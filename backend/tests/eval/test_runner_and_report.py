"""The runner against the real gateway and prompt, the reports, and the command line."""

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from ember.adapters.ai.config import AiTasksConfig
from ember.adapters.ai.errors import AiProviderError
from ember.adapters.ai.fake import FakeAiProvider, InMemoryUsageRecorder
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.prompts import Prompt, PromptLibrary
from ember.adapters.ai.tracing import NullTracer
from ember_eval.config import EvalConfig, load_config
from ember_eval.dataset import (
    GoldenItem,
    inputs_fingerprint,
    load_documents,
    load_golden,
)
from ember_eval.report import (
    build_report,
    find_regressions,
    latest_comparable,
    render_markdown,
    report_stem,
    write_report,
)
from ember_eval.runner import answer_question, declined, format_passages, run_eval
from ember_eval.scoring import aggregate
from ember_eval.search import KeywordSearch, Passage
from tests.eval.conftest import EVAL

CONFIG: EvalConfig = load_config(EVAL / "setups.yaml")
SETUP = CONFIG.setup("fake")
DOCS = {"pricing.md": "# Pricing\n\nThe Team plan costs 29 dollars per user per month."}
QUESTION = "How much does the Team plan cost per user?"


def make_gateway(provider: FakeAiProvider) -> tuple[AiGateway, InMemoryUsageRecorder]:
    config = AiTasksConfig.model_validate(
        {
            "models": {"fake/answer": {"input_per_million_usd": 1, "output_per_million_usd": 1}},
            "tasks": {
                "live_answer": {
                    "provider": "fake",
                    "model": "answer",
                    "max_tokens": 100,
                    "timeout_seconds": 1,
                }
            },
        }
    )
    recorder = InMemoryUsageRecorder()
    gateway = AiGateway(
        config=config, providers={"fake": provider}, recorder=recorder, tracer=NullTracer()
    )
    return gateway, recorder


@pytest.fixture
def prompt() -> Prompt:
    directory = EVAL.parent / "backend" / "src" / "ember" / "modules" / "calls" / "prompts"
    return PromptLibrary(directory).load("live_answer", version=1)


def golden(identifier: str = "q1", *, answerable: bool = True) -> GoldenItem:
    return GoldenItem(
        id=identifier,
        question=QUESTION,
        expected_answer="The Team plan costs 29 dollars per user per month."
        if answerable
        else None,
        source_doc="pricing.md" if answerable else None,
        answerable=answerable,
    )


# --- the runner --------------------------------------------------------------------------


def test_the_passages_are_listed_with_their_documents() -> None:
    text = format_passages([Passage("a.md", "One.", 1.0), Passage("b.md", "Two.", 0.5)])

    assert text == "- [a.md] One.\n- [b.md] Two."


@pytest.mark.parametrize(
    "reply", ["Not confirmed.", "not confirmed", "  Not confirmed!  ", "Not confirmed. Sorry"]
)
def test_a_not_confirmed_reply_is_recognised(reply: str) -> None:
    assert declined(reply)


@pytest.mark.parametrize("reply", ["The plan costs 29 dollars.", "I cannot confirm", ""])
def test_other_replies_are_answers(reply: str) -> None:
    assert not declined(reply) or reply == ""


async def test_a_confident_question_reaches_the_model_with_the_passages_and_the_question(
    prompt: Prompt,
) -> None:
    provider = FakeAiProvider(reply="The Team plan costs 29 dollars per user per month.")
    gateway, recorder = make_gateway(provider)

    attempt = await _answer(gateway, prompt)

    system, user = provider.chat_requests[0].messages
    assert "29 dollars" in system.content and "[pricing.md]" in system.content
    assert QUESTION not in system.content, "the question is data, in the user message only"
    assert user.content == QUESTION
    assert attempt.reason == "answered" and not attempt.not_confirmed
    assert attempt.first_token_ms is not None
    assert (recorder.records[0].prompt_name, recorder.records[0].prompt_version) == (
        "live_answer",
        1,
    )


async def _answer(gateway: AiGateway, prompt: Prompt, question: str = QUESTION) -> Any:
    from ember.core.tenancy import TenantContext
    from ember_eval.runner import EVAL_TENANT

    with TenantContext.use(EVAL_TENANT):
        return await answer_question(
            question, search=KeywordSearch(DOCS), gateway=gateway, prompt=prompt, setup=SETUP
        )


async def test_with_no_confident_passage_the_model_is_not_asked(prompt: Prompt) -> None:
    provider = FakeAiProvider()
    gateway, _ = make_gateway(provider)

    attempt = await _answer(gateway, prompt, "Who are your biggest competitors?")

    assert attempt.reason == "low_confidence" and attempt.not_confirmed
    assert attempt.first_token_ms is None and attempt.answer == ""
    assert provider.chat_requests == []


async def test_a_model_that_says_not_confirmed_counts_as_declined(prompt: Prompt) -> None:
    gateway, _ = make_gateway(FakeAiProvider(reply="Not confirmed."))

    attempt = await _answer(gateway, prompt)

    assert attempt.reason == "model_declined" and attempt.not_confirmed and attempt.answer == ""
    assert attempt.first_token_ms is not None


async def test_a_vendor_failure_is_counted_and_the_run_goes_on(prompt: Prompt) -> None:
    provider = FakeAiProvider(reply="The Team plan costs 29 dollars per user per month.")
    provider.fail_next(AiProviderError())
    gateway, _ = make_gateway(provider)

    results = await run_eval(
        [golden("q1"), golden("q2")],
        search=KeywordSearch(DOCS),
        gateway=gateway,
        prompt=prompt,
        setup=SETUP,
        scoring=CONFIG.scoring,
    )

    assert [r.attempt.reason for r in results] == ["error", "answered"]
    assert aggregate(results)["errors"] == 1
    assert [r.item.id for r in results] == ["q1", "q2"]


# --- reports -----------------------------------------------------------------------------


def make_report(
    *, created: datetime, setup: str = "fake", sha: str = "abc", **metrics: float | None
) -> dict[str, Any]:
    base: dict[str, Any] = {
        name: 0.8
        for name in (
            "correctness",
            "groundedness",
            "not_confirmed_precision",
            "not_confirmed_recall",
            "overall_accuracy",
        )
    }
    base.update(metrics)
    return {
        "report_version": 1,
        "created_at": created.isoformat(),
        "setup": setup,
        "inputs_sha256": sha,
        "metrics": base,
    }


def at(day: int) -> datetime:
    return datetime(2026, 11, day, 12, 0, tzinfo=UTC)


def save(directory: Path, name: str, report: dict[str, Any]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(json.dumps(report), encoding="utf-8")


def test_a_report_is_named_by_date_time_and_setup_without_characters_windows_rejects() -> None:
    stem = report_stem(datetime(2026, 11, 10, 15, 30, 45, tzinfo=UTC), "fake")

    assert stem == "2026-11-10-153045-fake"
    assert not set(stem) & set('<>:"/\\|?*')


def test_the_latest_comparable_report_is_the_newest_with_the_same_setup_and_inputs(
    tmp_path: Path,
) -> None:
    save(tmp_path, "old.json", make_report(created=at(1), correctness=0.1))
    save(tmp_path, "new.json", make_report(created=at(5), correctness=0.5))
    save(tmp_path, "newer-other-setup.json", make_report(created=at(9), setup="other"))
    save(tmp_path, "newer-other-inputs.json", make_report(created=at(9), sha="zzz"))
    save(tmp_path, "old-format.json", {**make_report(created=at(9)), "report_version": 0})
    (tmp_path / "broken.json").write_text("{not json", encoding="utf-8")
    (tmp_path / "notes.md").write_text("ignored", encoding="utf-8")

    found = latest_comparable(tmp_path, setup="fake", inputs_sha256="abc")

    assert found is not None and found["metrics"]["correctness"] == 0.5


def test_no_comparable_report_gives_none(tmp_path: Path) -> None:
    assert latest_comparable(tmp_path / "missing", setup="fake", inputs_sha256="abc") is None
    save(tmp_path, "x.json", make_report(created=at(1), sha="other"))
    assert latest_comparable(tmp_path, setup="fake", inputs_sha256="abc") is None


def test_a_drop_in_a_quality_score_is_a_regression_but_a_rise_is_not() -> None:
    before = make_report(created=at(1), correctness=0.9, groundedness=0.9)
    after = make_report(created=at(2), correctness=0.8, groundedness=1.0)

    found = find_regressions(before, after, tolerance=0.0)

    assert [(r.metric, r.before, r.after) for r in found] == [("correctness", 0.9, 0.8)]


def test_a_drop_within_the_tolerance_is_allowed() -> None:
    before = make_report(created=at(1), correctness=0.9)
    after = make_report(created=at(2), correctness=0.88)

    assert find_regressions(before, after, tolerance=0.05) == []
    assert len(find_regressions(before, after, tolerance=0.01)) == 1


def test_a_score_that_is_not_available_on_either_side_is_skipped() -> None:
    before = make_report(created=at(1), not_confirmed_recall=None)
    after = make_report(created=at(2), not_confirmed_recall=0.0, correctness=None)

    assert find_regressions(before, after, tolerance=0.0) == []


# --- end to end --------------------------------------------------------------------------


def run_main(run_module: ModuleType, *arguments: str) -> int:
    code: int = run_module.main(list(arguments))
    return code


def test_a_run_writes_a_json_and_a_markdown_report(
    run_module: ModuleType, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run_main(run_module, "--out", str(tmp_path)) == 0

    files = sorted(path.suffix for path in tmp_path.iterdir())
    assert files == [".json", ".md"]
    report = json.loads(next(tmp_path.glob("*.json")).read_text(encoding="utf-8"))
    assert report["report_version"] == 1 and report["setup"] == "fake"
    assert report["dataset"]["items"] == len(load_golden(EVAL / "golden" / "sample.jsonl"))
    assert len(report["items"]) == report["dataset"]["items"]
    assert report["config"]["ai_task"]["task"] == "live_answer"
    markdown = next(tmp_path.glob("*.md")).read_text(encoding="utf-8")
    for heading in ("## Scores", "## Latency", "## Items", "## Wrong", "Not confirmed recall"):
        assert heading in markdown
    assert "report written to" in capsys.readouterr().out


def test_the_fake_run_gives_the_same_scores_every_time(
    run_module: ModuleType, tmp_path: Path
) -> None:
    run_main(run_module, "--out", str(tmp_path / "a"))
    run_main(run_module, "--out", str(tmp_path / "b"))

    first, second = (
        json.loads(next((tmp_path / name).glob("*.json")).read_text(encoding="utf-8"))
        for name in ("a", "b")
    )
    keep = lambda r: {k: v for k, v in r["metrics"].items() if k != "latency_ms"}  # noqa: E731
    assert keep(first) == keep(second)
    assert [i["outcome"] for i in first["items"]] == [i["outcome"] for i in second["items"]]


def test_a_regression_is_reported_with_exit_status_2(
    run_module: ModuleType, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run_main(run_module, "--out", str(tmp_path))
    baseline = json.loads(next(tmp_path.glob("*.json")).read_text(encoding="utf-8"))
    baseline["created_at"] = "2999-01-01T00:00:00+00:00"
    baseline["metrics"]["correctness"] = 1.0
    (tmp_path / "baseline.json").write_text(json.dumps(baseline), encoding="utf-8")
    capsys.readouterr()

    code = run_main(run_module, "--out", str(tmp_path), "--check-regression")

    assert code == 2
    assert "correctness fell from 1.000" in capsys.readouterr().err


def test_no_regression_against_an_identical_earlier_run(
    run_module: ModuleType, tmp_path: Path
) -> None:
    run_main(run_module, "--out", str(tmp_path))

    assert run_main(run_module, "--out", str(tmp_path), "--check-regression") == 0


def test_with_nothing_to_compare_against_the_check_passes_and_says_so(
    run_module: ModuleType, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run_main(run_module, "--out", str(tmp_path), "--check-regression") == 0
    assert "no earlier comparable report" in capsys.readouterr().out


def test_a_report_of_changed_documents_is_not_compared(
    run_module: ModuleType, tmp_path: Path
) -> None:
    golden_copy = tmp_path / "set" / "golden"
    shutil.copytree(EVAL / "golden", golden_copy)
    out = tmp_path / "out"
    run_main(run_module, "--dataset", str(golden_copy / "sample.jsonl"), "--out", str(out))
    baseline = json.loads(next(out.glob("*.json")).read_text(encoding="utf-8"))
    baseline["created_at"] = "2999-01-01T00:00:00+00:00"
    baseline["metrics"]["correctness"] = 1.0
    (out / "baseline.json").write_text(json.dumps(baseline), encoding="utf-8")
    (golden_copy / "docs" / "pricing.md").write_text("# Pricing\n\nChanged.\n", encoding="utf-8")

    code = run_main(
        run_module,
        "--dataset", str(golden_copy / "sample.jsonl"),
        "--out", str(out),
        "--check-regression",
    )  # fmt: skip

    assert code == 0


def test_bad_input_is_a_clean_error_not_a_traceback(
    run_module: ModuleType, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run_main(run_module, "--setup", "nope", "--out", str(tmp_path)) == 1
    assert "No setup 'nope'" in capsys.readouterr().err
    assert run_main(run_module, "--dataset", str(tmp_path / "missing.jsonl")) == 1
    assert "Cannot read the golden file" in capsys.readouterr().err
    assert list(tmp_path.iterdir()) == []


def test_reports_of_the_sample_go_to_reports_and_of_any_other_set_to_the_ignored_folder(
    run_module: ModuleType, tmp_path: Path
) -> None:
    assert run_module.default_output_directory(EVAL / "golden" / "sample.jsonl") == EVAL / "reports"
    assert run_module.default_output_directory(tmp_path / "real.jsonl") == EVAL / "real" / "reports"
    gitignore = (EVAL.parent / ".gitignore").read_text(encoding="utf-8")
    assert "eval/real/" in gitignore


def test_the_committed_baseline_report_matches_the_current_sample() -> None:
    """Change the sample questions or documents, and a new report must be recorded with them."""
    golden = EVAL / "golden" / "sample.jsonl"
    fingerprint = inputs_fingerprint(golden, load_documents(EVAL / "golden" / "docs"))

    baseline = latest_comparable(EVAL / "reports", setup="fake", inputs_sha256=fingerprint)

    assert baseline is not None, "run `uv run poe eval` and commit the new report in eval/reports/"


def test_build_and_render_work_for_a_run_with_no_answers(prompt: Prompt) -> None:
    results = []  # an empty run still renders (every ratio is n/a)
    metrics = aggregate(results)
    report = build_report(
        created_at=at(1),
        setup_name="fake",
        setup=SETUP.model_dump(mode="json"),
        scoring=CONFIG.scoring.model_dump(mode="json"),
        dataset={
            "path": "x.jsonl",
            "items": 0,
            "answerable": 0,
            "unanswerable": 0,
            "documents": 0,
            "inputs_sha256": "0" * 64,
        },
        prompt={"name": prompt.name, "version": prompt.version},
        ai_task={
            "task": "live_answer",
            "configured_provider": "p",
            "configured_model": "m",
            "answered_by": "fake",
        },
        metrics=metrics,
        results=results,
    )

    markdown = render_markdown(report, results)

    assert "n/a" in markdown and "Nothing: every question was handled correctly." in markdown


def test_write_report_creates_the_folder_and_both_files(tmp_path: Path) -> None:
    report = make_report(created=at(1))

    json_path, markdown_path = write_report(
        tmp_path / "new" / "folder", report, "# hi\n", created_at=at(1)
    )

    assert json_path.name == "2026-11-01-120000-fake.json"
    assert markdown_path.read_text(encoding="utf-8") == "# hi\n"
    assert json.loads(json_path.read_text(encoding="utf-8"))["setup"] == "fake"
