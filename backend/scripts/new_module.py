"""Generate a business module with the layout from AGENTS.md section 2.

    uv run python scripts/new_module.py <name> [--ai]

Creates ``src/ember/modules/<name>/`` (``public.py``, ``router.py``, ``schemas.py``,
``service.py``, ``repository.py``, ``models.py``, ``events.py``, ``tasks.py``; plus ``prompts/``
with ``--ai``), a matching ``tests/modules/<name>/`` folder, and the import-linter contract that
keeps other modules on ``<name>.public``.

Nothing else needs registering: the API mounts every ``ember.modules.<name>.router.router``, and
Alembic imports every ``ember.modules.<name>.models``.
"""

import argparse
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
# Private files: other modules may not import these (they use ``public`` instead).
PRIVATE_FILES = ("events", "models", "repository", "router", "schemas", "service", "tasks")
CONTRACT_MARKER = "# --- poethepoet"

SOURCE_TEMPLATES = {
    "__init__.py": '"""The {name} module. Other modules import only ``{package}.public``."""\n',
    "public.py": (
        '"""The only file other modules may import from the {name} module.\n\n'
        "Expose service functions and classes and DTO schemas here. Never expose ORM models.\n"
        '"""\n\n'
        "__all__: list[str] = []\n"
    ),
    "router.py": (
        '"""HTTP routes of the {name} module: parse input, call the service, return a schema.\n\n'
        "Routes are mounted under ``/api/v1``, so declare full paths such as\n"
        "``/documents/{{id}}`` and the role each route requires (``require_role``).\n"
        '"""\n\n'
        "from fastapi import APIRouter\n\n"
        'router = APIRouter(tags=["{name}"])\n'
    ),
    "schemas.py": '"""Pydantic v2 request, response and DTO models of the {name} module."""\n',
    "service.py": (
        '"""Business logic of the {name} module.\n\n'
        "Services never commit and never import FastAPI. Every public function documents what it\n"
        "does, its inputs, its outputs and the errors it raises.\n"
        '"""\n'
    ),
    "repository.py": (
        '"""Database access of the {name} module.\n\n'
        "Repositories of tenant data extend ``TenantScopedRepository`` and hold no business\n"
        "logic.\n"
        '"""\n'
    ),
    "models.py": (
        '"""SQLAlchemy models of the {name} module.\n\n'
        "Inherit ``TenantModel`` for tenant-owned tables. Alembic imports this file\n"
        "automatically.\n"
        '"""\n'
    ),
    "events.py": '"""Events the {name} module publishes and the handlers it registers."""\n',
    "tasks.py": '"""Taskiq tasks of the {name} module (verbs, e.g. ``ingest_document``)."""\n',
}

TEST_TEMPLATES = {
    "__init__.py": "",
    "test_service.py": (
        "import pytest\n\n\n"
        '@pytest.mark.skip(reason="TODO: service tests with fake repositories")\n'
        "def test_service_placeholder() -> None: ...\n"
    ),
    "test_repository.py": (
        "import pytest\n\n\n"
        '@pytest.mark.skip(reason="TODO: tenant-isolation test (tests/tenant_isolation.py)")\n'
        "def test_tenant_isolation_placeholder() -> None: ...\n"
    ),
    "test_router.py": (
        "import pytest\n\n\n"
        '@pytest.mark.skip(reason="TODO: route tests for every endpoint")\n'
        "def test_routes_placeholder() -> None: ...\n"
    ),
}


def contract_name(name: str) -> str:
    return f"other modules use {name} only through its public interface"


def contract_block(name: str) -> str:
    package = f"ember.modules.{name}"
    forbidden = "".join(f'    "{package}.{private}",\n' for private in PRIVATE_FILES)
    return (
        "[[tool.importlinter.contracts]]\n"
        f'name = "{contract_name(name)}"\n'
        'type = "forbidden"\n'
        # One source per module package. import-linter skips a source that overlaps a forbidden
        # module, which is what lets a module import its own files while every other module
        # is checked. (With the plain "ember.modules" package as source the check silently
        # does nothing, because that package contains the forbidden modules.)
        'source_modules = ["ember.modules.*"]\n'
        f"forbidden_modules = [\n{forbidden}]\n"
        # Reaching private files through <name>.public is the intended route.
        "allow_indirect_imports = true\n\n"
    )


def create_module(name: str, *, backend: Path = BACKEND, ai: bool = False) -> list[Path]:
    """Create the module, its test folder and its import-linter contract.

    Raises:
        ValueError: ``name`` is not a valid ``snake_case`` module name.
        FileExistsError: the module already exists.
    """
    if not NAME_PATTERN.fullmatch(name):
        raise ValueError(f"Module name must be snake_case (letters, digits, _): {name!r}")
    module_dir = backend / "src" / "ember" / "modules" / name
    if module_dir.exists():
        raise FileExistsError(f"Module already exists: {module_dir}")
    pyproject = backend / "pyproject.toml"
    if CONTRACT_MARKER not in pyproject.read_text(encoding="utf-8"):
        # Checked before writing anything, so a failure never leaves half a module behind.
        raise RuntimeError(f"{pyproject} has no {CONTRACT_MARKER!r} line to insert before")

    package = f"ember.modules.{name}"
    created: list[Path] = []

    def write(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        created.append(path)

    for filename, template in SOURCE_TEMPLATES.items():
        write(module_dir / filename, template.format(name=name, package=package))
    if ai:
        write(module_dir / "prompts" / ".gitkeep", "")

    tests_dir = backend / "tests" / "modules"
    if not (tests_dir / "__init__.py").exists():
        write(tests_dir / "__init__.py", "")
    for filename, content in TEST_TEMPLATES.items():
        write(tests_dir / name / filename, content)

    if _add_contract(backend / "pyproject.toml", name):
        created.append(backend / "pyproject.toml")
    return created


def _add_contract(pyproject: Path, name: str) -> bool:
    text = pyproject.read_text(encoding="utf-8")
    if contract_name(name) in text:
        return False
    if CONTRACT_MARKER not in text:
        raise RuntimeError(f"{pyproject} has no {CONTRACT_MARKER!r} line to insert before")
    updated = text.replace(CONTRACT_MARKER, contract_block(name) + CONTRACT_MARKER, 1)
    pyproject.write_text(updated, encoding="utf-8", newline="\n")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a business module.")
    parser.add_argument("name", help="module name in snake_case, e.g. accounts")
    parser.add_argument("--ai", action="store_true", help="also create prompts/ for AI prompts")
    args = parser.parse_args()
    try:
        created = create_module(args.name, ai=args.ai)
    except (ValueError, FileExistsError) as exc:
        sys.stderr.write(f"{exc}\n")
        return 1
    for path in created:
        sys.stdout.write(f"created {path.relative_to(BACKEND)}\n")
    sys.stdout.write("Next: run `uv run poe check`, then fill in the module.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
