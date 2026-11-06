"""A Microsoft Graph mail client for tests: serves given messages, keeps drafts in a list."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ember.adapters.msgraph.interface import DraftRef, EmailMessage, EmailPage


@dataclass(frozen=True, slots=True)
class SavedDraft:
    mailbox: str
    to: tuple[str, ...]
    subject: str
    body: str


class FakeGraphMailClient:
    def __init__(self, messages: Sequence[EmailMessage] = (), *, page_size: int = 2) -> None:
        self.messages = list(messages)
        self.drafts: list[SavedDraft] = []
        self._page_size = page_size

    async def list_messages(
        self, *, mailbox: str, since: datetime, cursor: str | None = None
    ) -> EmailPage:
        # The fake has one mailbox's worth of mail; the argument is accepted to match Graph.
        matching = sorted(
            (m for m in self.messages if m.sent_at >= since), key=lambda message: message.sent_at
        )
        start = int(cursor) if cursor is not None else 0
        page = matching[start : start + self._page_size]
        more = start + self._page_size < len(matching)
        return EmailPage(
            messages=tuple(page), next_cursor=str(start + self._page_size) if more else None
        )

    async def create_draft(
        self, *, mailbox: str, to: Sequence[str], subject: str, body: str
    ) -> DraftRef:
        self.drafts.append(SavedDraft(mailbox=mailbox, to=tuple(to), subject=subject, body=body))
        draft_id = f"fake-draft-{len(self.drafts)}"
        return DraftRef(id=draft_id, web_link=f"https://outlook.fake.test/drafts/{draft_id}")
