"""The only file other modules (and entrypoints and scripts) may import from calls.

For now this is what the realtime process needs to serve live calls: the WebSocket router and a
function that builds what every live session shares.
"""

from redis.asyncio import Redis

from ember.adapters.ai.gateway import AiGateway
from ember.core.config import Settings
from ember.modules.calls.live.pipeline import FakePipeline
from ember.modules.calls.live.router import router as live_router
from ember.modules.calls.live.session import LiveRuntime
from ember.modules.calls.live.store import RedisSessionStore

__all__ = ["LiveRuntime", "build_live_runtime", "live_router"]


def build_live_runtime(settings: Settings, *, redis: Redis, gateway: AiGateway) -> LiveRuntime:
    """What the realtime process shares between live sessions.

    ``redis`` must be created with ``decode_responses=True``. The pipeline is the fake one (see
    ``live/pipeline.py``): it answers with canned text through ``gateway`` and uses no knowledge.

    Raises:
        PromptError: the answer prompt file is missing.
    """
    realtime = settings.realtime
    return LiveRuntime(
        store=RedisSessionStore(
            redis,
            session_ttl_seconds=realtime.session_ttl_seconds,
            ended_retention_seconds=realtime.ended_session_retention_seconds,
        ),
        pipeline=FakePipeline(gateway),
        max_message_bytes=realtime.max_message_bytes,
        start_timeout_seconds=realtime.start_timeout_seconds,
    )
