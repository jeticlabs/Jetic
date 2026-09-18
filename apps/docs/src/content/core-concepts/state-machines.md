# State Machines & Dependencies 🧬

Beyond endpoints — modeling resource lifecycles and inter-endpoint data flow.

---

## 🔄 StateMachine (`packages/model/src/schema.ts`)

```ts
interface StateMachine {
  resource: string;          // e.g. "Order"
  states: string[];          // ["draft", "authorized", "captured", "refunded"]
  transitions: StateTransition[]; // { from, to, via: "POST /api/orders/:id/capture", condition? }
  invalidTransitions?: InvalidTransition[]; // { from, to, expectStatus, description }
}
```

Stored in `model.json → stateMachines[]`. Currently scaffolded — roadmap: automatic state transition verification (e.g. `payment.capture()` valid when `authorized`, invalid when `refunded`).

---

## 🔗 Dependency (`Dependency`)

```ts
interface Dependency {
  from: string;  // "POST /api/auth/register"
  to: string;    // "POST /api/auth/login"
  via: string;   // "workflow:accessToken" or "data.id"
}
```

Stored in `model.json → dependencies[]`. Informs workflow ordering — `register → login → create` chains exist because `login` consumes what `register` produces.

---

## 📸 Placeholder

![State machine diagram — Order states with transitions via endpoints](/screenshots/mastra.jfif)
*Click image to enlarge — Replace with a state diagram for your domain resource.*

> [!TIP]
> Today, model these manually in `model.json`. Future `jetic mcp` tools will auto-synthesize `stateMachines` from `produces`/`consumes` wiring.
