# Human-in-the-Loop Workflows 👤

When a workflow needs a value only a person knows at runtime — OTP, 2FA code, CAPTCHA, real email — use `{{human:key}}`.

---

## 🔑 Syntax

In any `body` or `inject` value:
```json
{ "body": { "code": "{{human:devCode}}", "email": "{{workflow:regEmail}}" } }
```

---

## 🔄 Resolution Order (same in CLI + Dashboard dev server + simulator)

1. `JETIC_HUMAN_DEVCODE` env var (`human:devCode` → uppercased, non-alphanum → `_`)
2. `human:devCode` in `.jetic/memory.json` (saved after first manual entry)
3. Interactive prompt:
   - **CLI `jetic simulate workflow`**: TTY `readline/promises` prompt (masked with `*` if key looks like `pass|secret|token|pwd`)
   - **Dashboard `jetic dev`**: SSE `human_input_required { runId, key, stepIndex }` → modal dialog → `POST /api/workflows/human-input { runId, key, value }` → `human_resolved` event + run log note

If terminal is non-TTY and nothing is pre-seeded, CLI throws `HumanInputError` with fix: `jetic memory set human:devCode <value>` or `export JETIC_HUMAN_DEVCODE`.

---

## 📸 Dashboard Human Dialog

![Human input dialog — amber modal with devCode field, Submit & resume](/screenshots/jetic_conditional_simulation.JPG)
*Click image to enlarge — Dialog that pauses the run. Also shows pulsing amber User icon on step row + Run Log line “will ask for {{human:devCode}} when reached” vs “← saved human memory (ready)” when pre-seeded.*

> [!TIP]
> After first answer, reruns reuse saved memory silently. To be asked again: `jetic memory delete human:devCode` or clear via Dashboard `/memory`.

---

## 🧪 MCP Authoring

`jetic_create_workflow` and `jetic_update_workflow` return:
```json
{ "needsHuman": ["devCode"], "humanNote": "Steps need interactive human input for: {{human:devCode}}. Runners pause for it — pre-seed with JETIC_HUMAN_DEVCODE env or human: memory. Tell the user." }
```
Validator allows `{{human:*}}` without prior capture — `{{workflow:*}}` without capture is still an error.

---

## 🔒 Pre-seeding for CI

```bash
export JETIC_HUMAN_OTP=424242
jetic simulate workflow --workflow verify-otp
# Dashboard: POST /api/workflows/run { file, humanInputs: { otp: "424242" } }  → no pause
```
