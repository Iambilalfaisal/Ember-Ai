"""The WebSocket route, through the real realtime app and dev tokens.

Flow tests use a real Redis (needs Docker); the sign-in refusals happen before Redis is touched.
"""

import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import pytest
import redis as sync_redis
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import SecretStr
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from ember.adapters.ai.factory import FAKE_REPLY
from ember.core.config import AuthSettings, RedisSettings, Settings
from ember.core.security import Role, issue_dev_token
from ember.entrypoints.realtime import create_app
from ember.modules.calls.live.store import RedisSessionStore
from tests.conftest import make_settings
from tests.modules.calls.live.support import (
    CALL,
    OTHER_TENANT,
    OTHER_USER,
    TENANT,
    USER,
    final_frame,
    frame,
    partial_frame,
    start_frame,
)

DEV_KEY = "realtime-tests-dev-signing-key-0123456789"
URL = f"/ws/v1/calls/{CALL}"
STAGES = {
    "stage.detect",
    "stage.rewrite",
    "stage.retrieve",
    "stage.generate_total",
    "stage.generate_first_token",
}


def settings_for(redis_url: str | None = None) -> Settings:
    values: dict[str, Any] = {
        "env": "local",
        "auth": AuthSettings(dev_signing_key=SecretStr(DEV_KEY)),
    }
    if redis_url is not None:
        values["redis"] = RedisSettings(url=redis_url)  # type: ignore[arg-type]
    return make_settings(**values)


def bearer(
    settings: Settings,
    *,
    user: uuid.UUID = USER,
    tenant: uuid.UUID = TENANT,
    roles: tuple[Role, ...] = (Role.REP,),
    ttl: timedelta = timedelta(minutes=5),
) -> dict[str, str]:
    token = issue_dev_token(
        settings, user_id=user, tenant_id=tenant, roles=frozenset(roles), ttl=ttl
    )
    return {"Authorization": f"Bearer {token}"}


@dataclass(frozen=True)
class Call:
    """One call id and the frames a desktop sends for it."""

    call_id: uuid.UUID = field(default_factory=uuid.uuid4)

    @property
    def url(self) -> str:
        return f"/ws/v1/calls/{self.call_id}"

    def hello(self, ws: WebSocketTestSession) -> dict[str, Any]:
        ws.send_text(start_frame(call_id=self.call_id))
        ready: dict[str, Any] = ws.receive_json()
        return ready

    def final(self, seq: int, text: str, utterance_id: str = "u1") -> str:
        return final_frame(seq, text, utterance_id=utterance_id, call_id=self.call_id)

    def partial(self, seq: int, text: str) -> str:
        return partial_frame(seq, text, call_id=self.call_id)

    def end(self, seq: int) -> str:
        return frame("session.end", seq, call_id=self.call_id)


def read_until(ws: WebSocketTestSession, type_: str) -> list[dict[str, Any]]:
    """Messages from the server up to and including the first of ``type_``."""
    seen = []
    while (message := ws.receive_json())["type"] != type_:
        seen.append(message)
    return [*seen, message]


def close_code(client: TestClient, url: str, headers: dict[str, str] | None = None) -> int:
    """Connect, and return the close code the server answers with."""
    with (
        client.websocket_connect(url, headers=headers or {}) as ws,
        pytest.raises(WebSocketDisconnect) as closed,
    ):
        ws.receive_json()
    return closed.value.code


@pytest.fixture
def call() -> Call:
    """A new call per test: the Redis container is shared."""
    return Call()


@pytest.fixture
def settings() -> Settings:
    return settings_for()


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """The app with no reachable Redis: for tests that are refused before any state is used."""
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def live_client(redis_url: str) -> Iterator[tuple[TestClient, Settings]]:
    """The app against a real Redis, and the settings that mint its tokens."""
    settings = settings_for(redis_url)
    with TestClient(create_app(settings)) as client:
        yield client, settings


@pytest.fixture
def redis_client(redis_url: str) -> Iterator[sync_redis.Redis]:
    connection = sync_redis.Redis.from_url(redis_url, decode_responses=True)
    yield connection
    connection.close()


# --- signing in ----------------------------------------------------------------


def test_no_token_means_close_4401(client: TestClient) -> None:
    assert close_code(client, URL) == 4401


@pytest.mark.parametrize(
    "authorization",
    ["Bearer", "Bearer ", "Basic abc", "abc", "Bearer not-a-jwt", "Token abc.def.ghi"],
)
def test_a_malformed_or_invalid_authorization_header_means_close_4401(
    client: TestClient, authorization: str
) -> None:
    assert close_code(client, URL, {"Authorization": authorization}) == 4401


def test_an_expired_token_means_close_4401(client: TestClient, settings: Settings) -> None:
    assert close_code(client, URL, bearer(settings, ttl=timedelta(minutes=-5))) == 4401


def test_a_token_signed_with_another_key_means_close_4401(client: TestClient) -> None:
    other_key = settings_for().model_copy(
        update={"auth": AuthSettings(dev_signing_key=SecretStr("another-key-" + "x" * 30))}
    )

    assert close_code(client, URL, bearer(other_key)) == 4401


def test_a_token_in_the_url_is_not_accepted(client: TestClient, settings: Settings) -> None:
    token = bearer(settings)["Authorization"].removeprefix("Bearer ")

    assert close_code(client, f"{URL}?token={token}") == 4401
    assert close_code(client, f"{URL}?access_token={token}") == 4401


def test_a_user_with_no_role_may_not_take_calls(client: TestClient, settings: Settings) -> None:
    assert close_code(client, URL, bearer(settings, roles=())) == 4403


@pytest.mark.integration
@pytest.mark.parametrize("role", [Role.REP, Role.TEAM_LEAD, Role.ADMIN])
def test_every_signed_in_role_may_take_a_call(
    live_client: tuple[TestClient, Settings], call: Call, role: Role
) -> None:
    client, settings = live_client

    with client.websocket_connect(call.url, headers=bearer(settings, roles=(role,))) as ws:
        assert call.hello(ws)["type"] == "session.ready"


def test_a_call_id_that_is_not_a_uuid_is_refused(client: TestClient, settings: Settings) -> None:
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws/v1/calls/not-a-uuid", headers=bearer(settings)),
    ):
        pass


@pytest.mark.integration
def test_a_refused_sign_in_creates_no_session(
    live_client: tuple[TestClient, Settings], redis_client: sync_redis.Redis, call: Call
) -> None:
    client, _ = live_client

    assert close_code(client, call.url) == 4401

    assert redis_client.keys(f"*{call.call_id}*") == []


# --- a whole call ----------------------------------------------------------------


@pytest.mark.integration
def test_a_call_runs_from_start_through_a_streamed_card_to_the_end(
    live_client: tuple[TestClient, Settings], call: Call
) -> None:
    client, settings = live_client

    with client.websocket_connect(call.url, headers=bearer(settings)) as ws:
        ready = call.hello(ws)
        assert (ready["type"], ready["seq"], ready["payload"]) == (
            "session.ready",
            1,
            {"resumed": False, "last_client_seq": 0},
        )

        ws.send_text(call.partial(1, "How much does"))
        ws.send_text(call.final(2, "That is great.", "u0"))
        ws.send_text(call.final(3, "How much does it cost?", "u1"))

        start, *deltas, end = read_until(ws, "card.end")
        assert (start["type"], start["payload"]["utterance_id"]) == ("card.start", "u1")
        card_id = start["payload"]["card_id"]
        assert {d["type"] for d in deltas} == {"card.delta"}
        assert {d["payload"]["card_id"] for d in deltas} == {card_id}
        assert len(deltas) > 1  # streamed piece by piece, not in one go
        assert "".join(d["payload"]["text"] for d in deltas) == FAKE_REPLY
        assert end["payload"] == {"card_id": card_id, "status": "complete"}
        # Server numbering: ready is 1, then the card's messages count on from 2.
        assert [m["seq"] for m in (start, *deltas, end)] == list(range(2, 4 + len(deltas)))

        ws.send_text(call.end(4))
        closed = ws.receive()
        assert (closed["type"], closed["code"]) == ("websocket.close", 1000)


@pytest.mark.integration
def test_a_desktop_that_reconnects_resumes_the_same_call(
    live_client: tuple[TestClient, Settings], call: Call
) -> None:
    client, settings = live_client
    headers = bearer(settings)

    with client.websocket_connect(call.url, headers=headers) as first:
        call.hello(first)
        first.send_text(call.final(1, "How much does it cost?", "u1"))
        read_until(first, "card.end")
        first.send_text(call.partial(2, "And"))
        # The desktop's network drops here; it never says session.end.

    with client.websocket_connect(call.url, headers=headers) as second:
        ready = call.hello(second)
        assert ready["seq"] == 1  # the server's numbering is per connection
        assert ready["payload"]["resumed"] is True
        assert ready["payload"]["last_client_seq"] in (1, 2)  # 2 unless the drop beat message 2

        # The desktop re-sends what it is unsure about; none of it is acted on twice.
        second.send_text(call.final(1, "How much does it cost?", "u1"))
        second.send_text(call.partial(2, "And"))
        second.send_text(call.final(3, "Does it support Teams?", "u3"))

        start = second.receive_json()
        assert (start["type"], start["payload"]["utterance_id"]) == ("card.start", "u3")
        read_until(second, "card.end")

        second.send_text(call.end(4))
        assert second.receive()["code"] == 1000


@pytest.mark.integration
def test_a_call_that_ended_cannot_be_rejoined(
    live_client: tuple[TestClient, Settings], call: Call
) -> None:
    client, settings = live_client
    headers = bearer(settings)
    with client.websocket_connect(call.url, headers=headers) as ws:
        call.hello(ws)
        ws.send_text(call.end(1))
        assert ws.receive()["code"] == 1000

    with client.websocket_connect(call.url, headers=headers) as again:
        again.send_text(start_frame(call_id=call.call_id))
        assert again.receive_json()["payload"]["code"] == "session_ended"
        with pytest.raises(WebSocketDisconnect) as closed:
            again.receive_json()
        assert closed.value.code == 4409


@pytest.mark.integration
def test_another_user_of_the_same_tenant_cannot_join_the_call(
    live_client: tuple[TestClient, Settings], call: Call
) -> None:
    client, settings = live_client
    with client.websocket_connect(call.url, headers=bearer(settings)) as owner:
        call.hello(owner)

        with client.websocket_connect(call.url, headers=bearer(settings, user=OTHER_USER)) as other:
            other.send_text(start_frame(call_id=call.call_id))
            assert other.receive_json()["payload"]["code"] == "forbidden"
            with pytest.raises(WebSocketDisconnect) as closed:
                other.receive_json()
            assert closed.value.code == 4403


@pytest.mark.integration
def test_the_same_call_id_in_another_tenant_is_a_different_call(
    live_client: tuple[TestClient, Settings], call: Call
) -> None:
    client, settings = live_client
    with client.websocket_connect(call.url, headers=bearer(settings)) as mine:
        call.hello(mine)
        mine.send_text(call.partial(1, "Hello"))

        theirs_headers = bearer(settings, user=OTHER_USER, tenant=OTHER_TENANT)
        with client.websocket_connect(call.url, headers=theirs_headers) as theirs:
            ready = call.hello(theirs)

            assert ready["payload"] == {"resumed": False, "last_client_seq": 0}


@pytest.mark.integration
def test_a_binary_frame_is_an_error_and_the_call_goes_on(
    live_client: tuple[TestClient, Settings], call: Call
) -> None:
    client, settings = live_client
    with client.websocket_connect(call.url, headers=bearer(settings)) as ws:
        call.hello(ws)

        ws.send_bytes(b"\x00\x01")
        error = ws.receive_json()

        assert error["payload"]["code"] == "invalid_message"
        assert error["payload"]["fatal"] is False
        ws.send_text(call.final(1, "How much does it cost?"))
        assert ws.receive_json()["type"] == "card.start"  # still being served


@pytest.mark.integration
def test_only_ids_and_counters_are_kept_in_redis(
    live_client: tuple[TestClient, Settings], redis_client: sync_redis.Redis, call: Call
) -> None:
    client, settings = live_client
    with client.websocket_connect(call.url, headers=bearer(settings)) as ws:
        call.hello(ws)
        ws.send_text(call.final(1, "my-secret-call-content, how much?"))
        read_until(ws, "card.end")

    key = RedisSessionStore.key(TENANT, call.call_id)
    assert redis_client.hgetall(key) == {
        "user_id": str(USER),
        "status": "active",
        "last_client_seq": "1",
    }
    assert redis_client.keys(f"*{call.call_id}*") == [key]


@pytest.mark.integration
def test_stage_timings_reach_the_trace_exporter_under_the_connection_span(
    live_client: tuple[TestClient, Settings],
    call: Call,
    telemetry: tuple[InMemorySpanExporter, Any],
) -> None:
    exporter, _ = telemetry
    exporter.clear()
    client, settings = live_client

    with client.websocket_connect(call.url, headers=bearer(settings)) as ws:
        call.hello(ws)
        ws.send_text(call.final(1, "How much does it cost?"))
        read_until(ws, "card.end")
        ws.send_text(call.end(2))
        ws.receive()

    spans = exporter.get_finished_spans()
    stage_spans = [span for span in spans if span.name.startswith("stage.")]
    assert {span.name for span in stage_spans} == STAGES
    stage_traces = {span.context.trace_id for span in stage_spans}
    assert len(stage_traces) == 1
    others = [span for span in spans if not span.name.startswith("stage.")]
    assert any(span.context.trace_id in stage_traces for span in others)  # the connection's span
    # One span per message would drown the trace (the instrumentation's receive/send spans).
    assert not any("send" in span.name or "receive" in span.name for span in others)


# --- the service itself -----------------------------------------------------------


def test_the_realtime_app_has_health_endpoints_and_no_http_api(client: TestClient) -> None:
    assert client.get("/health/live").json() == {"status": "ok"}
    assert client.get("/api/v1/me").status_code == 404
    assert client.get("/api/v1/openapi.json").status_code == 404
