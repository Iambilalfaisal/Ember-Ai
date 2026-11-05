import asyncio
from pathlib import Path
from typing import Any

import asyncpg
import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parent.parent


def _alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    config.attributes["url"] = database_url
    config.attributes["configure_logging"] = False
    return config


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


@pytest.mark.integration
def test_downgrade_removes_pgvector_and_upgrade_is_repeatable(database_url: str) -> None:
    config = _alembic_config(database_url)

    command.upgrade(config, "head")
    command.downgrade(config, "base")
    assert not _has_vector_extension(database_url)

    command.upgrade(config, "head")
    command.upgrade(config, "head")
    assert _has_vector_extension(database_url)
