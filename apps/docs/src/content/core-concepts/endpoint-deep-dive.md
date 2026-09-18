# Endpoint Deep Dive 🔬

Every field of `Endpoint` in `packages/model/src/schema.ts` — what `jetic_add_endpoint` can author at full fidelity.

---

## 📄 Full Endpoint Shape

```ts
interface Endpoint {
  id: string;                          // auto uuid, or preserved on overwrite
  method: HttpMethod;                  // GET | POST | PUT | PATCH | DELETE | OPTIONS | HEAD
  path: string;                        // /api/users/:id  — must start with /
  name?: string;                       // "Create User" — human label
  summary?: string;                    // one-line
  description?: string;                // detailed
  tags?: string[];                     // ["users", "auth"]
  deprecated?: boolean;
  timeout?: number;                    // ms, e.g. 8000
  resource?: string;                   // "User" — domain entity
  handlerName?: string;                // "UserController.create"
  source: SourceReference;             // { file, line, column? }
  security?: EndpointSecurity[];       // [{ scheme: "bearerAuth" }]
  middleware: MiddlewareReference[];    // IN EXECUTION ORDER
  parameters?: Parameter[];            // query/path/header/cookie
  requestBody?: RequestBody;           // fields + constraints
  responses?: Record<string, ResponseDefinition>; // "200", "201", "400" ...
  pagination?: PaginationConfig;       // page | offset | cursor
  rateLimit?: RateLimitConfig | null;  // null to remove
  ownership?: OwnershipConfig;
  produces?: EndpointProduces[];       // memory vars from response
  consumes?: EndpointConsumes[];       // memory vars into header/body
}
```

---

## 🧱 Field Breakdown

### `middleware` — Execution Order Matters
```json
"middleware": [
  { "name": "cors", "type": "cors" },
  { "name": "express.json", "type": "parser" },
  { "name": "auth", "type": "auth", "scheme": "bearerAuth" },
  { "name": "rateLimit", "type": "rate-limit", "config": { "windowMs": 60000, "max": 100 } }
]
```
`jetic_scan` discovers these statically; `jetic_add_endpoint` lets AI declare them explicitly. Never silently dropped on upsert — previous chain is preserved if new payload omits it.

### `parameters` — Includes Validation
```json
{ "name": "limit", "in": "query", "type": "number", "min": 1, "max": 100, "default": 20 }
```
`in: path` params are auto-injected from `:param` in the path if AI misses them.

### `requestBody` — Business Rules
```json
"requestBody": {
  "contentType": "application/json",
  "fields": { "password": { "type": "string", "minLength": 8, "required": true } },
  "constraints": [{ "field": "password", "rule": "minLength", "value": 8, "failureStatus": 400 }]
}
```

### `responses` — Multi-Status
```json
"responses": { "200": { "description": "ok", "schema": { "data": "array", "meta.total": "number" } } }
```

### `pagination` / `rateLimit` / `ownership`
```json
"pagination": { "type": "page", "pageParam": "page", "limitParam": "limit", "totalPath": "meta.total" },
"rateLimit": { "windowMs": 60000, "max": 100, "scope": "user" },
"ownership": { "ownerField": "userId", "mustMatchAuthClaim": "sub" }
```

### `produces` / `consumes` — Memory Wiring for Workflows
```json
"produces": [{ "variable": "lastOrderId", "responseField": "data.0.id" }],
"consumes": [{ "variable": "accessToken", "usedAs": "header:Authorization", "producedBy": "POST /api/auth/login" }]
```

---

## 🖼️ Jetic Studio Views

![Behavioral Model explorer — endpoint cards, method chips, search](/screenshots/jetic_model_list.JPG)
*Click image to enlarge — `/model` page showing method filtering, schema cards, security badges.*

![Endpoint inspect — AST source viewer at routes/orders.ts:42 + related files + schema explorer + REST client](/screenshots/jetic_endpoint_inspect.JPG)
*Click image to enlarge — `/inspect` deep dive with AST viewer centered on handler line, Related Files navigator, and interactive REST client.*

![Add Endpoint modal — manual endpoint authoring for non-Express stacks](/screenshots/jetic_add_endpoint.JPG)
*Click image to enlarge — Manual creation modal used for FastAPI/Go/Java.*

> [!TIP]
> Replace placeholders with your own screenshots after running `jetic dev`.
