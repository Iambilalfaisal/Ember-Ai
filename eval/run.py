"""Run the evaluation harness: ``uv run poe eval`` (from ``backend/``).

Every golden question goes through search and the ``live_answer`` task; the scores and latencies
are written to a dated report. ``--check-regression`` also compares the quality scores with the
latest comparable report and exits with status 2 if any fell (AGENTS.md section 7).
"""

import argparse
import asyncio
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

import structlog

from ember.adapters.ai.config import load_tasks_config
from ember.adapters.ai.errors import AiConfigError
from ember.adapters.ai.fake import DiscardUsageRecorder
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.prompts import PromptError, PromptLibrary
from ember.adapters.ai.tracing import NullTracer
from ember_eval.config import ConfigError, load_config
from ember_eval.dataset import (
    DatasetError,
    check_sources,
    inputs_fingerprint,
    load_documents,
    load_golden,
)
from ember_eval.fake_model import ExtractiveProvider
from ember_eval.report import (
    build_report,
    find_regressions,
    latest_comparable,
    render_markdown,
    write_report,
)
from ember_eval.runner import ANSWER_TASK, run_eval
from ember_eval.scoring import aggregate
from ember_eval.search import KeywordSearch

EVAL = Path(__file__).resolve().parent
BACKEND = EVAL.parent / "backend"
TASKS_CONFIG = BACKEND / "config" / "ai_tasks.yaml"
PROMPTS = BACKEND / "src" / "ember" / "modules" / "calls" / "prompts"
PROMPT_NAME = "live_answer"
PROMPT_VERSION = 1


def default_output_directory(dataset: Path) -> Path:
    """The sample's reports go to ``reports/``; any other set's to the git-ignored ``real/``."""
    if dataset.resolve().is_relative_to((EVAL / "golden").resolve()):
        return EVAL / "reports"
    return EVAL / "real" / "reports"


def parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else None)
    parser.add_argument("--setup", default="fake", help="a setup from eval/setups.yaml")
    parser.add_argument("--dataset", type=Path, default=EVAL / "golden" / "sample.jsonl")
    parser.add_argument(
        "--docs", type=Path, help="documents folder (default: docs/ by the dataset)"
    )
    parser.add_argument("--config", type=Path, default=EVAL / "setups.yaml")
    parser.add_argument("--out", type=Path, help="where to write the report")
    parser.add_argument(
        "--check-regression",
        action="store_true",
        help="exit with status 2 if a quality score fell since the latest comparable report",
    )
    return parser.parse_args(argv)


async def evaluate(arguments: argparse.Namespace) -> int:
    config = load_config(arguments.config)
    setup = config.setup(arguments.setup)
    items = load_golden(arguments.dataset)
    documents = load_documents(arguments.docs or arguments.dataset.parent / "docs")
    check_sources(items, documents)

    tasks = load_tasks_config(TASKS_CONFIG)
    task = tasks.tasks[ANSWER_TASK]
    # The real task file and the real prompt, with the fake model standing in for the vendor.
    gateway = AiGateway(
        config=tasks,
        providers={task.provider: ExtractiveProvider(min_overlap=setup.answer.min_overlap)},
        recorder=DiscardUsageRecorder(),
        tracer=NullTracer(),
    )
    prompt = PromptLibrary(PROMPTS).load(PROMPT_NAME, version=PROMPT_VERSION)
    try:
        results = await run_eval(
            items,
            search=KeywordSearch(documents),
            gateway=gateway,
            prompt=prompt,
            setup=setup,
            scoring=config.scoring,
        )
    finally:
        await gateway.aclose()

    created_at = datetime.now(UTC)
    metrics = aggregate(results)
    report = build_report(
        created_at=created_at,
        setup_name=arguments.setup,
        setup=setup.model_dump(mode="json"),
        scoring=config.scoring.model_dump(mode="json"),
        dataset={
            "path": arguments.dataset.name,
            "items": metrics["items"],
            "answerable": metrics["answerable"],
            "unanswerable": metrics["unanswerable"],
            "documents": len(documents),
            "inputs_sha256": inputs_fingerprint(arguments.dataset, documents),
        },
        prompt={"name": prompt.name, "version": prompt.version},
        ai_task={
            "task": ANSWER_TASK,
            "configured_provider": task.provider,
            "configured_model": task.model,
            "answered_by": setup.answer.provider,
        },
        metrics=metrics,
        results=results,
    )
    directory = arguments.out or default_output_directory(arguments.dataset)
    previous = (
        latest_comparable(directory, setup=arguments.setup, inputs_sha256=report["inputs_sha256"])
        if arguments.check_regression
        else None
    )
    json_path, markdown_path = write_report(
        directory, report, render_markdown(report, results), created_at=created_at
    )
    sys.stdout.write(f"eval: {metrics['items']} questions, report written to {markdown_path}\n")
    sys.stdout.write(f"eval: machine-readable copy: {json_path}\n")

    if not arguments.check_regression:
        return 0
    if previous is None:
        sys.stdout.write("eval: no earlier comparable report, so nothing to compare with\n")
        return 0
    regressions = find_regressions(previous, report, tolerance=config.scoring.regression_tolerance)
    for regression in regressions:
        sys.stderr.write(
            f"eval: {regression.metric} fell from "
            f"{regression.before:.3f} to {regression.after:.3f}\n"
        )
    return 2 if regressions else 0


def main(argv: list[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    # The gateway logs one line per model call; a 100-question run would drown the summary.
    structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING))
    try:
        return asyncio.run(evaluate(arguments))
    except (DatasetError, ConfigError, AiConfigError, PromptError) as error:
        sys.stderr.write(f"eval: {error}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
