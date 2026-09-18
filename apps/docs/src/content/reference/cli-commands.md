# CLI Commands Reference — Per Command Deep Dive 📟

Every `jetic` command as implemented in `apps/cli/src/commands/*.ts`.

---

## `jetic init` (`init.ts`)

Creates `.jetic/` with `config.json` (user AI prefs) + empty `model.json` skeleton + `workflows/` + `traces/`. Safe to re-run.

```bash
jetic init
```

---

## `jetic scan` (`scan.ts`)

`new ExpressScanner(loadConfig()).scan()` → `writeJsonSync(model.json)`. Requires `tsconfig.json`. No AI key needed for static discovery; with `config.ai` adds AI enrichment.

```bash
jetic scan
```

---

## `jetic inspect` (`inspect.ts`)

Pretty-prints `model.json` summary: `X endpoints, Y resources, Z securitySchemes`, or `jetic inspect endpoint GET /api/users/:id` for single endpoint table.

---

## `jetic simulate` (`simulate.ts`) vs `jetic simulate workflow` (`simulate-workflow.ts`)

- `simulate` — single endpoint or `--all` with `DataGenerator` vs `simulate workflow` — full `WorkflowSimulator` with SSE progress.
- `simulate workflow --goal "..."` → `generateWorkflow()` via `ai` → saves `.jetic/workflows/<slug>.json`.
- `simulate workflow --workflow <file> --env local --clear-memory` → executes with `WorkflowSimulator`, streams via spinner, saves trace.

---

## `jetic dev` (`dev.ts:8`)

Express server on `--port 8787`, serves `apps/cli/dist/dashboard` + APIs: `GET /api/model`, `PUT /api/model/endpoint/:id`, `POST /api/model/endpoint`, `POST /api/workflows/generate`, `POST /api/workflows/run` (SSE), `GET /api/changes/stream` (SSE), `GET/POST/DELETE /api/memory`, `/api/traces`, auto-opens browser.

---

## `jetic memory` (`memory.ts`)

```bash
jetic memory list
jetic memory get workflow:accessToken
jetic memory set human:otp 424242
jetic memory clear
```

---

## `jetic mcp` (`mcp.ts`)

`new SerializedTransport(new StdioServerTransport())` + `McpServer` with 18 tools. `--project C:/path` overrides `JETIC_PROJECT_PATH`.

```bash
jetic mcp
jetic mcp --project C:/path/to/backend
```

---

## `jetic config` (`config.ts`) & `jetic upgrade` (`upgrade.ts`)

`jetic config ai --provider openrouter --model anthropic/claude-3.5-sonnet --key-env OPENROUTER_API_KEY` writes `.jetic/config.json`. `jetic upgrade` checks `jetic-cli` latest via `npm view`.

---

## 📸 CLI Screenshots

![CLI first view — jetic --help output](/screenshots/jetic_cli_first_view.mp4)
*Click image to enlarge — Video placeholder; replace with terminal recording.*

![CLI workflow run — spinner, step results, memory captures](/screenshots/start.PNG)
*Click image to enlarge — CLI execution output.*
