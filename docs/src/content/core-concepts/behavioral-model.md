# Behavioral Model Specification (`model.json`) 🧠

The **Behavioral Model** (`.jetic/model.json`) is the central source of truth for your application's API architecture, endpoints, data contracts, and security rules.

---

## 📄 JSON Schema Structure

```json
{
  "version": "0.3",
  "generatedAt": "2026-08-30T10:00:00.000Z",
  "project": {
    "name": "express-shop",
    "language": "typescript",
    "framework": "express"
  },
  "environments": [
    { "name": "local", "baseUrl": "http://localhost:3000" }
  ],
  "securitySchemes": {
    "bearerAuth": {
      "type": "http",
      "scheme": "bearer",
      "obtainedFrom": {
        "endpoint": "POST /api/auth/login",
        "field": "data.accessToken"
      }
    }
  },
  "endpoints": [
    {
      "id": "post-api-auth-login",
      "method": "POST",
      "path": "/api/auth/login",
      "handlerName": "AuthController.login",
      "source": {
        "file": "src/routes/auth.routes.ts",
        "line": 14
      },
      "requestBody": {
        "contentType": "application/json",
        "fields": {
          "user_email": { "type": "string", "format": "email", "required": true },
          "user_password": { "type": "string", "minLength": 8, "required": true }
        }
      },
      "responses": {
        "200": {
          "description": "Login successful",
          "schema": {
            "data.accessToken": "string",
            "data.user.id": "string"
          }
        }
      },
      "middleware": ["rateLimiter", "jsonParser"]
    }
  ]
}
```

---

## 🔍 AST Static Analysis & Provenance

Jetic scanner uses `ts-morph` to inspect AST nodes:
- **Express Scanner**: Flattens nested router mounts (`app.use('/api/v1', router)`).
- **Import Resolver**: Traces imported controllers, middleware, and type declarations to extract property validation rules.
- **Source Provenance**: Records precise file paths and line numbers (`source: { file: "src/routes/auth.routes.ts", line: 14 }`), enabling live code viewing inside Jetic Studio inspect page.

---

## ✏️ Hand-Added vs AST Discovered Endpoints

You can manage endpoints in `model.json` through:
1. **Automated Scanner**: `jetic scan` (Express + TypeScript).
2. **Jetic Studio Web UI**: Click **"Add Endpoint"** on the `/model` page.
3. **MCP Tools**: AI editors can invoke `jetic_add_endpoint`, `jetic_update_endpoint`, and `jetic_verify_model` to build and validate models for any stack (FastAPI, Go, Rust, NestJS, Java).
