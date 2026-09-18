# Simulator Engine ⚙️

`packages/simulator` — the execution engine that turns declarative workflows into real HTTP traffic.

---

## 🧩 Modules

| File | Export | Role |
|---|---|---|
| `src/data-generator.ts` | `DataGenerator` | Generates `body` + `queryParams` from `FieldDefinition` respecting `min/max/minLength/maxLength/enum/format` |
| `src/response-validator.ts` | `ResponseValidator` | Validates status code + JSON shape against `endpoint.responses[status].schema` |
| `src/simulator.ts` | `EndpointSimulator` | Single-endpoint `simulateEndpoint(endpoint, { headers?, body?, queryParams?, timeoutMs? })` — merges overrides, builds headers (Bearer via `securitySchemes.obtainedFrom`), resolves `:params`, fetches, validates |
| `src/workflow-simulator.ts` | `WorkflowSimulator` | Multi-step `simulateWorkflow(workflow, { clearMemory })` — the heart |
| `src/index.ts` | Re-exports | Barrel |

---

## 🔄 WorkflowSimulator Steps (what actually happens per step)

```
resolveInjections(inject) → headers/body    // {{workflow:token}} → Bearer header
resolveBodyTemplates(body) → faker/human/memory
captureInputToMemory(captureInput, body)    // BEFORE fetch — save faker emails for login
resolvePathParams(path, body)               // :id → body.id or memory
fetch(baseUrl + path, { method, headers, body/query })
  └─ timeout via AbortSignal.timeout(15000)
captureToMemory(capture, responseBody)      // AFTER 2xx — JSONPath dot.notation
evaluateStepCondition() — 14 operators
```

### Template Sources (in order)
1. `{{faker.company.name}}` → `faker.company.name()` dynamic call
2. `{{human:otp}}` → `JETIC_HUMAN_OTP` env → `human:` memory → TTY prompt (CLI) or `human_input_required` SSE (Dashboard) → saved to memory
3. `{{workflow:accessToken}}` → `JeticMemory({scope:'workflow'}).get()`

### Condition System
`ConditionOperator: equals | not_equals | greater_than | greater_than_or_equal | less_than | less_than_or_equal | exists | not_exists | is_empty | is_not_empty | contains | not_contains | starts_with | ends_with`
Grouped by `ConditionGroup { all?: ConditionRule[] (AND), any?: ConditionRule[] (OR) }` with `onFail: abort | continue | switch` (+ `switchToWorkflow`, `returnOnComplete`).

---

## 🎨 Dashboard Execution Views

![Simulations list — workflow cards with step status chips](/screenshots/jetic_simulations.JPG)
*Click image to enlarge — `/simulations` list view with Run/Graph toggle.*

![Expandable step — resolved body, injected headers, captured vars, expected vs actual status](/screenshots/jetic_smulations_expandable_new.JPG)
*Click image to enlarge — Expanded step showing auth injection and captures.*

![Simulations graph — ReactFlow vertical chain with condition diamonds](/screenshots/jetic_smulations_graph.JPG)
*Click image to enlarge — Graph view: StepNode → ConditionNode diamond.*

![Execution trace — ReactFlow node-graph + timeline + drawer](/screenshots/jetic_traces.JPG)
*Click image to enlarge — `/traces` observability page.*
