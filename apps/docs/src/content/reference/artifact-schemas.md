# .jetic Artifact Schemas 📄

Every file the tools read/write, with full JSON examples.

---

## `model.json` (`packages/model/src/schema.ts` — BehavioralModel)

Already shown in `Behavioral Model` page — includes `version`, `generatedAt`, `project`, `environments[]`, `securitySchemes: Record<string, SecurityScheme>`, `resources[]`, `endpoints[]`, `dependencies[]`, `workflows[]`, `stateMachines[]`.

---

## `workflows/*.json` (WorkflowDef)

See `workflow-spec.md` + `endpoint-deep-dive.md` — includes `name`, `generatedAt`, `environment?`, `steps: WorkflowStepDef[]` with `inject/capture/captureInput/expectStatus/condition` + `{{human:*}}`.

---

## `memory.json` (JeticMemory)

```json
{
  "workflow": { "adminEmail": "a@ex.com", "accessToken": "eyJ..." },
  "human": { "otp": "424242" },
  "global": { "baseUrl": "http://localhost:3000" }
}
```
Scopes `workflow` (ephemeral, `--clear-memory` wipes), `global` (persistent), `human` (interactive, TTL optional via `JeticMemory.set(key, val, { ttl: 60 })`).

---

## `changes.json` (File Watcher)

```json
{
  "version": 1,
  "watchedSince": "2026-09-18T10:00:00.000Z",
  "projectRoot": "C:/projects/my-api",
  "changes": [{ "filePath": "src/routes/user.routes.ts", "absolutePath": "...", "changedAt": "...", "eventType": "change" }]
}
```

---

## `traces/trace_*.json` (Execution Trace)

```json
{
  "id": "trace_abc123",
  "workflowName": "Shop setup",
  "startedAt": "...",
  "finishedAt": "...",
  "durationMs": 1234,
  "phase": "done",
  "passed": 3,
  "failed": 0,
  "steps": [{ "index": 0, "name": "Register", "method": "POST", "path": "/api/setup", "status": 201, "durationMs": 120, "captured": { "workflow:adminEmail": "a@ex.com" } }]
}
```

---

## `config.json` (User Config)

```json
{ "ai": { "provider": "openrouter", "model": "anthropic/claude-3.5-sonnet", "apiKeyEnvVar": "OPENROUTER_API_KEY" } }
```

![Artifacts folder — .jetic directory tree in VS Code explorer](/screenshots/start.PNG)
*Click image to enlarge — File tree showing all artifacts.*
