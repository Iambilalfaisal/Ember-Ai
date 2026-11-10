"""Reports: a JSON file (for machines and comparisons) and a Markdown file (for people).

Both are named ``<date>-<time>-<setup>`` (UTC, no colons so Windows accepts them) and written to
``eval/reports/``. Reports of the committed sample set are committed. Reports of any other set go
to ``eval/real/reports/``, which git ignores: they contain real questions (AGENTS.md section 9).
The format is described in ``eval/README.md``.
"""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

from ember_eval.scoring import ItemResult

REPORT_VERSION: Final = 1

# The scores a change must not lower (AGENTS.md section 7). Latency is not gated: it is noise.
QUALITY_METRICS: Final = (
    "correctness",
    "groundedness",
    "not_confirmed_precision",
    "not_confirmed_recall",
    "overall_accuracy",
)


@dataclass(frozen=True, slots=True)
class Regression:
    metric: str
    before: float
    after: float


def build_report(
    *,
    created_at: datetime,
    setup_name: str,
    setup: dict[str, Any],
    scoring: dict[str, Any],
    dataset: dict[str, Any],
    prompt: dict[str, Any],
    ai_task: dict[str, Any],
    metrics: dict[str, Any],
    results: list[ItemResult],
) -> dict[str, Any]:
    """Assemble the report document."""
    return {
        "report_version": REPORT_VERSION,
        "created_at": created_at.astimezone(UTC).isoformat(timespec="seconds"),
        "setup": setup_name,
        "inputs_sha256": dataset["inputs_sha256"],
        "dataset": dataset,
        "config": {
            "setup": setup,
            "scoring": scoring,
            "prompt": prompt,
            "ai_task": ai_task,
        },
        "metrics": metrics,
        "items": [
            {
                "id": r.item.id,
                "answerable": r.item.answerable,
                "outcome": r.attempt.reason,
                "correct": r.correct,
                "answer_recall": _round(r.answer_recall),
                "grounded": r.grounded,
                "groundedness": _round(r.groundedness),
                "source_retrieved": r.source_retrieved,
                "top_score": _round(max((p.score for p in r.attempt.passages), default=None)),
                "answer": r.attempt.answer,
                "total_ms": round(r.attempt.total_ms, 2),
                "first_token_ms": _round(r.attempt.first_token_ms, 2),
            }
            for r in results
        ],
    }


def _round(value: float | None, digits: int = 3) -> float | None:
    return None if value is None else round(value, digits)


def _percent(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _milliseconds(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1f} ms"


def render_markdown(report: dict[str, Any], results: list[ItemResult]) -> str:
    """The report as Markdown: the scores first, then every item, then what went wrong."""
    metrics = report["metrics"]
    latency = metrics["latency_ms"]
    dataset = report["dataset"]
    task = report["config"]["ai_task"]
    prompt = report["config"]["prompt"]
    scores = [
        ("Correctness", "correctness", "answerable questions answered correctly"),
        ("Groundedness", "groundedness", "answers that say only what the passages say"),
        (
            "Not confirmed precision",
            "not_confirmed_precision",
            "of the declined questions, the share that should be declined",
        ),
        (
            "Not confirmed recall",
            "not_confirmed_recall",
            "of the unanswerable questions, the share declined",
        ),
        ("Overall accuracy", "overall_accuracy", "every question handled right"),
        (
            "Source retrieved",
            "source_retrieved",
            "answerable questions whose source document was found",
        ),
    ]
    lines = [
        f"# Eval report: {report['setup']}",
        "",
        f"- Date (UTC): {report['created_at']}",
        f"- Setup: `{report['setup']}`: {report['config']['setup']['description']}",
        f"- Dataset: `{dataset['path']}`, {dataset['items']} items "
        f"({dataset['answerable']} answerable, {dataset['unanswerable']} unanswerable)",
        f"- Inputs fingerprint: `{report['inputs_sha256'][:12]}` "
        "(reports are comparable only when this matches)",
        f"- Prompt: `{prompt['name']}` v{prompt['version']}",
        f"- AI task `{task['task']}`: configured "
        f"`{task['configured_provider']}/{task['configured_model']}`, "
        f"answered by `{task['answered_by']}`",
        "",
        "## Scores",
        "",
        "| Measure | Value | Meaning |",
        "|---|---|---|",
        *(f"| {label} | {_percent(metrics[key])} | {meaning} |" for label, key, meaning in scores),
        f"| Errors | {metrics['errors']} | questions where the model call failed |",
        "",
        "## Latency",
        "",
        "| | p50 | p95 |",
        "|---|---|---|",
        _latency_row("Whole answer", latency["total_p50"], latency["total_p95"]),
        _latency_row("First text", latency["first_token_p50"], latency["first_token_p95"]),
        _latency_row("Search", latency["retrieve_p50"], None),
        "",
        "## Items",
        "",
        "| Id | Answerable | Outcome | Correct | Recall | Grounded | Source found |",
        "|---|---|---|---|---|---|---|",
    ]
    lines += [
        f"| {i['id']} | {'yes' if i['answerable'] else 'no'} | {i['outcome']} | "
        f"{'yes' if i['correct'] else '**no**'} | {_percent(i['answer_recall'])} | "
        f"{_flag(i['grounded'])} | {_flag(i['source_retrieved'])} |"
        for i in report["items"]
    ]
    failures = [r for r in results if not r.correct]
    lines += ["", "## Wrong", ""]
    if not failures:
        lines.append("Nothing: every question was handled correctly.")
    for r in failures:
        shown = r.attempt.answer or f"(no answer: {r.attempt.reason})"
        expected = r.item.expected_answer or "Not confirmed"
        lines += [
            f"- **{r.item.id}** {r.item.question}",
            f"  - expected: {expected}",
            f"  - got: {shown}",
        ]
    return "\n".join(lines) + "\n"


def _latency_row(label: str, p50: float | None, p95: float | None) -> str:
    return f"| {label} | {_milliseconds(p50)} | {_milliseconds(p95) if p95 is not None else ''} |"


def _flag(value: bool | None) -> str:
    return "n/a" if value is None else ("yes" if value else "no")


def report_stem(created_at: datetime, setup_name: str) -> str:
    """``2026-11-10-153045-fake``: sortable, and safe as a file name on Windows."""
    return f"{created_at.astimezone(UTC):%Y-%m-%d-%H%M%S}-{setup_name}"


def write_report(
    directory: Path, report: dict[str, Any], markdown: str, *, created_at: datetime
) -> tuple[Path, Path]:
    """Write ``<stem>.json`` and ``<stem>.md`` into ``directory``; return their paths."""
    directory.mkdir(parents=True, exist_ok=True)
    stem = report_stem(created_at, report["setup"])
    json_path = directory / f"{stem}.json"
    markdown_path = directory / f"{stem}.md"
    json_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    markdown_path.write_text(markdown, encoding="utf-8", newline="\n")
    return json_path, markdown_path


def latest_comparable(directory: Path, *, setup: str, inputs_sha256: str) -> dict[str, Any] | None:
    """The newest earlier report of this setup, measured on the same inputs (else ``None``).

    Reports of another setup or of changed documents or questions are not comparable, so they
    are skipped rather than compared.
    """
    candidates: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json")) if directory.is_dir() else []:
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            isinstance(report, dict)
            and report.get("report_version") == REPORT_VERSION
            and report.get("setup") == setup
            and report.get("inputs_sha256") == inputs_sha256
        ):
            candidates.append(report)
    return max(candidates, key=lambda report: report["created_at"], default=None)


def find_regressions(
    previous: dict[str, Any], current: dict[str, Any], *, tolerance: float
) -> list[Regression]:
    """Quality scores that fell by more than ``tolerance`` since ``previous``.

    A score that is ``n/a`` on either side is skipped: there is nothing to compare.
    """
    found = []
    for metric in QUALITY_METRICS:
        before, after = previous["metrics"].get(metric), current["metrics"].get(metric)
        if before is not None and after is not None and after < before - tolerance:
            found.append(Regression(metric, before, after))
    return found
