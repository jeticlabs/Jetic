# @jetic/mcp-server

> Model Context Protocol (MCP) server for Jetic Behavioral Models (`.jetic/model.json`).

`@jetic/mcp-server` is a **stdio-based MCP server** for AI code editors and agents —
**opencode**, **Antigravity**, **Cursor**, **Claude Code**, **Claude Desktop**,
**Windsurf**, and **VS Code (Copilot)**. It gives the AI 16 typed tools to inspect,
author, validate, and live-test the API endpoints and multi-step workflows stored
in `.jetic/model.json` / `.jetic/workflows/` directly from the editor — no AI API
keys, no external scanners.

---

## Requirements

- **Node.js ≥ 20**
- A Jetic project with `.jetic/model.json` (create one with `jetic init` + `jetic scan`)
- The workspace built once: `pnpm install && pnpm --filter @jetic/mcp-server run build`
  (or `pnpm build` at the repo root)

---

## Quick start

### Option A — via the Jetic CLI (recommended for local dev)

```bash
jetic mcp
# pin to a project explicitly (useful when the editor spawns the server elsewhere):
jetic mcp --project C:\path\to\my-api
# equivalent via env var:
JETIC_PROJECT_PATH=C:\path\to\my-api jetic mcp
```

### Option B — standalone binary

```bash
jetic-mcp --help       # usage (prints to stderr, never pollutes MCP stdout)
jetic-mcp --version
JETIC_PROJECT_PATH=C:\path\to\my-api jetic-mcp
```

### Verify it speaks MCP (30-second smoke test)

Paste this into PowerShell / bash — you should get an `initialize` result,
a 12-tool `tools/list` result, and a model summary back:

```bash
node packages/mcp-server/dist/index.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"jetic_read_model","arguments":{"summaryOnly":true}}}
EOF
```

Or use the official inspector: `npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js`.

---

## How project resolution works

Every tool accepts an optional `projectPath`. Resolution order:

1. `projectPath` argument (per call — highest priority)
2. `JETIC_PROJECT_PATH` environment variable (recommended for editor configs)
3. The server process working directory (walks **up** the tree to find `.jetic/model.json`)

If no `model.json` exists, read tools return `modelExists: false` plus a hint
instead of silently pretending an empty model is real — run `jetic init` /
`jetic scan` first in that case.

---

## Editor setup

All entries below are **local stdio** servers. After adding the config, restart the editor (or refresh its MCP panel) and look for the `jetic_*` tools (16 total: 6 read-only, 5 writers, 2 destructive, 3 live-HTTP).

> Windows note: prefer `"command": "node"` with **absolute forward-slash paths**
> in `args` (e.g. `C:/Users/you/Jetic/packages/mcp-server/dist/index.js`).
> Plain `jetic` / `npx` also work if the binary is on `PATH`, but absolute paths
> survive editor restarts and workspace switches.

### 1. opencode (Recommended config)

Add to your `opencode.json` (project root or `~/.config/opencode/opencode.json`).
`command` is an **array**, env goes under **`environment`**:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "jetic": {
      "type": "local",
      "command": ["node", "C:/Users/you/Jetic/packages/mcp-server/dist/index.js"],
      "environment": {
        "JETIC_PROJECT_PATH": "C:/path/to/my-api"
      },
      "enabled": true
    }
  }
}
```

Variants:

```jsonc
// ...via the Jetic CLI binary (must be on PATH):
"command": ["jetic", "mcp", "--project", "C:/path/to/my-api"],

// ...monorepo dev (no install needed):
"command": ["pnpm", "--dir", "C:/Users/you/Jetic", "--filter", "jetic-cli", "exec", "jetic", "mcp"],
```

Verify & use:

```bash
opencode mcp list        # or: opencode mcp auth list
```

Then prompt, e.g.: `use the jetic tools to summarize my API and verify the model`.
To limit context, disable globally and enable per-agent
([docs](https://opencode.ai/docs/mcp-servers/)):

```json
{
  "mcp": { "jetic": { "type": "local", "command": ["jetic", "mcp"], "enabled": true } },
  "tools": { "jetic_*": false },
  "agent": { "build": { "tools": { "jetic_*": true } } }
}
```

### 2. Google Antigravity (IDE / CLI)

Antigravity uses `mcpServers` (note the plural) with `command` + `args` + `env`:

- **Global:** `~/.gemini/antigravity/mcp_config.json`
  (Windows: `%USERPROFILE%\.gemini\antigravity\mcp_config.json`)
- **Workspace:** `<project>/.agents/mcp_config.json`
- **Absolute paths are required** — no `${workspaceFolder}` variables.

```json
{
  "mcpServers": {
    "jetic": {
      "command": "node",
      "args": ["C:/Users/you/Jetic/packages/mcp-server/dist/index.js"],
      "env": {
        "JETIC_PROJECT_PATH": "C:/path/to/my-api"
      }
    }
  }
}
```

Steps: agent panel `…` → **MCP Servers** → **Manage MCP Servers** →
**View raw config** → paste → save → **Refresh**. The 16 `jetic_*` tools then
appear for every project (global config).

Tip: add an `AGENTS.md` in the project root so the agent reaches for Jetic first:

```md
When working with this API, use the `jetic_*` MCP tools:
read the model first (`jetic_read_model`), verify after edits (`jetic_verify_model`).
```

### 3. Cursor

`.cursor/mcp.json` in the workspace root (or global `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "jetic": {
      "command": "node",
      "args": ["C:/Users/you/Jetic/packages/mcp-server/dist/index.js"],
      "env": {
        "JETIC_PROJECT_PATH": "${workspaceFolder}"
      }
    }
  }
}
```

Open Cursor Settings → MCP → enable **jetic**. Destructive tools
(`jetic_delete_endpoint`) are annotated `destructiveHint: true`, so Cursor can
gate them behind approval.

### 4. Claude Code CLI

```bash
claude mcp add jetic --env JETIC_PROJECT_PATH=C:/path/to/my-api -- node C:/Users/you/Jetic/packages/mcp-server/dist/index.js
# or via the CLI wrapper:
claude mcp add jetic -- jetic mcp --project C:/path/to/my-api
claude mcp list   # verify
```

### 5. Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "jetic": {
      "command": "node",
      "args": ["C:/Users/you/Jetic/packages/mcp-server/dist/index.js"],
      "env": { "JETIC_PROJECT_PATH": "C:/path/to/my-api" }
    }
  }
}
```

### 6. Windsurf / VS Code (Copilot MCP)

Windsurf (`~/.codeium/windsurf/mcp_config.json`) and VS Code
(`.vscode/mcp.json` with `"type": "stdio"`) share the same shape:

```json
{
  "mcpServers": {
    "jetic": {
      "command": "node",
      "args": ["C:/Users/you/Jetic/packages/mcp-server/dist/index.js"],
      "env": { "JETIC_PROJECT_PATH": "C:/path/to/my-api" }
    }
  }
}
```

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Editor shows no `jetic_*` tools | Wrong `command`/path; check the editor's MCP log panel. Use absolute `node` + absolute `dist/index.js`. Rebuild: `pnpm --filter @jetic/mcp-server run build`. |
| Tools run against the wrong project | The server's cwd ≠ your project. Set `JETIC_PROJECT_PATH` (or `projectPath` per call, or `jetic mcp --project …`). |
| `modelExists: false` in responses | No `.jetic/model.json` found upward from the resolved path. Run `jetic init` + `jetic scan` in the project root. |
| `Invalid JSON in model file …` | Hand-edit broke the file; the error names the file. Restore from git or regenerate with `jetic scan`. |
| `jetic_test_endpoint` / `jetic_simulate*` fail with `fetch failed` | Target server isn't running. Start it, or pass `baseUrl` / `envName` pointing at a live environment (`jetic_manage_environment` → `list` to see options). Default timeout is 15 s (`timeoutMs`, max 120 s). |
| `... sirv ... EPIPE` / exit on editor close | Normal: the editor closed the stdio pipe. Restart via the editor's MCP refresh. |
| `jetic-mcp --help` hangs | You're on a stale build — rebuild; current builds exit immediately for `--help`/`--version`. |
| Slow completions / context bloat (opencode) | Jetic adds 16 tools. Scope them per-agent (`jetic_*`) as shown above. |

Still stuck? Capture stderr: editors log it to their MCP panel — the server
prints its version and resolved project there on startup, and **never** writes
anything but protocol JSON to stdout.

---

## Provided MCP tools (16)

The server advertises machine-readable `annotations` (`readOnlyHint`,
`destructiveHint`, `openWorldHint`) and startup `instructions`, so modern
editors can badge tools and suggest the read → edit → verify flow automatically.
Tool calls execute strictly one-at-a-time in arrival order, so agents may fire
parallel calls safely.

| # | Tool | Kind | Purpose |
|---|---|---|---|
| 1 | `jetic_read_model` | read-only | Full `.jetic/model.json` or metadata summary (`summaryOnly`). Returns `modelExists` + hint when no file exists. Params: `projectPath?`, `summaryOnly?`. |
| 2 | `jetic_list_endpoints` | read-only | List endpoints with `method` / `tag` / `resource` / `pathContains` filters. |
| 3 | `jetic_get_endpoint` | read-only | Full details of one endpoint by `id` or `method` + `path`. |
| 4 | `jetic_add_endpoint` | writes model | Add (or upsert with `overwriteIfExists`, default `true`) an endpoint with **full fidelity**: `method*`, `path*`, `name`, `summary`, `description`, `tags`, `deprecated`, `timeout`, `handlerName`, `resource`, `source`, `security`, **`middleware` (chain in execution order)**, `parameters` (incl. `min`/`max`), `requestBody` (incl. business-rule `constraints`), `responses` (incl. `schema`/`example`/`condition`), **`pagination`**, **`rateLimit`**, **`ownership`**, **`produces`/`consumes` memory wiring**. Warns on undeclared security schemes; never silently drops a previous middleware chain or rate limit on upsert. |
| 5 | `jetic_update_endpoint` | writes model | Partial update by `id` or `method` + `path` via `updates` — same field coverage as add (`middleware` replaces the whole chain; `rateLimit: null` removes it). |
| 6 | `jetic_delete_endpoint` | **destructive** | Remove by `id` or `method` + `path`. Confirm with the user first. |
| 7 | `jetic_verify_model` | read-only | Validate: duplicate routes, unbound path params, bad status codes, missing responses, dangling `source` links, unknown security schemes. Returns `isValid` + `issues[]`. **Run after every edit.** |
| 8 | `jetic_test_endpoint` | live HTTP | Real request against `envName`/`baseUrl`. `customHeaders` / `customBody` / `customQuery` are **actually sent** (merged over generated data); `timeoutMs` (default 15000). Returns status, timing, payload + schema validation. |
| 9 | `jetic_manage_environment` | writes model | `list` / `add` / `update` / `delete` deployment environments (`name`, `baseUrl`). |
| 10 | `jetic_list_workflows` | read-only | Workflows from `.jetic/workflows/*.json`, `.jetic/workflow.json`, or embedded `model.json` workflows. |
| 11 | `jetic_simulate_workflow` | live HTTP | End-to-end multi-step simulation with memory capture + validation. Params: `workflow?`, `envName?`, `baseUrl?`, `clearMemory?`. |
| 12 | `jetic_simulate` | live HTTP | Alias of `jetic_simulate_workflow` (kept for older prompts). |
| 13 | `jetic_validate_workflow` | read-only | **Dry-run validation without saving or running.** Checks structure, endpoint cross-references against `model.json` (with did-you-mean suggestions), and full memory data-flow: every `{{scope:key}}` must be captured by an earlier step. Accepts a saved reference **or an inline definition for pre-save checks**. Flags dialect mix-ups (`call`/`auth`/`bind` belong to embedded model workflows, not files) and warns about ignored keys like `condition`. |
| 14 | `jetic_create_workflow` | writes workflows | Saves `.jetic/workflows/<slug>.json` from ordered steps. **Refuses to save when validation errors exist** (each error names the step and the fix); `validateOnly` dry-runs; `overwrite: false` by default blocks accidental clobbering; `fromModelWorkflow` migrates an embedded `model.json` workflow to a file. |
| 15 | `jetic_update_workflow` | writes workflows | Rename / description / environment / full `steps` replace / `appendSteps`. Validates before writing, refuses on errors. Cannot edit `model.json`-embedded workflows (migrate them first). |
| 16 | `jetic_delete_workflow` | **destructive** | Deletes a workflow file by slug/name/path. Confirm with the user first. |

### Suggested agent workflow

1. `jetic_read_model` with `{"summaryOnly": true}`
2. `jetic_list_endpoints` (+ `jetic_get_endpoint` for details)
3. Edit via `jetic_add_endpoint` / `jetic_update_endpoint` (middleware in execution order; `jetic_verify_model` afterwards)
4. `jetic_verify_model` → fix issues
5. `jetic_test_endpoint` (needs a running server) or author a journey (next section) and `jetic_simulate_workflow`

### Authoring workflows (reliable loop)

Never hand-write workflow files blind — follow validate → create → simulate:

1. **Discover**: `jetic_list_endpoints` for exact `method` + `path` values (the validator rejects unknown routes, with suggestions).
2. **Draft steps** with memory chaining:
   - *Producer*: `capture: { "workflow:accessToken": "data.accessToken" }` (response → memory) or `captureInput: { "workflow:email": "email" }` (request → memory, pre-flight).
   - *Consumer*: `inject: { "header:Authorization": "Bearer {{workflow:accessToken}}" }`, body templates `{{workflow:key}}`, faker data `{{faker.internet.email}}`, cross-scope `{{scope:key}}`.
   - Path params use `:id` + a body field or captured `workflow:id` key (`{{…}}` templates do **not** resolve in paths).
3. **Dry-run**: `jetic_validate_workflow` with the inline `definition` — fix every error (undefined memory refs, unresolved `:params`, dialect mix-ups like `call`/`auth`/`bind`).
4. **Save**: `jetic_create_workflow` (refuses to save while errors remain; `overwrite: false` default protects existing files).
5. **Execute**: `jetic_simulate_workflow` against a live server; iterate with `jetic_update_workflow` (`appendSteps` or full `steps` replace).

### God-level endpoint example

```json
{
  "method": "GET",
  "path": "/api/orders",
  "name": "List Orders",
  "handlerName": "OrderController.list",
  "security": [{ "scheme": "bearerAuth" }],
  "middleware": [
    { "name": "cors", "type": "cors" },
    { "name": "express.json", "type": "parser" },
    { "name": "auth", "type": "auth", "scheme": "bearerAuth" },
    { "name": "rateLimit", "type": "rate-limit", "config": { "windowMs": 60000, "max": 100 } },
    { "name": "validateQuery", "type": "validation" }
  ],
  "parameters": [
    { "name": "page", "in": "query", "type": "number", "min": 1, "default": 1 },
    { "name": "limit", "in": "query", "type": "number", "min": 1, "max": 100, "default": 20 }
  ],
  "responses": { "200": { "description": "ok", "schema": { "data": "array", "meta.total": "number" } } },
  "pagination": { "type": "page", "pageParam": "page", "limitParam": "limit", "totalPath": "meta.total" },
  "rateLimit": { "windowMs": 60000, "max": 100, "scope": "user" },
  "ownership": { "ownerField": "userId", "mustMatchAuthClaim": "sub" },
  "produces": [{ "variable": "lastOrderId", "responseField": "data.0.id" }],
  "consumes": [{ "variable": "accessToken", "usedAs": "header:Authorization", "producedBy": "POST /api/auth/login" }]
}
```

Pass this as `jetic_add_endpoint` arguments (plus `projectPath` if needed) — every key above is accepted.

Example prompts:

- “Use the jetic tools to summarize this API: how many endpoints, resources, environments?”
- “Use jetic to add POST /api/v1/orders with an authenticated body, then verify the model.”
- “Use jetic to test GET /api/users/:id against http://localhost:4000 with my bearer token.”

---

## Development

```bash
pnpm --filter @jetic/mcp-server run build    # tsc → dist/
pnpm --filter @jetic/mcp-server run clean    # cross-platform rimraf dist
```

Protocol rule: only the `StdioServerTransport` may write to stdout —
diagnostics go to `stderr`. The `jetic mcp` CLI command embeds the same
`runMcpServer()` used by the binary, plus a `--project <path>` shortcut for
`JETIC_PROJECT_PATH`.

Reliability note: inbound requests pass through `src/serial-transport.ts`
(`SerializedTransport`), which executes tool calls strictly one at a time in
arrival order. The MCP SDK otherwise dispatches pipelined requests
concurrently, which corrupts a stateful read-modify-write model file (e.g. a
`jetic_get_endpoint` sent right after `jetic_add_endpoint` could run first and
read stale state). Agents that fire parallel tool calls are therefore safe.

---

## License

MIT © [Jetic](https://github.com/jeticlabs/Jetic)
