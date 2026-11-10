# 0007. Adapters and the AI gateway

- Status: accepted
- Date: 2026-11-06

## Context

Everything external (AI models, speech-to-text, file storage, ClickUp, Microsoft Graph) sits behind
`adapters/` (AGENTS.md section 2). Model calls must go through one gateway that names a task, never a
model, and that records tokens, cost, latency and tenant for every call and traces it in Langfuse
(section 7). F6 builds that gateway with one real provider, and the interfaces and fakes for the
other adapters.

## Decision

### The gateway

- **API:** `AiGateway.complete(task=, messages=)`, `.stream(task=, messages=)` (an async generator
  of text pieces) and `.embed(task=, texts=)`. The tenant is the current `TenantContext` tenant; a
  call with none raises. An optional `PromptRef` records which prompt file produced the messages.
- **Tasks are config.** `config/ai_tasks.yaml` maps a task to provider, model, `max_tokens`,
  `timeout_seconds`, optional temperature and optional fallback. Model **prices** are in the same
  file, so cost follows the model with no code change. The file is validated when the process
  starts: a model without a price, a chat task without `max_tokens`, a misspelled key or an
  unregistered provider stops startup instead of failing a live call.
- **Timeouts:** the whole call for `complete` and `embed`. For `stream` it is the longest wait for the
  next piece of text (first piece included), so a slow consumer such as the live panel never counts
  against the provider.
- **Fallback:** if the primary model fails or times out, the task's `fallback` is tried. A stream falls
  back only while nothing has been sent to the caller; after the first piece a failure is raised as it
  is, because a second model would repeat words the caller already has. Only provider failures and
  timeouts fall back; a bug is raised.
- **Providers** implement the `AiProvider` protocol and only turn a request into a vendor call. The
  gateway owns timeouts, fallback, cost, recording and tracing. `FakeAiProvider` can fail, hang and
  stream on command, so those paths are tested without a network.

### OpenAI, over plain HTTP

The one real provider is OpenAI (chat completions, streamed completions, embeddings), called with
`httpx` instead of the vendor SDK. Three endpoints are all Ember needs, `httpx` is already the
project's HTTP client, and the provider can be tested with `httpx.MockTransport` against exact
requests and replies. No dependency is added. Vendor error bodies are never copied into exceptions
(they can echo the prompt); only the HTTP status and the vendor's short error code are kept.

### Usage records

- One `ai_usage` row per call **attempt**, including failed and fallback attempts: task, operation,
  provider, model, status (`ok`, `error`, `timeout`, `cancelled`), tokens, cost, latency, time to
  first token, whether it was a fallback, the prompt name and version, and the exception class name.
  No prompt, answer or document text, and no exception message.
- Rows are written by `DbUsageRecorder` in its **own** short transaction, not the caller's. The
  tokens were spent even if the request later rolls back, and a streamed answer finishes after the
  request's session may be gone. This is the one place besides the session dependency that commits,
  and it only inserts.
- A recording or tracing failure is logged and never fails the call.
- `ai_usage` has no foreign key to `tenants`: adapters may not depend on a module's tables.

### Tracing

Langfuse gets one generation (or embedding) observation per attempt, with input, output, token usage,
cost and the tenant, task and prompt in metadata. With no Langfuse keys, `NullTracer` does nothing.

Langfuse 5 is built on OpenTelemetry, and a generation carries the prompt and the answer as span
attributes. On the app's global tracer provider the generation would also reach the app's OTLP
exporter, which AGENTS.md section 9 does not allow. So Langfuse gets its **own** tracer provider
(found by probing, and covered by a test). OpenTelemetry context is shared across providers, so a
generation still takes the trace id of the span active when it starts, and Langfuse and the OTLP
backend can be joined on it.

### Prompts

`PromptLibrary(folder).load(name, version=N)` reads `<name>.v<N>.md` from a module's `prompts/` folder
(the module passes its own folder, because adapters may not import modules). There is no "latest".
Placeholders are `{{name}}`; values are substituted in one pass, so transcript text that contains
`{{other}}` stays inert. A missing or unused value is an error.

### Other adapters

`stt`, `storage`, `clickup` and `msgraph` have an interface (`Protocol`) and a fake, and no real
implementation yet.

- `storage` prefixes every key with the tenant id inside the interface (`blob_path`) and rejects keys
  that are absolute or contain `..`, so a caller cannot reach another tenant's blobs.
- `stt` has `issue_streaming_token(tenant_id, call_id)` and a first-shape `transcribe_batch`.
- `clickup` and `msgraph` shapes are first guesses, written before the modules that will use them
  exist; expect them to change.

## Consequences

- **Real implementations for STT and storage are deferred.** The foundation plan says each adapter has a
  real implementation. No speech vendor has been chosen, and an Azure Blob implementation cannot be
  tested before there is an Azure environment (or an emulator is set up), so both wait.
- **Prices in `ai_tasks.yaml` are maintained by hand** and were written from memory of the provider's
  price list. Check them before trusting cost figures. Model names and limits are untuned starting
  values; the eval runner (F9) should decide them.
- **A cancelled or abandoned call has no token counts** from the vendor, so its tokens and cost are
  recorded as zero. Costs can be under-counted when streams are cut short.
- **No retries** beyond the one fallback attempt.
- **`ai_usage` grows without bound** and has no aggregation or retention yet.
- The API holds the gateway and closes it on shutdown, which flushes buffered Langfuse traces. The
  worker and the realtime service build their own when they first need one.
- Content is in Langfuse traces whenever Langfuse is configured. Outside local development its host must
  be the tenant's own deployment (ADR 0002).

## Alternatives considered

- **The OpenAI SDK:** typed and maintained, but a new dependency for three endpoints, and harder to
  test without the network.
- **A multi-provider library such as LiteLLM:** the plan leaves multi-provider fallback out, and the
  gateway already isolates providers behind a small protocol.
- **Writing usage in the request's session:** simpler, but a rolled-back request would lose the record of
  money already spent, and streams outlive the session.
- **OpenTelemetry spans only, no Langfuse generations:** would put prompt text in the OTLP backend.
- **Prices in code:** a price change would need a release.
