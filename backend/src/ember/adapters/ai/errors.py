"""Errors raised by the AI gateway and its providers.

``AiProviderError`` and its subclasses are :class:`~ember.core.errors.AppError` s, so a route
that lets one escape answers 503 problem+json. Their messages are fixed text: nothing from the
request or the vendor's reply (which can echo prompt content) goes into a message.
"""

from ember.core.errors import UpstreamUnavailable


class AiConfigError(ValueError):
    """``ai_tasks.yaml`` or the gateway wiring is wrong. Raised at startup, never per call."""


class UnknownAiTask(LookupError):
    """Code asked for a task that ``ai_tasks.yaml`` does not define (a programming error)."""


class AiTaskKindMismatch(TypeError):
    """A chat task was used for embeddings, or the other way round (a programming error)."""


class AiProviderError(UpstreamUnavailable):
    """The AI vendor failed or answered with something unusable."""

    type = "urn:ember:problem:ai-provider-error"
    title = "AI Provider Error"

    def __init__(
        self,
        detail: str = "The AI provider request failed.",
        *,
        upstream_status: int | None = None,
        error_code: str | None = None,
    ) -> None:
        super().__init__(detail)
        self.upstream_status = upstream_status
        """HTTP status the vendor answered with, if any. Logged, never returned to clients."""
        self.error_code = error_code
        """The vendor's short error code (for example ``rate_limit_exceeded``), if it sent one."""


class AiTimeout(AiProviderError):
    """The provider did not answer within the task's ``timeout_seconds``."""

    type = "urn:ember:problem:ai-timeout"
    title = "AI Provider Timeout"

    def __init__(self, detail: str = "The AI provider took too long to answer.") -> None:
        super().__init__(detail)


class AiNotConfigured(UpstreamUnavailable):
    """The provider a task needs has no credentials in this environment."""

    type = "urn:ember:problem:ai-not-configured"
    title = "AI Provider Not Configured"
