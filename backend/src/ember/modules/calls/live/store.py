"""Where a live call's session state lives: Redis, so a reconnecting desktop resumes the call.

The state is small on purpose: who owns the call, whether it ended, and ``last_client_seq`` (the
last desktop message the server accepted). Transcript text is **not** stored here. It is call
content, so keeping it needs the tenant's consent and retention settings (AGENTS.md section 9),
which belong to the ``calls`` persistence work, not to a cache.

Every key starts with the tenant id, so a call id from another tenant is simply a different
(empty) session. Each step is one Lua script, so two connections racing for the same call (a
desktop reconnecting before the server noticed the old socket died) cannot both accept the same
message: exactly one ``advance`` wins.
"""

import uuid
from collections.abc import Awaitable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Final, Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError

KEY_PREFIX: Final = "ember:live"

# KEYS[1] = session key; ARGV = user id, session ttl. Creates the session or returns the existing.
# Replies {existed, last_client_seq, user_id, status}.
_OPEN: Final = """
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then
  redis.call('HSET', key, 'user_id', ARGV[1], 'status', 'active', 'last_client_seq', 0)
  redis.call('EXPIRE', key, ARGV[2])
  return {0, 0, ARGV[1], 'active'}
end
redis.call('EXPIRE', key, ARGV[2])
local fields = redis.call('HMGET', key, 'last_client_seq', 'user_id', 'status')
return {1, tonumber(fields[1]), fields[2], fields[3]}
"""

# ARGV = seq, session ttl. Accepts ``seq`` only if it is exactly the next one.
_ADVANCE: Final = """
local key = KEYS[1]
local fields = redis.call('HMGET', key, 'last_client_seq', 'status')
if not fields[1] then return 'missing' end
if fields[2] ~= 'active' then return 'ended' end
local last = tonumber(fields[1])
local seq = tonumber(ARGV[1])
if seq <= last then return 'duplicate' end
if seq ~= last + 1 then return 'gap' end
redis.call('HSET', key, 'last_client_seq', seq)
redis.call('EXPIRE', key, ARGV[2])
return 'claimed'
"""

# ARGV = retention. Marks the session ended, only if it still exists.
_END: Final = """
local key = KEYS[1]
if redis.call('EXISTS', key) == 1 then
  redis.call('HSET', key, 'status', 'ended')
  redis.call('EXPIRE', key, ARGV[1])
end
return 1
"""


class SessionStoreUnavailable(Exception):
    """The store could not be reached or timed out. The desktop is told to reconnect shortly."""


class Advance(StrEnum):
    CLAIMED = "claimed"
    """The message is the next one and is now accepted."""
    DUPLICATE = "duplicate"
    """Already accepted before (a resend after a reconnect): ignore it."""
    GAP = "gap"
    """A message was skipped."""
    ENDED = "ended"
    MISSING = "missing"
    """The session expired in Redis."""


@dataclass(frozen=True, slots=True)
class SessionState:
    user_id: uuid.UUID
    resumed: bool
    """``False`` for the connection that created the session."""
    last_client_seq: int
    ended: bool


class SessionStore(Protocol):
    async def open(
        self, *, tenant_id: uuid.UUID, call_id: uuid.UUID, user_id: uuid.UUID
    ) -> SessionState:
        """Create the session, or return the existing one (the caller checks who owns it)."""
        ...

    async def advance(self, *, tenant_id: uuid.UUID, call_id: uuid.UUID, seq: int) -> Advance:
        """Accept desktop message ``seq`` if it is the next one, and keep the session alive."""
        ...

    async def end(self, *, tenant_id: uuid.UUID, call_id: uuid.UUID) -> None:
        """Mark the session ended and keep it briefly."""
        ...


class RedisSessionStore:
    """:class:`SessionStore` on Redis. The client must be created with ``decode_responses=True``."""

    def __init__(
        self,
        redis: Redis,
        *,
        session_ttl_seconds: int,
        ended_retention_seconds: int,
    ) -> None:
        self._session_ttl = session_ttl_seconds
        self._ended_retention = ended_retention_seconds
        self._open = redis.register_script(_OPEN)
        self._advance = redis.register_script(_ADVANCE)
        self._end = redis.register_script(_END)

    @staticmethod
    def key(tenant_id: uuid.UUID, call_id: uuid.UUID) -> str:
        return f"{KEY_PREFIX}:{tenant_id}:{call_id}"

    async def open(
        self, *, tenant_id: uuid.UUID, call_id: uuid.UUID, user_id: uuid.UUID
    ) -> SessionState:
        reply = await _guarded(
            self._open(keys=[self.key(tenant_id, call_id)], args=[str(user_id), self._session_ttl])
        )
        existed, last_client_seq, owner, status = reply
        return SessionState(
            user_id=uuid.UUID(str(owner)),
            resumed=bool(existed),
            last_client_seq=int(last_client_seq),
            ended=str(status) == "ended",
        )

    async def advance(self, *, tenant_id: uuid.UUID, call_id: uuid.UUID, seq: int) -> Advance:
        reply = await _guarded(
            self._advance(keys=[self.key(tenant_id, call_id)], args=[seq, self._session_ttl])
        )
        return Advance(str(reply))

    async def end(self, *, tenant_id: uuid.UUID, call_id: uuid.UUID) -> None:
        await _guarded(self._end(keys=[self.key(tenant_id, call_id)], args=[self._ended_retention]))


async def _guarded(call: Awaitable[Any]) -> Any:
    """Await a Redis call, turning any Redis or network failure into ``SessionStoreUnavailable``."""
    try:
        return await call
    except (RedisError, OSError) as exc:
        raise SessionStoreUnavailable from exc
