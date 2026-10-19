# Jetic Tools — Custom Tools, the SDK, MCP, and Workflow Integration

This document answers, with reference to the actual code:

- Can MCP call agents? **(Yes — `jetic_run_agent` / `jetic_list_agents`.)**
- Does Jetic let me create **custom tools**? **(Yes — `jetic.tools.ts` via the `@jetic/sdk`.)**
- Can custom tools be **injected into workflows**? **(No — workflow steps are HTTP requests only.)**
- Can tools **update files**? **(Yes if you invoke them — they are arbitrary Node code with the project root; details below.)**
- Can **MCP** call custom tools? **(Not today — MCP exposes only the 26 built-in tools; this is stated plainly in section 5.)**

---

## Table of Contents

1. [Three different things called "tools"](#1-three-different-things-called-tools)
2. [Custom project tools — what they are](#2-custom-project-tools--what-they-are)
3. [The SDK contract](#3-the-sdk-contract)
4. [Creating a custom tool — complete example](#4-creating-a-custom-tool--complete-example)
5. [Listing and invoking tools](#5-listing-and-invoking-tools)
6. [Can MCP call custom tools or agents?](#6-can-mcp-call-custom-tools-or-agents)
7. [Can tools be injected into workflows?](#7-can-tools-be-injected-into-workflows)
8. [Can tools update files?](#8-can-tools-update-files)
9. [Tools vs Agents — which should I build?](#9-tools-vs-agents--which-should-i-build)
10. [Reference summary and FAQ](#10-reference-summary-and-faq)

---

## 1. Three different things called "tools"

The word "tool" is overloaded. In Jetic it means three distinct things:

| Term | What it is | How you use it | Status today |
|---|---|---|---|
| **MCP tools** | The 26 built-in tools the Jetic MCP server exposes (`jetic_scan`, `jetic_simulate_workflow`, `jetic_run_agent`, ...) | Your AI editor calls them over the MCP protocol | Fully implemented |
| **Jetic agents** | Deterministic tasks registered in the agent registry (`model-watcher`, `workflow-impact`) | `jetic agent run <id>` (CLI) or `jetic_run_agent` (MCP) | Fully implemented, MCP-callable |
| **Project tools** | Your own tools declared in `jetic.tools.ts` with `defineTool()` from `@jetic/sdk` | Listed with `jetic tool list`; *execution is not wired into Jetic yet* | Contract + listing implemented; no runner |

So when this document says "custom tools", it means the third row: **project tools**.

---

## 2. Custom project tools — what they are

A project tool is a typed, named function declared in your project and exported from a
"tools entry" file:

- Default entry: `./jetic.tools.ts` at the project root.
- Configurable in `jetic.config.json`:

```json
{
  "project": { "name": "my-api" },
  "tools": { "entry": "./jetic.tools.ts" }
}
```

- The entry must export `{ tools: JeticTool[] }` (or default-export `{ tools }`).
- Each tool has `name`, `description`, a **zod** `input` schema, an optional zod `output`
  schema, and an `execute(input, ctx)` function.

The design intent (from the original project spec, project.md §23) is that project tools are
the extension point where you put non-HTTP automation — seeding databases, creating fixture
files, minting tokens, cleanup — so that journeys and AI sessions have deterministic setup
and teardown primitives.

**Current state, precisely:**

- `@jetic/sdk` ships the full contract (`JeticTool`, `defineTool`, `ToolsModule`).
- The CLI has `jetic tool list` which loads the entry and lists the declared tools.
- There is **no** `jetic tool run <name>` subcommand, and the MCP server exposes **no** tool
  for listing or executing project tools (its catalog is exactly the 26 built-in tools).
- `jetic init` scaffolds the config with `tools.entry` and the smoke suite covers listing
  (SMK-114: missing entry, listing from a `.js` entry, exit code 2 on a bad export).

In other words: you can **declare and document** custom tools today; Jetic will not
**execute** them yet. Section 5 shows how to invoke them yourself in the meantime.

---

## 3. The SDK contract

From `packages/sdk/src/index.ts`:

```ts
import { z } from 'zod';

export interface ToolContext {
  projectRoot: string;
}

export interface JeticTool<Input extends z.ZodTypeAny = z.ZodTypeAny, Output extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input: Input;
  output?: Output;
  execute(input: z.infer<Input>, ctx: ToolContext): Promise<unknown>;
}

export function defineTool<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny = z.ZodTypeAny>(
  tool: JeticTool<Input, Output>
): JeticTool<Input, Output> {
  return tool;
}

/** Shape expected from a project's `jetic.tools.ts` entry (project.md §23). */
export interface ToolsModule {
  tools: JeticTool[];
}
```

Notes:

- `defineTool()` is an identity helper — it exists for type inference (`z.infer<Input>` flows
  into your `execute` signature).
- `execute` receives the parsed input (zod-validated by whatever runner invokes it) and a
  `ToolContext` carrying `projectRoot` — the same project-root convention the MCP server uses.
- Return value is free-form (`Promise<unknown>`); if you declare `output`, later runners can
  validate it.

---

## 4. Creating a custom tool — complete example

Example: **`seed-test-user`** — writes a fixture file into `.jetic/fixtures/` and returns the
generated identity. Useful for deterministic workflow setup.

### 4.1 The tool module

`jetic.tools.ts` (project root):

```ts
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { defineTool } from '@jetic/sdk';

export const tools = [
  defineTool({
    name: 'seed-test-user',
    description: 'Write a deterministic test-user fixture to .jetic/fixtures/ and return it',
    input: z.object({
      email: z.string().email().optional(),
      role: z.enum(['admin', 'member']).default('member'),
    }),
    output: z.object({ email: z.string(), role: z.string(), file: z.string() }),
    async execute(input, ctx) {
      const email = input.email ?? `seed+${Date.now()}@example.com`;
      const dir = path.join(ctx.projectRoot, '.jetic', 'fixtures');
      fs.mkdirSync(dir, { recursive: true });

      const file = path.join(dir, 'test-user.json');
      const record = { email, role: input.role, createdAt: new Date().toISOString() };
      fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8');

      return { email, role: input.role, file };
    },
  }),
  defineTool({
    name: 'cleanup-fixtures',
    description: 'Remove everything under .jetic/fixtures/',
    input: z.object({}),
    async execute(_input, ctx) {
      const dir = path.join(ctx.projectRoot, '.jetic', 'fixtures');
      fs.rmSync(dir, { recursive: true, force: true });
      return { cleaned: dir };
    },
  }),
];
```

Guidelines that make a project tool good:

- **Typed input via zod.** Required fields are explicit; defaults encode sane behavior.
- **Idempotent where possible.** `seed-test-user` overwrites a single fixture file rather
  than accumulating.
- **Scoped writes.** Touch your own namespace (`.jetic/fixtures/`, a test DB) — do not write
  `model.json` or workflows; those belong to Jetic's own tools.
- **Return structured results.** The return value is the tool's visible output; make it
  JSON-serializable and informative.

### 4.2 Installing the SDK types

Add `@jetic/sdk` and `zod` as dev dependencies in your project (the SDK is part of the Jetic
monorepo; in a published setup install from npm under the same version as your CLI):

```bash
npm install --save-dev @jetic/sdk zod
```

---

## 5. Listing and invoking tools

### 5.1 Listing (built in)

```bash
jetic tool list
```

- Reads `tools.entry` from `jetic.config.json` (default `./jetic.tools.ts`).
- Missing entry → a friendly message telling you to create it.
- Bad export (no `tools` array) → error and exit code `2`.
- **Loader caveat:** the CLI `require()`s the entry directly, so a plain `.js`/`.cjs` entry
  loads as-is. A `.ts` entry needs a loader (`tsx`/`ts-node`) in the environment — otherwise
  you get:

  ```
  Could not load ./jetic.tools.ts directly (TypeScript entries require a loader like
  tsx/ts-node in this project): …
  ```

  For today's listing path, the most friction-free setup is a compiled `.js` entry (or run
  the CLI under `tsx`).

### 5.2 Invoking (do it yourself, for now)

Since Jetic has no tool runner yet, invoke the tool from your own script/harness. The pattern
is: load the module, find the tool by name, parse the input with its own zod schema, call
`execute`.

`scripts/seed.mjs` (plain Node, `.mjs`/`.cjs` entry works with the built-in CLI too):

```js
import { pathToFileURL } from 'url';
import path from 'path';

const projectRoot = process.cwd();
const mod = await import(pathToFileURL(path.join(projectRoot, 'jetic.tools.js')));
const tools = mod.tools ?? mod.default?.tools;

const tool = tools.find((t) => t.name === 'seed-test-user');
if (!tool) throw new Error('tool not found');

const input = tool.input.parse({ role: 'admin' });   // zod validation
const result = await tool.execute(input, { projectRoot });
console.log(JSON.stringify(result, null, 2));
```

Use it in CI before/after workflow runs:

```bash
node scripts/seed.mjs
jetic test --ci
node scripts/cleanup.mjs
```

(This is exactly the "tools as deterministic setup/teardown" role the contract was designed
for.)

---

## 6. Can MCP call custom tools or agents?

**Agents: yes.** The MCP server exposes:

- `jetic_list_agents` → the registered deterministic agents,
- `jetic_run_agent { "agent": "<id>" }` → runs one synchronously and writes
  `.jetic/runs/<runId>/agent-report.json`.

So anything you package as an **agent** (see `tutorials/agents.md`) is directly callable by
your AI editor over MCP.

**Custom project tools: not yet.** The MCP tool catalog is exactly the 26 built-in tools
(`tests/smoke` asserts the exact list). There is no `jetic_list_tools` / `jetic_run_tool`.
Project tools are a CLI-side contract today.

**Practical consequence — if you want MCP-triggered automation, build an agent, not a tool.**
Agents and tools can share the same logic:

- A tool is better when **your scripts/CI** drive it (typed input, parses nicely, typed
  output).
- An agent is better when **the AI editor** should trigger it over MCP (registry-based, no
  arguments, findings output).

You can even implement the core logic once (a plain function) and wrap it in both a tool
(`defineTool`) and an agent (`defineAgent`) if you need both entry points.

---

## 7. Can tools be injected into workflows?

**No.** Workflow steps are HTTP requests only:

- A step is `{ name, method, path, body, query, inject, capture, ... }` and the simulator
  sends `environment.baseUrl + path` over HTTP. There is no `tool:` step type, no
  `agent:` step type, and the workflow validator rejects unknown step keys
  (`UNKNOWN_STEP_KEY`).

Why not: workflows are *stateful HTTP journeys* — the memory chain of requests/responses is
the product. Tools are host-side automation with different failure semantics (what does a
workflow `retry` mean for a file write?). Keeping them separate keeps both predictable.

### What to do instead

1. **Setup/teardown around the journey** (the intended pattern): run your tool scripts
   before `jetic test` / `jetic_simulate_workflow` and after. Tools prepare deterministic
   state; workflows exercise the API; nothing is mixed.
2. **Model the effect through the API when possible.** If "seeding" is really "call
   POST /api/admin/seed", make it a workflow **step** (with `inject` of an admin token) —
   then it is part of the journey, retried and reported like everything else.
3. **Agents for audits between runs.** `jetic_run_agent` before/after workflows to explain
   what changed or what is affected.
4. **Workflow conditions for runtime branching.** Anything the journey must decide at
   runtime (roles, flags, values captured from earlier responses) is expressible with rules
   conditions and `onFail: "switch"` — no external tool/code hook needed.

---

## 8. Can tools update files?

**Yes — technically.** A tool's `execute()` is arbitrary Node code running with your OS
permissions, and `ctx.projectRoot` tells it exactly where the project is. The `seed-test-user`
example above writes `.jetic/fixtures/test-user.json`; `cleanup-fixtures` deletes the
directory.

Precision on "can":

- **When invoked, yes.** Any file under (or outside) the project can be read/written by your
  tool code. There is no sandbox.
- **But Jetic does not invoke tools today** (no runner, no MCP exposure), so in practice the
  invoker is *your* script/harness/CI step. You therefore control when writes happen.
- **Runtime-write path that *is* fully wired today:** workflow `capture`/`captureInput`
  → `.jetic/memory.json`, and simulations → `.jetic/runs/<runId>/…`. Those are the only
  writes Jetic performs on your behalf.

Recommended discipline for tools that write:

| Do | Don't |
|---|---|
| Write inside a dedicated namespace (`.jetic/fixtures/`, temp dirs, a test DB) | Rewrite `model.json`, `.jetic/workflows/*` (those belong to Jetic tools) |
| Make operations idempotent and repeatable | Accumulate unbounded state |
| Return what you wrote (path, values) | Swallow errors silently |
| Fail loudly with actionable messages | Assume hidden environment state |

This mirrors the agent guidelines (see `tutorials/agents.md` §5) — small, deterministic,
scoped, idempotent.

---

## 9. Tools vs Agents — which should I build?

| Question | Project tool | Agent |
|---|---|---|
| Who triggers it today? | Your scripts / CI (manual invocation) | AI editor via MCP (`jetic_run_agent`), CLI (`jetic agent run`) |
| Input | Typed zod schema + `ToolContext` | None (reads artifacts; `AgentContext.config`) |
| Output | Structured return value, optional zod `output` | `{ summary, findings[] }` |
| Side effects | Allowed (scoped writes OK) | Read-mostly (small caches only) |
| Workflow step? | No | No |
| MCP-callable? | Not yet | Yes |
| Typical job | Seed/cleanup/fixture/mint | Diff/audit/impact analysis |

Rule of thumb:

- **"Prepare or clean my environment" → tool.**
- **"Tell me something about my project" → agent.**
- **"Exercise my API" → workflow.**

And the composition that covers almost everything today:

```bash
node scripts/seed.mjs                 # tool: deterministic setup
jetic agent run workflow-impact       # agent: what is affected?
jetic test --ci                       # workflow: exercise the API
node scripts/cleanup.mjs              # tool: teardown
```

---

## 10. Reference summary and FAQ

| Item | Value |
|---|---|
| SDK package | `@jetic/sdk` — `defineTool`, `JeticTool`, `ToolContext { projectRoot }`, `ToolsModule` |
| Entry file | `jetic.config.json` → `tools.entry` (default `./jetic.tools.ts`) |
| Export shape | `{ tools: JeticTool[] }` (or default-export `{ tools }`) |
| CLI support | `jetic tool list` (lists; `.js`/`.cjs` load directly, `.ts` needs tsx/ts-node) |
| CLI runner | None yet (`jetic tool run` does not exist) |
| MCP support | None yet (catalog is exactly the 26 built-in tools; agents ARE MCP-callable) |
| Workflow steps | HTTP requests only — tools cannot be steps |
| File writes | Possible when you invoke the tool; Jetic itself does not invoke tools today |
| Smoke coverage | SMK-114 (`jetic tool list`: missing entry, listing, bad-export exit 2) |

**FAQ**

**Does the MCP server let my AI editor run custom tools?**
No, not in this release. MCP exposes the 26 built-in tools; agents are callable via
`jetic_run_agent`. If you need MCP-triggered automation, implement it as an agent
(`tutorials/agents.md`).

**Can I make a workflow call `seed-test-user` as its first step?**
No. Steps are HTTP requests. Call your seeding (script/tool) before the simulation, or model
the seeding as a real API endpoint call (e.g. `POST /api/admin/seed`) if your backend has
one — then it can be a step with proper retry/reporting.

**Why does `jetic tool list` fail on my `.ts` entry?**
The CLI loads the entry with `require()`; TypeScript needs a loader. Either compile the entry
to `.js` (and point `tools.entry` at it), run the CLI under `tsx`, or keep the entry `.ts`
for the future runner and maintain a compiled `.js` copy for listing today.

**Do tools run inside the MCP server process or the CLI process?**
Neither, today — there is no execution path. When you invoke a tool yourself, it runs in
*your* process with *your* permissions; treat the code accordingly (it is as powerful as any
script you ship in your repo).

**Is `jetic.tools.ts` the same as the MCP "tools" JSON my editor config has?**
No. The editor config lists the MCP **server** (`jetic mcp`); `jetic.tools.ts` is a
Jetic-side extension file for your own automation and is unrelated to the MCP protocol
handshake.
