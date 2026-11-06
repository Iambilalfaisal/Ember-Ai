"""The F5 example, end to end on real Postgres and Redis (needs Docker).

An admin invites a user through the API. That publishes ``UserInvited``; once the request commits,
the handler enqueues a background task; a worker (run here in the test process) executes it.
"""

import asyncio
import contextlib
import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from taskiq import AsyncBroker
from taskiq.receiver import Receiver

from ember.core.config import AuthSettings, DbSettings, RedisSettings, Settings, TasksSettings
from ember.core.security import Role
from ember.entrypoints.api import create_app
from ember.entrypoints.worker import create_broker
from tests.conftest import make_settings
from tests.modules.identity.conftest import DEV_KEY, dev_token, seed_tenant, user_spec

pytestmark = pytest.mark.integration


def _settings(database_url: str, redis_url: str) -> Settings:
    return make_settings(
        env="local",
        db=DbSettings(url=database_url),  # type: ignore[arg-type]
        redis=RedisSettings(url=redis_url),  # type: ignore[arg-type]
        auth=AuthSettings(dev_signing_key=DEV_KEY),  # type: ignore[arg-type]
        tasks=TasksSettings(queue_name=f"test-{uuid.uuid4().hex[:8]}"),
    )


@contextlib.asynccontextmanager
async def running_worker(settings: Settings) -> AsyncIterator[AsyncBroker]:
    """A worker in this process: the same broker the ``worker`` entrypoint builds."""
    broker = create_broker(settings)
    broker.is_worker_process = True
    # Start first: the consumer group must exist before anything is enqueued.
    await broker.startup()
    finished = asyncio.Event()
    listener = asyncio.create_task(Receiver(broker, run_startup=False).listen(finished))
    try:
        yield broker
    finally:
        finished.set()
        await asyncio.wait_for(listener, timeout=10)
        await broker.shutdown()


async def _wait_for_log(
    capsys: pytest.CaptureFixture[str], text: str, wait_seconds: float = 15
) -> str:
    seen = ""
    for _ in range(int(wait_seconds / 0.1)):
        seen += capsys.readouterr().out
        if text in seen:
            return seen
        await asyncio.sleep(0.1)
    raise AssertionError(f"{text!r} never appeared in the logs:\n{seen}")


async def test_an_invite_through_the_api_is_processed_by_the_worker(
    migrated_database_url: str,
    redis_url: str,
    session_factory: async_sessionmaker[AsyncSession],
    capsys: pytest.CaptureFixture[str],
) -> None:
    tenant = await seed_tenant(
        session_factory, "Acme", {"admin": user_spec("admin@acme.test", Role.ADMIN)}
    )
    settings = _settings(migrated_database_url, redis_url)
    headers = dev_token(settings, tenant.users["admin"], tenant.tenant_id, Role.ADMIN)

    # Built inside the test so the log handlers bind to the captured stdout.
    async with running_worker(settings):
        app = create_app(settings)
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(transport=transport, base_url="http://test") as client,
        ):
            response = await client.post(
                "/api/v1/users",
                headers=headers,
                json={"email": "secret.person@acme.test", "roles": ["rep"]},
            )
            assert response.status_code == 201
            invited_id = response.json()["id"]

            logs = await _wait_for_log(capsys, "identity.user_invited_processed")

    processed = [line for line in logs.splitlines() if "identity.user_invited_processed" in line]
    assert len(processed) == 1
    assert f'"user_id": "{invited_id}"' in processed[0]
    assert '"found": true' in processed[0]
    # Bound by the worker around the task, from the enqueued tenant_id.
    assert f'"tenant_id": "{tenant.tenant_id}"' in processed[0]
    assert '"task": "identity.log_user_invited"' in processed[0]
    # No personal data on the way: not in the event, the job arguments or the logs.
    assert "secret.person" not in logs


async def test_a_rejected_invite_starts_no_job(
    migrated_database_url: str,
    redis_url: str,
    session_factory: async_sessionmaker[AsyncSession],
    capsys: pytest.CaptureFixture[str],
) -> None:
    tenant = await seed_tenant(
        session_factory,
        "Acme",
        {
            "admin": user_spec("admin@acme.test", Role.ADMIN),
            "rep": user_spec("rep@acme.test", Role.REP),
        },
    )
    settings = _settings(migrated_database_url, redis_url)
    headers = dev_token(settings, tenant.users["admin"], tenant.tenant_id, Role.ADMIN)

    async with running_worker(settings):
        app = create_app(settings)
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(transport=transport, base_url="http://test") as client,
        ):
            duplicate = await client.post(
                "/api/v1/users", headers=headers, json={"email": "rep@acme.test", "roles": ["rep"]}
            )
            # A later, valid invite proves the worker is alive and has had time to act.
            valid = await client.post(
                "/api/v1/users", headers=headers, json={"email": "new@acme.test", "roles": ["rep"]}
            )
            logs = await _wait_for_log(capsys, "identity.user_invited_processed")
            await asyncio.sleep(0.5)  # room for a (wrongly) enqueued second job
            logs += capsys.readouterr().out

    assert duplicate.status_code == 409
    assert valid.status_code == 201
    assert logs.count("identity.user_invited_processed") == 1
