"""Alembic environment: async engine, URL from Settings, models discovered from modules."""

import asyncio
import importlib
import importlib.util
import pkgutil
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

import ember.modules
from ember.core.config import get_settings
from ember.core.models import Base

config = context.config

# Callers (tests) may pass the URL via config.attributes["url"] and skip logging setup.
if config.config_file_name is not None and config.attributes.get("configure_logging", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def _import_module_models() -> None:
    """Import ``ember.modules.<name>.models`` for every module so Base.metadata is complete."""
    for module in pkgutil.iter_modules(ember.modules.__path__):
        models = f"ember.modules.{module.name}.models"
        if importlib.util.find_spec(models) is not None:
            importlib.import_module(models)


_import_module_models()
target_metadata = Base.metadata


def _database_url() -> str:
    return config.attributes.get("url") or get_settings().db.url.get_secret_value()


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting (``alembic upgrade head --sql``)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(_database_url(), poolclass=NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
