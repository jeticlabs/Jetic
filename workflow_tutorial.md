# 📘 Complete Jetic Workflow Reference & Tutorial

Welcome to the definitive guide for designing, authoring, and executing **Jetic Workflows** (`.jetic/workflows/*.json`).

Jetic Workflows allow you to simulate multi-step, stateful, end-to-end integration tests against live HTTP backends. Workflows support dynamic data generation, state capturing, memory injection, human-in-the-loop interactive inputs, conditional branching, failure handling, and retry strategies.

---

## 📑 Table of Contents

1. [Workflow File Architecture](#1-workflow-file-architecture)
2. [Complete Annotated JSON Schema](#2-complete-annotated-json-schema)
3. [Full Real-World Example Workflow](#3-full-real-world-example-workflow)
4. [Template Syntax & Placeholders](#4-template-syntax--placeholders)
   - [Dynamic Data Generators (`{{faker.*}}`)](#dynamic-data-generators-faker)
   - [Workflow & Runtime Memory (`{{workflow:key}}`, `{{memory:key}}`)](#workflow--runtime-memory)
   - [Environment Variables (`{{env:KEY}}`)](#environment-variables-envkey)
   - [Human-in-the-Loop Prompts (`{{human:key}}`)](#human-in-the-loop-prompts-humankey)
5. [Step Data Injection (`inject`)](#5-step-data-injection-inject)
6. [Data Capture Protocol (`capture` & `captureInput`)](#6-data-capture-protocol-capture--captureinput)
7. [Step Conditions & Branching (`condition`)](#7-step-conditions--branching-condition)
8. [Failure Handling & Retry Strategies (`onFailure`, `retry`)](#8-failure-handling--retry-strategies-onfailure-retry)
9. [Running Workflows via CLI & MCP](#9-running-workflows-via-cli--mcp)

---

## 1. Workflow File Architecture

Workflow files are standard JSON documents saved inside your project's `.jetic/workflows/` directory (e.g., `.jetic/workflows/user-onboarding-checkout.json`).

Every workflow consists of top-level metadata and an ordered list of **Steps**. Each step represents an HTTP call to an endpoint defined in your `.jetic/model.json`.

```
.jetic/
├── model.json
└── workflows/
    ├── user-onboarding.json
    ├── checkout-flow.json
    └── 2fa-transfer.json
```

---

## 2. Complete Annotated JSON Schema

Below is the complete TypeScript-equivalent structure supported by Jetic's simulator engine (`WorkflowSimulator`) and CLI command (`jetic simulate workflow`):

```json
{
  "name": "String (Required) — Short, descriptive title of the workflow",
  "description": "String (Optional) — Full summary of what this workflow tests",
  "version": "String (Optional) — Schema format version, e.g. '0.3'",
  "environment": "String (Optional) — Target environment name, e.g. 'local' or 'staging'",
  "retry": {
    "times": "Number — Global default max retry attempts per step (e.g. 3)",
    "delayMs": "Number — Global delay in milliseconds between retries (e.g. 1000)"
  },
  "steps": [
    {
      "name": "String (Required) — Step label displayed in CLI logs and Jetic Studio",
      "method": "String (Required) — HTTP verb: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'",
      "path": "String (Required) — Endpoint route path, e.g. '/api/v1/auth/login'",
      "description": "String (Optional) — Purpose of this specific API call",
      "expectStatus": "Number (Optional) — Expected HTTP status for success (Default: 200 / 201)",
      "continueOnStatus": ["Array of Numbers — Additional HTTP status codes treated as pass"],
      
      "body": {
        "key": "Values can be hardcoded literals, {{faker.*}}, {{workflow:key}}, or {{human:key}}"
      },
      
      "captureInput": {
        "workflow:targetKey": "bodyFieldName — Saves resolved body values BEFORE sending HTTP request"
      },
      
      "capture": {
        "workflow:targetKey": "dot.notation.path — Saves response body fields AFTER HTTP success"
      },
      
      "inject": {
        "header:HeaderName": "Value to set as request header, e.g. 'Bearer {{workflow:token}}'",
        "body:fieldName": "Value to inject directly into request body payload"
      },
      
      "condition": {
        "if": "{{workflow:userRole}}",
        "equals": "admin",
        "notEquals": "guest",
        "contains": "super",
        "exists": true,
        "greaterThan": 10,
        "lessThan": 100,
        "in": ["admin", "superadmin"]
      },
      
      "onFailure": "String (Optional) — 'abort' (stops workflow) or 'continue' (skips step capture & continues)",
      
      "retry": {
        "times": "Number — Per-step retry limit overriding global setting",
        "delayMs": "Number — Per-step retry delay in milliseconds"
      }
    }
  ]
}
```

---

## 3. Full Real-World Example Workflow

Below is a complete, production-ready workflow demonstrating **registration, login token capture, human interactive 2FA prompt, conditional admin actions, failure continuation, and retry rules**:

```json
{
  "name": "Enterprise Workspace Setup & 2FA Verification Flow",
  "description": "Tests full lifecycle: workspace setup, login, 2FA verification, conditional team creation, and teardown.",
  "version": "0.3",
  "environment": "local",
  "retry": {
    "times": 2,
    "delayMs": 500
  },
  "steps": [
    {
      "name": "1. Admin Workspace Registration",
      "method": "POST",
      "path": "/api/v1/workspaces/setup",
      "description": "Creates initial workspace and root admin credentials",
      "expectStatus": 201,
      "body": {
        "workspaceName": "{{faker.company.name}} Workspace",
        "adminEmail": "{{faker.internet.email}}",
        "adminPassword": "{{faker.internet.password}}",
        "adminName": "{{faker.person.fullName}}"
      },
      "captureInput": {
        "workflow:adminEmail": "adminEmail",
        "workflow:adminPassword": "adminPassword",
        "workflow:workspaceName": "workspaceName"
      },
      "capture": {
        "workflow:workspaceId": "data.workspace.id"
      }
    },
    {
      "name": "2. Admin Login & JWT Issuance",
      "method": "POST",
      "path": "/api/v1/auth/login",
      "description": "Authenticates using credentials captured in step 1",
      "expectStatus": 200,
      "body": {
        "email": "{{workflow:adminEmail}}",
        "password": "{{workflow:adminPassword}}",
        "deviceId": "{{faker.string.uuid}}"
      },
      "capture": {
        "workflow:accessToken": "data.tokens.access",
        "workflow:refreshToken": "data.tokens.refresh",
        "workflow:userRole": "data.user.role",
        "workflow:requires2FA": "data.user.requires2FA"
      }
    },
    {
      "name": "3. Interactive 2FA Verification (Human Prompt)",
      "method": "POST",
      "path": "/api/v1/auth/verify-2fa",
      "description": "Prompts operator for OTP code if 2FA is required",
      "expectStatus": 200,
      "condition": {
        "if": "{{workflow:requires2FA}}",
        "equals": "true"
      },
      "inject": {
        "header:Authorization": "Bearer {{workflow:accessToken}}"
      },
      "body": {
        "otpCode": "{{human:admin_otp_code}}"
      },
      "capture": {
        "workflow:verifiedToken": "data.sessionToken"
      },
      "retry": {
        "times": 3,
        "delayMs": 1000
      }
    },
    {
      "name": "4. Provision Enterprise Team (Admin Only)",
      "method": "POST",
      "path": "/api/v1/teams",
      "description": "Executes team creation only if user has admin role",
      "expectStatus": 201,
      "condition": {
        "if": "{{workflow:userRole}}",
        "equals": "admin"
      },
      "inject": {
        "header:Authorization": "Bearer {{workflow:verifiedToken}}"
      },
      "body": {
        "workspaceId": "{{workflow:workspaceId}}",
        "teamName": "Engineering Division",
        "maxMembers": 25
      },
      "capture": {
        "workflow:teamId": "data.id"
      }
    },
    {
      "name": "5. Optional Audit Check (Failure Tolerant)",
      "method": "GET",
      "path": "/api/v1/audit/logs",
      "description": "Reads audit logs; continues even if audit service returns 404",
      "expectStatus": 200,
      "continueOnStatus": [404],
      "onFailure": "continue",
      "inject": {
        "header:Authorization": "Bearer {{workflow:verifiedToken}}"
      }
    },
    {
      "name": "6. Session Logout",
      "method": "POST",
      "path": "/api/v1/auth/logout",
      "description": "Invalidates active JWT token",
      "expectStatus": 200,
      "inject": {
        "header:Authorization": "Bearer {{workflow:verifiedToken}}"
      }
    }
  ]
}
```

---

## 4. Template Syntax & Placeholders

Jetic evaluates placeholders inside string values across `body`, `headers`, `params`, and `inject` properties.

### Dynamic Data Generators (`{{faker.*}}`)
Generates realistic fake test data automatically during execution:

| Placeholder | Example Resolved Output | Description |
|---|---|---|
| `{{faker.internet.email}}` | `"user_8f9a@example.com"` | Random valid email |
| `{{faker.internet.password}}` | `"kX9#mL2$vP1"` | Random secure password |
| `{{faker.internet.username}}` | `"dev_alex99"` | Random username |
| `{{faker.person.fullName}}` | `"Sarah Connor"` | Random full name |
| `{{faker.company.name}}` | `"Acme Dynamics Inc"` | Random company name |
| `{{faker.string.uuid}}` | `"a1b2c3d4-e5f6-7890-abcd-1234567890ab"` | UUID v4 string |
| `{{faker.phone.number}}` | `"+1-555-019-2834"` | Phone number |
| `{{faker.word.noun}}` | `"workspace"` | Random single noun |
| `{{faker.commerce.productName}}` | `"Ergonomic Aluminum Keyboard"` | Product name |

### Workflow & Runtime Memory (`{{workflow:key}}`, `{{memory:key}}`)
Reads dynamic values captured from prior steps or saved in persistent workspace memory:

- **`{{workflow:accessToken}}`**: Values captured during the current running workflow execution.
- **`{{memory:defaultUserEmail}}`**: Values stored in `.jetic/memory.json`.

### Environment Variables (`{{env:KEY}}`)
Reads system environment variables from the host running Jetic:

- **`{{env:API_BASE_URL}}`**
- **`{{env:STAGE_TOKEN}}`**

### Human-in-the-Loop Prompts (`{{human:key}}`)
When Jetic encounters `{{human:key}}` during step execution, it pauses execution and interactively asks the user in CLI or Studio UI to input the value.

```
  ? Enter value for human input "admin_otp_code": 
```

- **Caching**: The first response is automatically saved into memory key `human:admin_otp_code` for subsequent steps.
- **CI/CD Non-interactive Override**: In automated CI/CD pipelines, set an environment variable matching `JETIC_HUMAN_<KEY>` (e.g. `JETIC_HUMAN_ADMIN_OTP_CODE="123456"`) to skip the prompt automatically.

---

## 5. Step Data Injection (`inject`)

The `inject` block injects captured memory variables into request headers or body properties before the HTTP call executes.

### Syntax Options:
- **Header Injection (`header:HeaderName`)**:
  ```json
  "inject": {
    "header:Authorization": "Bearer {{workflow:accessToken}}",
    "header:X-Workspace-ID": "{{workflow:workspaceId}}"
  }
  ```
- **Body Field Injection (`body:fieldName`)**:
  ```json
  "inject": {
    "body:userId": "{{workflow:userId}}",
    "body:tenantId": "{{workflow:tenantId}}"
  }
  ```
- **Standard Header Key (Without Prefix)**:
  ```json
  "inject": {
    "Authorization": "Bearer {{workflow:accessToken}}"
  }
  ```

> **Security Rule**: Every endpoint requiring authentication (`[requiresAuth]`) **MUST** contain an `inject` entry for `header:Authorization`.

---

## 6. Data Capture Protocol (`capture` & `captureInput`)

Jetic provides two distinct mechanisms for capturing state into runtime memory.

### 1. `captureInput` (Pre-Request Capture)
Saves resolved request body fields to memory **BEFORE** the HTTP call is executed. Essential for capturing generated `{{faker.*}}` fields so that subsequent steps can re-use the exact same credentials.

```json
"body": {
  "email": "{{faker.internet.email}}",
  "password": "{{faker.internet.password}}"
},
"captureInput": {
  "workflow:userEmail": "email",
  "workflow:userPassword": "password"
}
```

### 2. `capture` (Post-Request Response Capture)
Saves response body values to memory **AFTER** the HTTP call returns a successful status code. Uses standard dot-notation object paths.

```json
"capture": {
  "workflow:accessToken": "data.tokens.accessToken",
  "workflow:userId": "data.user.id",
  "workflow:firstItem": "items[0].id"
}
```

---

## 7. Step Conditions & Branching (`condition`)

Conditions evaluate before step execution. If a condition evaluates to `false`, the step is **skipped** (counts as passed in metrics) and the workflow proceeds to the next step.

### Condition Structure:
```json
"condition": {
  "if": "{{workflow:userRole}}",
  "equals": "admin",
  "notEquals": "guest",
  "contains": "super",
  "exists": true,
  "greaterThan": 5,
  "lessThan": 100,
  "in": ["admin", "owner", "superadmin"]
}
```

### Comparison Operators:
- `equals`: Match exact string equality.
- `notEquals`: Inverse match string equality.
- `contains`: Match substring inclusion.
- `exists`: Check if variable is non-empty (`true`) or empty (`false`).
- `greaterThan`: Numeric greater than (`>`).
- `lessThan`: Numeric less than (`<`).
- `in`: Array list match (evaluated against string array).

---

## 8. Failure Handling & Retry Strategies (`onFailure`, `retry`)

### Per-Step Failure Behavior (`onFailure`)
- **`"abort"` (Default)**: Stops the workflow immediately if status assertion fails.
- **`"continue"`**: Logs the failure, skips step response captures, but allows the workflow to execute remaining steps. Useful for optional cleanup or negative tests.

### Extra Pass Codes (`continueOnStatus`)
Treats specified non-2xx status codes as successful passes for assertion purposes:

```json
"expectStatus": 200,
"continueOnStatus": [404, 409]
```

### Retry Configuration (`retry`)
Configures automatic retries when a network error occurs or status assertions fail:

- **Global Workflow Default**:
  ```json
  "retry": {
    "times": 3,
    "delayMs": 1000
  }
  ```
- **Per-Step Override**:
  ```json
  "retry": {
    "times": 5,
    "delayMs": 2000
  }
  ```

---

## 9. Running Workflows via CLI & MCP

### Execute via Jetic CLI
Run your workflow against local or remote environments:

```bash
# Execute workflow against default local environment
jetic simulate workflow .jetic/workflows/user-onboarding-checkout.json

# Clear memory before execution
jetic simulate workflow .jetic/workflows/user-onboarding-checkout.json --clear-memory
```

### Execute via AI IDE (MCP Tool)
If Jetic MCP server (`jetic mcp`) is connected to Cursor, opencode, Antigravity, or VS Code, ask your AI assistant:

> *"Run the workflow `.jetic/workflows/user-onboarding-checkout.json` and inspect the result step logs."*

The assistant will execute `jetic_simulate_workflow` and present an interactive step summary trace.

---

<p align="center">
  <i>Jetic API Behavior Testing & Simulation Platform</i>
</p>
