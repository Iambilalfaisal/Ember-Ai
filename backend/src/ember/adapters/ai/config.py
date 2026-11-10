"""``config/ai_tasks.yaml``: which provider and model each AI task uses, and what they cost.

Code names a task (``live_answer``), never a model (AGENTS.md section 7). Changing the model
behind a task, its limits or its fallback is an edit to that file only. Prices live there too,
so cost figures follow the model without a code change. The file is validated at startup:
a task whose model has no price, or a chat task without ``max_tokens``, stops the process
instead of failing on the first call.
"""

from decimal import Decimal
from pathlib import Path
from typing import Literal, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from ember.adapters.ai.errors import AiConfigError
from ember.adapters.ai.interface import TokenUsage

_PER_MILLION = Decimal(1_000_000)
_COST_PLACES = Decimal("0.00000001")


class _Strict(BaseModel):
    # A misspelled key must fail loudly instead of silently using a default.
    model_config = ConfigDict(extra="forbid", frozen=True)


class ModelPrice(_Strict):
    """US dollars per million tokens. Embedding models have no output price."""

    input_per_million_usd: Decimal = Field(ge=0)
    output_per_million_usd: Decimal = Field(default=Decimal(0), ge=0)


class ModelRef(_Strict):
    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)

    @property
    def price_key(self) -> str:
        return f"{self.provider}/{self.model}"


class TaskConfig(_Strict):
    kind: Literal["chat", "embedding"] = "chat"
    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
    max_tokens: int | None = Field(default=None, gt=0)
    """Cap on generated tokens. Required for chat tasks, meaningless for embeddings."""
    timeout_seconds: float = Field(gt=0)
    """Chat/embedding: the whole call. Streaming: the longest wait for the next piece of text
    (the first piece included), so a slow consumer never counts against the provider."""
    temperature: float | None = Field(default=None, ge=0, le=2)
    fallback: ModelRef | None = None
    """Tried when the primary fails or times out (a streamed answer only if nothing was sent)."""

    @property
    def primary(self) -> ModelRef:
        return ModelRef(provider=self.provider, model=self.model)

    @model_validator(mode="after")
    def _kind_matches_fields(self) -> Self:
        if self.kind == "chat" and self.max_tokens is None:
            raise ValueError("chat tasks need max_tokens")
        if self.kind == "embedding" and (self.max_tokens is not None or self.temperature):
            raise ValueError("embedding tasks take neither max_tokens nor temperature")
        return self


class AiTasksConfig(_Strict):
    models: dict[str, ModelPrice]
    """Keyed ``<provider>/<model>``, for example ``openai/gpt-4o-mini``."""
    tasks: dict[str, TaskConfig]

    @model_validator(mode="after")
    def _every_model_has_a_price(self) -> Self:
        for name, task in self.tasks.items():
            for ref in (task.primary, task.fallback):
                if ref is not None and ref.price_key not in self.models:
                    raise ValueError(f"task {name!r} uses {ref.price_key!r}, which has no price")
        return self

    def providers_in_use(self) -> set[str]:
        used: set[str] = set()
        for task in self.tasks.values():
            used.add(task.provider)
            if task.fallback is not None:
                used.add(task.fallback.provider)
        return used

    def cost_usd(self, target: ModelRef, usage: TokenUsage) -> Decimal:
        """Cost of ``usage`` on ``target`` at the configured prices (8 decimal places)."""
        price = self.models[target.price_key]
        cost = (
            usage.input_tokens * price.input_per_million_usd
            + usage.output_tokens * price.output_per_million_usd
        ) / _PER_MILLION
        return cost.quantize(_COST_PLACES)


def load_tasks_config(path: Path) -> AiTasksConfig:
    """Read and validate the task file.

    Raises:
        AiConfigError: the file is missing, is not YAML, or fails validation. The message names
            the problem and the path, never any secret.
    """
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise AiConfigError(f"Cannot read the AI task file {path}.") from exc
    except yaml.YAMLError as exc:
        raise AiConfigError(f"The AI task file {path} is not valid YAML.") from exc
    try:
        return AiTasksConfig.model_validate(raw)
    except ValidationError as exc:
        raise AiConfigError(f"The AI task file {path} is invalid:\n{exc}") from exc
