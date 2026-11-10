"""Makes the harness in ``eval/`` importable (it is not part of the ``ember`` package)."""

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

EVAL = Path(__file__).resolve().parents[3] / "eval"

# At import time, not in a fixture: the test modules import ``ember_eval`` while being collected.
if str(EVAL) not in sys.path:
    sys.path.insert(0, str(EVAL))


@pytest.fixture(scope="session")
def run_module() -> ModuleType:
    """``eval/run.py``, loaded under a name that cannot clash with anything else called ``run``."""
    spec = importlib.util.spec_from_file_location("ember_eval_run", EVAL / "run.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
