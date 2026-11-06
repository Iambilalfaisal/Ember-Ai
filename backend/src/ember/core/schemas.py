"""Request and response building blocks shared by every module's routes."""

from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel

from ember.core.tenancy import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT


class CursorPage[T](BaseModel):
    """Response body of a list endpoint. ``next_cursor`` is ``None`` on the last page."""

    items: list[T]
    next_cursor: str | None = None


class PageParams:
    """The ``?cursor=&limit=`` query parameters of a list endpoint (AGENTS.md section 5)."""

    def __init__(
        self,
        cursor: Annotated[str | None, Query(max_length=512)] = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT)] = DEFAULT_PAGE_LIMIT,
    ) -> None:
        self.cursor = cursor
        self.limit = limit


Pagination = Annotated[PageParams, Depends()]
