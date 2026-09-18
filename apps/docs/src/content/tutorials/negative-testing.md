# Negative & Conditional Testing 🚦

Test that your API *rejects* bad input — not just that it accepts good input.

---

## ❌ Negative Testing via `expectStatus`

```json
{
  "name": "Non-admin cannot delete user",
  "method": "DELETE",
  "path": "/api/admin/users/:id",
  "inject": { "header:Authorization": "Bearer {{workflow:userToken}}" },
  "body": { "id": "{{workflow:someUserId}}" },
  "expectStatus": 403
}
```

If actual is `200`, step fails. Use `401`, `403`, `404`, `422` to assert auth, ownership, validation.

---

## ◆ Conditions — Branching After a Step

`StepCondition` evaluated *after* the step's HTTP call and before next step:

```ts
interface ConditionRule { left: string; operator: ConditionOperator; right?: string }
interface ConditionGroup { all?: ConditionRule[]; any?: ConditionRule[] } // AND / OR
type ConditionOnFail = 'abort' | 'continue' | 'switch'
interface StepCondition { rules: ConditionGroup; onFail: ConditionOnFail; switchToWorkflow?: string; returnOnComplete?: boolean }
```

**Operators (14):** `equals | not_equals | greater_than | greater_than_or_equal | less_than | less_than_or_equal | exists | not_exists | is_empty | is_not_empty | contains | not_contains | starts_with | ends_with`

Values may contain `{{workflow:*}}` / `{{human:*}}` — resolved via `JeticMemory` before comparison.

**Actions:**
- `abort` — stop entire workflow, mark `aborted`
- `continue` — skip remaining steps, emit `done { conditionBranch: "continue" }`
- `switch` — load `workflows/<switchToWorkflow>.json` and run it inline; if `returnOnComplete: true`, return to next step of parent

---

## 🖼️ Dashboard Condition UI

- **List row:** purple `◇ condition` badge
- **Graph:** diamond node between steps, edges `PASS` (solid) vs `FAIL→ABORT` (dashed)
- **Run Log:** `◇ condition failed — left equals right → abort`
- **Editor:** `ConditionEditor` modal (AND/OR toggle, operator dropdown, `onFail` pills, `switchToWorkflow` input, `returnOnComplete` checkbox)

![Condition graph — step → diamond → next step with PASS/FAIL edges](/screenshots/jetic_conditional_simulation.JPG)
*Click image to enlarge — Condition branching visualization.*

> [!WARNING]
> Conditions are evaluated client-side in Dashboard local simulation and server-side in `dev.ts:755` `evalCondition()` — keep them in sync.
