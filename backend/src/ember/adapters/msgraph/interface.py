"""Outlook mail through Microsoft Graph: read a rep's recent mail, create follow-up drafts.

Interface and fake only. The shapes are a first guess made before the ``integrations`` and
``nurturing`` modules exist and will change when those define what they need. Drafts are created
in the rep's mailbox for the rep to review: nothing here sends mail. Email addresses, subjects and
bodies are personal data: never log them (AGENTS.md section 9).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True, slots=True)
class EmailMessage:
    id: str
    subject: str
    sender: str
    recipients: tuple[str, ...]
    sent_at: datetime
    body_text: str


@dataclass(frozen=True, slots=True)
class EmailPage:
    messages: tuple[EmailMessage, ...]
    next_cursor: str | None
    """Pass back as ``cursor`` for the next page; ``None`` on the last page."""


@dataclass(frozen=True, slots=True)
class DraftRef:
    id: str
    web_link: str
    """Where the rep opens the draft in Outlook."""


class GraphMailClient(Protocol):
    async def list_messages(
        self, *, mailbox: str, since: datetime, cursor: str | None = None
    ) -> EmailPage:
        """One page of ``mailbox`` messages sent or received since ``since``, oldest first."""
        ...

    async def create_draft(
        self, *, mailbox: str, to: Sequence[str], subject: str, body: str
    ) -> DraftRef:
        """Save a draft in ``mailbox`` without sending it."""
        ...
