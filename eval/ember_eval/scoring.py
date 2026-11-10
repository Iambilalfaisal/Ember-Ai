"""Scoring: one answer against its golden item, and all of them into the report's numbers.

Four things are measured (foundation plan, F9):

* **correctness**: of the answerable questions, how many got a correct answer;
* **groundedness**: of the answers given, how many say only what the retrieved passages say;
* **"Not confirmed" precision and recall**: how reliably it declines exactly when it should;
* **latency**: p50 and p95 of the whole answer and of the time to the first piece of text.

Correctness and groundedness are judged by word overlap here, with thresholds from ``setups.yaml``.
That is crude and deterministic on purpose: it lets the harness run offline and in CI. A judge that
reads the answer (an LLM through the gateway) replaces ``judge_answer`` when spike S2 needs it.
"""

import math
from dataclasses import dataclass
from typing import Any

from ember_eval.config import ScoringConfig
from ember_eval.dataset import GoldenItem
from ember_eval.search import Passage
from ember_eval.text import content_words, coverage


@dataclass(frozen=True, slots=True)
class Attempt:
    """What the pipeline did with one question."""

    answer: str
    """The text the rep would see; empty when nothing was shown."""
    not_confirmed: bool
    reason: str
    """``low_confidence`` (the search gate), ``model_declined``, ``error`` or ``answered``."""
    passages: tuple[Passage, ...]
    retrieve_ms: float
    first_token_ms: float | None
    """Time from asking the model to its first text; ``None`` when the model was not asked."""
    total_ms: float


@dataclass(frozen=True, slots=True)
class ItemResult:
    item: GoldenItem
    attempt: Attempt
    correct: bool
    """Answerable: answered and the answer is right. Unanswerable: declined, as it should."""
    answer_recall: float | None
    """Share of the expected answer's words in the answer (answerable questions only)."""
    grounded: bool | None
    """``None`` when no answer was given, so there is nothing to ground."""
    groundedness: float | None
    source_retrieved: bool | None
    """Did the passages include the item's ``source_doc``? ``None`` for unanswerable items."""


def judge_answer(expected: str, answer: str) -> float:
    """How much of the expected answer the answer contains, 0 to 1."""
    return coverage(content_words(expected), content_words(answer))


def judge_grounding(answer: str, passages: tuple[Passage, ...]) -> float:
    """How much of the answer is found in the passages, 0 to 1."""
    support = frozenset().union(*(content_words(passage.text) for passage in passages))
    return coverage(content_words(answer), support)


def score_item(item: GoldenItem, attempt: Attempt, config: ScoringConfig) -> ItemResult:
    """Score one attempt."""
    recall = None
    grounding = None
    grounded = None
    if not attempt.not_confirmed:
        grounding = judge_grounding(attempt.answer, attempt.passages)
        grounded = grounding >= config.grounded_min_overlap
    if item.answerable:
        recall = judge_answer(item.expected_answer or "", attempt.answer) if attempt.answer else 0.0
        correct = not attempt.not_confirmed and recall >= config.correct_min_recall
        source_retrieved = any(passage.doc == item.source_doc for passage in attempt.passages)
    else:
        correct = attempt.not_confirmed
        source_retrieved = None
    return ItemResult(
        item=item,
        attempt=attempt,
        correct=correct,
        answer_recall=recall,
        grounded=grounded,
        groundedness=grounding,
        source_retrieved=source_retrieved,
    )


def percentile(values: list[float], fraction: float) -> float | None:
    """Nearest-rank percentile (``fraction`` 0.95 is p95); ``None`` for no values."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(fraction * len(ordered)))
    return ordered[rank - 1]


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def aggregate(results: list[ItemResult]) -> dict[str, Any]:
    """The report's numbers. A ratio with nothing to divide is ``None``, never a made-up 0 or 1."""
    answerable = [r for r in results if r.item.answerable]
    unanswerable = [r for r in results if not r.item.answerable]
    answered = [r for r in results if not r.attempt.not_confirmed]
    declined = [r for r in results if r.attempt.not_confirmed]
    declined_rightly = [r for r in declined if not r.item.answerable]
    first_tokens = [
        r.attempt.first_token_ms for r in results if r.attempt.first_token_ms is not None
    ]
    totals = [r.attempt.total_ms for r in results]
    return {
        "items": len(results),
        "answerable": len(answerable),
        "unanswerable": len(unanswerable),
        "correctness": _ratio(sum(r.correct for r in answerable), len(answerable)),
        "groundedness": _ratio(sum(bool(r.grounded) for r in answered), len(answered)),
        "not_confirmed_precision": _ratio(len(declined_rightly), len(declined)),
        "not_confirmed_recall": _ratio(len(declined_rightly), len(unanswerable)),
        "overall_accuracy": _ratio(sum(r.correct for r in results), len(results)),
        "source_retrieved": _ratio(
            sum(bool(r.source_retrieved) for r in answerable), len(answerable)
        ),
        "errors": sum(r.attempt.reason == "error" for r in results),
        "latency_ms": {
            "total_p50": percentile(totals, 0.50),
            "total_p95": percentile(totals, 0.95),
            "first_token_p50": percentile(first_tokens, 0.50),
            "first_token_p95": percentile(first_tokens, 0.95),
            "retrieve_p50": percentile([r.attempt.retrieve_ms for r in results], 0.50),
        },
    }
