"""Print a signed dev token for local work (needs EMBER_ENV=local and a dev signing key).

    uv run python scripts/dev_token.py --role admin
    curl -H "Authorization: Bearer $(uv run python scripts/dev_token.py)" localhost:8000/api/v1/...

The token goes to stdout; the user and tenant ids it carries go to stderr. Until the identity
module (F4) creates real tenants and users, any ids work.
"""

import argparse
import sys
import uuid
from datetime import timedelta

from ember.core.config import get_settings
from ember.core.security import DevAuthDisabled, Role, issue_dev_token


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--role", action="append", choices=[r.value for r in Role], default=None)
    parser.add_argument("--tenant-id", type=uuid.UUID, default=uuid.uuid4())
    parser.add_argument("--user-id", type=uuid.UUID, default=uuid.uuid4())
    parser.add_argument("--hours", type=float, default=8.0, help="token lifetime in hours")
    args = parser.parse_args()
    roles = frozenset(Role(r) for r in (args.role or [Role.REP.value]))
    try:
        token = issue_dev_token(
            get_settings(),
            user_id=args.user_id,
            tenant_id=args.tenant_id,
            roles=roles,
            ttl=timedelta(hours=args.hours),
        )
    except DevAuthDisabled as exc:
        sys.stderr.write(f"{exc}\n")
        return 1
    sys.stderr.write(f"user_id={args.user_id} tenant_id={args.tenant_id}\n")
    sys.stdout.write(f"{token}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
