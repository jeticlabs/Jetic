# Scoped Runtime Memory (`memory.json`) 💾

Jetic maintains a persistent, scoped key-value memory store in `.jetic/memory.json` to manage authentication tokens, resource IDs, faker variables, and environment configuration across workflow steps.

---

## 📄 Schema & Scopes

```json
{
  "workflow": {
    "adminEmail": "admin_test_8421@example.com",
    "adminPassword": "Password123!",
    "workspaceID": "ws_98124712",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "global": {
    "baseUrl": "http://localhost:3000"
  }
}
```

### Memory Scopes
- **`workflow` scope**: Ephemeral state populated during workflow execution (`captureInput` and `capture`). Cleared using `--clear-memory` or via Studio Memory Inspector.
- **`global` scope**: Persistent workspace state (base URLs, API keys, environment parameters) shared across single endpoint simulations and workflows.

---

## 🔤 String Interpolation Syntax

Jetic supports string template interpolation inside headers, body payloads, and query parameters:

| Template Syntax | Description | Example Resolution |
| :--- | :--- | :--- |
| `{{workflow:varName}}` | Resolves key from `workflow` scope | `eyJhbGci...` |
| `{{global:baseUrl}}` | Resolves key from `global` scope | `http://localhost:3000` |
| `{{faker.internet.email}}` | Generates fake email via Faker.js | `john.doe_82@example.com` |
| `{{faker.company.name}}` | Generates fake company name | `Acme Corp` |
| `{{faker.string.uuid}}` | Generates random UUID | `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d` |

---

## 🖥️ Managing Memory

- **CLI Commands**:
  ```bash
  jetic memory list
  jetic memory set workflow:token "my-jwt-token"
  jetic memory get workflow:token
  jetic memory clear
  ```
- **Jetic Studio Dashboard**: View, edit, or delete keys interactively under `/memory`.
