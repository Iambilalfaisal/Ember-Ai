"""The module generator (scripts/new_module.py), run against a throwaway backend folder."""

import importlib.util
import py_compile
import tomllib
from pathlib import Path
from types import ModuleType

import pytest

from tests.conftest import BACKEND


def _load_generator() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "new_module", BACKEND / "scripts" / "new_module.py"
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = _load_generator()

EXPECTED_SOURCE_FILES = {
    "__init__.py",
    "public.py",
    "router.py",
    "schemas.py",
    "service.py",
    "repository.py",
    "models.py",
    "events.py",
    "tasks.py",
}


@pytest.fixture
def backend(tmp_path: Path) -> Path:
    """A minimal backend folder: just a pyproject.toml with the contract insertion marker."""
    (tmp_path / "pyproject.toml").write_text(
        '[tool.importlinter]\nroot_package = "ember"\n\n# --- poethepoet ---\n[tool.poe.tasks]\n',
        encoding="utf-8",
    )
    return tmp_path


def _contracts(backend: Path) -> list[dict[str, object]]:
    data = tomllib.loads((backend / "pyproject.toml").read_text(encoding="utf-8"))
    return data["tool"]["importlinter"]["contracts"]


def test_creates_the_layout_from_agents_md(backend: Path) -> None:
    generator.create_module("accounts", backend=backend)

    module = backend / "src" / "ember" / "modules" / "accounts"
    assert {p.name for p in module.iterdir()} == EXPECTED_SOURCE_FILES
    tests = backend / "tests" / "modules"
    assert (tests / "__init__.py").exists()
    assert {p.name for p in (tests / "accounts").iterdir()} == {
        "__init__.py",
        "test_service.py",
        "test_repository.py",
        "test_router.py",
    }


def test_generated_files_are_valid_python_and_mention_the_module(backend: Path) -> None:
    generator.create_module("accounts", backend=backend)

    module = backend / "src" / "ember" / "modules" / "accounts"
    for path in [*module.glob("*.py"), *(backend / "tests" / "modules" / "accounts").glob("*.py")]:
        py_compile.compile(str(path), doraise=True)
    assert "accounts" in (module / "service.py").read_text(encoding="utf-8")
    assert "router = APIRouter" in (module / "router.py").read_text(encoding="utf-8")


def test_generated_events_and_tasks_files_follow_the_conventions(backend: Path) -> None:
    generator.create_module("accounts", backend=backend)

    module = backend / "src" / "ember" / "modules" / "accounts"
    events = (module / "events.py").read_text(encoding="utf-8")
    assert "def register_handlers(bus: EventBus) -> None:" in events
    assert '@task("accounts.<verb>")' in (module / "tasks.py").read_text(encoding="utf-8")


def test_generated_placeholder_tests_are_skipped_not_passing(backend: Path) -> None:
    generator.create_module("accounts", backend=backend)

    for name in ("test_service.py", "test_repository.py", "test_router.py"):
        text = (backend / "tests" / "modules" / "accounts" / name).read_text(encoding="utf-8")
        assert "pytest.mark.skip" in text


def test_adds_one_import_contract_for_the_module(backend: Path) -> None:
    generator.create_module("accounts", backend=backend)

    (contract,) = _contracts(backend)
    assert contract["type"] == "forbidden"
    # A plain "ember.modules" source would make import-linter skip the check (see
    # test_import_contracts.py), so the source is one package per module.
    assert contract["source_modules"] == ["ember.modules.*"]
    forbidden = set(contract["forbidden_modules"])  # type: ignore[call-overload]
    assert forbidden == {f"ember.modules.accounts.{name}" for name in generator.PRIVATE_FILES}
    assert "ember.modules.accounts.public" not in forbidden
    assert contract["allow_indirect_imports"] is True


def test_each_module_gets_its_own_contract_and_the_rest_of_the_file_is_kept(backend: Path) -> None:
    generator.create_module("accounts", backend=backend)
    generator.create_module("calls", backend=backend)

    names = [c["name"] for c in _contracts(backend)]
    assert names == [generator.contract_name("accounts"), generator.contract_name("calls")]
    assert "[tool.poe.tasks]" in (backend / "pyproject.toml").read_text(encoding="utf-8")


def test_ai_flag_adds_a_prompts_folder(backend: Path) -> None:
    generator.create_module("calls", backend=backend, ai=True)
    generator.create_module("accounts", backend=backend)

    modules = backend / "src" / "ember" / "modules"
    assert (modules / "calls" / "prompts").is_dir()
    assert not (modules / "accounts" / "prompts").exists()


def test_refuses_to_overwrite_an_existing_module(backend: Path) -> None:
    generator.create_module("accounts", backend=backend)
    marker = backend / "src" / "ember" / "modules" / "accounts" / "service.py"
    marker.write_text("# my work\n", encoding="utf-8")

    with pytest.raises(FileExistsError):
        generator.create_module("accounts", backend=backend)

    assert marker.read_text(encoding="utf-8") == "# my work\n"
    assert len(_contracts(backend)) == 1


@pytest.mark.parametrize(
    "name", ["", "Accounts", "my-module", "1module", "a b", "../escape", "x.y"]
)
def test_rejects_invalid_names_without_creating_anything(backend: Path, name: str) -> None:
    with pytest.raises(ValueError, match="snake_case"):
        generator.create_module(name, backend=backend)

    assert not (backend / "src").exists()
    assert not (backend / "tests").exists()


def test_fails_clearly_when_pyproject_has_no_insertion_point(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\nname = 'x'\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="poethepoet"):
        generator.create_module("accounts", backend=tmp_path)

    assert not (tmp_path / "src").exists()
    assert not (tmp_path / "tests").exists()
