"""A ClickUp client for tests, serving the tasks it was given in pages."""

from collections.abc import Sequence
from datetime import datetime

from ember.adapters.clickup.interface import ClickUpTask, ClickUpTaskPage
from ember.core.errors import NotFound


class FakeClickUpClient:
    def __init__(self, tasks: Sequence[ClickUpTask] = (), *, page_size: int = 2) -> None:
        self.tasks = list(tasks)
        self._page_size = page_size

    async def list_tasks(
        self,
        *,
        list_id: str,
        updated_since: datetime | None = None,
        cursor: str | None = None,
    ) -> ClickUpTaskPage:
        matching = [
            task
            for task in self.tasks
            if task.list_id == list_id
            and (updated_since is None or task.updated_at > updated_since)
        ]
        start = int(cursor) if cursor is not None else 0
        page = matching[start : start + self._page_size]
        more = start + self._page_size < len(matching)
        return ClickUpTaskPage(
            tasks=tuple(page), next_cursor=str(start + self._page_size) if more else None
        )

    async def get_task(self, task_id: str) -> ClickUpTask:
        for task in self.tasks:
            if task.id == task_id:
                return task
        raise NotFound
