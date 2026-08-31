# Tutorial: Adding API Endpoints in Jetic

This tutorial walks you through two complementary workflows:

1. **Defining a route** in your Express backend (`workspace.routes.ts`)
2. **Registering it in the Model** via the dashboard UI (`Model.tsx` → *Add Endpoint* dialog)

Both sides are shown using three real examples taken directly from the workspace module:

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | `POST` | `/setup` | Public workspace bootstrap (no auth) |
| 2 | `GET` | `/audit-logs` | Authenticated audit log retrieval |
| 3 | `GET` / `POST` | `/:id/users/:userId/assignments` | Nested resource — user assignments |

---

## Part 1 — Backend: `workspace.routes.ts`

### File location
```
examples/Backend/src/modules/workspace/workspace.routes.ts
```

### Pattern overview

```ts
import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { WorkspaceController } from './workspace.controller';

const router = Router();

// Simple route (no middleware)
router.post('/setup', WorkspaceController.setup);

// Authenticated route
router.get('/audit-logs', authenticateToken, WorkspaceController.getAuditLogs);

// Nested resource with multiple path parameters
router.get('/:id/users/:userId/assignments', WorkspaceController.getUserAssignments);
router.post('/:id/users/:userId/assignments', WorkspaceController.addUserAssignment);
router.delete('/:id/users/:userId/assignments/:assignmentId', WorkspaceController.removeUserAssignment);

export default router;
```

### Step-by-step: adding each endpoint

---

#### Example 1 — `POST /setup` (public, no auth)

**Use case**: Initial workspace creation during onboarding — called before any token exists.

```ts
// No middleware — this route is intentionally public
router.post('/setup', WorkspaceController.setup);
```

> **Rule of thumb**: Omit `authenticateToken` only when the route must be reachable without a valid session (e.g., sign-up, setup wizards, webhooks with their own signature verification).

---

#### Example 2 — `GET /audit-logs` (authenticated)

**Use case**: Return a list of audit events for the calling workspace. Requires a valid bearer token.

```ts
// Insert BEFORE any /:id routes to avoid Express matching "audit-logs" as an id param
router.get('/audit-logs', authenticateToken, WorkspaceController.getAuditLogs);
```

> ⚠️ **Ordering matters.** Static path segments (`/audit-logs`) must be registered **before** dynamic segments (`/:id`). If `/:id` comes first, Express captures `audit-logs` as the `id` param value and the dedicated handler is never reached.

The current file already does this correctly:
```
line 10: router.get('/audit-logs', ...)   ← static, comes first
line 11: router.get('/:id',        ...)   ← dynamic, comes second
```

---

#### Example 3 — `/:id/users/:userId/assignments` (nested resource)

**Use case**: Manage which assignments belong to a specific user inside a specific workspace.

```ts
// GET  — list assignments
router.get('/:id/users/:userId/assignments', WorkspaceController.getUserAssignments);

// POST — add an assignment
router.post('/:id/users/:userId/assignments', WorkspaceController.addUserAssignment);

// DELETE — remove a specific assignment by its own id
router.delete('/:id/users/:userId/assignments/:assignmentId', WorkspaceController.removeUserAssignment);
```

Express exposes all three params (`id`, `userId`, `assignmentId`) on `req.params` automatically.

**Middleware tip**: These three routes don't include `authenticateToken` in the example file. In production you would typically add it:

```ts
router.get('/:id/users/:userId/assignments', authenticateToken, WorkspaceController.getUserAssignments);
```

---

### Generic template for any new endpoint

```ts
// HTTP_METHOD  PATH  [middleware, ...]  ControllerMethod
router.METHOD('/your/path', [optionalMiddleware,] YourController.handlerName);
```

| HTTP Method | Typical semantic |
|-------------|-----------------|
| `GET` | Read / list |
| `POST` | Create / action |
| `PUT` | Full replace |
| `PATCH` | Partial update |
| `DELETE` | Remove |
| `HEAD` | Like GET, headers only |
| `OPTIONS` | CORS pre-flight |

---

## Part 2 — Dashboard UI: `Model.tsx` Add Endpoint Dialog

The **Model** page in the dashboard lets you register any endpoint manually — completely framework-agnostic and supporting all standard HTTP methods.

### Where to find it

```
apps/dashboard/src/pages/Workspace/Model.tsx
```

Click the **"+ Add Endpoint"** button (top-right of the Model page) to open the dialog.

---

### Dialog tabs

The dialog has three tabs. Only **Method** and **Path** are required.

```
+------------------------------------------+
|  ✦  Add Endpoint                     ✕  |
+------------------------------------------+
|  [ Basic ]  [ Request ]  [ Responses ]   |
+------------------------------------------+
```

---

### Tab 1 — Basic

| Field | Required | Notes |
|-------|----------|-------|
| **Method** | ✅ | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| **Path** | ✅ | Must start with `/`. Path params use `:param` syntax |
| Name | ✗ | Human-readable label, e.g. `Get Audit Logs` |
| Description | ✗ | Free text summary |
| Tags | ✗ | Comma-separated, e.g. `workspace, logs, admin` |

---

### Tab 2 — Request

#### Parameters sub-section

Click **"+ Add Parameter"** for each URL param, query string, header or cookie.

| Field | Options |
|-------|---------|
| Name | Free text (e.g. `userId`, `page`) |
| Location (`in`) | `query` · `path` · `header` · `cookie` |
| Type | `string` · `integer` · `number` · `boolean` · `array` · `object` |
| Required | Checkbox |
| Description | Short text |
| Example | Shown in docs / inspector |

#### Request Body sub-section

| Field | Notes |
|-------|-------|
| Content Type | Default `application/json`; also supports form, multipart, XML, binary |
| Required | Checkbox |
| Schema (JSON) | Full JSON Schema object (see example below) |
| Example | A concrete JSON value |

---

### Tab 3 — Responses

Click **"+ Add Response"** for each status code your endpoint can return.

| Field | Notes |
|-------|-------|
| Status code | e.g. `200`, `201`, `400`, `401`, `404`, `500` |
| Description | e.g. `Workspace created successfully` |
| Content Type | Same options as request body |
| Body Schema (JSON) | JSON Schema for the response body |
| Example | A concrete JSON value |

---

### Worked examples in the UI

---

#### UI Example 1 — `POST /setup`

**Tab: Basic**
- Method: `POST`
- Path: `/setup`
- Name: `Setup Workspace`
- Description: `Bootstraps a new workspace. Does not require authentication.`
- Tags: `workspace, public`

**Tab: Request → Request Body**
- Content Type: `application/json`
- Required: ✅
- Schema:
```json
{
  "type": "object",
  "properties": {
    "name":    { "type": "string" },
    "ownerId": { "type": "string", "format": "uuid" }
  },
  "required": ["name", "ownerId"]
}
```
- Example:
```json
{ "name": "Acme Corp", "ownerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479" }
```

**Tab: Responses**
- `201` — `Workspace created` — schema: `{ "type": "object", "properties": { "id": { "type": "string" } } }`
- `400` — `Validation error`

---

#### UI Example 2 — `GET /audit-logs`

**Tab: Basic**
- Method: `GET`
- Path: `/audit-logs`
- Name: `Get Audit Logs`
- Description: `Returns paginated audit events for the current workspace.`
- Tags: `workspace, logs, admin`

**Tab: Request → Parameters**

| Name | Location | Type | Required | Example |
|------|----------|------|----------|---------|
| `page` | `query` | `integer` | ✗ | `1` |
| `limit` | `query` | `integer` | ✗ | `50` |
| `action` | `query` | `string` | ✗ | `user.login` |

**Tab: Responses**
- `200` — `Audit log list` — schema:
```json
{
  "type": "object",
  "properties": {
    "items": { "type": "array" },
    "total": { "type": "integer" }
  }
}
```
- `401` — `Unauthorized`

---

#### UI Example 3 — `GET /:id/users/:userId/assignments`

**Tab: Basic**
- Method: `GET`
- Path: `/:id/users/:userId/assignments`
- Name: `Get User Assignments`
- Description: `Lists all assignments for a user within a workspace.`
- Tags: `workspace, users, assignments`

**Tab: Request → Parameters**

| Name | Location | Type | Required | Example |
|------|----------|------|----------|---------|
| `id` | `path` | `string` | ✅ | `ws_abc123` |
| `userId` | `path` | `string` | ✅ | `usr_xyz789` |

**Tab: Responses**
- `200` — `Assignment list` — schema:
```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "assignmentId": { "type": "string" },
      "role":         { "type": "string" },
      "assignedAt":   { "type": "string", "format": "date-time" }
    }
  }
}
```
- `404` — `User or workspace not found`

---

## Part 3 — How the UI dialog works internally

Understanding the internals helps when you need to extend or debug the dialog.

### API calls made by the dialog

| Action | Method | URL | Payload |
|--------|--------|-----|---------|
| Load model | `GET` | `/api/model` | — |
| Scan project | `POST` | `/api/model/scan` | — |
| **Create endpoint** | `POST` | `/api/model/endpoint` | Full endpoint object |
| Update endpoint | `PUT` | `/api/model/endpoint/:id` | Partial endpoint object |

### Endpoint object shape sent on creation

```ts
{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS",
  path: string,                  // always starts with "/"
  name?: string,
  description?: string,
  tags?: string[],

  // optional path/query/header/cookie params
  parameters?: Array<{
    name: string,
    in: "query" | "path" | "header" | "cookie",
    schema: { type: string },
    required: boolean,
    description?: string,
    example?: any,
  }>,

  // optional request body (supports any content type)
  requestBody?: {
    required: boolean,
    content: {
      [contentType: string]: {
        schema?: object,
        example?: any,
      }
    }
  },

  // optional response definitions
  responses?: {
    [statusCode: string]: {
      description?: string,
      content?: {
        [contentType: string]: {
          schema?: object,
          example?: any,
        }
      }
    }
  }
}
```

> **Supported HTTP methods** are defined in `METHOD_COLORS` at the top of `Model.tsx`:
> `GET · POST · PUT · PATCH · DELETE · HEAD · OPTIONS`
> The dialog select box already lists all of them — no code change is needed to use any standard HTTP method.

---

## Part 4 — Does the dialog support any HTTP method / endpoint type?

**Yes.** The `AddEndpointDialog` component is fully generic:

- The **Method** dropdown lists all 7 standard HTTP methods — no hard-coded assumptions about which ones are "valid".
- The **Path** field accepts any string including deep nested paths (e.g. `/:id/users/:userId/assignments`) and purely static paths (e.g. `/audit-logs`).
- **Parameters** cover all four standard locations: `query`, `path`, `header`, `cookie`.
- **Request Body** and **Responses** accept arbitrary JSON schemas and any MIME content type from the `CONTENT_TYPES` list (`application/json`, form-encoded, multipart, plain text, XML, octet-stream).

The only fields that are truly required are **Method** and **Path** — everything else is optional metadata.

---

## Quick-reference checklist

### Adding a backend route

- [ ] Choose the right HTTP method
- [ ] Use a static path segment before any dynamic (`/:id`) segment
- [ ] Decide whether `authenticateToken` (or other middleware) is needed
- [ ] Add the handler to `WorkspaceController` (or equivalent controller)
- [ ] Register the route in the appropriate router file

### Registering in the dashboard Model

- [ ] Open the Model page → click **"+ Add Endpoint"**
- [ ] **Basic tab**: set Method + Path (required)
- [ ] **Request tab**: add path/query params and optional request body schema
- [ ] **Responses tab**: add expected status codes with schemas
- [ ] Click **"Add Endpoint"** to save

---

*Generated for Jetic workspace — `examples/Backend` + `apps/dashboard`*
