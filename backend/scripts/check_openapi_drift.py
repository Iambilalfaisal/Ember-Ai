"""Fail if the generated files in ``contracts/`` differ from what the backend produces now.

It regenerates into a temporary folder and compares, so it does not touch ``contracts/`` and does
not depend on git state: a developer who just ran ``uv run poe openapi`` (before committing)
passes, and CI fails for a contract change that was not regenerated and committed.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from export_openapi import CONTRACTS, GENERATED_DIRECTORIES, GENERATED_FILES

BACKEND = Path(__file__).resolve().parent.parent


def generated_files(root: Path) -> dict[str, bytes]:
    """Every generated file under ``root``, by posix-style relative path.

    Line endings are normalised, so a checkout that converted LF to CRLF is not drift.
    """
    paths = [root / name for name in GENERATED_FILES if (root / name).is_file()]
    for directory in GENERATED_DIRECTORIES:
        paths.extend(path for path in sorted((root / directory).rglob("*")) if path.is_file())
    return {
        path.relative_to(root).as_posix(): path.read_bytes().replace(b"\r\n", b"\n")
        for path in paths
    }


def differences(committed: dict[str, bytes], fresh: dict[str, bytes]) -> list[str]:
    """One line per file that is missing, stale or left over in ``committed``."""
    problems = []
    for name in sorted(fresh):
        if name not in committed:
            problems.append(f"  missing: {name}")
        elif committed[name] != fresh[name]:
            problems.append(f"  out of date: {name}")
    problems += [
        f"  no longer generated: {name}" for name in sorted(committed.keys() - fresh.keys())
    ]
    return problems


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="ember-contracts-") as temporary:
        fresh_root = Path(temporary)
        result = subprocess.run(
            [sys.executable, str(BACKEND / "scripts" / "export_openapi.py"), "--out", temporary],
            cwd=BACKEND,
            check=False,
        )
        if result.returncode != 0:
            return result.returncode
        problems = differences(generated_files(CONTRACTS), generated_files(fresh_root))
    if problems:
        sys.stderr.write("contracts/ is out of date. Run `uv run poe openapi` and commit it:\n")
        sys.stderr.write("\n".join(problems) + "\n")
        return 1
    sys.stdout.write("openapi-check: contracts/ is up to date\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
