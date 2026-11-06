"""SQLAlchemy models of the identity module: tenants and their users.

``Tenant`` is the registry that tenant scoping itself comes from, so it has no ``tenant_id``.
``User`` is tenant-owned and has a real foreign key to ``tenants``.
"""

from enum import StrEnum
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ember.core.models import Base, IdMixin, TenantModel, TimestampMixin


class UserStatus(StrEnum):
    INVITED = "invited"
    """Created by an admin; becomes active on the user's first sign-in."""
    ACTIVE = "active"
    DISABLED = "disabled"
    """Kept for history but refused at sign-in."""


class Tenant(Base, IdMixin, TimestampMixin):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String, nullable=False)
    entra_tenant_id: Mapped[str | None] = mapped_column(String, unique=True)
    """The customer's Entra directory (``tid`` claim); ties sign-ins to this tenant."""
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    """Per-tenant configuration, read through ``TenantSettings``."""


class User(TenantModel):
    __tablename__ = "users"
    __table_args__ = (
        ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        UniqueConstraint("tenant_id", "entra_object_id", name="uq_users_tenant_entra_object_id"),
        CheckConstraint("status IN ('invited', 'active', 'disabled')", name="status"),
    )

    email: Mapped[str] = mapped_column(String, nullable=False)
    """Stored lower-cased; unique within the tenant."""
    display_name: Mapped[str | None] = mapped_column(String)
    roles: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default=UserStatus.INVITED.value)
    entra_object_id: Mapped[str | None] = mapped_column(String)
    """Entra ``oid`` of the person; set on their first sign-in."""
