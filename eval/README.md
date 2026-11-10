# eval

The evaluation harness (F9). It asks a set of golden questions the way the live pipeline will, scores
the answers, and writes a dated report. AGENTS.md section 7 makes it the gate: **a change to a prompt,
a model, chunking or retrieval must be run through it and must not lower the scores in the latest
report.** Decisions behind it: [ADR 0010](../docs/decisions/0010-evaluation-harness.md).

```
cd backend
uv run poe eval                       # run, write eval/reports/<date>-<time>-fake.{json,md}
uv run poe eval --check-regression    # also compare with the latest comparable report; exit 2 if a score fell
uv run poe eval --setup <name>        # a setup from setups.yaml (only `fake` exists until spike S2)
uv run poe eval --dataset <file> --docs <folder>   # another golden set (reports then go to eval/real/reports/)
```

## What is here

```
eval/
├── golden/sample.jsonl     14 anonymised questions (10 answerable, 4 not)
├── golden/docs/*.md        the invented company's documents the questions are asked against
├── setups.yaml             scoring thresholds and the named setups
├── reports/                one .json and one .md per run of the sample (committed)
├── run.py                  the command line
└── ember_eval/             dataset, search, fake model, scoring, runner, report
```

Real question sets and real client documents never go into git (AGENTS.md section 9). They live in
Azure storage; download them into `eval/real/`, which is git-ignored, and pass `--dataset` and `--docs`.
Reports of any set other than `golden/sample.jsonl` are written to `eval/real/reports/` for the same reason.

## The golden file

One JSON object per line:

```json
{"id": "q01", "question": "How much does the Team plan cost per user?", "expected_answer": "The Team plan costs 29 dollars per user per month.", "source_doc": "pricing.md", "answerable": true}
{"id": "q11", "question": "Can Brightwave be installed on our own servers?", "expected_answer": null, "source_doc": null, "answerable": false}
```

An answerable item needs `expected_answer` and `source_doc` (a file in the documents folder). An unanswerable
item has neither: the right reply is "Not confirmed". Ids are unique and match `[A-Za-z0-9._-]{1,64}`.
A bad line is reported by line number only, never by content.

## What a run does

For every question, one at a time (latency is measured, so nothing runs in parallel):

1. **Search** the documents (`KnowledgeSearch`; today a keyword search over paragraphs).
2. **Gate**: if no passage reaches `search.min_score`, the answer is "Not confirmed" and the model is not asked
   (AGENTS.md section 7).
3. **Ask the model** through the real AI gateway, task `live_answer`, with the real prompt file
   (`calls/prompts/live_answer.v1.md`): the passages in the system prompt, the question alone in the user message,
   streamed. Time to the first piece of text is recorded.
4. A reply of "Not confirmed" counts as declining. A model failure counts as declining and is reported under `errors`.
5. **Score** the answer against the golden item.

## What is measured

| Score | Meaning | How |
|---|---|---|
| `correctness` | answerable questions answered correctly | answered, and at least `correct_min_recall` of the expected answer's meaningful words are in the answer |
| `groundedness` | answers that say only what the passages say | at least `grounded_min_overlap` of the answer's meaningful words are in the passages given; only answers that were shown count |
| `not_confirmed_precision` | of the questions declined, the share that should be | declined and unanswerable, over all declined |
| `not_confirmed_recall` | of the unanswerable questions, the share declined | declined and unanswerable, over all unanswerable |
| `overall_accuracy` | every question handled right | answerable answered correctly, plus unanswerable declined |
| `source_retrieved` | answerable questions whose `source_doc` the search found | a diagnostic: a wrong answer with `false` here is a search problem, not a model problem |
| `latency_ms` | `total_p50`, `total_p95`, `first_token_p50`, `first_token_p95`, `retrieve_p50` | nearest-rank percentiles, in milliseconds |

A score with nothing to divide (no unanswerable questions, so no recall) is `null` in the JSON and `n/a` in the
Markdown. It is never filled in with 0 or 1. First-text latency only counts questions the model was asked.

Correctness and groundedness are judged by word overlap: deterministic, offline, and crude. That is good enough
to prove the harness and to catch gross regressions in CI, and it is **not** a verdict on answer quality. Spike S2
replaces `judge_answer` and `judge_grounding` (`ember_eval/scoring.py`) with a judge that reads the answer.
Every threshold is in `setups.yaml`, not in code.

## The report

Two files per run, named `<UTC date>-<time>-<setup>` (for example `2026-11-10-100011-fake`), no colons so Windows accepts them.

`*.md` is for people: the header (setup, dataset, prompt, model), the scores, the latency, one row per question,
and a "Wrong" section with what was expected and what was given.

`*.json` is for machines and comparisons (`report_version` 1):

| Field | Content |
|---|---|
| `created_at`, `setup` | when (UTC, ISO 8601) and which setup |
| `inputs_sha256` | a hash of the golden file and the documents; two reports are comparable only if it matches |
| `dataset` | `path`, `items`, `answerable`, `unanswerable`, `documents`, `inputs_sha256` |
| `config` | `setup` (as in `setups.yaml`), `scoring` thresholds, `prompt` (`name`, `version`), `ai_task` (`task`, `configured_provider`, `configured_model`, `answered_by`) |
| `metrics` | the scores above, plus `items`, `answerable`, `unanswerable`, `errors` |
| `items[]` | per question: `id`, `answerable`, `outcome` (`answered`, `low_confidence`, `model_declined` or `error`), `correct`, `answer_recall`, `grounded`, `groundedness`, `source_retrieved`, `top_score`, `answer`, `total_ms`, `first_token_ms` |

`ai_task.answered_by` says what actually produced the answers. For the `fake` setup it is `extractive-fake`
even though `ai_tasks.yaml` configures a real model: the report never pretends the fake was the vendor.

### Regression check

`--check-regression` finds the newest earlier report with the same `setup` and the same `inputs_sha256`, and
fails with exit status 2 if `correctness`, `groundedness`, `not_confirmed_precision`, `not_confirmed_recall` or
`overall_accuracy` fell by more than `scoring.regression_tolerance` (0 by default: any drop). Latency is
reported, not gated: it is noise. With no comparable report it passes and says so. If you change the questions or
the documents the hash changes and the old report stops being comparable; record a new one and commit it
(a test fails until you do).

## Adding a setup

Add an entry to `setups.yaml` and, if it needs a new kind of search or model, a branch in `run.py` behind the
`KnowledgeSearch` protocol (`ember_eval/search.py`) or the gateway's provider. The report records the setup,
so every score can be traced to what produced it. Spike S2 uses this to compare chunking, hybrid search and
reranking on the 30 to 50 real golden questions.
