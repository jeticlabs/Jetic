# Jetic — Complete Documentation

This document explains how Jetic works end-to-end: the behavioral model, the scanners and
framework adapters, the CLI, memory, workflows, the simulator, the MCP server, the local
Studio/dashboard, run persistence, and configuration. It reflects the actual code in this
repository (monorepo `jetic-monorepo`, CLI published as `jetic-cli`).

---

## Table of Contents

1. [What Jetic is](#1-what-jetic-is)
2. [The big picture](#2-the-big-picture)
3. [The `.jetic/` folder](#3-the-jetic-folder)
4. [The Behavioral Model (`model.json`)](#4-the-behavioral-model-modeljson)
5. [Scanning and framework adapters](#5-scanning-and-framework-adapters)
6. [CLI reference](#6-cli-reference)
7. [Memory and templates](#7-memory-and-templates)
8. [Workflows](#8-workflows)
9. [The simulator engine](#9-the-simulator-engine)
10. [Runs and observability](#10-runs-and-observability)
11. [The MCP server](#11-the-mcp-server)
12. [jetic dev — Studio and change tracking](#12-jetic-dev--studio-and-change-tracking)
13. [Configuration files](#13-configuration-files)
14. [Typical end-to-end walkthrough](#14-typical-end-to-end-walkthrough)
15. [FAQ](#15-faq)

---

## 1. What Jetic is

Jetic is an **agentic, code-native API platform**. It turns your backend source code into a
machine-readable **behavioral model** of your API, then uses that model to:

- document endpoints (routes, params, auth, constraints, responses),
- author and run **multi-step, stateful workflows** (integration "user journeys") against a
  live server,
- give AI editors (opencode, Cursor, Claude Code, VS Code, Windsurf) a safe, deterministic
  tool surface over MCP so they can model, verify, and simulate your API without guessing.

The core loop is:

```
source code ──scan──▶ behavioral model ──author──▶ workflows ──simulate──▶ run reports
     ▲                      │                          ▲                        │
     └──────── jetic dev watches edits ◀───────────────┴────────────────────────┘
```

Everything is stored in a `.jetic/` folder inside your project. No cloud, no AI provider
keys — scanning is static, simulation is plain HTTP.

---

## 2. The big picture

### Monorepo layout

| Package | Purpose |
|---|---|
| `packages/core` | Config loading (`jetic.config.json`), filesystem helpers, events, activity log |
| `packages/model` | Behavioral model TypeScript types, YAML I/O, workflow file helpers |
| `packages/scanner` | The Express+TypeScript AST scanner (`ExpressScanner`, ts-morph based) |
| `packages/scanner-sdk` | Adapter contract (`JeticAdapter`, `defineAdapter`, `AdapterRegistry`, `auto` detection) |
| `packages/adapter-express` | Express adapter (wraps `ExpressScanner`) |
| `packages/adapter-fastify` | Fastify adapter (`instance.get/post/...`) |
| `packages/adapter-hono` | Hono adapter |
| `packages/adapter-nestjs` | NestJS decorator adapter (`@Controller`/`@Get`/...) |
| `packages/adapter-nextjs` | Next.js App Router adapter (`app/**/route.ts`) |
| `packages/simulator` | `WorkflowSimulator` + `EndpointSimulator` + condition engine |
| `packages/memory` | `JeticMemory` — scoped key/value store in `.jetic/memory.json` |
| `packages/agent-sdk` | Agent contract (`JeticAgent`, `defineAgent`, `AgentRegistry`) |
| `packages/agents` | Built-in deterministic agents (`model-watcher`, `workflow-impact`) |
| `packages/mcp-server` | The MCP server: 26 tools, 4-phase lifecycle, run store, error envelope |
| `packages/sdk` | `defineTool` / `jetic.tools.ts` project-tool contract |
| `apps/cli` (`jetic-cli`) | The `jetic` command (bundles the MCP server and dashboard assets) |
| `apps/dashboard` | Jetic Studio UI (served by `jetic dev`) |
| `tests/smoke` | End-to-end smoke suite (tiers t0–t5) |

### Two ways to drive Jetic

1. **CLI** — `jetic init`, `jetic scan`, `jetic simulate workflow`, `jetic test`, `jetic dev`, ...
2. **MCP** — `jetic mcp` exposes tools such as `jetic_get_session_phase`, `jetic_scan`,
   `jetic_add_endpoint`, `jetic_validate_workflow`, `jetic_simulate_workflow` to an AI editor.

Both paths read and write the same `.jetic/` artifacts, so CLI work and AI work are fully
interoperable.

---

## 3. The `.jetic/` folder

`jetic init` creates this structure (all paths relative to your project root):

```
.jetic/
├── model.json                  # the behavioral model (single-file form)
├── model/                      # optional split YAML layout (jetic model export)
│   ├── paths/
│   ├── schemas/
│   └── security/
├── workflows/                  # *.json workflows you can run
│   └── checkout-flow.json
├── workflow.json               # legacy single-workflow location (still read)
├── agents/                     # reserved for agents (directory is created)
├── environments/               # reserved for env files
├── activity/                   # endpoint_added / endpoint_removed event log
├── index/                      # reserved
├── runs/                       # run reports (simulations + agents)
│   └── 2026-10-19T09-30-00-000Z/
│       ├── simulation-report.json
│       ├── simulation-status.json
│       └── agent-report.json
├── reports/                    # reserved
├── cache/                      # e.g. model-watcher-snapshot.json
├── traces/                     # traces written by Studio/CLI (optional)
├── changes.json                # file-change log written by `jetic dev`
└── memory.json                 # Jetic memory (scopes → key → value)
```

Plus `jetic.config.json` at the project root (see [section 13](#13-configuration-files)).

---

## 4. The Behavioral Model (`model.json`)

The model is a JSON document (`version`, `generatedAt`, `project`, `endpoints`, plus optional
sections). Current schema version: **0.3** (`CURRENT_MODEL_VERSION` in `packages/model`).

### Top level

| Field | Description |
|---|---|
| `version` | Model schema version (`"0.3"`) |
| `generatedAt` | ISO timestamp of the last write |
| `project` | `{ name, language?, framework? }` |
| `environments` | `[{ name, baseUrl, variables? }]` — e.g. `local`, `staging` |
| `securitySchemes` | Named schemes: `http`, `apiKey`, `signature`, `oauth2`, `none`; may declare `obtainedFrom: { endpoint, field }` (which endpoint produces the token) |
| `resources` | Domain entities (`{ name, idField?, ownedBy? }`) |
| `endpoints` | The route list (see below) |
| `dependencies` | Inter-endpoint data flow edges |
| `workflows` | Optional **embedded** workflows (a second, simpler dialect — see section 8) |
| `stateMachines` | Resource lifecycle states/transitions |

### Endpoint shape (the important fields)

| Field | Meaning |
|---|---|
| `id` | Stable identifier (e.g. `get--api-users--id` or a UUID) |
| `method`, `path` | HTTP verb and route (`/api/users/:id`) |
| `name`, `description`, `summary`, `tags[]` | Human-readable metadata (required for the Phase 3 gate, see section 11) |
| `source` | `{ file, line, column? }` — where the route is defined in code |
| `handlerName` | e.g. `UserController.create` |
| `middleware[]` | Execution-ordered chain (`cors → json → auth → rateLimit → validator`) with optional `config`, `scheme`, `source` |
| `security[]` | `{ scheme, required?, scopes? }` referencing `securitySchemes` |
| `parameters[]` | query/path/header/cookie/body params: `{ name, in, type, format?, required?, default?, description?, min?, max?, example? }` |
| `requestBody` | `{ contentType, required?, fields: { name → FieldDefinition }, constraints[] }` |
| `responses` | Keyed by status code string: `{ description?, contentType?, schema?, example?, condition?, ownershipCheck? }` |
| `produces[]` | Memory variables a call yields: `{ variable, responseField, resourceStateChange? }` |
| `consumes[]` | Variables the call needs: `{ variable, usedAs, producedBy? }` |
| `pagination` | `{ type: offset\|cursor\|page, pageParam?, limitParam?, cursorParam?, totalPath? }` |
| `rateLimit` | `{ windowMs, max, scope? }` |
| `ownership` | `{ ownerField, mustMatchAuthClaim }` |
| `auth`, `authorization`, `requestSchema`, `responseSchemas`, `constraints` | **Evidence-backed facts**: `{ value, status: verified\|inferred\|unknown, confidence, evidence[] }` |

`produces` / `consumes` are what make cross-step data flow (token chains, IDs) explicit and
powerful for workflow scaffolding.

### Environment resolution

Simulation targets an environment by name (`--env staging`) or falls back to the model's
default (`defaultEnvironment`, or the env marked `default`, or the first one). `baseUrl` can
always be overridden per call (`baseUrl` on `jetic_test_endpoint` / `jetic_simulate_workflow`,
`--url` style options on CLI).

---

## 5. Scanning and framework adapters

### How scanning works

1. The scanner walks the project's TypeScript/JavaScript sources with **ts-morph** (a typed
   AST, not grep).
2. It collects Express `router.METHOD(path, ...middleware, handler)` registrations, resolves
   `router.use()` mount prefixes, and extracts:
   - route path + method, handler name, source `{ file, line }`,
   - middleware chains in execution order,
   - auth heuristics (JWT/bearer middleware → `securitySchemes`),
   - request body fields (from destructuring / zod-style validators when recognizable),
   - parameters (query/path/header/cookie),
   - responses and constraints where they can be inferred statically.
3. The result is merged into `.jetic/model.json`. Scan modes:
   - `merge` (default): upsert scanned routes, **keep** hand-added endpoints,
   - `overwrite`: replace the whole `endpoints` array.

Scanning is fully static and keyless — no AI provider, no network, no server running.

### Does Jetic automatically route the project to the right adapter?

There *is* an adapter registry with automatic detection, and there are five adapters. The
detection is dependency-driven:

| Adapter | `detect()` returns true when |
|---|---|
| `express` | `package.json` has `express`, or fallback: a `tsconfig.json` exists |
| `fastify` | `package.json` has `fastify` |
| `hono` | `package.json` has `hono` |
| `nestjs` | `package.json` has `@nestjs/core` or `@nestjs/common` |
| `nextjs` | `package.json` has `next` |

You can introspect them:

```bash
jetic adapter list            # which adapters detect in THIS project
jetic adapter inspect nestjs  # detection result + endpoint count for one adapter
```

`AdapterRegistry.resolve('auto', ctx)` picks the first adapter whose `detect()` returns true,
and `jetic.config.json` has a `scanner.adapter` field (`"auto"` by default) so a project can
pin one.

**Important current limitation (KG-23):** the *scan path itself* — CLI `jetic scan` and MCP
`jetic_scan` — always uses the **Express scanner**. The Fastify/Hono/NestJS/Next.js adapters
are fully implemented and used by `jetic adapter inspect`, but they are not yet wired into
`jetic scan`. Consequence:

- Express+TypeScript projects: `jetic scan` / `jetic_scan` fills the model automatically.
- Any other stack (NestJS, Fastify, Hono, Next.js, Python, Go, ...): read the source (the AI
  does this over MCP) and add endpoints with `jetic_add_endpoint` — the MCP instructions
  explicitly tell the model to do this.

This is intentional behavior in the current release, not a bug in your project. The adapter
packages are the foundation for wiring other frameworks into the scan path next.

### Manual modeling via MCP (any stack)

For non-Express stacks the MCP workflow is:

```
jetic_add_endpoint   (per route: method, path, middleware chain, security, requestBody,
                      parameters, responses, produces/consumes, pagination, rateLimit, …)
jetic_verify_model   (duplicate routes, unbound :path params, bad status codes, dangling source
                      links, unknown schemes)
```

### The change log (`jetic dev`)

While `jetic dev` runs, a `ChangeScanner` watches your sources (debounced 300 ms, ignores
`node_modules`, `dist`, binary assets, etc.) and appends edits to `.jetic/changes.json`.
Over MCP the AI can then:

1. `jetic_get_changes` — read only the changed files instead of rescanning everything,
2. update `model.json` for those files,
3. `jetic_clear_changes` (or `jetic_scan`, which clears automatically).

The same log powers the `workflow-impact` agent (see `tutorials/agents.md`).

---

## 6. CLI reference

Everything below is available as `jetic <command>` (global install or `npx jetic-cli`).

| Command | What it does |
|---|---|
| `jetic init` | Scaffold `.jetic/` + `jetic.config.json`. `jetic init --ide vscode` writes the VS Code MCP config (`--dry-run` to preview) |
| `jetic scan` | Static scan (Express+TS) → `.jetic/model.json`; records `endpoint_added/removed` activity |
| `jetic inspect` | Inspect the discovered model; `jetic inspect <id>` for one endpoint |
| `jetic model export` | Convert `model.json` to the split YAML layout `.jetic/model/` |
| `jetic model list` | List endpoints (YAML layout if present, else `model.json`) |
| `jetic adapter list` / `jetic adapter inspect <id>` | Framework adapter detection + counts |
| `jetic agent list` / `jetic agent run <id>` | Run deterministic agents; reports land in `.jetic/runs/<runId>/agent-report.json` |
| `jetic memory` | `add` (interactive), `clear`, inspect memory state |
| `jetic simulate` | Simulate a single endpoint or all endpoints against a live server |
| `jetic simulate workflow` | Execute a saved workflow (interactive human input supported) |
| `jetic test` | Run ALL saved workflows; `--ci` for machine-readable output + exit 1 on failure |
| `jetic dev` | Start Jetic Studio (dashboard) + ChangeScanner, default port 8787 |
| `jetic doctor` | Diagnose setup problems |
| `jetic authz` | Best-effort check that secured endpoints reject anonymous requests |
| `jetic activity list` | List model-change events |
| `jetic tool list` | List tools exported from `jetic.tools.ts` |
| `jetic config` | Show resolved configuration paths |
| `jetic upgrade` | Upgrade the CLI |
| `jetic mcp` | Launch the MCP server on stdio (`--project <path>` or `JETIC_PROJECT_PATH`) |

---

## 7. Memory and templates

### JeticMemory

`JeticMemory` is a scoped JSON store at `.jetic/memory.json`:

```
{
  "workflow": { "accessToken": { "value": "eyJ..." }, "orderId": { "value": "o_123" } },
  "human":    { "otp": { "value": "123456" } },
  "global":   { "apiKey": { "value": "..." } }
}
```

- Scopes are free-form strings: `workflow`, `human`, `global`, `step`, ... anything.
- Values support optional TTL (`expiresAt`); expired entries are cleaned up on read.
- The scope used most in workflows is `workflow:` — the run-scoped working set.

### Template syntax (simulator engine)

Inside `body`, `query`, `inject` values, `path`, and conditions:

| Template | Resolution |
|---|---|
| `{{faker.internet.email}}` | Faker call — **parameterless paths only** (`faker.string.uuid`, `faker.person.fullName`, ...) |
| `{{workflow:accessToken}}` | Memory lookup, scope `workflow` |
| `{{human:otp}}` | 1) `JETIC_HUMAN_OTP` env var, 2) `human:otp` memory, 3) interactive prompt (CLI/dashboard) or a strict error (non-interactive runners like MCP) |
| `{{global:apiKey}}` (etc.) | Any other scope is a plain memory lookup |
| `{{step:...}}` | Same mechanism (scope `step`) |

Rules and behavior:

- **Resolution is deep**: every string in a nested body/query object is resolved
  (arrays and objects included) before the request is sent.
- **Strict by default**: if a `{{...}}` or `:path` param resolves to nothing, the step fails
  *before any request is sent*, with a message naming the placeholder. Set
  `strictTemplates: false` (MCP `jetic_simulate_workflow`) only if you deliberately want the
  legacy empty-string behavior.
- **Parameterized faker calls are rejected**: `{{faker.number.int({min:1,max:5})}}` throws a
  clear error (strict mode). Use `{{faker.number.int}}` or a literal.
- Inject values without braces are treated as memory keys: `"workflow:accessToken"` reads
  memory; a bare key defaults to the `workflow` scope.

### Inject targets

`inject` maps a destination to a value source:

```json
"inject": {
  "header:Authorization": "Bearer {{workflow:accessToken}}",
  "header:X-Api-Key": "global:apiKey",
  "body:tenantId": "workflow:tenantId"
}
```

- `header:<Name>` — sets a request header. **`Authorization` is special: if the value is a
  raw token (no scheme prefix like `Bearer`), `Bearer ` is prefixed automatically.** If you
  write `"Basic dXNlcjpwYXNz"` or `"Token abc"` it is passed through untouched.
- `body:<field>` — merges the value into the request body. Body injections happen **before
  path-parameter resolution**, so `inject: { "body:id": "workflow:orderId" }` also fills
  `/orders/:id`.

---

## 8. Workflows

Workflows are JSON files in `.jetic/workflows/*.json` (a legacy `.jetic/workflow.json` is
still read). They are ordered lists of HTTP steps with state capture and flow control.

### Step fields (complete)

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Step label |
| `method`, `path` | string | HTTP call target. `path` supports `:params` and `{{templates}}` |
| `description` | string | Optional note |
| `body` | object | Request body. Templates resolved deeply |
| `query` | object | Explicit URL query parameters (templates resolved). Prefer this over GET bodies |
| `timeoutMs` | number | Per-step request timeout (overrides the run default; `0` disables) |
| `expectStatus` | number | Expected status (default 200; any 2xx passes when expecting 2xx) |
| `continueOnStatus` | number[] | Extra status codes treated as pass, e.g. `[404, 409]` |
| `capture` | map | After a PASSING step: `"workflow:orderId": "data.order.id"` — dot paths into the response |
| `captureInput` | map | Before sending: `"workflow:email": "email"` — saves a REQUEST body field |
| `inject` | map | Header/body injection (see section 7) |
| `condition` | object | Rules condition (after the step) or legacy guard (before the step) — see below |
| `onFailure` | `"abort"` \| `"continue"` | What a failing step does to the run (default `abort`) |
| `retry` | `{ times, delayMs }` | Per-step retry (overrides the workflow-level default) |

### Workflow-level fields

| Field | Meaning |
|---|---|
| `name`, `description`, `generatedAt`, `environment` | Metadata; `environment` selects the target env |
| `retry` | Global retry default `{ times, delayMs }`, overridable per step (keep `times` ≤ 5) |
| `steps` | The ordered steps |

### Conditions

**Rules form (canonical)** — evaluated AFTER the step runs, so it can use what the step just
captured:

```json
"condition": {
  "rules": { "all": [ { "left": "{{workflow:userRole}}", "operator": "equals", "right": "admin" } ] },
  "onFail": "abort"
}
```

- `rules.all` = AND, `rules.any` = OR.
- Operators: `equals`, `not_equals`, `greater_than`, `greater_than_or_equal`, `less_than`,
  `less_than_or_equal`, `exists`, `not_exists`, `is_empty`, `is_not_empty`, `contains`,
  `not_contains`, `starts_with`, `ends_with`.
- `onFail`:
  - `"abort"` — fail the workflow,
  - `"continue"` — stop the remaining steps; the workflow still passes (branch not applicable),
  - `"switch"` — run another saved workflow (`"switchToWorkflow": "<slug or name>"`);
    add `"returnOnComplete": true` to resume this workflow afterwards. Switch loops are
    detected and fail fast.

**Legacy guard form** — evaluated BEFORE the step; a miss skips just that step (counted as
passed):

```json
"condition": { "if": "{{workflow:userRole}}", "equals": "admin" }
```

Operators: `equals`, `notEquals`, `contains`, `exists` (bool), `greaterThan`, `lessThan`, `in`.

A condition that matches **neither** shape fails the run — it is never silently ignored.

### Failure modes and retry

- `onFailure: "continue"` — log the failure and proceed. Captures for that step are skipped
  (a capture from a failed call would be garbage). The validator warns (`CONTINUE_WITH_CAPTURE`)
  when a later step consumes a capture that a `continue` step may never produce.
- `retry: { "times": 3, "delayMs": 1000 }` — up to 3 retries with 1 s delay. Per-step retry
  beats the workflow-level default.
- **Connection loss aborts the run early**, regardless of `onFailure` — losing the server
  mid-journey is never something to "continue" past. Codes like `ECONNREFUSED`, `ECONNRESET`,
  `ENOTFOUND`, `ETIMEDOUT`, `UND_ERR_SOCKET` trigger this.

### Embedded workflows (model.json)

`model.json` may also carry a simpler embedded workflow dialect
(`{ name, steps: [{ call: "POST /api/login", body, expectStatus }] }`). `jetic_list_workflows`
merges file workflows + legacy `workflow.json` + embedded ones (`source: workflows_dir |
legacy_file | model_json`). For real work, use file workflows — they support the full field
set. The MCP lifecycle's scaffold/validate/create tools only author file workflows.

---

## 9. The simulator engine

`WorkflowSimulator` (`packages/simulator`) executes a workflow against a live `baseUrl`.

### Per-step resolution order

1. Resolve `inject` values (memory/templates) → headers + body injections.
2. Deep-resolve `body` templates; merge `{ ...injectedBody, ...resolvedBody }`.
3. Deep-resolve `query` templates.
4. Save `captureInput` from the merged request body (before sending).
5. Resolve `path`: templates first, then `:params` from the merged body, then memory keys
   whose name matches the param, then `{{workflow:<param>}}` inline templates. Longest param
   names are replaced first (`/a/:user_id/:id` works correctly). A `:param` with no source
   throws in strict mode.
6. Send the request with the resolved query appended (GET/HEAD bodies are demoted to query
   parameters only for flat values; nested GET bodies produce a `GET_WITH_BODY` validation
   warning because they would be stringified).
7. On a passing status: run `capture` (dot paths into the response → memory).

### Preflight

Before step 1, the simulator can probe the target `baseUrl`:

- `preflight: 'abort'` (MCP default) — one `GET` probe; `5xx` → verdict `server-error`;
  otherwise `healthy`; network failure → verdict `unreachable` with the real reason
  (`ECONNREFUSED` etc.). Unhealthy aborts the run before any step, with `abortReason` set and
  `stats.executedSteps: 0`.
- `preflight: 'warn'` — record the probe and continue anyway.
- `preflight: 'off'` — skip the probe entirely (CLI/library default; keeps parity harnesses
  and mocks that do not expect probe traffic green).

### Timeouts

- Run-level default: `requestTimeoutMs` (MCP default 30000 ms).
- Per-step override: `timeoutMs` (validated positive; max 120000 over MCP).
- Timeouts surface as a clear message: `Request timed out after 30000ms (GET /api/users).`
  with a retry-friendly classification (`TimeoutError`/`ETIMEDOUT`).

### Result shape

`WorkflowSimulationResult`:

```json
{
  "success": true,
  "workflow": { "name": "...", "description": "...", "stepsCount": 4 },
  "environment": { "name": "local", "baseUrl": "http://localhost:3000" },
  "stats": { "totalSteps": 4, "executedSteps": 4, "passedSteps": 4, "failedSteps": 0, "totalTimeMs": 512 },
  "results": [ { "stepIndex": 1, "passed": true, "targetUrl": "...", "requestHeaders": {}, "requestBody": {}, "requestQuery": {}, "responseBody": {}, "capturedMemory": ["workflow:accessToken ← data.accessToken"], "retryCount": 0, "skipped": false, "durationMs": 88 } ],
  "preflight": { "url": "http://localhost:3000", "verdict": "healthy", "status": 404, "message": "...", "aborted": false },
  "abortReason": "Connection refused (ECONNREFUSED) at http://localhost:3000 — the server is not accepting connections."
}
```

`stepIndex` is 1-based. `conditionResult` / `conditionOutcome` / `failureHandling` appear when
relevant.

---

## 10. Runs and observability

Every MCP simulation run is persisted under `.jetic/runs/<runId>/`:

- `runId` = `YYYY-MM-DDTHH-mm-ss-sssZ` (ISO timestamp, `:`/`.` replaced with `-` for Windows).
- `simulation-report.json` — full report: metadata + the complete `WorkflowSimulationResult`
  (every request, response, capture, error).
- `simulation-status.json` — compact status file, written even while a run is `running` or
  when it ends in a run-level `error`. Fields: `type`, `runId`, `workflowName`, `environment`,
  `baseUrl`, `status` (`passed|failed|aborted|running|error`), `startedAt`, `finishedAt?`,
  `durationMs?`, `error?`, `stats { totalSteps, executedSteps, passedSteps, failedSteps, skippedSteps }`,
  `reportPath`.
- `agent-report.json` — agent runs (see `tutorials/agents.md`).

Status derivation:

| Status | When |
|---|---|
| `passed` | `result.success === true` |
| `aborted` | failed AND `abortReason` present (preflight abort, connection loss, strict template failure at step level, condition abort) |
| `failed` | failed without a run-level abort reason |
| `running` | async run in flight |
| `error` | async run crashed unexpectedly (run-level exception) |

MCP observability tools:

- `jetic_list_runs` — newest-first list (simulations + agent runs) with status, step counts,
  duration.
- `jetic_get_run { runId }` — full stored report; for `running` runs it falls back to the
  status file and tells you to poll again.

`jetic_simulate_workflow` responses:

- Default: a **compact** summary (`ok`, `status`, `runId`, `workflow`, `environment`, `stats`,
  `preflight?`, `abortReason?`, one line per step, `reportPath`, `next` hint).
- `includeStepResults: true`: the full per-step result objects (requests, responses) plus
  `runId`/`status` (large payload — prefer `jetic_get_run` for follow-up).
- `async: true`: returns `{ status: "running", runId, ... }` immediately; the run continues in
  the background and the polling loop is `jetic_get_run`.

CLI observability: `jetic simulate workflow` prints a live per-step report;
`jetic test --ci` prints a machine-readable JSON summary and exits 1 on any failure.

---

## 11. The MCP server

### What it is

`jetic mcp` starts a Model Context Protocol server over **stdio**. Editors connect to it as a
local MCP server and get 26 tools. The server holds no state of its own — everything is read
from / written to `.jetic/` under the served project.

### Connecting an editor

opencode (`opencode.json`):

```json
{
  "mcp": {
    "jetic": {
      "type": "local",
      "command": ["cmd", "/c", "jetic", "mcp"],
      "cwd": "C:/path/to/your-backend"
    }
  }
}
```

Cursor / Claude / generic `mcpServers`:

```json
{
  "mcpServers": {
    "jetic": {
      "command": "jetic",
      "args": ["mcp", "--project", "C:/path/to/your-backend"]
    }
  }
}
```

VS Code: `jetic init --ide vscode` writes the config for you.

Project resolution order for every tool: explicit `projectPath` argument →
`JETIC_PROJECT_PATH` env var → the server's working directory (`--project` sets the env var).

### The 4-phase lifecycle (enforced)

The server ships an `instructions` block that every modern client sees, and
`jetic_get_session_phase` returns the exact `nextAction` the AI must take. The phases are
gates; the AI must not skip or reorder them:

**Phase 1 — Initialize.** Call `jetic_get_session_phase`. If no `model.json`: `jetic_init`
(gate: `modelExists`).

**Phase 2 — Scan.** Populate endpoints:
- Express+TypeScript (tsconfig.json present): `jetic_scan` — static, keyless.
- Any other stack or scan gaps: read the source and `jetic_add_endpoint` per route
  (middleware chains, security, constraints, pagination, produces/consumes).
- Gate: `endpointsCount > 0`.

**Phase 3 — Verify.** `jetic_verify_model` must be clean AND every endpoint must be
"complete": a `description`, at least one `tag`, a `description` on every parameter, and a
`description` on every response status. Fix with `jetic_update_endpoint`, re-verify.
- Gate: `phase=4` (`modelIsValid && allFieldsFilled`).

**Phase 4 — Simulate.** The AI must STOP and ask the user what to build, then:
- **4a Scaffold** — `jetic_scaffold_workflow` with the ordered endpoints. It reads the model
  and returns `draftSteps`: faker-mapped bodies (by type/format/field-name), `inject` from
  `securitySchemes.obtainedFrom` token chains, `capture` from `produces`, `captureInput` for
  required fields reused later, path `:params` mapped to matching memory keys
  (`{{workflow:<param>}}`) or flagged in `missingFields`, and query params emitted from
  `parameters` (`in: query`).
- **4b Human input** — use `{{human:key}}` ONLY for values unknowable before runtime (OTP,
  2FA, CAPTCHA, real credentials typed at run time). Never for things faker can generate.
- **4c Conditions** — rules conditions for branching/assertions; legacy guards still accepted.
- **4d Failure modes & retry** — `onFailure`, `continueOnStatus`, per-step/global `retry`.
- **4e Validate** — `jetic_validate_workflow` (dry run, no save). Errors block; warnings are
  informational.
- **4f Save** — `jetic_create_workflow`.
- **4g Run** — `jetic_simulate_workflow` (preflights the target; compact result + `runId`).

### Tool catalog (26)

**Phase / project:** `jetic_get_session_phase`, `jetic_init`, `jetic_scan`,
`jetic_get_changes`, `jetic_clear_changes`.

**Model:** `jetic_read_model`, `jetic_list_endpoints`, `jetic_get_endpoint`,
`jetic_add_endpoint`, `jetic_update_endpoint`, `jetic_delete_endpoint`, `jetic_verify_model`.

**Live testing:** `jetic_test_endpoint`, `jetic_manage_environment`.

**Workflows:** `jetic_list_workflows`, `jetic_scaffold_workflow`, `jetic_validate_workflow`,
`jetic_create_workflow`, `jetic_update_workflow`, `jetic_delete_workflow`,
`jetic_simulate_workflow`, `jetic_simulate` (alias).

**Runs:** `jetic_get_run`, `jetic_list_runs`.

**Agents:** `jetic_list_agents`, `jetic_run_agent`.

Each tool declares MCP `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`) so editors can badge read-only vs destructive tools and gate deletions.

### Error envelope

Every tool wraps results consistently:

Success:

```json
{ "ok": true, "data": { ... } }
```

Error (`isError: true`):

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT | NOT_INITIALIZED | MODEL_STALE | APP_BOOT_FAILED | BUSY | TIMEOUT | FORBIDDEN_ENV | NOT_FOUND | WRITE_DISABLED | INTERNAL",
    "message": "The real error message (truncated to 500 chars) — not a generic string",
    "hint": "Custom hint when the code provides one, else a generic retry hint; zod issues are summarized as 'Invalid input — path: message; …'"
  }
}
```

### Serialized transport

All inbound MCP calls pass through a `SerializedTransport`: pipelined/parallel tool calls
execute strictly one at a time, in arrival order. This is required because the server does
stateful read-modify-write cycles on `model.json`.

### Validator highlights (`jetic_validate_workflow`)

The dry-run validator cross-checks a workflow against the model and performs a full memory
data-flow analysis. Notable rules:

- Unknown endpoints / undefined memory refs / strict template issues → errors.
- `UNRESOLVED_PATH_PARAM` — a `:param` needs a source: a body field, an `inject` of
  `body:<name>`, or a matching memory key. (All three are runtime-supported; the validator
  accepts all three.)
- `BAD_QUERY` (query must be an object) and `UNKNOWN_QUERY_PARAM` (query key not declared by
  the endpoint — warning).
- `GET_WITH_BODY` — warning only for nested GET bodies (flat values are safely promoted to
  query params by the runtime).
- `UNSUPPORTED_FAKER_CALL` — parameterized faker calls (detected with a brace-aware scanner,
  so `{{faker.number.int({min:1,max:5})}}` is caught).
- `CONTINUE_WITH_CAPTURE` — a `continue` step's capture consumed downstream (warning).
- `CONTINUE_WITH_CAPTURE`, `UNDEFINED_MEMORY_REF`, `UNKNOWN_STEP_KEY`, `UNKNOWN_ENDPOINT`,
  unknown condition shapes, retry bounds, etc.

---

## 12. jetic dev — Studio and change tracking

`jetic dev` (default port 8787, `--port`, `--no-open`) starts:

- **Jetic Studio** — the dashboard (`apps/dashboard`), which talks to a local API server:
  - `GET /api/model`, endpoint create/update, `POST /api/model/scan` (rescan from the UI),
  - `GET/POST/PUT/DELETE /api/model/environments` (+ set default),
  - `GET /api/model/source` (code snippet around an endpoint's `source.line`) and
    `GET /api/model/related` (imports of the source file),
  - `GET/POST/PUT/DELETE /api/workflows` + `POST /api/workflows/run` — runs a workflow with
    **Server-Sent Events** (`start`, `step_start`, `step_result`, `condition_result`,
    `human_input_required`, `human_resolved`, `done`, `aborted`),
  - `GET/POST/DELETE /api/memory`, `GET /api/changes`, `GET /api/changes/stream` (SSE live
    updates), `DELETE /api/changes`, traces API.
- **ChangeScanner** — recursive `fs.watch` over the project (debounced, ignore lists for
  `node_modules`, `.git`, `dist`, `.next`, binaries, ...) writing `.jetic/changes.json`.
  Source extensions tracked include `.ts/.tsx/.js/.jsx/.py/.go/.rs/.java/.json/.yaml/.sql/.prisma/.proto`, etc.

**Human-in-the-loop in Studio:** a `{{human:key}}` in a run pauses it, the UI shows a prompt
(`human_input_required`), the answer is POSTed to `/api/workflows/human-input`, optionally
persisted to `human:<key>` memory, and the run resumes. There is a 10-minute timeout per
prompt, and pre-seeded answers are supported for CI-style runs.

---

## 13. Configuration files

### `jetic.config.json` (project root)

```json
{
  "$schema": "https://jetic.dev/schema/config.json",
  "project": { "name": "my-api" },
  "source": { "root": ".", "include": ["src/**/*.{ts,tsx,js,jsx}"], "exclude": ["node_modules/**", "dist/**"] },
  "scanner": { "adapter": "auto", "incremental": true, "watch": true },
  "model": { "directory": ".jetic/model" },
  "workflows": { "directory": ".jetic/workflows" },
  "agents": { "directory": ".jetic/agents" },
  "tools": { "entry": "./jetic.tools.ts" },
  "environments": { "directory": ".jetic/environments", "default": "local" },
  "runtime": { "baseUrl": "http://localhost:3000" },
  "auth": { "roles": { "admin": { "login": "POST /api/auth/login", "env": { "password": "ADMIN_PASS" } } }, "anonymous": true }
}
```

Only `project.name` is required. Directories fall back to the `.jetic/...` defaults.
`scanner.adapter` accepts `auto` or an adapter id.

### `jetic.tools.ts` (optional)

A project can export custom tools against the Jetic SDK (`packages/sdk`):

```ts
import { defineTool } from '@jetic/sdk';
import { z } from 'zod';

export const tools = [
  defineTool({
    name: 'seed-database',
    description: 'Seed the test database',
    input: z.object({}),
    async execute(_input, ctx) {
      // ctx.projectRoot
      return { ok: true };
    },
  }),
];
```

`jetic tool list` lists what is exported; `tools.entry` in the config points at the file.

---

## 14. Typical end-to-end walkthrough

### Express + TypeScript project (CLI route)

```bash
npm install -g jetic-cli

cd my-api
jetic init                 # scaffolds .jetic/ + jetic.config.json
jetic scan                 # model.json filled from your routes
jetic dev                  # open Studio, browse the model, tweak endpoints
jetic simulate workflow checkout-flow
jetic test --ci            # run every saved workflow in CI
```

### Any stack (MCP route, in your AI editor)

1. Connect the editor to `jetic mcp` (section 11).
2. Ask: "Model my API with Jetic." The AI will `jetic_get_session_phase` → `jetic_init` →
   read source → `jetic_add_endpoint` ×N → `jetic_verify_model` → fill descriptions/tags
   until Phase 4.
3. Ask: "Build a workflow that registers a user, logs in, creates an order, and fetches it."
   The AI scaffolds (`jetic_scaffold_workflow`), validates, saves, and runs the journey, then
   reports pass/fail with a `runId` you can inspect (`jetic_get_run`).
4. Iterate: `jetic dev` watches your code; edits appear in `.jetic/changes.json`; the AI
   updates the model incrementally (`jetic_get_changes` → update → `jetic_clear_changes`).

### CI

```bash
jetic test --ci            # JSON summary, exit 1 on any workflow failure
jetic agent run workflow-impact   # which workflows are affected by current edits
```

---

## 15. FAQ

**Does Jetic send my code anywhere?**
No. Scanning is a local AST pass; simulation is local HTTP to your own `baseUrl`. No AI key,
no cloud call.

**Which auth schemes are supported in the model?**
`http` (bearer/basic), `apiKey` (header), `signature` (with `algorithm`, `signedPayload`,
`secretVariable`), `oauth2`, and `none`. `obtainedFrom` links a scheme to the endpoint that
produces its credential, which is what scaffold uses to auto-wire token chains.

**My endpoint is not Express — can Jetic still scan it?**
Not automatically in the current release (KG-23: scan path is Express-only). Use MCP manual
modeling (`jetic_add_endpoint`) — the workflow is documented in section 5. The
Fastify/Hono/NestJS/Next.js adapters exist and are inspectable with `jetic adapter inspect`;
they are not yet wired into `jetic scan`.

**Why did my run abort before step 1?**
The MCP simulation default `preflight: "abort"` probes the server first. If the app is not
running, the response contains `preflight.verdict: "unreachable"` and `abortReason` with the
real network error. Start your server, or pass `preflight: "off"` / `"warn"`.

**Why does a step fail with "unresolved template" before any request?**
Strict templates (default). The step references `{{scope:key}}` or `:param` with no value.
Capture it earlier, seed it (`jetic memory set`), set `strictTemplates: false`, or provide a
literal.

**How do I pass a raw token into `Authorization` without writing `Bearer`?**
Just inject `{ "header:Authorization": "{{workflow:accessToken}}" }` — the runtime
auto-prefixes `Bearer ` for raw values. Values that already look like a scheme
(`Basic ...`, `Token ...`) pass through untouched.

**Where do run results live?**
`.jetic/runs/<runId>/` (`simulation-report.json` + `simulation-status.json` for simulations,
`agent-report.json` for agents). Query them over MCP with `jetic_get_run` / `jetic_list_runs`.

**Can workflows call non-HTTP things (gRPC, DB actions)?**
Workflow steps are HTTP requests against the target API. Non-HTTP automation belongs in
project tools (`jetic.tools.ts`) or agents (see `tutorials/agents.md`).

**What are the "known gaps"?**
The smoke suite marks known gaps as `KG-nn` tests. Current notable ones include KG-23
(adapters not wired into the scan path). Gaps are converted to normal tests as they are
fixed.
