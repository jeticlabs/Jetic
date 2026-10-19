# Jetic Agents — How They Work, How to Build One, and How They Relate to Workflows

This document covers everything about Jetic agents: what they are, the two built-in agents,
how to run them from the CLI and over MCP, the Agent SDK contract, a complete example of
writing your own agent, and the honest answer to "can an agent be a workflow step?".

---

## Table of Contents

1. [What an agent is](#1-what-an-agent-is)
2. [The built-in agents](#2-the-built-in-agents)
3. [Running agents](#3-running-agents)
4. [Agent reports — where results land](#4-agent-reports--where-results-land)
5. [The Agent SDK](#5-the-agent-sdk)
6. [Writing your own agent — complete example](#6-writing-your-own-agent--complete-example)
7. [Can agents be a step in a workflow?](#7-can-agents-be-a-step-in-a-workflow)
8. [Recipes and ideas](#8-recipes-and-ideas)
9. [Reference summary](#9-reference-summary)

---

## 1. What an agent is

A Jetic agent is a **deterministic, read-oriented task** that inspects the project's Jetic
artifacts (`.jetic/model.json`, `.jetic/workflows/`, `.jetic/changes.json`, memory, runs) and
produces a **summary + findings**.

Key properties (from `packages/agent-sdk`):

- **No LLM.** Agents are plain TypeScript functions. There is no AI provider involved, no
  prompts, no tokens — just code reading files and reasoning about them deterministically.
  `AgentContext` deliberately exposes only the loaded `JeticConfig` (read-only context).
- **Synchronous, single-shot.** An agent runs once and finishes; over MCP it completes within
  a single tool call (there is an internal notion of `jetic_run_agent`/`jetic_get_agent_run`
  in the original spec, but the implementation collapses both into one synchronous call).
- **Finding-producing.** The result shape is always `{ summary: string, findings: [...] }` —
  the summary is a one-liner, findings are structured JSON records so tooling (and AI) can
  act on them.
- **Out-of-band with respect to workflows.** Agents observe and audit; they do not send HTTP
  requests as part of a user journey (see [section 7](#7-can-agents-be-a-step-in-a-workflow)).

The agent contract lives in two packages:

| Package | Contains |
|---|---|
| `packages/agent-sdk` | `JeticAgent`, `AgentContext`, `AgentResult`, `defineAgent()`, `AgentRegistry` |
| `packages/agents` | The built-in implementations (`model-watcher`, `workflow-impact`) |

The registry is **closed and build-time**: the CLI and the MCP server each construct an
`AgentRegistry` and register the built-in agents explicitly. `.jetic/agents/` (created by
`jetic init`) and `jetic.config.json` → `agents.directory` are reserved scaffolding for
future dynamic loading, but no config-based agent loading is implemented yet — to add an
agent you add code and register it (see [section 6](#6-writing-your-own-agent--complete-example)).

---

## 2. The built-in agents

### 2.1 `model-watcher` — what changed in the API since last look

**File:** `packages/agents/src/model-watcher.ts`

What it does:

1. Reads `.jetic/model.json` (if missing: summary "No model found… Run 'jetic scan' first.",
   no findings).
2. Reads its own snapshot from `.jetic/cache/model-watcher-snapshot.json`
   (`{ endpointIds: string[] }`) — written by the previous run.
3. Diffs endpoint ids: computes `added` and `removed`.
4. Writes the **current** id list as the new snapshot (so the next run diffs against now).
5. Returns:
   - first run ever: `summary: "Initial snapshot recorded (N endpoints)."`, no findings
     (there is no previous state to compare against),
   - otherwise: `summary: "X endpoint(s) added, Y removed since last snapshot."` and findings
     `{ kind: 'endpoint_added', endpointId }` / `{ kind: 'endpoint_removed', endpointId }`.

Typical use: run it after `jetic scan` or after an AI editing session to get a precise
"what changed in the API model" delta without diffing anything by hand.

Note: the snapshot is only updated when the agent runs — so it reports everything that
changed *since the last time you ran model-watcher*, not since the last scan.

### 2.2 `workflow-impact` — which workflows do my edits affect

**File:** `packages/agents/src/workflow-impact.ts`

What it does:

1. Reads `.jetic/model.json` (missing → same guidance as above).
2. Reads `.jetic/changes.json` — the change log written by the `ChangeScanner` inside
   `jetic dev`. If there are no tracked changes, it says so (run `jetic dev` to start
   tracking).
3. Maps changed source files → endpoints (`endpoint.source.file` is in the changed set).
4. Maps affected endpoints → workflows: every file in `.jetic/workflows/*.json` whose steps
   contain a `METHOD path` matching an affected endpoint.
5. Returns `summary: "X endpoint(s) changed, affecting Y workflow(s)."` and findings
   `{ kind: 'workflow_affected', workflow: <name>, file: <path> }`.

Typical use: before running `jetic test`, ask "which workflows are impacted by my current
edits?" and only run those — or run all of them knowing why.

---

## 3. Running agents

### 3.1 CLI

```bash
jetic agent list
#   model-watcher     Detects endpoints added/removed since the last recorded model snapshot.
#   workflow-impact   Lists workflows affected by recently changed source files.

jetic agent run model-watcher
jetic agent run workflow-impact
```

- Unknown id → error message listing registered ids, exit code `2`.
- Successful run prints the summary and each finding, then the report path.

### 3.2 MCP (AI editors)

Two tools are exposed:

```jsonc
// List available agents
jetic_list_agents
// → { agents: [ { id: "model-watcher", description: "..." }, { id: "workflow-impact", description: "..." } ] }

// Run one agent (synchronous; returns result and writes the report)
jetic_run_agent { "agent": "workflow-impact" }
// → {
//     status: "completed",
//     runId: "2026-10-19T09-30-00-000Z",
//     agentId: "workflow-impact",
//     reportPath: ".jetic/runs/<runId>/agent-report.json",
//     summary: "2 endpoint(s) changed, affecting 1 workflow(s).",
//     findings: [ { kind: "workflow_affected", workflow: "Checkout Flow", file: "..." } ]
//   }
```

An unknown agent id throws, which the MCP error envelope turns into
`{ ok: false, error: { code: "INTERNAL", message: 'Unknown agent "x". Registered: …' } }`.

### 3.3 Where a good agent fits in a session

A typical loop between a developer, their AI editor, and Jetic:

```
edit code → jetic dev (change tracking) → AI: jetic_get_changes → update model
          → jetic_run_agent("workflow-impact")   ← what does this break?
          → jetic_simulate_workflow (only affected journeys)    ← does it still work?
          → jetic_run_agent("model-watcher")     ← record the new API shape
```

---

## 4. Agent reports — where results land

Every run (CLI and MCP) writes a report to:

```
.jetic/runs/<runId>/agent-report.json
```

with `runId` = ISO timestamp, `:`/`.` replaced by `-` (Windows-safe, sortable), and content:

```json
{
  "agentId": "workflow-impact",
  "runId": "2026-10-19T09-30-00-000Z",
  "summary": "2 endpoint(s) changed, affecting 1 workflow(s).",
  "findings": [ { "kind": "workflow_affected", "workflow": "Checkout Flow", "file": "…/.jetic/workflows/checkout-flow.json" } ]
}
```

Because agent reports share the `.jetic/runs/` directory with simulation runs,
`jetic_list_runs` shows both:

```jsonc
jetic_list_runs
// → { runsDir: "…/.jetic/runs", totalCount: 2, runs: [
//     { runId: "2026-10-19T09-30-…", type: "agent", name: "workflow-impact", status: "completed", reportPath: "…" },
//     { runId: "2026-10-19T09-29-…", type: "simulation", name: "Checkout Flow", status: "passed", durationMs: 512, reportPath: "…" }
//   ] }
```

---

## 5. The Agent SDK

From `packages/agent-sdk/src/index.ts`:

```ts
import { JeticConfig } from '@jetic/core';

/** Read-only context an agent runs with — deterministic agents only (no LLM). */
export interface AgentContext {
  config: JeticConfig;
}

export interface AgentResult {
  summary: string;
  findings: Array<Record<string, unknown>>;
}

export interface JeticAgent {
  id: string;
  description: string;
  run(ctx: AgentContext): Promise<AgentResult>;
}

export function defineAgent(agent: JeticAgent): JeticAgent { return agent; }

export class AgentRegistry {
  register(agent: JeticAgent): void;
  list(): JeticAgent[];
  get(id: string): JeticAgent | undefined;
}
```

What `ctx.config` gives you (`JeticConfig` from `@jetic/core`):

| Field | Meaning |
|---|---|
| `projectRoot` | Project root (absolute) |
| `jeticDir` | `.jetic/` directory |
| `projectConfig` | Parsed `jetic.config.json` or `null` |
| `modelDir`, `workflowsDir`, `agentsDir`, `environmentsDir` | Resolved directories |
| `scannerAdapter` | `"auto"` or a pinned adapter id |

Reading/writing artifacts: use `readJsonSync` / `writeJsonSync` / `ensureDirSync` from
`@jetic/core` (they handle missing files gracefully, `readJsonSync` returns `null`).

Design guidelines for good agents:

- **Read-mostly.** Agents may write small cache/state files (like the model-watcher
  snapshot) but should not mutate `model.json` or workflows.
- **Idempotent findings.** Same inputs → same findings. No timestamps or randomness inside
  finding records.
- **Actionable kinds.** Use a `kind` discriminator per finding (`endpoint_added`,
  `workflow_affected`, ...) so downstream tooling can filter.
- **Graceful missing state.** If `model.json`/`changes.json` is absent, return an explanatory
  summary with empty findings — never throw for a not-yet-initialized project.
- **One purpose.** A single `kind` family per agent; compose agents instead of growing one.

---

## 6. Writing your own agent — complete example

Example: **`stale-endpoints`** — flags endpoints whose `source.file` no longer exists (routes
deleted without a rescan), a real maintenance pain in AI-edited codebases.

### Step 1 — Create the agent file

`packages/agents/src/stale-endpoints.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { readJsonSync } from '@jetic/core';
import { BehavioralModel } from '@jetic/model';
import { defineAgent, AgentContext, AgentResult } from '@jetic/agent-sdk';

/** Flags endpoints in model.json whose source file no longer exists on disk. */
export const staleEndpointsAgent = defineAgent({
  id: 'stale-endpoints',
  description: 'Finds endpoints whose source file has been deleted or moved.',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const modelPath = path.join(ctx.config.jeticDir, 'model.json');

    const model = readJsonSync<BehavioralModel>(modelPath);
    if (!model) {
      return { summary: `No model found at ${modelPath}. Run "jetic scan" first.`, findings: [] };
    }

    const findings = [];
    for (const endpoint of model.endpoints) {
      const rel = endpoint.source?.file;
      if (!rel) continue;
      // The scanner stores repo-relative paths; resolve against the project root.
      const abs = path.isAbsolute(rel) ? rel : path.join(ctx.config.projectRoot, rel);
      if (!fs.existsSync(abs)) {
        findings.push({
          kind: 'stale_endpoint',
          endpointId: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          missingFile: rel,
        });
      }
    }

    return {
      summary: `${findings.length} endpoint(s) point at missing source files.`,
      findings,
    };
  },
});
```

Note the conventions used: `readJsonSync` for safe reads, relative → absolute path
resolution against `ctx.config.projectRoot`, a `kind` discriminator per finding, and a
graceful "no model" summary.

### Step 2 — Export it from the agents package

`packages/agents/src/index.ts`:

```ts
export * from './model-watcher';
export * from './workflow-impact';
export * from './stale-endpoints';   // ← added
```

### Step 3 — Register it in BOTH hosts

The registry is build-time, so a new agent must be registered wherever agents run. There are
exactly two places:

**CLI** — `apps/cli/src/commands/agent.ts`:

```ts
import { modelWatcherAgent, workflowImpactAgent, staleEndpointsAgent } from '@jetic/agents';

function buildRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(modelWatcherAgent);
  registry.register(workflowImpactAgent);
  registry.register(staleEndpointsAgent);   // ← added
  return registry;
}
```

**MCP server** — `packages/mcp-server/src/tools/agent-tools.ts`:

```ts
import { modelWatcherAgent, workflowImpactAgent, staleEndpointsAgent } from '@jetic/agents';

function buildRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(modelWatcherAgent);
  registry.register(workflowImpactAgent);
  registry.register(staleEndpointsAgent);   // ← added
  return registry;
}
```

### Step 4 — Build and run

```bash
pnpm --filter @jetic/agents build
pnpm --filter jetic-cli build          # CLI bundles the agents package

jetic agent list                        # stale-endpoints is now listed
jetic agent run stale-endpoints
# stale-endpoints: 1 endpoint(s) point at missing source files.
#   - {"kind":"stale_endpoint","endpointId":"get--api-legacy","method":"GET","path":"/api/legacy","missingFile":"src/routes/legacy.ts"}
# Report: .jetic/runs/2026-…/agent-report.json
```

Over MCP it appears automatically in `jetic_list_agents` and runs via
`jetic_run_agent { "agent": "stale-endpoints" }` once `@jetic/mcp-server` is rebuilt
(`pnpm --filter @jetic/mcp-server build`, which the CLI build also triggers when bundled).

### Optional: add a unit test

Follow the existing pattern — agents are pure functions of the filesystem, so tests just
create a temp project, drop in a `model.json`, run the agent, and assert findings. For
`packages/agents`, add a `*.test.ts` next to the source and a jest script in the package
(see `packages/simulator` for the setup to copy).

---

## 7. Can agents be a step in a workflow?

**Not today — and here is exactly what that means.**

- Workflow steps are **HTTP requests**: `{ name, method, path, body, query, inject, capture,
  condition, onFailure, retry, ... }`. The simulator's step executor sends an HTTP request to
  `environment.baseUrl + path`. There is no `agent: "..."` step type, no MCP tool to author
  one, and the workflow schema validator would reject an unknown step key
  (`UNKNOWN_STEP_KEY`).
- Agents are **out-of-band deterministic tasks** run via `jetic agent run <id>` (CLI) or
  `jetic_run_agent` (MCP). They read artifacts and report; they never participate in a
  journey's step sequence or memory capture flow.

Why it is designed that way: workflows are *stateful HTTP journeys* whose whole value is the
request/response/memory chain. Agent logic (diffing artifacts, auditing files) is a different
concern with different failure semantics; mixing them would blur both tools and complicate
replay/retry semantics (what does "retry" mean for a diff?).

### What you can do instead

**1. Compose them around workflow runs** (the common case):

```bash
jetic agent run workflow-impact      # what do my edits affect?
jetic test --ci                      # run the workflows
jetic agent run model-watcher        # record the new API shape afterwards
```

Wire this as a CI pipeline or npm script; each command has a clean exit story — agents always
complete (report findings), `jetic test --ci` exits `1` on workflow failure.

**2. Drive Jetic from your own script or agent (LLM) harness.** Since CLI and MCP expose the
same artifacts, an external orchestrator can run an agent, branch on its findings, and then
run workflows — this is the "agentic" composition pattern Jetic is designed for, with the AI
layer living in your editor or CI, not inside Jetic.

**3. Use workflow conditions for in-journey branching.** Everything a journey needs to react
to at *runtime* (roles, flags, IDs captured from responses) is expressible with rules
conditions and `onFail: "switch"` — no agent required.

**A helpful mental model:**

| | Workflows | Agents |
|---|---|---|
| Owns | HTTP journeys against the live API | Static analysis of Jetic artifacts |
| Runs | Sequentially, with memory + retries | Once, on demand (CLI/MCP/CI) |
| Output | Pass/fail per step + captured state | Summary + structured findings |
| Writes | Memory (`workflow:` scope) | Small caches (e.g. snapshots) |
| Failure | Aborts/continues the journey | Reports; never throws for missing state |

---

## 8. Recipes and ideas

Small, high-value agents that fit the SDK contract:

1. **`stale-endpoints`** — the worked example above: endpoints whose source file is gone.
2. **`auth-coverage`** — endpoints whose `middleware` chain contains no auth middleware and
   whose `security` is empty, grouped by tag. A cheap "which routes are open?" audit.
3. **`orphaned-flows`** — `produces` variables nobody consumes and `consumes` variables
   nobody produces across the model (broken token chains before they break a run).
4. **`dead-workflows`** — workflow steps whose `METHOD path` no longer exists in the model
   (renamed/deleted endpoints). Complements `workflow-impact`, which works from the change
   log instead of the model diff.
5. **`undocumented-fields`** — endpoints missing `requestBody`/`responses` schemas after
   manual modeling, sorted by traffic-criticality tags.

Implementation pattern for all of them: read `ctx.config.jeticDir` artifacts with
`readJsonSync`, compute, return `{ summary, findings }` with a single `kind` discriminator.
No I/O beyond `.jetic/` and the project tree; no mutation of model/workflows.

---

## 9. Reference summary

| Item | Value |
|---|---|
| Agent contract | `JeticAgent { id, description, run(ctx) }` — `packages/agent-sdk` |
| Helper | `defineAgent(agent)` (identity, for typing) |
| Registry | `AgentRegistry` — `register` / `list` / `get` |
| Context | `{ config: JeticConfig }` (projectRoot, jeticDir, modelDir, workflowsDir, ...) |
| Result | `{ summary: string, findings: Record<string, unknown>[] }` |
| Built-ins | `model-watcher`, `workflow-impact` (`packages/agents`) |
| CLI | `jetic agent list`, `jetic agent run <id>` |
| MCP | `jetic_list_agents`, `jetic_run_agent { agent }` |
| Reports | `.jetic/runs/<runId>/agent-report.json` (also visible via `jetic_list_runs`) |
| Registration points | `apps/cli/src/commands/agent.ts` + `packages/mcp-server/src/tools/agent-tools.ts` |
| Workflow steps | HTTP requests only — agents are not (and cannot currently be) a step type |
| LLM involvement | None — agents are deterministic code |
