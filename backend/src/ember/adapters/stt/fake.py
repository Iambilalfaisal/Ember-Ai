"""A speech-to-text provider for tests: predictable tokens, a scripted batch transcript."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from pydantic import SecretStr

from ember.adapters.stt.interface import BatchTranscript, StreamingToken


def _utcnow() -> datetime:
    return datetime.now(UTC)


class FakeSttProvider:
    def __init__(
        self,
        *,
        token_ttl: timedelta = timedelta(minutes=10),
        batch_transcript: BatchTranscript | None = None,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._token_ttl = token_ttl
        self._batch_transcript = batch_transcript or BatchTranscript(segments=())
        self._clock = clock
        self.issued: list[tuple[uuid.UUID, str]] = []
        """``(tenant_id, call_id)`` of every token issued, in order."""
        self.batch_requests: list[str] = []

    async def issue_streaming_token(self, *, tenant_id: uuid.UUID, call_id: str) -> StreamingToken:
        self.issued.append((tenant_id, call_id))
        return StreamingToken(
            token=SecretStr(f"fake-token-{len(self.issued)}"),
            expires_at=self._clock() + self._token_ttl,
        )

    async def transcribe_batch(
        self, *, audio_url: str, language: str | None = None
    ) -> BatchTranscript:
        self.batch_requests.append(audio_url)
        return self._batch_transcript
