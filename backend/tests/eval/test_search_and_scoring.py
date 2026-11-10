"""Keyword search, the fake model, scoring and the aggregate numbers."""

import pytest

from ember.adapters.ai.interface import ChatRequest, Message
from ember_eval.config import ScoringConfig
from ember_eval.dataset import GoldenItem
from ember_eval.fake_model import NOT_CONFIRMED, ExtractiveProvider
from ember_eval.scoring import (
    Attempt,
    ItemResult,
    aggregate,
    judge_answer,
    judge_grounding,
    percentile,
    score_item,
)
from ember_eval.search import KeywordSearch, Passage

DOCS = {
    "pricing.md": (
        "# Pricing\n\nThe Team plan costs 29 dollars per user.\n\nAnnual billing gives a discount."
    ),
    "support.md": "# Support\n\nEmail support is available on all plans.",
}
SCORING = ScoringConfig(correct_min_recall=0.6, grounded_min_overlap=0.8, regression_tolerance=0)


def item(identifier: str, *, answerable: bool, expected: str | None = "Ten dollars.") -> GoldenItem:
    return GoldenItem(
        id=identifier,
        question="How much?",
        expected_answer=expected if answerable else None,
        source_doc="pricing.md" if answerable else None,
        answerable=answerable,
    )


def attempt(
    answer: str = "Ten dollars.",
    *,
    declined: bool = False,
    reason: str = "answered",
    passages: tuple[Passage, ...] = (Passage("pricing.md", "Ten dollars per user.", 1.0),),
    total: float = 10.0,
    first: float | None = 2.0,
) -> Attempt:
    return Attempt(
        "" if declined else answer,
        declined,
        reason,
        passages,
        1.0,
        None if declined else first,
        total,
    )


# --- search ------------------------------------------------------------------------------


def test_search_returns_the_best_paragraph_first_with_its_document() -> None:
    passages = KeywordSearch(DOCS).search("How much does the Team plan cost?", k=2)

    assert passages[0].doc == "pricing.md"
    assert "29 dollars" in passages[0].text
    assert passages[0].score > passages[1].score
    assert all(0 <= passage.score <= 1 for passage in passages)


def test_headings_count_for_matching_but_are_not_part_of_the_passage() -> None:
    passages = KeywordSearch(DOCS).search("support", k=1)

    assert passages[0].doc == "support.md"
    assert passages[0].score == 1.0  # found through the heading and the text
    assert not passages[0].text.startswith("#")


def test_search_is_deterministic_and_limited_to_k() -> None:
    search = KeywordSearch(DOCS)

    assert search.search("plan", k=2) == search.search("plan", k=2)
    assert len(search.search("plan", k=1)) == 1
    assert search.search("", k=3)[0].score == 0.0


# --- fake model --------------------------------------------------------------------------


def request(passages: str, question: str) -> ChatRequest:
    return ChatRequest(
        model="m",
        messages=(
            Message("system", f"Be brief.\n\nPassages:\n{passages}\n"),
            Message("user", question),
        ),
        max_tokens=50,
    )


async def test_the_fake_model_answers_with_the_best_matching_sentence() -> None:
    provider = ExtractiveProvider(min_overlap=0.5)
    passages = "- [a.md] Plans vary. The Team plan costs 29 dollars.\n- [b.md] Email is free."

    result = await provider.complete(request(passages, "How much does the Team plan cost?"))

    assert result.text == "The Team plan costs 29 dollars."  # no "- [a.md]" prefix


async def test_the_fake_model_declines_when_nothing_matches() -> None:
    provider = ExtractiveProvider(min_overlap=0.5)

    result = await provider.complete(request("- [a.md] Email is free.", "Where is the moon?"))

    assert result.text == NOT_CONFIRMED


async def test_the_fake_model_streams_word_by_word_then_reports_usage() -> None:
    provider = ExtractiveProvider(min_overlap=0.5)

    chunks = [
        c async for c in provider.stream(request("- [a.md] Ten dollars total.", "dollars total"))
    ]

    assert "".join(c.text for c in chunks) == "Ten dollars total."
    assert len([c for c in chunks if c.text]) == 3
    assert chunks[-1].usage is not None


# --- scoring one item --------------------------------------------------------------------


def test_the_judges_measure_overlap() -> None:
    assert judge_answer("Ten dollars per month", "ten dollars") == 0.5
    passages = (Passage("a.md", "Ten dollars per user", 1.0),)
    assert judge_grounding("Ten dollars", passages) == 1.0
    assert judge_grounding("Ten euros", passages) == 0.5
    assert judge_grounding("anything", ()) == 0.0


def test_a_right_answer_to_an_answerable_question_is_correct_and_grounded() -> None:
    result = score_item(item("q", answerable=True), attempt(), SCORING)

    assert result.correct and result.grounded and result.source_retrieved
    assert result.answer_recall == 1.0


def test_a_wrong_answer_is_not_correct() -> None:
    result = score_item(item("q", answerable=True), attempt("Twenty euros."), SCORING)

    assert not result.correct
    assert result.answer_recall == 0.0


def test_declining_an_answerable_question_is_wrong_and_has_nothing_to_ground() -> None:
    result = score_item(item("q", answerable=True), attempt(declined=True), SCORING)

    assert not result.correct
    assert result.grounded is None and result.groundedness is None


def test_declining_an_unanswerable_question_is_right_and_answering_it_is_wrong() -> None:
    declined = score_item(item("q", answerable=False), attempt(declined=True), SCORING)
    answered = score_item(item("q", answerable=False), attempt("Ten dollars."), SCORING)

    assert declined.correct and declined.source_retrieved is None
    assert not answered.correct


def test_an_answer_the_passages_do_not_support_is_not_grounded() -> None:
    result = score_item(
        item("q", answerable=True), attempt("Ten dollars and a free yacht."), SCORING
    )

    assert result.grounded is False


def test_the_source_document_counts_as_retrieved_only_if_it_was_in_the_passages() -> None:
    other = (Passage("support.md", "Ten dollars.", 1.0),)

    result = score_item(item("q", answerable=True), attempt(passages=other), SCORING)

    assert result.source_retrieved is False


# --- aggregate ---------------------------------------------------------------------------


def result(
    identifier: str, *, answerable: bool, declined: bool, answer: str = "Ten dollars.", **kw: float
) -> ItemResult:
    return score_item(
        item(identifier, answerable=answerable), attempt(answer, declined=declined, **kw), SCORING
    )


def test_percentiles_use_the_nearest_rank() -> None:
    values = [float(n) for n in range(1, 21)]

    assert percentile(values, 0.50) == 10.0
    assert percentile(values, 0.95) == 19.0
    assert percentile([5.0], 0.95) == 5.0
    assert percentile([], 0.5) is None


def test_the_aggregate_computes_each_score_from_the_right_items() -> None:
    results = [
        result("a", answerable=True, declined=False),  # right answer
        result("b", answerable=True, declined=False, answer="Twenty euros."),  # wrong answer
        result("c", answerable=True, declined=True),  # wrongly declined
        result("d", answerable=False, declined=True),  # rightly declined
        result("e", answerable=False, declined=False),  # should have declined
    ]

    metrics = aggregate(results)

    assert (metrics["items"], metrics["answerable"], metrics["unanswerable"]) == (5, 3, 2)
    assert metrics["correctness"] == pytest.approx(1 / 3)
    assert metrics["not_confirmed_precision"] == pytest.approx(1 / 2)  # declined: c (wrong), d
    assert metrics["not_confirmed_recall"] == pytest.approx(1 / 2)  # unanswerable: d, not e
    assert metrics["groundedness"] == pytest.approx(2 / 3)  # answered: a, e grounded; b not
    assert metrics["overall_accuracy"] == pytest.approx(2 / 5)  # a and d
    assert metrics["errors"] == 0


def test_a_score_with_nothing_to_measure_is_none_not_zero_or_one() -> None:
    only_answerable = aggregate([result("a", answerable=True, declined=False)])
    nothing_declined = aggregate([result("a", answerable=False, declined=False)])

    assert only_answerable["not_confirmed_recall"] is None
    assert only_answerable["not_confirmed_precision"] is None
    assert nothing_declined["correctness"] is None
    assert nothing_declined["not_confirmed_precision"] is None
    assert nothing_declined["not_confirmed_recall"] == 0.0


def test_latency_percentiles_ignore_questions_the_model_was_not_asked() -> None:
    results = [
        result("a", answerable=True, declined=False, total=10.0, first=2.0),
        result("b", answerable=True, declined=False, total=30.0, first=4.0),
        result("c", answerable=False, declined=True, total=1.0),
    ]

    latency = aggregate(results)["latency_ms"]

    assert latency["total_p50"] == 10.0 and latency["total_p95"] == 30.0
    assert latency["first_token_p50"] == 2.0 and latency["first_token_p95"] == 4.0
