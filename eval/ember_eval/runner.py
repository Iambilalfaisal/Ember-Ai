"""Run every golden question through search and the ``live_answer`` task, and score the result."""

import time
import uuid
from collections.abc import Sequence

import structlog

from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.interface import Message
from ember.adapters.ai.prompts import Prompt
from ember.core.tenancy import TenantContext
from ember_eval.config import ScoringConfig, SetupConfig
from ember_eval.dataset import GoldenItem
from ember_eval.scoring import Attempt, ItemResult, score_item
from ember_eval.search import KnowledgeSearch, Passage

ANSWER_TASK = "live_answer"
EVAL_TENANT = uuid.UUID("00000000-0000-0000-0000-00000000e7a1")
"""The gateway wants a tenant; evaluation runs as this fixed one and records no usage."""

logger = structlog.get_logger(__name__)


def format_passages(passages: Sequence[Passage]) -> str:
    """The ``{{passages}}`` of the answer prompt: one bullet per passage, with its document."""
    return "\n".join(f"- [{passage.doc}] {passage.text}" for passage in passages)


def declined(text: str) -> bool:
    """Did the model reply "Not confirmed"? (The prompt asks for exactly that reply.)"""
    return text.strip().lower().rstrip(".!").startswith("not confirmed")


async def answer_question(
    question: str,
    *,
    search: KnowledgeSearch,
    gateway: AiGateway,
    prompt: Prompt,
    setup: SetupConfig,
) -> Attempt:
    """What the live pipeline will do for one question: search, gate, ask the model, stream."""
    started = time.perf_counter()
    passages = tuple(search.search(question, k=setup.search.top_k))
    retrieve_ms = (time.perf_counter() - started) * 1000
    confident = tuple(p for p in passages if p.score >= setup.search.min_score)
    if not confident:
        # AGENTS.md section 7: no confident passage, no answer, and no model call.
        return Attempt("", True, "low_confidence", passages, retrieve_ms, None, retrieve_ms)

    messages = [
        Message("system", prompt.render(passages=format_passages(confident))),
        Message("user", question),
    ]
    asked = time.perf_counter()
    first_token_ms: float | None = None
    pieces: list[str] = []
    try:
        async for piece in gateway.stream(task=ANSWER_TASK, messages=messages, prompt=prompt.ref):
            if first_token_ms is None:
                first_token_ms = (time.perf_counter() - asked) * 1000
            pieces.append(piece)
    except Exception as exc:  # a vendor failure must not stop the run; it is counted
        logger.warning("eval.answer_failed", error=type(exc).__name__)
        total_ms = (time.perf_counter() - started) * 1000
        return Attempt("", True, "error", confident, retrieve_ms, first_token_ms, total_ms)
    total_ms = (time.perf_counter() - started) * 1000
    text = "".join(pieces).strip()
    if declined(text) or not text:
        return Attempt("", True, "model_declined", confident, retrieve_ms, first_token_ms, total_ms)
    return Attempt(text, False, "answered", confident, retrieve_ms, first_token_ms, total_ms)


async def run_eval(
    items: Sequence[GoldenItem],
    *,
    search: KnowledgeSearch,
    gateway: AiGateway,
    prompt: Prompt,
    setup: SetupConfig,
    scoring: ScoringConfig,
) -> list[ItemResult]:
    """Answer and score every item, one at a time (latency is measured, so no concurrency)."""
    results = []
    with TenantContext.use(EVAL_TENANT):
        for item in items:
            attempt = await answer_question(
                item.question, search=search, gateway=gateway, prompt=prompt, setup=setup
            )
            results.append(score_item(item, attempt, scoring))
    return results
