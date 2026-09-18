# Data Flow: Code → Model → Workflow → Trace 🔄

The single pipeline that connects every Jetic package.

---

## 🔁 End-to-End Sequence

```
Backend Source Code (TS/Express)
        │
        ▼ ts-morph Project
packages/scanner — ExpressScanner.scan()
   ├─ discoverRoutes(project)  → Method + Path + source:line
   ├─ resolveRouteContext(file) → contextFiles Map (controllers, services, types)
   └─ (optional) AiAnalyzer.analyzeEndpoint() → parameters, requestBody, responses, middleware
        │
        ▼ normalizeDiscoveries()
   .jetic/model.json  (packages/model — BehavioralModel)
        │   version, project, environments, securitySchemes, endpoints[]
        │
        ├──→ jetic inspect  (apps/cli — pretty table)
        ├──→ Jetic Studio /model  (apps/dashboard — cards + AST viewer)
        │
        ├──→ AI Workflow Generation
        │       generateWorkflow(model, goal)  →  .jetic/workflows/*.json
        │       prompts canonical example with captureInput/capture/inject
        │
        └──→ Simulator
                WorkflowSimulator.simulateWorkflow(workflow, { baseUrl })
                   for step in workflow.steps:
                     resolveTemplateString("{{faker.*}}", "{{workflow:*}}", "{{human:*}}")
                     resolveInjections(inject) → headers/body
                     fetch(baseUrl + resolvedPath, { method, headers, body })
                     captureInputToMemory() — before call
                     captureToMemory()     — after 2xx
                     evaluateStepCondition() — 14 operators, onFail: abort/continue/switch
                │
                ▼
           .jetic/memory.json  (packages/memory — JeticMemory)
           .jetic/traces/trace_*.json  (ReactFlow Obs.)
                │
                ▼ SSE /api/workflows/run or CLI spinner
           Jetic Studio /traces  (ReactFlow graph)
           Jetic Studio /changes (SSE /api/changes/stream + .jetic/changes.json)
```

![Data flow sequence diagram — Scanner → Model → Generator → Simulator → Memory → Traces](/screenshots/step3.PNG)
*Click image to enlarge — Sequence diagram matching the `How Jetic Works` ascii art but rendered as a proper diagram.*

---

## 📂 File Change Watcher Loop (Zero Git)

```
File edited on disk
   │
   ▼ fs.watch (express dev.ts)
.jetic/changes.json  { version, watchedSince, projectRoot, changes: [{filePath, eventType}] }
   │
   ├──→ SSE GET /api/changes/stream → Dashboard /changes page (live badge)
   └──→ MCP jetic_get_changes → AI reads only modified paths → jetic_add_endpoint patch → jetic_clear_changes
        (Delta re-indexing — no full codebase read)
```

---

## 🧠 Memory Interpolation Pipeline

Every `{{scope:key}}` or `{{faker.*}}` or `{{human:key}}` is resolved by `resolveTemplateString()` in both `cli/src/commands/simulate-workflow.ts` and `dashboard/src/pages/Workspace/Simulations.tsx`:

| Syntax | Resolver | Source |
|---|---|---|
| `{{faker.internet.email}}` | `faker` dynamic call | `@faker-js/faker` |
| `{{workflow:accessToken}}` | `new JeticMemory({scope:'workflow'}).get(key)` | `.jetic/memory.json` |
| `{{human:otp}}` | `askHuman()` → `JETIC_HUMAN_OTP` env → `human:` memory → TTY prompt or SSE `human_input_required` dialog | Interactive |

Order matters: `captureInput` (pre-flight) runs *before* `fetch`, `capture` (post-flight) only on `2xx`.

---

## 🔌 MCP Bridge

```
AI Editor (Cursor, Claude, opencode)
   │ MCP stdio — 18 tools
   ▼
@jetic/mcp-server — SerializedTransport (one-at-a-time, no race on .jetic/model.json)
   ├─ read/verify: jetic_read_model, jetic_list_endpoints, jetic_get_endpoint, jetic_verify_model
   ├─ write model: jetic_add_endpoint, jetic_update_endpoint, jetic_delete_endpoint, jetic_init, jetic_scan
   └─ workflows: jetic_validate_workflow → jetic_create_workflow → jetic_simulate_workflow
```

![MCP architecture — Editor ↔ SerializedTransport ↔ Model file ↔ Scanner/Simulator](/screenshots/mastra.jfif)
*Click image to enlarge — MCP bridge diagram.*
