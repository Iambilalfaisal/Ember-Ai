"""SQLAlchemy declarative base and the mixins every business table uses.

Every business table has ``id`` (UUID primary key), ``tenant_id`` (not null, indexed),
``created_at`` and ``updated_at`` (``timestamptz``, UTC). Inherit :class:`TenantModel`
(the three mixins on ``Base``)::

    class Document(TenantModel):
        __tablename__ = "documents"
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Deterministic constraint and index names, so Alembic autogenerate can diff and drop them.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def utcnow() -> datetime:
    return datetime.now(UTC)


class IdMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TenantMixin:
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)


class TimestampMixin:
    # Python-side defaults keep values known after flush (no refresh round trip in async
    # code); the server default covers rows inserted by raw SQL.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )


class TenantModel(Base, IdMixin, TenantMixin, TimestampMixin):
    """Abstract base for tenant-owned business tables.

    Same columns as composing the three mixins by hand, but gives
    ``TenantScopedRepository`` a type that guarantees ``id``, ``tenant_id`` and
    ``created_at`` exist.
    """

    __abstract__ = True
