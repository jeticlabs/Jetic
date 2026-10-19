# New Changes — WS1 + WS2 + WS3 ("Stop silently wrong requests" + "Fail fast & observe everything" + "Complete run observability")

This document describes the changes implemented in this work cycle. They came out of real
usage feedback (`feedback/user-1.md`): an AI agent driving Jetic over MCP kept producing
workflows that *silently sent wrong requests* (empty Authorization headers, unresolved
templates, empty path params) and the failure/observability experience was weak (violations
only visible after the whole journey ran, no run persistence, giant tool outputs).

A second feedback round (`feedback/user_2.md`) showed the run model still fell short for
debugging: a running run exposed no per-step progress and stored reports lacked the actual
requests that were sent (WS3, see [section 8](#8-ws3--complete-run-observability)).

Three workstreams were implemented:

- **WS1 — Never send a silently wrong request.** Fix the request-building and validation
  pipeline so mistakes fail loudly and locally instead of hitting the server wrong.
- **WS2 — Fail fast, observe everything.** Preflight + early abort, timeouts, run
  persistence, compact tool outputs, async runs, and run-inspection tools.
- **WS3 — Complete run observability.** Per-step payload capture (curl-style), live
  `pending → passed/failed` progress while a run is in flight, capped-but-complete stored
  bodies, and distinct connection diagnostics everywhere (MCP + CLI + dashboard).

---

## Table of Contents

1. [Summary of user-visible changes](#1-summary-of-user-visible-changes)
2. [WS1 — Request building & validation](#2-ws1--request-building--validation)
3. [WS2 — Resilience & observability](#3-ws2--resilience--observability)
4. [Bug fixes discovered during verification](#4-bug-fixes-discovered-during-verification)
5. [Defaults & compatibility](#5-defaults--compatibility)
6. [File map](#6-file-map)
7. [Verification](#7-verification)
8. [WS3 — Complete run observability](#8-ws3--complete-run-observability)

---

## 1. Summary of user-visible changes

| Area | Before | After |
|---|---|---|
| `Authorization` injection | Required writing `"Bearer {{...}}"` by hand; a raw token was sent bare (401s) | Raw values are auto-prefixed with `Bearer `; explicit schemes (`Basic ...`) pass through |
| Template resolution | Shallow in places; unresolved `{{...}}` silently became `""` or the raw text | Deep resolution + **strict mode**: unresolved template/path-param fails the step before any request, naming the placeholder |
| Parameterized faker | `{{faker.number.int({min:1,max:5})}}` crashed or sent garbage | Clear error: parameterless paths only (`{{faker.string.uuid}}`) |
| Path params | `:id` needed `body.id` or memory key `id`; other styles silently sent `:id` literally | `:param` resolves from body, `inject: body:<name>`, matching memory key, or inline `{{workflow:<param>}}`; strict error if none |
| Query params | No explicit `query` field; GET bodies were a footgun | New `query` field (deep templates); GET bodies demoted to query only for flat values; `GET_WITH_BODY` warning for nested |
| Validator noise | False alarms + blind spots (could not even see parameterized faker) | Accurate: `BAD_QUERY`, `UNKNOWN_QUERY_PARAM`, `UNSUPPORTED_FAKER_CALL`, `UNRESOLVED_PATH_PARAM` (accepts all 3 runtime sources), `CONTINUE_WITH_CAPTURE` only when consumed; `PATH_TEMPLATE` warning removed |
| Scaffold | Path `:params` and query params dropped | Scaffold emits `{{workflow:<param>}}` path refs and query params, or flags `missingFields` |
| MCP error messages | Generic text | Real `error.message` (500-char cap), custom hints, zod issues summarized |
| Simulation preflight | None | Target probed before step 1 (MCP default: abort when unreachable) |
| Connection loss mid-run | Kept executing remaining steps against a dead server | Run aborts immediately with a clear reason |
| Timeouts | None | Run-level `requestTimeoutMs` (30 s default, 120 s cap) + per-step `timeoutMs` |
| MCP simulate output | Full per-step bodies in every response | Compact one-line-per-step summary + `runId` by default; `includeStepResults: true` for full detail |
| Run persistence | None | Every run saved to `.jetic/runs/<runId>/` (report + status file) |
| Run inspection | None | `jetic_get_run`, `jetic_list_runs` |
| Long runs | Block until finished | `async: true` returns a `runId` immediately; poll with `jetic_get_run` |
| Stored step detail (WS3) | Step name/status/timing only | Full curl-style payload per step: `resolvedUrl`, `requestHeaders` (actual sent set), `requestBody`, `responseStatus`, `responseHeaders`, `responseBody` (capped), `startedAt`/`finishedAt` |
| Polling detail (WS3) | Status file said `running` — no step info | `jetic_get_run` shows the planned route with per-step `pending → passed/failed/skipped` while it runs |
| Unreachable backend (WS3) | "fetch failed" per step (×N) | One classified preflight abort (`ECONNREFUSED`/`ENOTFOUND`/…); runs report `status: 'aborted'`, `executedSteps: 0` |
| CLI trace payloads (WS3) | Names + statuses | Full resolved request/response payloads incl. actual `Authorization`, final URL, response headers, connection-error flag |

---

## 2. WS1 — Request building & validation

### 2.1 Bearer auto-prefix for `Authorization` (`packages/simulator`)

- When an injection target is `authorization` (case-insensitive) and the resolved value is a
  **raw token** (no scheme — does not match `/^[A-Za-z][A-Za-z0-9-]*\s/`), the runtime
  prefixes `Bearer `.
- Explicit schemes are untouched: `"Basic dXNlcjpwYXNz"`, `"Token abc"` pass through.
- Empty values are not prefixed with a dangling `Bearer `.

### 2.2 Deep + strict template resolution (`packages/simulator`)

- New brace-aware placeholder scanner (`findPlaceholders`) — unlike a naive regex, it
  understands nested braces so it can *see* `{{faker.number.int({min:1,max:5})}}` and report
  it instead of misparsing.
- `resolveDeep` walks objects/arrays, resolving every string in `body` and `query`.
- Strict mode (default): unresolved memory refs and path params **throw before the request**:
  - `unresolved template {{workflow:x}} — no value for "workflow:x"; capture it in an earlier step or seed it first`
  - `missing human input {{human:otp}} — set JETIC_HUMAN_OTP or seed "human:otp" memory (non-interactive runners cannot prompt)`
  - `unresolved path parameter ":id" in path "/orders/:id" — provide it in the body, an inject "body:id", memory key "id", or a template`
- `strictTemplates: false` restores the legacy empty-string behavior for workflows that
  depend on it. Conditions always resolve with `strict = false` (a missing key makes a
  condition false, it does not error).

### 2.3 Faker guardrails (`packages/simulator`)

- Parameterized faker expressions (`{...}` / `(...)` in the expression) throw a descriptive
  error.
- Faker calls are wrapped in try/catch: a faker path that needs arguments reports
  "this faker path needs arguments; parameterized faker calls are not supported" instead of
  a stack trace.
- Unknown faker paths (`{{faker.not.a.real.path}}`) report clearly.

### 2.4 Path parameters (`packages/simulator`)

Resolution sources, in order:

1. already-resolved `{{...}}` templates inside the path,
2. merged request body (includes `inject: { "body:id": ... }` — injections happen first),
3. memory keys whose name matches the param (e.g. captured `workflow:id`),
4. inline `{{workflow:<param>}}` style.

Longest parameter names are replaced first so `/a/:user_id/:id` cannot corrupt `:user_id`.
If nothing provides the value: strict error (2.2).

### 2.5 New step fields (`packages/simulator` + MCP schema)

- `query` — explicit URL query parameters, deep-resolved templates. Prefer over GET bodies.
- `timeoutMs` — per-step request timeout in ms (overrides the run default; `0` disables).

The MCP workflow schema accepts both (`query`, `timeoutMs` are in `KNOWN_STEP_KEYS`), so they
no longer trigger `UNKNOWN_STEP_KEY`.

### 2.6 Validator alignment (`packages/mcp-server/src/tools/workflow-authoring-tools.ts`)

- `BAD_QUERY` — `query` must be an object.
- `UNKNOWN_QUERY_PARAM` — query keys not declared by the endpoint (warning).
- `GET_WITH_BODY` — now only for **nested** GET bodies (flat values are safely sent as query
  params by the runtime, so no warning).
- `UNKNOWN_BODY_FIELD` — only for non-GET/HEAD steps.
- `UNSUPPORTED_FAKER_CALL` — parameterized faker expressions. This required replacing the old
  `TEMPLATE_RE` regex with a **brace-aware ref scanner**: the old regex could not match
  `{{faker.number.int({min:1,max:5})}}` at all, so the lint was blind to exactly the case it
  was meant to catch.
- `UNRESOLVED_PATH_PARAM` — accepts all three runtime-supported sources: `body.<name>`,
  `inject: "body:<name>"`, or a matching memory key.
- `CONTINUE_WITH_CAPTURE` — now only warns when a *later step actually consumes* the capture
  (`refsUsedAnywhere` pre-scan over body/query/path/inject).
- Removed the `PATH_TEMPLATE` warning (`{{...}}` in paths is fully supported).

### 2.7 Scaffold improvements (`packages/mcp-server/src/tools/workflow-designer-tools.ts`)

`jetic_scaffold_workflow` now also:

- maps path `:params`: if the param is provided in the step's body, keep it; otherwise if a
  produced memory key name-matches, replace `:name` with `{{workflowKey}}`; else record a
  `missingFields` note with guidance;
- emits query params from the endpoint's `parameters` (`in: 'query'`): memory-matched keys
  become `{{key}}` templates, optional params are skipped (server default applies), required
  params get a faker-mapped value or `{{human:<name>}}` + a `missingFields` entry.

### 2.8 MCP error envelope (`packages/mcp-server/src/response-envelope.ts`)

- Errors now carry the **real** `error.message` (trimmed, truncated at 500 chars with `…`),
  not a generic string, so the AI can act on them.
- Custom hints (errors with a `hint` property) are surfaced; a generic fallback hint is used
  otherwise.
- Zod-style validation failures (objects with an `issues` array) are summarized as
  `Invalid input — path: message; path: message (+n more)` with a "fix the flagged arguments"
  hint.

---

## 3. WS2 — Resilience & observability

### 3.1 Preflight probe (`packages/simulator`)

- `preflight: 'abort' | 'warn' | 'off'`, `preflightTimeoutMs` (default 3000).
- One `GET baseUrl` probe: `5xx` → `server-error`; anything else → `healthy`; network failure
  → `unreachable` with the real reason (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`).
- On `'abort'` with a bad verdict: the run stops before step 1 — `stats.executedSteps: 0`,
  `abortReason` set, and the probe recorded in `result.preflight`.
- Defaults: library/CLI **off** (parity harnesses and simple mocks unchanged), **MCP abort**.

### 3.2 Early abort on connection loss (`packages/simulator`)

- The connection-error code set now includes `UND_ERR_SOCKET` (what Node's fetch reports when
  a socket is destroyed mid-request, e.g. a killed server).
- A connection loss aborts the run immediately regardless of the step's `onFailure`,
  with a concrete reason; it is never treated as a "continue" step.

### 3.3 Timeouts (`packages/simulator` + MCP schema)

- Run-level `requestTimeoutMs` (default 30000, max 120000 over MCP).
- Per-step `timeoutMs` overrides it.
- Implemented with `AbortSignal.timeout`; timeout failures get a clear message
  (`Request timed out after 30000ms (GET /api/users).`).

### 3.4 Run persistence (`packages/mcp-server/src/run-store.ts`, new)

- `runId` = ISO timestamp with `:`/`.` → `-` (Windows-safe, sortable).
- `.jetic/runs/<runId>/simulation-report.json` — full report (metadata + complete
  `WorkflowSimulationResult`).
- `.jetic/runs/<runId>/simulation-status.json` — compact status: `passed | failed | aborted |
  running | error`, stats (`totalSteps/executedSteps/passedSteps/failedSteps/skippedSteps`),
  timings, `error?`, `reportPath`.
- Status derivation: `success → passed`; failed with `abortReason → aborted`; failed
  otherwise → `failed`; async start → `running`; run-level crash → `error`.
- Async runs write the `running` status *before* returning; the background completion
  rewrites it (or writes `error` on an unexpected crash).

### 3.5 Compact simulate output (`packages/mcp-server/src/run-store.ts` + `workflow-tools.ts`)

`jetic_simulate_workflow` now returns by default:

```json
{
  "ok": true, "success": true,
  "runId": "2026-10-19T09-30-00-000Z",
  "status": "passed",
  "workflow": "Checkout Flow",
  "environment": { "name": "local", "baseUrl": "http://localhost:3000" },
  "stats": { "totalSteps": 4, "executedSteps": 4, "passedSteps": 4, "failedSteps": 0, "totalTimeMs": 512 },
  "preflight": { "verdict": "healthy", "status": 404, "message": "...", "aborted": false },
  "steps": [ { "step": 1, "name": "Login", "method": "POST", "path": "/api/auth/login", "status": "passed", "expectedStatus": 200, "actualStatus": 200, "durationMs": 88 } ],
  "reportPath": "…/.jetic/runs/<runId>/simulation-report.json",
  "next": "Full request/response detail: jetic_get_run { \"runId\": \"…\" }"
}
```

- `includeStepResults: true` restores the full per-step payloads (plus `runId`, `status`,
  `reportPath`).
- `ok` and `success` are both present for backward compatibility (`success` is what existing
  consumers/parity harnesses read).

### 3.6 New MCP tools: `jetic_get_run`, `jetic_list_runs` (`run-tools.ts`, new)

- `jetic_list_runs` — newest-first list of simulation + agent runs with status, counts,
  duration; returns `runsDir` and `totalCount`.
- `jetic_get_run { runId }` — full stored report; for a still-`running` run it falls back to
  the status file and says "poll again shortly"; for `error` runs it explains the crash;
  an unknown id errors with the recent run ids.

### 3.7 Async simulation (`workflow-tools.ts`)

- `async: true` → writes the `running` status, starts the run in the background, returns
  `{ status: 'running', runId, workflowName, environment, message }` immediately.
- Poll via `jetic_get_run { runId }` (status file until the report lands) or `jetic_list_runs`.
- A background crash writes a status file with `status: 'error'` — no unhandled rejection,
  nothing is swallowed silently.

### 3.8 MCP instructions update (`packages/mcp-server/src/server.ts`)

- STEP 4g now documents preflight, `runId`, compact output, `jetic_get_run`/`jetic_list_runs`,
  and `async: true`.
- Tool count in the catalog: 24 → **26** (`jetic_get_run`, `jetic_list_runs` added;
  `jetic_simulate` remains as an alias of `jetic_simulate_workflow`).

---

## 4. Bug fixes discovered during verification

These were found while testing WS1/WS2 and fixed in the same cycle:

1. **Brace-aware template detection everywhere.** The validator's `TEMPLATE_RE`
   (`/\{\{\s*([^}]+?)\s*\}\}/g`) could not match a parameterized faker expression at all
   (inner `}` breaks the match), so `UNSUPPORTED_FAKER_CALL` never fired. Replaced with the
   same brace-aware scanner the simulator uses.
2. **KG-31 fixed — `inject: { "body:id": ... }` for path params.** The runtime always
   supported it (injections merge into the body before path resolution), but the validator
   rejected it with `UNRESOLVED_PATH_PARAM`. The validator now accepts it; the smoke test
   `KG-31` was converted from a `test.failing` (known-gap marker) to a normal passing test.
3. **Compact step numbering off-by-one.** The compact summary computed
   `step: r.stepIndex + 1`, but the simulator already records `stepIndex` 1-based — the
   summary showed `2..n+1`. Fixed to use `r.stepIndex` directly.
4. **KG-08 (error envelope) obsoleted.** The smoke test expecting generic error text was
   predicated on the old envelope; with real messages surfaced, the `test.failing` marker was
   converted to a normal test.
5. **`UND_ERR_SOCKET` added to connection-error codes** after observing a destroyed socket in
   the resilience tests report `TypeError: fetch failed` with cause code `UND_ERR_SOCKET`.

---

## 5. Defaults & compatibility

| Option | Library/CLI default | MCP tool default | Notes |
|---|---|---|---|
| `strictTemplates` | `true` | `true` | Set `false` for legacy empty-string behavior |
| `preflight` | `off` | `abort` | Keeps CLI/library parity harnesses green; MCP fails fast |
| `requestTimeoutMs` | `30000` | `30000` (max 120000) | `0` disables |
| `timeoutMs` (per step) | unset | unset | Overrides the run default |
| `includeStepResults` | n/a | `false` | Compact output by default |
| `async` | n/a | `false` | Background runs + polling |

Compatibility notes:

- Existing workflows that relied on unresolved templates resolving to `""` need
  `strictTemplates: false` (or, better, fix the workflow — the error names the placeholder).
- Response consumers: the full simulation payload is still returned with
  `includeStepResults: true`; the compact shape keeps `success` (not only `ok`) so existing
  readers keep working.
- Everything the runs produce is additive under `.jetic/runs/` — nothing else moved.

---

## 6. File map

| File | What changed |
|---|---|
| `packages/simulator/src/workflow-simulator.ts` | Bearer prefix; strict/deep templates; brace-aware `findPlaceholders`; faker guardrails; `query`; path-param sources; `timeoutMs`; preflight; early abort (`UND_ERR_SOCKET`); `WorkflowStepDef` additions; WS3: per-step payload fields (`resolvedUrl`, `requestHeaders`, `responseHeaders`, `startedAt`/`finishedAt`), `onStepResult`, standalone `probeTarget`/`networkErrorCode`/`CONNECTION_ERROR_CODES` |
| `packages/simulator/src/workflow-simulator.test.ts` | New `request building` + `resilience` suites (Bearer, strict templates, faker, path/query, preflight, timeouts, mid-run drop); WS3: `per-step payload capture & progress` suite |
| `packages/mcp-server/src/tools/workflow-authoring-tools.ts` | Validator: query/GET-body/faker/path-param rules, brace-aware refs, `CONTINUE_WITH_CAPTURE` conditional; schema: `query`, `timeoutMs` |
| `packages/mcp-server/src/tools/workflow-step-validation.test.ts` | New unit tests for the above (+ KG-31 path-param sources) |
| `packages/mcp-server/src/tools/workflow-designer-tools.ts` | Scaffold: path `:param` mapping + query param emission |
| `packages/mcp-server/src/response-envelope.ts` (+ test) | Real error messages, 500-char cap, custom hints, zod issue summaries |
| `packages/mcp-server/src/run-store.ts` | New: run persistence, status files, list, compact result; WS3: planned-step seeding (`pending`), `updateRunStatus`/`stepToProgress`/`statsFromSteps`, 16,384-char body truncation |
| `packages/mcp-server/src/run-store.test.ts` | New (WS3): pending seeding, incremental updates, truncation, step projections |
| `packages/mcp-server/src/tools/run-tools.ts` | New: `jetic_get_run`, `jetic_list_runs`; WS3: uniform top-level `steps` for running + finished runs |
| `packages/mcp-server/src/tools/workflow-tools.ts` | Simulate schema (`includeStepResults`, `async`, `preflight`, `strictTemplates`, `requestTimeoutMs`) + run persistence/compact/async handler; WS3: `onStepResult` → live step progress |
| `packages/mcp-server/src/server.ts` | Tool registration (26), STEP 4g instructions, run tools |
| `apps/cli/src/commands/simulate-workflow.ts` | WS3: deep template resolution, Bearer auto-prefix, `probeTarget` health check, 30 s timeouts, per-step payload capture in results + traces, connection-error early abort |
| `apps/dashboard/src/lib/traceStore.ts` + `apps/dashboard/src/pages/Observability/Traces.tsx` | WS3: trace type extended; drawer shows sent headers, request URL, response headers/status, started/finished |
| `tests/smoke/specs/t4-mcp-model.smoke.ts` | Catalog 24 → 26 tools; KG-08 converted to a normal test |
| `tests/smoke/specs/t4-mcp-workflows.smoke.ts` | SMK-408b–e rewritten/added; WS3: SMK-408f (pollable progress + curl-style stored payloads); KG-31 converted to a normal test |
| `tests/smoke/specs/t2-workflows.smoke.ts` | WS3: SMK-202 also asserts the trace's resolved request/response payloads |

---

## 7. Verification

- Unit tests (`pnpm test`, all workspaces): scanner 5, simulator 71 (incl. new request
  building/resilience and per-step payload/progress suites), mcp-server 35 (envelope +
  condition validation + step validation + run-store), cli 4 — all green.
- Full smoke suite (`pnpm --filter @jetic/smoke run smoke`): 17 suites, 162 passed,
  6 skipped (pre-existing parity-vector skips), 0 failed.
- `pnpm build`: all 19 workspace projects build (mcp-server via `tsc`, CLI via `tsup`,
  dashboard bundled into the CLI dist).

---

## 8. WS3 — Complete run observability

A second feedback round (`feedback/user_2.md`) drove this: the async run + run-store added in
WS2 gave a `runId` and a status, but a *running* run exposed no per-step progress, and the
stored report only had step names/statuses/timing — not the actual requests that were sent.
Debugging a failed journey still required re-running it.

### 8.1 Per-step payload capture (`packages/simulator`)

`WorkflowStepResult` now carries the complete curl-style picture for every step:

| Field | Meaning |
|---|---|
| `resolvedUrl` | Final URL **including query string** (what was actually fetched, retry-stable) |
| `requestHeaders` | The actual sent header set: `Content-Type` + every injected header (`Authorization` holds the real Bearer value) — not the injection spec |
| `requestBody` | The resolved request body (templates already substituted) |
| `responseStatus` / `responseHeaders` | HTTP status + full response header map |
| `responseBody` | Parsed response body (uncapped in memory) |
| `startedAt` / `finishedAt` | ISO timestamps per attempt (the recorded attempt, not wall-clock wander) |
| `responseBodyTruncated` | Present (`true`) when a persistence layer capped the body |

A new `onStepResult` callback (`SimulateWorkflowOptions`) fires after **every** recorded step —
passed, failed, or skipped — so hosts can persist progress incrementally. Callback errors are
swallowed on purpose: a broken observer must never fail a run.

### 8.2 Incremental progress in the run store (`packages/mcp-server/src/run-store.ts`)

- When an async run starts, the `running` status file is now **seeded with the planned route**:
  every step as `{ index, name, status: 'pending' }`.
- Each completed step updates its entry in place (`updateRunStatus`, read-modify-write), so a
  poll of `jetic_get_run` shows a live `pending → passed/failed/skipped` progression plus
  recomputed stats (`statsFromSteps`).
- Finished runs expose the same uniform top-level `steps` array (derived via
  `stepToProgress`), so clients can read one shape for both states.
- Report bodies are capped at persistence time: `MAX_PERSISTED_BODY_CHARS = 16_384`. A long
  string body is sliced with a `…[truncated: N more characters]` marker; a structured body is
  stored as `{ _truncated: true, preview, fullLengthChars }`; both set
  `responseBodyTruncated: true`. The in-memory result stays complete — only the stored files
  are capped.

### 8.3 Distinct connection diagnostics (`probeTarget`, `networkErrorCode`)

- `probeTarget(baseUrl, timeoutMs)` is now an exported standalone preflight probe returning
  `{ verdict: 'healthy' | 'server-error' | 'unreachable', status?, message, code? }` with the
  real network error code (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `UND_ERR_SOCKET`, …).
- `CONNECTION_ERROR_CODES` + `networkErrorCode(err)` are exported so hosts can classify the
  same way. An unreachable backend is one clear abort reason — not N identical
  "fetch failed" step failures.

### 8.4 CLI parity (`apps/cli/src/commands/simulate-workflow.ts`)

The CLI runner had drifted from the library simulator; it now matches:

- **Deep template resolution** — arrays/objects nested in `body` are resolved, not just
  top-level strings (`resolveDeepValue`/`resolveBodyTemplates`).
- **Bearer auto-prefix** — raw `Authorization` values get `Bearer ` (explicit schemes pass
  through), exactly like the simulator rule.
- **`probeTarget` health check** — unreachable → abort with exit 1 and the classified reason;
  `server-error` → warn and continue; healthy → proceed.
- **Enriched step results + traces** — `StepResult` and the stored trace
  (`.jetic/traces/trace_<id>.json`) now include `requestHeaders` (actual), `requestBody`
  (resolved) + `requestBodySpec`, `resolvedUrl`, `responseStatus`, `responseHeaders`,
  `startedAt`/`finishedAt`, `connectionError`; response bodies are capped at the same 16,384
  chars. Per-request timeout: 30 s (`AbortSignal.timeout`), and a connection error aborts the
  remaining steps immediately.

### 8.5 Dashboard trace viewer (`apps/dashboard`)

`StepDetailDrawer` renders the new fields: Request **URL** + **Headers (sent)** (falling back
to the injected spec for old traces), **Response headers**, the step's `responseStatus`, and
**Started/Finished** timestamps in the Timing section.

### 8.6 Tests

- `packages/simulator/src/workflow-simulator.test.ts` — new "per-step payload capture &
  progress" suite: payload fields (URL/headers/timestamps), `onStepResult` fire order incl.
  skipped and `onFailure: 'continue'` steps, and a throwing callback never failing the run.
- `packages/mcp-server/src/run-store.test.ts` (new) — pending-step seeding + incremental
  updates, no-op updates on a missing file, truncation + final status steps, `stepToProgress`
  projections.
- Smoke: `SMK-408f` (async run is pollable; first poll shows the 4-step plan; finished report
  steps carry `resolvedUrl`, real `Bearer` values, response headers, timestamps) and extended
  `SMK-202` (CLI trace payload assertions: resolved body, no `{{templates}}`, response
  status/headers, actual `Authorization`).
