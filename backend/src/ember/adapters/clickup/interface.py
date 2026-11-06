"""ClickUp, the system the first customer's deals live in (import and sync, read-only for now).

Interface and fake only. The shapes below are a first guess made before the ``integrations`` and
``accounts`` modules exist: expect them to change when those modules define what an import needs.
A real client is built per tenant (each tenant has its own ClickUp credentials), so no credential
appears in this interface.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ClickUpTask:
    id: str
    name: str
    status: str
    list_id: str
    updated_at: datetime
    custom_fields: Mapping[str, str | float | None] = field(default_factory=dict)
    """Customer data: never log names or values."""


@dataclass(frozen=True, slots=True)
class ClickUpTaskPage:
    tasks: tuple[ClickUpTask, ...]
    next_cursor: str | None
    """Pass back as ``cursor`` for the next page; ``None`` on the last page."""


class ClickUpClient(Protocol):
    async def list_tasks(
        self,
        *,
        list_id: str,
        updated_since: datetime | None = None,
        cursor: str | None = None,
    ) -> ClickUpTaskPage:
        """One page of a list's tasks, optionally only those changed since a time."""
        ...

    async def get_task(self, task_id: str) -> ClickUpTask:
        """One task.

        Raises:
            NotFound: there is no such task.
        """
        ...
