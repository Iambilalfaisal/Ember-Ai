import asyncio
from typing import Any

import asyncpg
import pytest
from alembic import command
from alembic.script import ScriptDirectory

from tests.conftest import BACKEND
from tests.conftest import alembic_config as _alembic_config


def _query(database_url: str, sql: str) -> list[Any]:
    async def run() -> list[Any]:
        connection = await asyncpg.connect(database_url.replace("+asyncpg", ""))
        try:
            return list(await connection.fetch(sql))
        finally:
            await connection.close()

    return asyncio.run(run())


def _has_vector_extension(database_url: str) -> bool:
    return bool(_query(database_url, "SELECT 1 FROM pg_extension WHERE extname = 'vector'"))


def test_there_is_a_single_migration_head() -> None:
    script = ScriptDirectory(str(BACKEND / "alembic"))

    assert len(script.get_heads()) == 1


@pytest.mark.integration
def test_upgrade_enables_pgvector(database_url: str) -> None:
    assert not _has_vector_extension(database_url)

    command.upgrade(_alembic_config(database_url), "head")

    assert _has_vector_extension(database_url)
    (version,) = _query(database_url, "SELECT version_num FROM alembic_version")
    head = ScriptDirectory(str(BACKEND / "alembic")).get_current_head()
    assert version["version_num"] == head
    # The vector type is usable.
    assert _query(database_url, "SELECT '[1,2,3]'::vector AS v")


def _tables(database_url: str) -> set[str]:
    rows = _query(
        database_url,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    )
    return {row["table_name"] for row in rows}


@pytest.mark.integration
def test_upgrade_creates_identity_tables_and_downgrade_removes_them(database_url: str) -> None:
    config = _alembic_config(database_url)

    command.upgrade(config, "head")
    assert {"tenants", "users"} <= _tables(database_url)

    command.downgrade(config, "base")
    assert not {"tenants", "users"} & _tables(database_url)


@pytest.mark.integration
def test_upgrade_creates_the_ai_usage_table_and_downgrade_removes_it(database_url: str) -> None:
    config = _alembic_config(database_url)

    command.upgrade(config, "head")
    assert "ai_usage" in _tables(database_url)

    command.downgrade(config, "base")
    assert "ai_usage" not in _tables(database_url)


@pytest.mark.integration
def test_downgrade_removes_pgvector_and_upgrade_is_repeatable(database_url: str) -> None:
    config = _alembic_config(database_url)

    command.upgrade(config, "head")
    command.downgrade(config, "base")
    assert not _has_vector_extension(database_url)

    command.upgrade(config, "head")
    command.upgrade(config, "head")
    assert _has_vector_extension(database_url)
