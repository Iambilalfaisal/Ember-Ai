"""The Redis session store, against a real Redis (needs Docker)."""

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest
from redis.asyncio import Redis

from ember.modules.calls.live.store import (
    Advance,
    RedisSessionStore,
    SessionStoreUnavailable,
)
from tests.modules.calls.live.support import OTHER_TENANT, OTHER_USER, TENANT, USER

pytestmark = pytest.mark.integration

SESSION_TTL = 60
ENDED_TTL = 30


@pytest.fixture
async def redis(redis_url: str) -> AsyncIterator[Redis]:
    client = Redis.from_url(redis_url, decode_responses=True)
    yield client
    await client.aclose()


@pytest.fixture
def store(redis: Redis) -> RedisSessionStore:
    return RedisSessionStore(
        redis, session_ttl_seconds=SESSION_TTL, ended_retention_seconds=ENDED_TTL
    )


@pytest.fixture
def call_id() -> uuid.UUID:
    """A new call per test: the Redis container is shared."""
    return uuid.uuid4()


async def test_the_first_open_creates_the_session_and_the_second_resumes_it(
    store: RedisSessionStore, call_id: uuid.UUID
) -> None:
    first = await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    second = await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)

    assert (first.resumed, first.last_client_seq, first.ended, first.user_id) == (
        False,
        0,
        False,
        USER,
    )
    assert (second.resumed, second.last_client_seq, second.ended, second.user_id) == (
        True,
        0,
        False,
        USER,
    )


async def test_a_later_open_by_someone_else_sees_the_owner_and_does_not_take_over(
    store: RedisSessionStore, call_id: uuid.UUID
) -> None:
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)

    intruder = await store.open(tenant_id=TENANT, call_id=call_id, user_id=OTHER_USER)

    assert intruder.user_id == USER
    assert (await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)).user_id == USER


async def test_messages_are_accepted_once_and_in_order(
    store: RedisSessionStore, call_id: uuid.UUID
) -> None:
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)

    async def advance(seq: int) -> Advance:
        return await store.advance(tenant_id=TENANT, call_id=call_id, seq=seq)

    assert [await advance(seq) for seq in (1, 2)] == [Advance.CLAIMED, Advance.CLAIMED]
    assert [await advance(seq) for seq in (2, 1)] == [Advance.DUPLICATE, Advance.DUPLICATE]
    assert await advance(4) == Advance.GAP
    assert await advance(3) == Advance.CLAIMED
    resumed = await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    assert resumed.last_client_seq == 3


async def test_racing_connections_cannot_both_accept_the_same_message(
    store: RedisSessionStore, call_id: uuid.UUID
) -> None:
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)

    results = await asyncio.gather(
        *(store.advance(tenant_id=TENANT, call_id=call_id, seq=1) for _ in range(25))
    )

    assert results.count(Advance.CLAIMED) == 1
    assert results.count(Advance.DUPLICATE) == 24


async def test_an_unknown_or_expired_session_is_missing(
    store: RedisSessionStore, redis: Redis, call_id: uuid.UUID
) -> None:
    assert await store.advance(tenant_id=TENANT, call_id=call_id, seq=1) == Advance.MISSING
    # No half-made session appears from a stray advance.
    assert await redis.exists(store.key(TENANT, call_id)) == 0

    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    await redis.delete(store.key(TENANT, call_id))

    assert await store.advance(tenant_id=TENANT, call_id=call_id, seq=1) == Advance.MISSING


async def test_an_ended_session_stays_for_a_short_while_and_accepts_nothing(
    store: RedisSessionStore, redis: Redis, call_id: uuid.UUID
) -> None:
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    await store.advance(tenant_id=TENANT, call_id=call_id, seq=1)

    await store.end(tenant_id=TENANT, call_id=call_id)

    state = await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    assert state.ended is True
    assert await store.advance(tenant_id=TENANT, call_id=call_id, seq=2) == Advance.ENDED
    assert 0 < await redis.ttl(store.key(TENANT, call_id)) <= SESSION_TTL
    await store.end(tenant_id=TENANT, call_id=call_id)
    assert 0 < await redis.ttl(store.key(TENANT, call_id)) <= ENDED_TTL


async def test_ending_a_session_that_expired_does_not_recreate_it(
    store: RedisSessionStore, redis: Redis, call_id: uuid.UUID
) -> None:
    await store.end(tenant_id=TENANT, call_id=call_id)

    assert await redis.exists(store.key(TENANT, call_id)) == 0


async def test_every_accepted_message_keeps_the_session_alive(
    store: RedisSessionStore, redis: Redis, call_id: uuid.UUID
) -> None:
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    key = store.key(TENANT, call_id)
    await redis.expire(key, 5)

    await store.advance(tenant_id=TENANT, call_id=call_id, seq=1)

    assert SESSION_TTL - 5 < await redis.ttl(key) <= SESSION_TTL


async def test_a_duplicate_does_not_extend_the_session(
    store: RedisSessionStore, redis: Redis, call_id: uuid.UUID
) -> None:
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    await store.advance(tenant_id=TENANT, call_id=call_id, seq=1)
    key = store.key(TENANT, call_id)
    await redis.expire(key, 5)

    await store.advance(tenant_id=TENANT, call_id=call_id, seq=1)

    assert await redis.ttl(key) <= 5


async def test_tenant_a_cannot_see_or_move_tenant_bs_session(
    store: RedisSessionStore, call_id: uuid.UUID
) -> None:
    # The tenant-isolation proof (AGENTS.md section 4) for this store: the same call id in two
    # tenants is two unrelated sessions.
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    await store.advance(tenant_id=TENANT, call_id=call_id, seq=1)
    await store.advance(tenant_id=TENANT, call_id=call_id, seq=2)

    assert await store.advance(tenant_id=OTHER_TENANT, call_id=call_id, seq=1) == Advance.MISSING
    other = await store.open(tenant_id=OTHER_TENANT, call_id=call_id, user_id=OTHER_USER)
    assert (other.resumed, other.user_id, other.last_client_seq) == (False, OTHER_USER, 0)
    await store.end(tenant_id=OTHER_TENANT, call_id=call_id)

    mine = await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    assert (mine.resumed, mine.last_client_seq, mine.ended) == (True, 2, False)


async def test_the_key_starts_with_the_tenant_and_only_ids_and_counters_are_stored(
    store: RedisSessionStore, redis: Redis, call_id: uuid.UUID
) -> None:
    await store.open(tenant_id=TENANT, call_id=call_id, user_id=USER)
    await store.advance(tenant_id=TENANT, call_id=call_id, seq=1)

    key = store.key(TENANT, call_id)
    assert key == f"ember:live:{TENANT}:{call_id}"
    assert await redis.hgetall(key) == {  # type: ignore[misc]
        "user_id": str(USER),
        "status": "active",
        "last_client_seq": "1",
    }


@pytest.mark.parametrize("operation", ["open", "advance", "end"])
async def test_an_unreachable_redis_is_reported_as_unavailable(
    call_id: uuid.UUID, operation: str
) -> None:
    broken = Redis.from_url(
        "redis://127.0.0.1:1/0", decode_responses=True, socket_connect_timeout=0.2
    )
    store = RedisSessionStore(broken, session_ttl_seconds=SESSION_TTL, ended_retention_seconds=1)
    calls = {
        "open": lambda: store.open(tenant_id=TENANT, call_id=call_id, user_id=USER),
        "advance": lambda: store.advance(tenant_id=TENANT, call_id=call_id, seq=1),
        "end": lambda: store.end(tenant_id=TENANT, call_id=call_id),
    }

    with pytest.raises(SessionStoreUnavailable):
        await calls[operation]()

    await broken.aclose()
