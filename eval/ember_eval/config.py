"""``setups.yaml``: scoring thresholds and the named setups the harness can run."""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class ConfigError(ValueError):
    """``setups.yaml`` is missing or invalid, or the named setup does not exist."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ScoringConfig(_Strict):
    correct_min_recall: float = Field(ge=0, le=1)
    grounded_min_overlap: float = Field(ge=0, le=1)
    regression_tolerance: float = Field(ge=0, le=1)


class SearchConfig(_Strict):
    kind: Literal["keyword"]
    top_k: int = Field(gt=0)
    min_score: float = Field(ge=0, le=1)


class AnswerConfig(_Strict):
    provider: Literal["extractive-fake"]
    min_overlap: float = Field(ge=0, le=1)


class SetupConfig(_Strict):
    description: str
    search: SearchConfig
    answer: AnswerConfig


class EvalConfig(_Strict):
    scoring: ScoringConfig
    setups: dict[str, SetupConfig]

    def setup(self, name: str) -> SetupConfig:
        """The setup called ``name``.

        Raises:
            ConfigError: there is no such setup.
        """
        try:
            return self.setups[name]
        except KeyError:
            raise ConfigError(f"No setup {name!r}; choose from {sorted(self.setups)}.") from None


def load_config(path: Path) -> EvalConfig:
    """Read and validate ``setups.yaml``.

    Raises:
        ConfigError: the file is missing or does not match the expected shape.
    """
    try:
        return EvalConfig.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
    except (OSError, yaml.YAMLError, ValidationError) as exc:
        raise ConfigError(f"{path.name} is missing or invalid: {exc}") from exc
