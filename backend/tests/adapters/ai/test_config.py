"""ai_tasks.yaml: validation, cost arithmetic and the shipped file."""

from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
import yaml

from ember.adapters.ai.config import AiTasksConfig, ModelRef, load_tasks_config
from ember.adapters.ai.errors import AiConfigError
from ember.adapters.ai.factory import build_ai_gateway
from ember.adapters.ai.interface import TokenUsage
from tests.conftest import BACKEND, make_settings


def _valid() -> dict[str, Any]:
    return {
        "models": {"p/m": {"input_per_million_usd": 2, "output_per_million_usd": 4}},
        "tasks": {"t": {"provider": "p", "model": "m", "max_tokens": 10, "timeout_seconds": 5}},
    }


def _write(tmp_path: Path, content: dict[str, Any]) -> Path:
    path = tmp_path / "ai_tasks.yaml"
    path.write_text(yaml.safe_dump(content), encoding="utf-8")
    return path


def test_a_valid_file_loads_with_defaults(tmp_path: Path) -> None:
    config = load_tasks_config(_write(tmp_path, _valid()))

    task = config.tasks["t"]
    assert task.kind == "chat"
    assert task.fallback is None
    assert task.temperature is None
    assert task.primary == ModelRef(provider="p", model="m")


def test_a_task_whose_model_has_no_price_is_rejected(tmp_path: Path) -> None:
    content = _valid()
    content["tasks"]["t"]["model"] = "unpriced"

    with pytest.raises(AiConfigError, match=r"p/unpriced"):
        load_tasks_config(_write(tmp_path, content))


def test_a_fallback_model_must_have_a_price_too(tmp_path: Path) -> None:
    content = _valid()
    content["tasks"]["t"]["fallback"] = {"provider": "p", "model": "unpriced"}

    with pytest.raises(AiConfigError, match=r"p/unpriced"):
        load_tasks_config(_write(tmp_path, content))


def test_a_chat_task_needs_max_tokens(tmp_path: Path) -> None:
    content = _valid()
    del content["tasks"]["t"]["max_tokens"]

    with pytest.raises(AiConfigError, match="max_tokens"):
        load_tasks_config(_write(tmp_path, content))


def test_an_embedding_task_takes_no_max_tokens(tmp_path: Path) -> None:
    content = _valid()
    content["tasks"]["t"]["kind"] = "embedding"

    with pytest.raises(AiConfigError, match="embedding"):
        load_tasks_config(_write(tmp_path, content))


@pytest.mark.parametrize(
    ("field", "value"),
    [("timeout_seconds", 0), ("max_tokens", 0), ("temperature", 3), ("kind", "image")],
)
def test_out_of_range_values_are_rejected(tmp_path: Path, field: str, value: object) -> None:
    content = _valid()
    content["tasks"]["t"][field] = value

    with pytest.raises(AiConfigError):
        load_tasks_config(_write(tmp_path, content))


def test_a_misspelled_key_is_rejected_instead_of_ignored(tmp_path: Path) -> None:
    content = _valid()
    content["tasks"]["t"]["timeout_second"] = 5

    with pytest.raises(AiConfigError, match="timeout_second"):
        load_tasks_config(_write(tmp_path, content))


def test_a_missing_or_malformed_file_is_a_config_error(tmp_path: Path) -> None:
    with pytest.raises(AiConfigError, match="Cannot read"):
        load_tasks_config(tmp_path / "missing.yaml")

    bad = tmp_path / "bad.yaml"
    bad.write_text("tasks: [unclosed", encoding="utf-8")
    with pytest.raises(AiConfigError, match="not valid YAML"):
        load_tasks_config(bad)


def test_cost_is_input_and_output_tokens_at_the_configured_prices() -> None:
    config = AiTasksConfig.model_validate(_valid())

    # 1,000 input tokens at $2 per million + 500 output tokens at $4 per million.
    cost = config.cost_usd(ModelRef(provider="p", model="m"), TokenUsage(1000, 500))

    assert cost == Decimal("0.004")


def test_cost_has_no_float_rounding_noise() -> None:
    content = _valid()
    content["models"]["p/m"] = {"input_per_million_usd": 0.15, "output_per_million_usd": 0.6}
    config = AiTasksConfig.model_validate(content)

    cost = config.cost_usd(ModelRef(provider="p", model="m"), TokenUsage(1234, 567))

    assert cost == Decimal("0.00052530")
    assert cost.as_tuple().exponent == -8


def test_zero_usage_costs_nothing() -> None:
    assert AiTasksConfig.model_validate(_valid()).cost_usd(
        ModelRef(provider="p", model="m"), TokenUsage()
    ) == Decimal(0)


# --- the file that ships ---------------------------------------------------------


SHIPPED = BACKEND / "config" / "ai_tasks.yaml"


def test_the_shipped_file_is_valid() -> None:
    config = load_tasks_config(SHIPPED)

    assert config.providers_in_use() == {"openai"}


def test_the_shipped_file_defines_the_tasks_named_in_agents_md() -> None:
    config = load_tasks_config(SHIPPED)

    assert {"live_detect", "live_answer", "call_summary", "followup_draft"} <= config.tasks.keys()
    assert {"embed_document", "embed_query"} <= config.tasks.keys()
    assert config.tasks["embed_query"].kind == "embedding"


def test_the_gateway_can_be_built_from_the_shipped_file_without_an_api_key() -> None:
    # The app must start in an environment that never calls a model.
    gateway = build_ai_gateway(make_settings(), session_factory=None)  # type: ignore[arg-type]

    assert gateway is not None
