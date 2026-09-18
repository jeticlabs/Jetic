# Dashboard Pages Deep Dive 🖥️

`apps/dashboard` — the local web IDE. Every page served at `jetic dev` → `http://localhost:8787`.

---

## 📊 1. Workspace Overview (`/overview`)

Metrics: endpoint totals, method distribution bar, secured route %, recent endpoints, active workflows, top memory keys. Entry point to every other page.

![Overview — metrics, charts, recent activity](/screenshots/jetic_overview.JPG)
*Click image to enlarge — Overview command center.*

---

## 🧩 2. Behavioral Model Explorer (`/model`)

Cards per endpoint: method chip, path, security badge, middleware list, request/response schema. Controls: method filter, text search, environment switcher. Button **Add Endpoint** → modal for non-Express stacks.

![Model explorer — filter, search, schema cards](/screenshots/jetic_model_list.JPG)
*Click image to enlarge — Model explorer with HTTP method filtering.*

![Add Endpoint modal](/screenshots/jetic_add_endpoint.JPG)
*Click image to enlarge — Manual endpoint creation modal.*

---

## 🔬 3. Endpoint Inspect (`/inspect?endpoint=GET /api/orders/:id`)

- **AST Source Viewer:** `source: { file, line }` → live code preview centered on handler line.
- **Related Files Navigator:** parsed imports → controllers/services/types.
- **Schema Explorer:** field table with `type`, `required`, `constraints`.
- **REST Client:** live `fetch` with generated or custom body + auth header injection.

![Endpoint inspect — AST viewer at line 42 + REST client](/screenshots/jetic_endpoint_inspect.JPG)
*Click image to enlarge — Inspect deep dive.*

---

## 💎 4. AI Workflow Simulations (`/simulations`)

Builder: natural language prompt → `POST /api/workflows/generate` → `WorkflowSimulator` preview. Runner: SSE `POST /api/workflows/run` → real-time step cards + graph. Step expansion shows resolved faker, injected `Authorization`, `expectStatus` checks.

![Simulations list](/screenshots/jetic_simulations.JPG)
*Click image to enlarge — Workflow cards.*

![Expandable step](/screenshots/jetic_smulations_expandable_new_2.JPG)
*Click image to enlarge — Expanded step with payload & capture.*

![Graph view](/screenshots/jetic_smulations_graph.JPG)
*Click image to enlarge — ReactFlow chain with condition diamonds.*

---

## 🗄️ 5. Memory Inspector (`/memory`)

Table of `.jetic/memory.json` scopes `workflow` / `global` / `human`. Inline edit, delete, clear. TTL countdown if set.

![Memory inspector — scoped key-value table](/screenshots/jetic_memory.JPG)
*Click image to enlarge — Memory Inspector.*

---

## 📈 6. Execution Traces (`/traces`)

ReactFlow node-graph: `StepNode` + `ConditionNode` diamond, edges labeled with `captured` keys. Timeline bar with ms. Click node → drawer: headers, request/response JSON, condition evaluation.

![Traces overview](/screenshots/jetic_traces.JPG)
*Click image to enlarge — Trace graph.*

![Success trace](/screenshots/jetic_success_traces.JPG)
*Click image to enlarge — Successful trace with all nodes passed.*

![Error trace](/screenshots/jetic_error_traces.JPG)
*Click image to enlarge — Failed trace with error drawer.*

---

## 🔄 7. File Changes (`/changes`)

Live `EventSource` to `GET /api/changes/stream` — no Git. Status: connected/disconnected, `watchedSince`, pending count, project root. Filters: Source/Code, Config, DB, search. Actions: Clear Changes, Rescan & Sync.

![File changes — live watcher list](/screenshots/start.PNG)
*Click image to enlarge — Changes page with live stream.*
