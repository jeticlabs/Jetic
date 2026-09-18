# MCP Tools Reference (18 Tools) 🤖

`packages/mcp-server/src/tools/*` — every tool's zod schema, annotation, and when the agent should call it (per `server.ts` structured instructions).

---

## Setup & Change Tracking (4)

| Tool | Kind | Params |
|---|---|---|
| `jetic_init` | writes model | `projectPath?, projectName?, language?, framework?, environmentName?, baseUrl?, overwrite?` — step 1, never clobbers |
| `jetic_scan` | writes model | `projectPath?, mode: merge|overwrite` — Express+TS static scan, keyless, mode controls merge |
| `jetic_get_changes` | read-only | `projectPath?` — reads `.jetic/changes.json` |
| `jetic_clear_changes` | destructive | `projectPath?` — clears change log |

## Read & Verification (5)

| Tool | Kind |
|---|---|
| `jetic_read_model` | read-only — `summaryOnly?` |
| `jetic_list_endpoints` | read-only — filters `method/tag/resource/pathContains` |
| `jetic_get_endpoint` | read-only — by `id` or `method+path` |
| `jetic_verify_model` | read-only — `isValid` + `issues[]` |
| `jetic_list_workflows` | read-only — from `workflows/*.json` + legacy + model |

## Endpoint Authoring (4)

Full fidelity: `middleware` in order, `parameters` with `min/max`, `requestBody` with `constraints`, `responses` with `condition/ownershipCheck`, `pagination`, `rateLimit`, `ownership`, `produces/consumes`.

| Tool |
|---|
| `jetic_add_endpoint` |
| `jetic_update_endpoint` |
| `jetic_delete_endpoint` |
| `jetic_manage_environment` (`list|add|update|delete`) |

## Workflow Authoring & Simulation (5)

| Tool |
|---|
| `jetic_validate_workflow` — `humanKeys[]`, no save, dialect check |
| `jetic_create_workflow` — returns `needsHuman[] + humanNote`, respects `validateOnly`/`overwrite` |
| `jetic_update_workflow` |
| `jetic_delete_workflow` |
| `jetic_test_endpoint` / `jetic_simulate_workflow` (+ alias `jetic_simulate`) — live HTTP |

---

## 🔄 Structured Order (from `server.ts` instructions)

1. `jetic_init` if `modelExists:false`
2. `jetic_scan` (Express) or `jetic_add_endpoint` per endpoint → `jetic_verify_model` until `isValid`
3. `jetic_validate_workflow` → `jetic_create_workflow` → `jetic_simulate_workflow` (only on user request)

`SerializedTransport` guarantees one-at-a-time mutation — agents may fire parallel tool calls safely.

![MCP tool catalog — 18 tools grouped by category table](/screenshots/jetic_dot.png)
*Click image to enlarge — Catalog table screenshot.*
