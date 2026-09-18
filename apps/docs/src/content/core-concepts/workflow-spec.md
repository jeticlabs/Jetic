# Stateful Workflow Specification 🔗

Jetic workflows (`.jetic/workflows/*.json`) define multi-step end-to-end integration scenarios that execute sequentially with state passing, faker data generation, and response validation.

---

## 📄 Workflow JSON Format

```json
{
  "name": "Admin creates workspace, creates class and logs out",
  "generatedAt": "2026-08-30T10:15:00.000Z",
  "steps": [
    {
      "name": "Admin setup workspace",
      "method": "POST",
      "path": "/api/workspaces/setup",
      "description": "Register workspace and initial admin credentials",
      "body": {
        "workspace_name": "{{faker.company.name}}",
        "admin_email": "{{faker.internet.email}}",
        "admin_password": "{{faker.internet.password}}"
      },
      "captureInput": {
        "workflow:adminEmail": "admin_email",
        "workflow:adminPassword": "admin_password"
      },
      "capture": {
        "workflow:workspaceID": "data.workspace.id"
      },
      "expectStatus": 201
    },
    {
      "name": "Admin login",
      "method": "POST",
      "path": "/api/auth/login",
      "description": "Authenticate using captured admin credentials",
      "body": {
        "user_email": "{{workflow:adminEmail}}",
        "user_password": "{{workflow:adminPassword}}"
      },
      "capture": {
        "workflow:accessToken": "data.accessToken"
      },
      "expectStatus": 200
    },
    {
      "name": "Create class",
      "method": "POST",
      "path": "/api/classes",
      "description": "Create class in workspace using Bearer token",
      "inject": {
        "header:Authorization": "Bearer {{workflow:accessToken}}"
      },
      "body": {
        "name": "{{faker.word.noun}} Class",
        "workspaceId": "{{workflow:workspaceID}}"
      },
      "expectStatus": 201
    }
  ]
}
```

---

## 🔄 Core Directives

### 1. `captureInput` (Pre-Flight Capture)
Saves generated request body or parameter values to `.jetic/memory.json` **before** firing the HTTP request. Essential for storing randomly generated faker credentials (e.g. `admin_email`) so subsequent steps can reuse them for login.

### 2. `capture` (Post-Flight Response Capture)
Reads fields from successful HTTP response JSON payloads via JSONPath (e.g. `data.accessToken`, `data.workspace.id`) and persists them to `.jetic/memory.json`.

### 3. `inject` (Header & Body Injection)
Injects values from memory into request headers (e.g. `header:Authorization = Bearer {{workflow:accessToken}}`) or request body properties.

### 4. `expectStatus` & Negative Testing
Specifies expected HTTP status code (e.g. `200`, `201`, `401`, `403`, `404`, `422`). If actual status differs, the step fails with a clear trace assertion.
