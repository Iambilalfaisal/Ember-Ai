"""Speech-to-text.

Live calls: the desktop streams audio **directly** to the transcription vendor with a short-lived
token that the backend issues; the backend only ever receives transcript text (AGENTS.md
section 6). After a call, a recording can be transcribed in batch.

Only the interface and a fake exist so far: no vendor is chosen yet. The batch half is a first
shape to be reviewed when a vendor is picked.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from pydantic import SecretStr


@dataclass(frozen=True, slots=True)
class StreamingToken:
    token: SecretStr
    """Hand to the desktop only. It lets the holder stream audio to the vendor: never log it."""
    expires_at: datetime
    """When the vendor stops accepting the token (timezone-aware, UTC)."""


@dataclass(frozen=True, slots=True)
class TranscriptSegment:
    start_ms: int
    end_ms: int
    text: str
    """Spoken words: never log them."""
    speaker: str | None = None


@dataclass(frozen=True, slots=True)
class BatchTranscript:
    segments: tuple[TranscriptSegment, ...]
    language: str | None = None


class SttProvider(Protocol):
    async def issue_streaming_token(self, *, tenant_id: uuid.UUID, call_id: str) -> StreamingToken:
        """A short-lived token for the desktop to stream one call's audio to the vendor.

        Args:
            tenant_id: the tenant the call belongs to.
            call_id: the call the token is for, so the vendor's usage can be attributed.
        """
        ...

    async def transcribe_batch(
        self, *, audio_url: str, language: str | None = None
    ) -> BatchTranscript:
        """Transcribe a finished recording the vendor can fetch from ``audio_url``."""
        ...
