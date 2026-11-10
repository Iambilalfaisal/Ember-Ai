"""Building the AI gateway from settings, and handing it to routes."""

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.adapters.ai.config import load_tasks_config
from ember.adapters.ai.fake import DiscardUsageRecorder, FakeAiProvider
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.openai_provider import OpenAiProvider
from ember.adapters.ai.tracing import NullTracer, build_tracer
from ember.adapters.ai.usage import DbUsageRecorder
from ember.core.config import Settings


def build_ai_gateway(
    settings: Settings, session_factory: async_sessionmaker[AsyncSession]
) -> AiGateway:
    """The gateway for this process: tasks from ``ai_tasks.yaml``, OpenAI, usage in Postgres.

    Reads and validates the task file now, so a bad file stops the process at startup. A missing
    OpenAI key does not: the first call that needs it raises ``AiNotConfigured`` instead, so
    environments that never call a model still start. Traces go to Langfuse when it is configured.

    Raises:
        AiConfigError: the task file is missing or invalid.
    """
    return AiGateway(
        config=load_tasks_config(settings.ai.tasks_config_path),
        providers={
            "openai": OpenAiProvider(
                api_key=settings.ai.openai_api_key, base_url=settings.ai.openai_base_url
            )
        },
        recorder=DbUsageRecorder(session_factory),
        tracer=build_tracer(settings),
    )


FAKE_REPLY = "This is a fake answer from the Ember skeleton, not from a model."


def build_fake_ai_gateway(settings: Settings, *, reply: str = FAKE_REPLY) -> AiGateway:
    """A gateway that answers every task with ``reply``, word by word, and calls no vendor.

    For processes that run a fake pipeline (the realtime skeleton). It reads the real
    ``ai_tasks.yaml``, so task names, limits and timeouts are the real ones; the fake provider
    stands in for ``openai``. Nothing is recorded or traced: the calls cost nothing, and a stored
    row would look like OpenAI spend.

    Raises:
        AiConfigError: the task file is missing or invalid.
    """
    return AiGateway(
        config=load_tasks_config(settings.ai.tasks_config_path),
        providers={"openai": FakeAiProvider(reply=reply)},
        recorder=DiscardUsageRecorder(),
        tracer=NullTracer(),
    )


def get_ai_gateway(request: Request) -> AiGateway:
    """FastAPI dependency: the process's gateway (``app.state.ai_gateway``)."""
    gateway: AiGateway = request.app.state.ai_gateway
    return gateway
