"""Fail if the generated contracts/ files differ from what the app produces.

Skipped until scripts/export_openapi.py exists (F8).
"""

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent


def main() -> int:
    exporter = BACKEND / "scripts" / "export_openapi.py"
    if not exporter.exists():
        sys.stdout.write("openapi-check: skipped (scripts/export_openapi.py arrives in F8)\n")
        return 0
    subprocess.run([sys.executable, str(exporter)], check=True, cwd=BACKEND)
    diff = subprocess.run(
        ["git", "diff", "--exit-code", "--", "contracts"],
        cwd=REPO,
        check=False,
    )
    return diff.returncode


if __name__ == "__main__":
    sys.exit(main())
