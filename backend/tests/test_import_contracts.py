"""The per-module import contract the generator writes must really stop private imports.

The contract once passed while checking nothing (import-linter silently skips a source package
that contains the forbidden modules), so these tests run import-linter itself on a throwaway
project built from the generator's own contract text.
"""

import subprocess
import sys
from pathlib import Path

import pytest

from tests.test_new_module import generator

RUN_IMPORT_LINTER = (
    "import sys; from importlinter.cli import lint_imports_command; "
    "sys.exit(lint_imports_command(prog_name='lint-imports'))"
)


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Package ``ember`` with modules ``identity`` and ``accounts``, each guarded by a contract.

    Inside each module, ``public`` imports ``service`` which imports ``models``: the legal shape.
    """
    config = '[tool.importlinter]\nroot_package = "ember"\n\n'
    config += generator.contract_block("identity") + generator.contract_block("accounts")
    _write(tmp_path / "pyproject.toml", config)
    _write(tmp_path / "ember" / "__init__.py")
    _write(tmp_path / "ember" / "modules" / "__init__.py")
    for name in ("identity", "accounts"):
        module = tmp_path / "ember" / "modules" / name
        _write(module / "__init__.py")
        _write(module / "models.py")
        _write(module / "service.py", f"from ember.modules.{name} import models\n")
        _write(module / "public.py", f"from ember.modules.{name} import service\n")
    return tmp_path


def _lint(project: Path) -> subprocess.CompletedProcess[str]:
    # ``-c`` puts the current directory first on sys.path, so the throwaway ``ember`` package
    # shadows the real one.
    return subprocess.run(  # noqa: S603
        [sys.executable, "-c", RUN_IMPORT_LINTER],
        cwd=project,
        capture_output=True,
        text=True,
        check=False,
    )


def _add_import(project: Path, importer: str, statement: str) -> None:
    _write(project / "ember" / "modules" / importer / "extra.py", statement + "\n")


def test_a_module_may_import_its_own_files_and_another_modules_public(project: Path) -> None:
    _add_import(project, "accounts", "from ember.modules.identity import public")

    result = _lint(project)

    assert result.returncode == 0, result.stdout


@pytest.mark.parametrize("private", ["models", "service"])
def test_importing_another_modules_private_file_breaks_the_contract(
    project: Path, private: str
) -> None:
    _add_import(project, "accounts", f"from ember.modules.identity import {private}")

    result = _lint(project)

    assert result.returncode == 1, result.stdout
    assert f"ember.modules.accounts is not allowed to import ember.modules.identity.{private}" in (
        result.stdout.replace("\n", " ")
    )


def test_the_contract_protects_every_module_not_just_the_first(project: Path) -> None:
    _add_import(project, "identity", "from ember.modules.accounts import models")

    result = _lint(project)

    assert result.returncode == 1, result.stdout
    assert "ember.modules.accounts.models" in result.stdout.replace("\n", " ")
