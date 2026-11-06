"""Tenant context and the base class for every tenant-scoped repository.

``TenantContext`` holds the current tenant in a context variable: ``current_user`` sets it
for the length of an authenticated request, and a worker job sets it with
``TenantContext.use``. ``TenantScopedRepository`` reads it and adds the tenant filter to every
query, so a service cannot forget to scope its data. With no tenant set, every repository
call raises instead of returning unscoped rows.
"""

import base64
import json
import uuid
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Select, and_, inspect, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ember.core.errors import ValidationFailed
from ember.core.models import TenantModel

DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 200

# Columns a caller may never change through ``update``.
_PROTECTED_COLUMNS = frozenset({"id", "tenant_id", "created_at"})

_current_tenant: ContextVar[uuid.UUID | None] = ContextVar("ember_tenant_id", default=None)


class TenantNotSet(RuntimeError):
    """A tenant-scoped operation ran with no current tenant. This is a programming error."""


class TenantMismatch(RuntimeError):
    """An entity belonging to another tenant was passed to the current tenant's repository."""


class TenantContext:
    """Accessors for the current tenant id (a context variable, so safe across async tasks)."""

    @staticmethod
    def get() -> uuid.UUID | None:
        """Return the current tenant id, or ``None`` when no tenant is set."""
        return _current_tenant.get()

    @staticmethod
    def require() -> uuid.UUID:
        """Return the current tenant id.

        Raises:
            TenantNotSet: no tenant is set.
        """
        tenant_id = _current_tenant.get()
        if tenant_id is None:
            raise TenantNotSet("No tenant is set for this request or job.")
        return tenant_id

    @staticmethod
    def set(tenant_id: uuid.UUID) -> Token[uuid.UUID | None]:
        """Set the current tenant. Pass the returned token to :meth:`reset` when done."""
        return _current_tenant.set(tenant_id)

    @staticmethod
    def reset(token: Token[uuid.UUID | None]) -> None:
        _current_tenant.reset(token)

    @staticmethod
    @contextmanager
    def use(tenant_id: uuid.UUID) -> Iterator[None]:
        """Run a block (a worker job, a test) as ``tenant_id``, restoring the previous value."""
        token = _current_tenant.set(tenant_id)
        try:
            yield
        finally:
            _current_tenant.reset(token)


@dataclass(frozen=True, slots=True)
class Page[T]:
    """One page of a cursor-paginated list. ``next_cursor`` is ``None`` on the last page."""

    items: list[T]
    next_cursor: str | None


def _encode_cursor(created_at: datetime, entity_id: uuid.UUID) -> str:
    raw = json.dumps([created_at.isoformat(), str(entity_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        created_raw, id_raw = json.loads(base64.urlsafe_b64decode(padded))
        created_at = datetime.fromisoformat(created_raw)
        if created_at.tzinfo is None:
            raise ValueError("cursor timestamp has no timezone")
        return created_at, uuid.UUID(id_raw)
    except (ValueError, TypeError) as exc:
        raise ValidationFailed("The cursor is not valid.") from exc


class TenantScopedRepository[ModelT: TenantModel]:
    """Base class for repositories of tenant-owned tables.

    Subclasses set ``model``. Every query is filtered by the current tenant, and a row of
    another tenant is indistinguishable from a row that does not exist. Repositories flush but
    never commit: the request's session dependency owns the transaction.
    """

    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _scoped(self) -> Select[ModelT]:
        """A ``SELECT`` of the model already filtered to the current tenant."""
        return select(self.model).where(self.model.tenant_id == TenantContext.require())

    async def get(self, entity_id: uuid.UUID) -> ModelT | None:
        """Return the current tenant's row with this id, or ``None``."""
        result = await self.session.execute(self._scoped().where(self.model.id == entity_id))
        return result.scalar_one_or_none()

    async def list(
        self, *, cursor: str | None = None, limit: int = DEFAULT_PAGE_LIMIT
    ) -> Page[ModelT]:
        """Return one page of the current tenant's rows, oldest first.

        Args:
            cursor: ``next_cursor`` of the previous page; ``None`` for the first page.
            limit: page size, clamped to 1..``MAX_PAGE_LIMIT``.

        Raises:
            ValidationFailed: the cursor is malformed.
        """
        limit = max(1, min(limit, MAX_PAGE_LIMIT))
        statement = self._scoped().order_by(self.model.created_at, self.model.id)
        if cursor is not None:
            created_at, last_id = _decode_cursor(cursor)
            statement = statement.where(
                or_(
                    self.model.created_at > created_at,
                    and_(self.model.created_at == created_at, self.model.id > last_id),
                )
            )
        # One extra row tells us whether another page exists.
        rows = list((await self.session.execute(statement.limit(limit + 1))).scalars())
        items = rows[:limit]
        next_cursor = (
            _encode_cursor(items[-1].created_at, items[-1].id) if len(rows) > limit else None
        )
        return Page(items=items, next_cursor=next_cursor)

    async def add(self, entity: ModelT) -> ModelT:
        """Insert ``entity`` for the current tenant and flush.

        ``tenant_id`` is filled in when unset.

        Raises:
            TenantMismatch: ``entity.tenant_id`` is set to another tenant.
        """
        tenant_id = TenantContext.require()
        if entity.tenant_id is None:
            entity.tenant_id = tenant_id
        elif entity.tenant_id != tenant_id:
            raise TenantMismatch("Entity belongs to a different tenant than the current one.")
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def update(self, entity_id: uuid.UUID, values: Mapping[str, Any]) -> ModelT | None:
        """Set columns on the current tenant's row and flush; ``None`` if there is no such row.

        Raises:
            ValueError: ``values`` names a protected column (``id``, ``tenant_id``,
                ``created_at``) or one the model does not have.
        """
        columns = {column.key for column in inspect(self.model).column_attrs}
        invalid = set(values) - (columns - _PROTECTED_COLUMNS)
        if invalid:
            raise ValueError(f"Cannot update columns: {sorted(invalid)}")
        entity = await self.get(entity_id)
        if entity is None:
            return None
        for key, value in values.items():
            setattr(entity, key, value)
        await self.session.flush()
        return entity

    async def delete(self, entity_id: uuid.UUID) -> bool:
        """Delete the current tenant's row and flush; ``False`` if there is no such row."""
        entity = await self.get(entity_id)
        if entity is None:
            return False
        await self.session.delete(entity)
        await self.session.flush()
        return True
