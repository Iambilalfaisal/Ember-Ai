"""Create a tenant and its first (invited) admin. Run once per customer, or once locally.

    uv run python scripts/create_tenant.py --name "Acme" --admin-email you@example.com \
        --entra-tenant-id <directory-id>

The admin becomes active when they first sign in through Entra with that email. For local work
without Entra, the ids printed at the end can be passed to ``scripts/dev_token.py``.
"""

import argparse
import asyncio
import sys

from ember.core.config import get_settings
from ember.core.db import create_engine, create_session_factory
from ember.core.errors import AppError
from ember.core.events import NullEventBus
from ember.modules.identity.public import create_tenant_with_admin


async def run(args: argparse.Namespace) -> int:
    engine = create_engine(get_settings())
    try:
        async with create_session_factory(engine)() as session:
            try:
                tenant, admin = await create_tenant_with_admin(
                    session,
                    NullEventBus(),  # a script has no listeners, so UserInvited is not delivered
                    name=args.name,
                    entra_tenant_id=args.entra_tenant_id,
                    admin_email=args.admin_email,
                    admin_display_name=args.admin_name,
                )
            except AppError as exc:
                sys.stderr.write(f"{exc.title}: {exc.detail}\n")
                return 1
            await session.commit()
    finally:
        await engine.dispose()
    sys.stdout.write(f"tenant_id={tenant.id}\nadmin_user_id={admin.id}\n")
    sys.stdout.write(
        "local dev token: uv run python scripts/dev_token.py "
        f"--tenant-id {tenant.id} --user-id {admin.id} --role admin\n"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a tenant and its first admin.")
    parser.add_argument("--name", required=True)
    parser.add_argument("--admin-email", required=True)
    parser.add_argument("--admin-name", default=None)
    parser.add_argument(
        "--entra-tenant-id", default=None, help="Entra directory id; omit for local-only tenants"
    )
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
