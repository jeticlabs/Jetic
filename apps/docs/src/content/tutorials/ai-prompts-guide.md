# AI Prompts Cookbook 💬

Copy-paste prompt recipes for using Jetic through AI code assistants (Cursor, Windsurf, Claude Code, Antigravity, opencode, VS Code).

---

## 💬 Recipe 1 — Meet Jetic (Fresh Project Onboarding)

> I've installed the Jetic MCP tools. Summarize what you can do with them, then read my project's model summary and tell me what's in it.

---

## 💬 Recipe 2 — Full Project Re-Analysis

> Help me re-analyse the whole project: find ALL API endpoints in this codebase — routes, controllers, middleware, auth guards, request/response shapes — and add every missing endpoint to my .jetic/model.json using the jetic tools. Include security, middleware chains, parameters, and response schemas. When done, run jetic_verify_model and fix all errors.

---

## 💬 Recipe 3 — Module Focus (Incremental)

> Analyse ONLY src/modules/payments: add/update all of its endpoints in the model with full detail (middleware, auth, validation constraints), then verify.

---

## 💬 Recipe 4 — Authoring & Simulating Workflows

> Help create a workflow called "Shopper checkout" with these steps: (1) register a user with a faker email and capture credentials, (2) log in and capture access token, (3) create an order with the Bearer token and expect 201. Validate it BEFORE saving, then save it and simulate it against http://localhost:3000.

---

## 💬 Recipe 5 — Negative & Constraint Testing

> Help create a workflow called "Forbidden admin action" where a normal non-admin user logs in and calls DELETE /api/admin/users/:id expecting 403. Validate, save, and simulate it.

---

## 💬 Recipe 6 — Re-syncing Code Changes

> Check recent file changes (jetic_get_changes). Re-analyse ONLY those modified files to update .jetic/model.json instead of reading the entire codebase. When done, clear the change tracking log.
