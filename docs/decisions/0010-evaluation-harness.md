# 0010. The evaluation harness

- Status: accepted
- Date: 2026-11-10

## Context

AGENTS.md section 7 says a change to a prompt, a model, chunking or retrieval must be run through `eval/`
and must not lower the scores in the latest report. That rule needs something to run, and a recorded report to
compare with, before the first real prompt exists. F9 builds the harness against fakes, so the machinery is
proven and the two spikes (S1, S2) can plug real search and real models into it.

## Decision

### The harness runs the pipeline's own parts

The runner goes through the real AI gateway, the real `ai_tasks.yaml` and the real prompt file
(`live_answer.v1.md`), so a change to any of them changes the numbers. Only two things are fake: the search
(keyword matching over paragraphs, behind a `KnowledgeSearch` protocol that the `knowledge` module will
implement) and the model (`ExtractiveProvider`, which answers with the sentence of the passages that best
matches the question). Both are deterministic, so the offline run gives the same scores every time and CI can
run it.

The "no confident passage means no model call, and the answer is Not confirmed" gate (AGENTS.md section 7) is
applied in the runner with a threshold from `setups.yaml`, so the harness measures it too.

### Scores

Correctness, groundedness, "Not confirmed" precision and recall, overall accuracy, a diagnostic `source_retrieved`
(did search find the right document, to tell a search failure from a model failure), and p50/p95 of the whole
answer and of the first text. A ratio with nothing to divide is `null`, never 0 or 1: a set with no unanswerable
questions has no recall, and reporting 100% would hide that.

Correctness and groundedness are word-overlap heuristics with thresholds in `setups.yaml`. That is crude on
purpose: deterministic, free and offline. It is documented as a stand-in; spike S2 replaces the two judge
functions with a judge that reads the answer.

### Reports

One JSON file (for comparison) and one Markdown file (for people) per run, in `eval/reports/` for the committed
sample. The JSON carries `inputs_sha256`, a hash of the golden file and the documents, and the setup config, so a
score can be traced to what produced it. For the fake setup `ai_task.answered_by` says `extractive-fake`, so no
report passes the fake off as the configured vendor.

Real question sets are not committed (AGENTS.md section 9). Any run on a dataset outside `eval/golden/` writes its
reports to `eval/real/reports/`, which `.gitignore` already covers.

### Regression gate

`--check-regression` compares with the newest earlier report of the same setup *and the same inputs hash* and exits
2 if a quality score fell by more than `regression_tolerance` (0 by default). Reports measured on different
questions or documents are skipped, not compared: that would blame a change that is not the one under test.
Latency is reported, not gated. A test requires a committed report that matches the current sample, so changing the
questions or documents forces a new report into the same pull request.

## Consequences

- **The first recorded scores are not good, on purpose.** Keyword search misses paraphrases ("CRM systems" against
  "Salesforce and HubSpot") and the fake model quotes one sentence. The baseline shows the harness catching real
  failure modes; the numbers say nothing about the product.
- **The heuristic judge can be wrong in both directions.** A correct answer worded differently scores low, and a
  wrong answer that reuses the expected words scores high. Do not use these scores to choose between real models
  until the judge is replaced.
- **The harness lives outside `src/` and the backend's mypy run.** It is checked by ruff (`uv run poe lint` covers
  `eval/`) and by its own tests in `backend/tests/eval/`. It imports `ember`; `ember` never imports it.
- **A real setup needs a vendor key and costs money,** so `uv run poe eval` stays on the fake setup; real setups are
  run on purpose, and CI does not run them.
- **New dependency: none.** It uses what the backend already has (pydantic, pyyaml, structlog).

## Alternatives considered

- **An LLM judge now:** it needs a key, costs money on every CI run and is not deterministic, which defeats a
  regression gate for the foundation. It arrives with S2, behind the same two functions.
- **Run the live pipeline's `FakePipeline` for the evaluation:** it answers with canned text and uses no knowledge,
  so it could not produce a meaningful correctness score.
- **Put the harness in `src/ember/`:** the rules say `eval/` is a top-level folder, `src` must not depend on
  evaluation code, and real questions must stay out of the package.
- **Compare with any earlier report:** a changed question set would show up as a regression or an improvement that
  nobody caused.
- **Gate on latency too:** latency on a developer laptop or a shared CI runner moves by more than the thresholds
  we would want to enforce.
