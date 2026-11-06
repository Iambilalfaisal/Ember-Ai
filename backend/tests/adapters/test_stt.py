import uuid
from datetime import UTC, datetime, timedelta

from ember.adapters.stt.fake import FakeSttProvider
from ember.adapters.stt.interface import BatchTranscript, TranscriptSegment

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)
TENANT = uuid.uuid4()


async def test_a_streaming_token_expires_after_its_lifetime() -> None:
    provider = FakeSttProvider(token_ttl=timedelta(minutes=5), clock=lambda: NOW)

    token = await provider.issue_streaming_token(tenant_id=TENANT, call_id="call-1")

    assert token.expires_at == NOW + timedelta(minutes=5)
    assert token.expires_at.tzinfo is not None


async def test_each_issue_gives_a_new_token_and_is_remembered_per_call() -> None:
    provider = FakeSttProvider()

    first = await provider.issue_streaming_token(tenant_id=TENANT, call_id="call-1")
    second = await provider.issue_streaming_token(tenant_id=TENANT, call_id="call-2")

    assert first.token.get_secret_value() != second.token.get_secret_value()
    assert provider.issued == [(TENANT, "call-1"), (TENANT, "call-2")]


async def test_a_streaming_token_does_not_show_in_its_repr() -> None:
    token = await FakeSttProvider().issue_streaming_token(tenant_id=TENANT, call_id="c")

    assert token.token.get_secret_value() not in repr(token)


async def test_batch_transcription_returns_the_scripted_transcript() -> None:
    transcript = BatchTranscript(
        segments=(TranscriptSegment(start_ms=0, end_ms=900, text="Hello", speaker="rep"),),
        language="en",
    )
    provider = FakeSttProvider(batch_transcript=transcript)

    result = await provider.transcribe_batch(audio_url="https://blob.test/a.mp3")

    assert result == transcript
    assert provider.batch_requests == ["https://blob.test/a.mp3"]
