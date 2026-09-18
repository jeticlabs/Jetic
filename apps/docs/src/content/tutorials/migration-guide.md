# Migration Guide: Adding Jetic to Any Backend 🛤️

Works for Express *and* FastAPI/Go/Rust/Java — MCP path needs no `jetic scan`.

---

## 1️⃣ Initialize

```bash
cd your-backend
jetic init   # creates .jetic/{model.json, config.json, memory.json, workflows/, traces/}
```

Via MCP (fresh repo check): `jetic_init {}` returns `scanRecommended: true` only if `package.json` has `express` + `tsconfig.json` exists.

---

## 2️⃣ Build Behavioral Model

**If Express + TypeScript:** `jetic_scan { mode: "merge" }` (static, keyless) → verify → refine via `jetic_add_endpoint` for AI-only fields. Re-run `jetic_scan` after code changes — discovered routes upsert, hand-added ones preserved unless `mode: "overwrite"`.

**Otherwise (any stack):** Read each route file and call `jetic_add_endpoint` per endpoint:

```json
{
  "method": "POST",
  "path": "/api/auth/login",
  "handlerName": "AuthController.login",
  "source": { "file": "src/routes/auth.ts", "line": 14 },
  "requestBody": { "fields": { "email": { "type": "string", "format": "email", "required": true } } },
  "responses": { "200": { "description": "ok", "schema": { "data.accessToken": "string" } } },
  "security": [{ "scheme": "bearerAuth" }],
  "middleware": [{ "name": "auth", "type": "auth" }]
}
```

Incremental path: keep `jetic dev` running, edit code, then `jetic_get_changes` → only modified file paths → patch model → `jetic_clear_changes`.

---

## 3️⃣ Create & Run Workflows

Only when needed: `jetic_validate_workflow` (dry-run) → `jetic_create_workflow` → `jetic_simulate_workflow` against live server. Use `{{human:otp}}` sparingly for OTP.

---

## 📸 Migration Flow Diagram Placeholder

![Migration flowchart — init → scan vs manual → verify → workflows](/screenshots/start.PNG)
*Click image to enlarge — Flowchart for both stacks.*
