from datetime import UTC, timedelta

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ember.core.models import Base, IdMixin, TenantMixin, TimestampMixin, utcnow


class Thing(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "test_things"

    name: Mapped[str] = mapped_column(String)


def test_id_is_a_uuid_primary_key() -> None:
    column = Thing.__table__.c.id

    assert column.primary_key
    assert isinstance(column.type, Uuid)


def test_tenant_id_is_required_and_indexed() -> None:
    table = Thing.__table__

    assert not table.c.tenant_id.nullable
    assert isinstance(table.c.tenant_id.type, Uuid)
    indexed = {tuple(c.name for c in index.columns) for index in table.indexes}
    assert ("tenant_id",) in indexed


def test_timestamps_are_required_and_timezone_aware() -> None:
    for name in ("created_at", "updated_at"):
        column = Thing.__table__.c[name]
        assert not column.nullable
        assert isinstance(column.type, DateTime)
        assert column.type.timezone
        assert column.server_default is not None


def test_naming_convention_gives_deterministic_names() -> None:
    table = Thing.__table__

    assert table.primary_key.name == "pk_test_things"
    assert {index.name for index in table.indexes} == {"ix_test_things_tenant_id"}


def test_utcnow_is_timezone_aware_utc() -> None:
    now = utcnow()

    assert now.tzinfo is UTC
    assert now.utcoffset() == timedelta(0)
