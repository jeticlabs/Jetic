{
  "$schema": "https://jetic.dev/schema/model/v1.json",
  "$comment": "Jetic Model Schema v1.0.0 — Full deterministic API description + test scenario format. Runtime reads this, generates workflow.json, and executes without AI.",
  "version": "1.0.0",
  "generatedAt": "2026-08-29T00:00:00.000Z",
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 1 — PROJECT
     Basic project metadata. Language + framework drive smart defaults in the
     runtime (e.g., knowing Express uses req.user means it can infer auth shape).
  ──────────────────────────────────────────────────────────────────────────── */
  "project": {
    "name": "Backend",
    "description": "LearningDeck backend — exam, workspace, billing, and user management",
    "language": "typescript",
    "framework": "express",
    "version": "1.0.0",
    "basePackage": "src",
    "tags": [
      "lms",
      "exam",
      "billing"
    ]
  },
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 2 — ENVIRONMENTS
     Named deployment targets. The active one is used unless a scenario
     overrides it. Variables here are accessible via {{env.KEY}} in steps.
  ──────────────────────────────────────────────────────────────────────────── */
  "environments": [
    {
      "name": "local",
      "baseUrl": "http://localhost:4000",
      "active": true,
      "variables": {
        "TIMEOUT_MS": 5000,
        "SLOW_THRESHOLD_MS": 1000,
        "DB_SEED": true
      }
    },
    {
      "name": "staging",
      "baseUrl": "https://staging.api.yourdomain.com",
      "active": false,
      "variables": {
        "TIMEOUT_MS": 8000,
        "SLOW_THRESHOLD_MS": 2000,
        "DB_SEED": false
      }
    },
    {
      "name": "production",
      "baseUrl": "https://api.yourdomain.com",
      "active": false,
      "variables": {
        "TIMEOUT_MS": 10000,
        "SLOW_THRESHOLD_MS": 3000,
        "DB_SEED": false
      }
    }
  ],
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 3 — GLOBAL SETTINGS
     Runtime-wide defaults. Override per-scenario or per-step.
  ──────────────────────────────────────────────────────────────────────────── */
  "settings": {
    "timeout": "{{env.TIMEOUT_MS}}",
    "retries": 2,
    "retryDelay": 500,
    "followRedirects": true,
    "verifySsl": false,
    "logLevel": "info",
    "outputDir": "./jetic-output",
    "reportFormat": [
      "json",
      "html",
      "csv"
    ],
    "stopOnFirstFailure": false,
    "parallelism": 10,
    "cookies": {
      "enabled": true,
      "jar": "shared"
    },
    "hooks": {
      "beforeAll": "setup-database",
      "afterAll": "teardown-database",
      "beforeEach": null,
      "afterEach": null
    }
  },
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 4 — SECURITY SCHEMES
     Named auth strategies. Endpoints reference these by key.
     The runtime resolves auth headers/cookies automatically per step.
  ──────────────────────────────────────────────────────────────────────────── */
  "securitySchemes": {
    "bearerAuth": {
      "type": "http",
      "scheme": "bearer",
      "bearerFormat": "JWT",
      "in": "header",
      "headerName": "Authorization",
      "prefix": "Bearer ",
      "tokenVar": "accessToken"
    },
    "refreshAuth": {
      "type": "http",
      "scheme": "bearer",
      "bearerFormat": "JWT",
      "in": "header",
      "headerName": "Authorization",
      "prefix": "Bearer ",
      "tokenVar": "refreshToken"
    },
    "apiKey": {
      "type": "apiKey",
      "in": "header",
      "headerName": "X-API-Key",
      "keyVar": "API_KEY"
    },
    "hmacWebhook": {
      "type": "hmac",
      "algorithm": "sha256",
      "headerName": "x-paystack-signature",
      "secretVar": "WEBHOOK_SECRET",
      "signTarget": "body"
    },
    "basicAuth": {
      "type": "http",
      "scheme": "basic",
      "usernameVar": "BASIC_USER",
      "passwordVar": "BASIC_PASS"
    },
    "oauth2": {
      "type": "oauth2",
      "flow": "clientCredentials",
      "tokenUrl": "/oauth/token",
      "scopes": [
        "read",
        "write"
      ],
      "clientIdVar": "OAUTH_CLIENT_ID",
      "clientSecretVar": "OAUTH_CLIENT_SECRET"
    },
    "cookieSession": {
      "type": "cookie",
      "cookieName": "session",
      "cookieVar": "sessionCookie"
    }
  },
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 5 — MODELS
     Shared data type definitions. Used for request validation, response
     schema assertions, and data generator shapes. Reference with $ref.
  ──────────────────────────────────────────────────────────────────────────── */
  "models": {
    "User": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "user_name": {
          "type": "string",
          "minLength": 2
        },
        "user_email": {
          "type": "string",
          "format": "email"
        },
        "role": {
          "type": "string",
          "enum": [
            "admin",
            "teacher",
            "student"
          ]
        },
        "workspaceId": {
          "type": "string",
          "format": "uuid"
        },
        "active": {
          "type": "boolean"
        },
        "createdAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [
        "id",
        "user_name",
        "user_email",
        "role"
      ]
    },
    "Workspace": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "ownerId": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "id",
        "name"
      ]
    },
    "Exam": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "exam_name": {
          "type": "string"
        },
        "minutes": {
          "type": "integer",
          "minimum": 1
        },
        "classId": {
          "type": "string",
          "format": "uuid"
        },
        "visible": {
          "type": "boolean"
        }
      },
      "required": [
        "id",
        "exam_name",
        "minutes"
      ]
    },
    "Subscription": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "plan": {
          "type": "string",
          "enum": [
            "free",
            "starter",
            "pro",
            "enterprise"
          ]
        },
        "active": {
          "type": "boolean"
        }
      }
    },
    "TokenPair": {
      "type": "object",
      "properties": {
        "accessToken": {
          "type": "string"
        },
        "refreshToken": {
          "type": "string"
        }
      },
      "required": [
        "accessToken",
        "refreshToken"
      ]
    },
    "PaginatedMeta": {
      "type": "object",
      "properties": {
        "total": {
          "type": "number"
        },
        "page": {
          "type": "number"
        },
        "limit": {
          "type": "number"
        }
      }
    },
    "ApiResponse": {
      "type": "object",
      "properties": {
        "success": {
          "type": "boolean"
        },
        "message": {
          "type": "string"
        },
        "data": {}
      },
      "required": [
        "success"
      ]
    }
  },
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 6 — ENDPOINTS
     Complete API contract. Every field the runtime needs to build real requests
     and validate real responses — no guessing at runtime.
  ──────────────────────────────────────────────────────────────────────────── */
  "endpoints": [
    /* ── AUTH ────────────────────────────────────────────────────────────── */
    {
      "id": "auth.register",
      "method": "POST",
      "path": "/api/auth/register",
      "tags": [
        "auth"
      ],
      "summary": "Register a new user with an invite token",
      "handlerName": "AuthController.register",
      "security": [],
      "rateLimit": {
        "requests": 10,
        "window": "1m",
        "scope": "ip"
      },
      "idempotent": false,
      "deprecated": false,
      "middleware": [],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "user_name": {
            "type": "string",
            "required": true,
            "minLength": 2,
            "maxLength": 100
          },
          "user_email": {
            "type": "string",
            "required": true,
            "format": "email"
          },
          "user_password": {
            "type": "string",
            "required": true,
            "minLength": 8,
            "sensitive": true
          },
          "inviteToken": {
            "type": "string",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            },
            "data.user": {
              "$ref": "#/models/User"
            },
            "data.accessToken": {
              "type": "string"
            },
            "data.refreshToken": {
              "type": "string"
            }
          }
        },
        "400": {
          "description": "Validation error or email already exists"
        },
        "401": {
          "description": "Invalid or expired invite token"
        }
      },
      "timing": {
        "expectedMs": 300,
        "timeoutMs": 5000
      }
    },
    {
      "id": "auth.login",
      "method": "POST",
      "path": "/api/auth/login",
      "tags": [
        "auth"
      ],
      "summary": "Authenticate a user and return access + refresh tokens",
      "handlerName": "AuthController.login",
      "security": [],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "user_email": {
            "type": "string",
            "required": true,
            "format": "email"
          },
          "user_password": {
            "type": "string",
            "required": true,
            "sensitive": true
          },
          "deviceId": {
            "type": "string",
            "required": false
          },
          "deviceName": {
            "type": "string",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "user.user_name": {
              "type": "string"
            },
            "user.user_email": {
              "type": "string"
            },
            "user.role": {
              "type": "string"
            },
            "data.accessToken": {
              "type": "string"
            },
            "data.refreshToken": {
              "type": "string"
            }
          }
        },
        "401": {
          "description": "Invalid credentials"
        },
        "429": {
          "description": "Too many attempts"
        }
      },
      "timing": {
        "expectedMs": 200,
        "timeoutMs": 5000
      }
    },
    {
      "id": "auth.logout",
      "method": "POST",
      "path": "/api/auth/logout",
      "tags": [
        "auth"
      ],
      "summary": "Invalidate the current session token",
      "handlerName": "AuthController.logout",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        },
        "401": {
          "description": "Missing or invalid token"
        }
      },
      "timing": {
        "expectedMs": 100,
        "timeoutMs": 3000
      }
    },
    {
      "id": "auth.verifyToken",
      "method": "GET",
      "path": "/api/auth/verify-token",
      "tags": [
        "auth"
      ],
      "summary": "Verify the current access token and return user info",
      "handlerName": "AuthController.verifyToken",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            },
            "data.user.user_email": {
              "type": "string"
            },
            "data.user.hasSubscription": {
              "type": "boolean"
            }
          }
        },
        "401": {
          "description": "Token invalid or expired"
        }
      }
    },
    {
      "id": "auth.refresh",
      "method": "POST",
      "path": "/api/auth/refresh",
      "tags": [
        "auth"
      ],
      "summary": "Exchange a refresh token for a new access token",
      "handlerName": "AuthController.refresh",
      "security": [
        "refreshAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "refreshToken": {
            "type": "string",
            "required": true,
            "sensitive": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            },
            "data.accessToken": {
              "type": "string"
            }
          }
        },
        "401": {
          "description": "Refresh token invalid or expired"
        }
      }
    },
    {
      "id": "auth.completeRegistration",
      "method": "POST",
      "path": "/api/auth/complete-registration",
      "tags": [
        "auth"
      ],
      "summary": "Complete registration via email link (token in query or body)",
      "handlerName": "AuthController.completeRegistration",
      "security": [],
      "idempotent": false,
      "parameters": [
        {
          "name": "token",
          "in": "query",
          "type": "string",
          "required": false
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {
          "token": {
            "type": "string"
          },
          "user_name": {
            "type": "string"
          },
          "password": {
            "type": "string",
            "sensitive": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            },
            "data.accessToken": {
              "type": "string"
            },
            "data.refreshToken": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "id": "auth.exchange",
      "method": "POST",
      "path": "/api/auth/exchange",
      "tags": [
        "auth"
      ],
      "summary": "Exchange a short-lived desktop code for long-lived device tokens",
      "handlerName": "AuthController.exchange",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "code": {
            "type": "string",
            "required": true
          },
          "deviceName": {
            "type": "string",
            "required": false
          },
          "deviceId": {
            "type": "string",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data.accessToken": {
              "type": "string"
            },
            "data.refreshToken": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "id": "auth.getDesktopCode",
      "method": "GET",
      "path": "/api/auth/desktop-code",
      "tags": [
        "auth"
      ],
      "summary": "Generate a short-lived desktop auth code",
      "handlerName": "AuthController.getDesktopCode",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "parameters": [
        {
          "name": "deviceName",
          "in": "query",
          "type": "string",
          "required": false
        },
        {
          "name": "deviceId",
          "in": "query",
          "type": "string",
          "required": false
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data.code": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "id": "auth.getSessions",
      "method": "GET",
      "path": "/api/auth/sessions",
      "tags": [
        "auth"
      ],
      "summary": "List all active sessions for the current user",
      "handlerName": "AuthController.getUserSessions",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    {
      "id": "auth.revokeSession",
      "method": "DELETE",
      "path": "/api/auth/sessions/:id",
      "tags": [
        "auth"
      ],
      "summary": "Revoke a specific session by session ID",
      "handlerName": "AuthController.revokeSession",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    /* ── WORKSPACE ───────────────────────────────────────────────────────── */
    {
      "id": "workspace.setup",
      "method": "POST",
      "path": "/api/workspaces/setup",
      "tags": [
        "workspace"
      ],
      "summary": "Bootstrap a brand-new workspace with an admin account",
      "handlerName": "WorkspaceController.setup",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "workspace_name": {
            "type": "string",
            "required": true
          },
          "admin_name": {
            "type": "string",
            "required": true
          },
          "admin_email": {
            "type": "string",
            "required": true,
            "format": "email"
          },
          "admin_password": {
            "type": "string",
            "required": true,
            "sensitive": true,
            "minLength": 8
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "workspace.id": {
              "type": "string",
              "format": "uuid"
            },
            "admin.user_name": {
              "type": "string"
            },
            "admin.user_email": {
              "type": "string"
            },
            "admin.role": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "id": "workspace.create",
      "method": "POST",
      "path": "/api/workspaces",
      "tags": [
        "workspace"
      ],
      "summary": "Create a new workspace",
      "handlerName": "WorkspaceController.create",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "name": {
            "type": "string",
            "required": true
          },
          "description": {
            "type": "string",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "$ref": "#/models/Workspace"
            },
            "success": {
              "type": "boolean"
            }
          }
        }
      }
    },
    {
      "id": "workspace.getAll",
      "method": "GET",
      "path": "/api/workspaces",
      "tags": [
        "workspace"
      ],
      "summary": "List all workspaces accessible to the current user",
      "handlerName": "WorkspaceController.getAll",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    {
      "id": "workspace.getById",
      "method": "GET",
      "path": "/api/workspaces/:id",
      "tags": [
        "workspace"
      ],
      "summary": "Fetch a single workspace by ID",
      "handlerName": "WorkspaceController.getById",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/Workspace"
            }
          }
        },
        "404": {
          "description": "Workspace not found"
        }
      }
    },
    {
      "id": "workspace.update",
      "method": "PUT",
      "path": "/api/workspaces/:id",
      "tags": [
        "workspace"
      ],
      "summary": "Update workspace name or description",
      "handlerName": "WorkspaceController.update",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "name": {
            "type": "string",
            "required": false
          },
          "description": {
            "type": "string",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "$ref": "#/models/Workspace"
            }
          }
        }
      }
    },
    {
      "id": "workspace.delete",
      "method": "DELETE",
      "path": "/api/workspaces/:id",
      "tags": [
        "workspace"
      ],
      "summary": "Permanently delete a workspace",
      "handlerName": "WorkspaceController.delete",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {
          "id": {
            "type": "string",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "id": "workspace.getAuditLogs",
      "method": "GET",
      "path": "/api/workspaces/audit-logs",
      "tags": [
        "workspace"
      ],
      "summary": "Retrieve filtered audit log entries for the workspace",
      "handlerName": "WorkspaceController.getAuditLogs",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "role",
          "in": "query",
          "type": "string",
          "required": false
        },
        {
          "name": "action",
          "in": "query",
          "type": "string",
          "required": false
        },
        {
          "name": "timeRange",
          "in": "query",
          "type": "string",
          "required": false,
          "enum": [
            "1h",
            "24h",
            "7d",
            "30d"
          ]
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    {
      "id": "workspace.createStudent",
      "method": "POST",
      "path": "/api/workspaces/:id/students",
      "tags": [
        "workspace",
        "users"
      ],
      "summary": "Directly add a student account to a workspace (no invite)",
      "handlerName": "WorkspaceController.createStudent",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "user_name": {
            "type": "string",
            "required": true
          },
          "user_email": {
            "type": "string",
            "required": true,
            "format": "email"
          },
          "user_password": {
            "type": "string",
            "required": false,
            "sensitive": true
          },
          "classId": {
            "type": "string",
            "required": true
          },
          "active": {
            "type": "boolean",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/User"
            }
          }
        }
      }
    },
    {
      "id": "workspace.createTeacher",
      "method": "POST",
      "path": "/api/workspaces/:id/teachers",
      "tags": [
        "workspace",
        "users"
      ],
      "summary": "Add a teacher account to a workspace",
      "handlerName": "WorkspaceController.createTeacher",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "teacher_name": {
            "type": "string",
            "required": true
          },
          "user_email": {
            "type": "string",
            "required": true,
            "format": "email"
          },
          "user_password": {
            "type": "string",
            "required": true,
            "sensitive": true
          },
          "classId": {
            "type": "string",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "teacher": {
              "$ref": "#/models/User"
            }
          }
        }
      }
    },
    {
      "id": "workspace.getUsage",
      "method": "GET",
      "path": "/api/workspaces/:id/usage",
      "tags": [
        "workspace"
      ],
      "handlerName": "WorkspaceController.getUsage",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "workspace.incrementAiUsage",
      "method": "POST",
      "path": "/api/workspaces/:id/usage/ai",
      "tags": [
        "workspace"
      ],
      "handlerName": "WorkspaceController.incrementAiUsage",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "amount": {
            "type": "number",
            "required": true,
            "minimum": 1
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "workspace.getUserAssignments",
      "method": "GET",
      "path": "/api/workspaces/:id/users/:userId/assignments",
      "tags": [
        "workspace"
      ],
      "handlerName": "WorkspaceController.getUserAssignments",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        },
        {
          "name": "userId",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    {
      "id": "workspace.addUserAssignment",
      "method": "POST",
      "path": "/api/workspaces/:id/users/:userId/assignments",
      "tags": [
        "workspace"
      ],
      "handlerName": "WorkspaceController.addUserAssignment",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        },
        {
          "name": "userId",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "assignment": {
            "type": "object",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "assignment": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "workspace.removeUserAssignment",
      "method": "DELETE",
      "path": "/api/workspaces/:id/users/:userId/assignments/:assignmentId",
      "tags": [
        "workspace"
      ],
      "handlerName": "WorkspaceController.removeUserAssignment",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        },
        {
          "name": "userId",
          "in": "path",
          "type": "string",
          "required": true
        },
        {
          "name": "assignmentId",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    /* ── BILLING ─────────────────────────────────────────────────────────── */
    {
      "id": "billing.initialize",
      "method": "POST",
      "path": "/api/billing/initialize",
      "tags": [
        "billing"
      ],
      "summary": "Initialize a Paystack payment transaction",
      "handlerName": "BillingController.initializeTransaction",
      "security": [],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "workspaceId": {
            "type": "string",
            "required": true
          },
          "plan": {
            "type": "string",
            "required": true,
            "enum": [
              "starter",
              "pro",
              "enterprise"
            ]
          },
          "amount": {
            "type": "number",
            "required": true,
            "minimum": 0
          },
          "email": {
            "type": "string",
            "required": true,
            "format": "email"
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            },
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "billing.webhook",
      "method": "POST",
      "path": "/api/billing/webhook",
      "tags": [
        "billing"
      ],
      "summary": "Paystack webhook receiver — validates HMAC signature",
      "handlerName": "BillingController.handleWebhook",
      "security": [
        "hmacWebhook"
      ],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "event": {
            "type": "object",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "id": "billing.verifyTransaction",
      "method": "GET",
      "path": "/api/billing/verify/:reference",
      "tags": [
        "billing"
      ],
      "summary": "Verify payment status by Paystack reference",
      "handlerName": "BillingController.verifyTransaction",
      "security": [],
      "idempotent": true,
      "parameters": [
        {
          "name": "reference",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data.status": {
              "type": "string"
            },
            "data.plan": {
              "type": "string"
            },
            "data.isPaid": {
              "type": "boolean"
            },
            "data.subscriptionActive": {
              "type": "boolean"
            }
          }
        }
      }
    },
    {
      "id": "billing.getSubscription",
      "method": "GET",
      "path": "/api/billing/subscription/:workspaceId",
      "tags": [
        "billing"
      ],
      "summary": "Get the active subscription for a workspace",
      "handlerName": "BillingController.getSubscription",
      "security": [],
      "idempotent": true,
      "parameters": [
        {
          "name": "workspaceId",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/Subscription"
            }
          }
        }
      }
    },
    {
      "id": "billing.getTransactions",
      "method": "GET",
      "path": "/api/billing/transactions/:workspaceId",
      "tags": [
        "billing"
      ],
      "summary": "Get transaction history for a workspace",
      "handlerName": "BillingController.getTransactions",
      "security": [],
      "idempotent": true,
      "parameters": [
        {
          "name": "workspaceId",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    /* ── USERS ───────────────────────────────────────────────────────────── */
    {
      "id": "user.getProfile",
      "method": "GET",
      "path": "/api/users/profile",
      "tags": [
        "users"
      ],
      "handlerName": "UserController.getProfile",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/User"
            }
          }
        }
      }
    },
    {
      "id": "user.getAll",
      "method": "GET",
      "path": "/api/users",
      "tags": [
        "users"
      ],
      "handlerName": "UserController.getAll",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "type": "number",
          "required": false
        },
        {
          "name": "limit",
          "in": "query",
          "type": "number",
          "required": false
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            },
            "meta.total": {
              "type": "number"
            },
            "meta.page": {
              "type": "number"
            },
            "meta.limit": {
              "type": "number"
            }
          }
        }
      }
    },
    {
      "id": "user.getById",
      "method": "GET",
      "path": "/api/users/:id",
      "tags": [
        "users"
      ],
      "handlerName": "UserController.getById",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "$ref": "#/models/User"
            }
          }
        },
        "404": {
          "description": "User not found"
        }
      }
    },
    {
      "id": "user.update",
      "method": "PUT",
      "path": "/api/users/:id",
      "tags": [
        "users"
      ],
      "handlerName": "UserController.update",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "id": {
            "type": "string",
            "required": true
          },
          "body": {
            "type": "object",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/User"
            }
          }
        }
      }
    },
    {
      "id": "user.delete",
      "method": "DELETE",
      "path": "/api/users/:id",
      "tags": [
        "users"
      ],
      "handlerName": "UserController.delete",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    {
      "id": "user.changePassword",
      "method": "PUT",
      "path": "/api/users/profile/change-password",
      "tags": [
        "users"
      ],
      "handlerName": "UserController.changePassword",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "currentPassword": {
            "type": "string",
            "required": true,
            "sensitive": true
          },
          "newPassword": {
            "type": "string",
            "required": true,
            "sensitive": true
          },
          "signOutOthers": {
            "type": "boolean",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    /* ── CLASSES ─────────────────────────────────────────────────────────── */
    {
      "id": "class.create",
      "method": "POST",
      "path": "/api/classes",
      "tags": [
        "classes"
      ],
      "handlerName": "ClassController.create",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "name": {
            "type": "string",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "type": "object"
            },
            "success": {
              "type": "boolean"
            }
          }
        }
      }
    },
    {
      "id": "class.getAll",
      "method": "GET",
      "path": "/api/classes",
      "tags": [
        "classes"
      ],
      "handlerName": "ClassController.getAll",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    {
      "id": "class.getById",
      "method": "GET",
      "path": "/api/classes/:id",
      "tags": [
        "classes"
      ],
      "handlerName": "ClassController.getById",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "class.update",
      "method": "PUT",
      "path": "/api/classes/:id",
      "tags": [
        "classes"
      ],
      "handlerName": "ClassController.update",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "name": {
            "type": "string"
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "class.delete",
      "method": "DELETE",
      "path": "/api/classes/:id",
      "tags": [
        "classes"
      ],
      "handlerName": "ClassController.delete",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    /* ── EXAMS ───────────────────────────────────────────────────────────── */
    {
      "id": "exam.create",
      "method": "POST",
      "path": "/api/exams",
      "tags": [
        "exams"
      ],
      "handlerName": "ExamController.create",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "exam_name": {
            "type": "string",
            "required": true
          },
          "minutes": {
            "type": "integer",
            "required": true,
            "minimum": 1
          },
          "workspaceId": {
            "type": "string",
            "required": true
          },
          "classId": {
            "type": "string",
            "required": true
          },
          "visible": {
            "type": "boolean",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/Exam"
            }
          }
        }
      }
    },
    {
      "id": "exam.getAll",
      "method": "GET",
      "path": "/api/exams",
      "tags": [
        "exams"
      ],
      "handlerName": "ExamController.getAll",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "classId",
          "in": "query",
          "type": "string",
          "required": false
        },
        {
          "name": "workspaceId",
          "in": "query",
          "type": "string",
          "required": false
        },
        {
          "name": "visible",
          "in": "query",
          "type": "boolean",
          "required": false
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "type": "array"
            },
            "success": {
              "type": "boolean"
            }
          }
        }
      }
    },
    {
      "id": "exam.getById",
      "method": "GET",
      "path": "/api/exams/:id",
      "tags": [
        "exams"
      ],
      "handlerName": "ExamController.getById",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/Exam"
            }
          }
        }
      }
    },
    {
      "id": "exam.update",
      "method": "PUT",
      "path": "/api/exams/:id",
      "tags": [
        "exams"
      ],
      "handlerName": "ExamController.update",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {
          "exam_name": {
            "type": "string",
            "required": false
          },
          "minutes": {
            "type": "number",
            "required": false
          },
          "workspaceId": {
            "type": "string",
            "required": false
          },
          "classId": {
            "type": "string",
            "required": false
          },
          "visible": {
            "type": "boolean",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "$ref": "#/models/Exam"
            }
          }
        }
      }
    },
    {
      "id": "exam.delete",
      "method": "DELETE",
      "path": "/api/exams/:id",
      "tags": [
        "exams"
      ],
      "handlerName": "ExamController.delete",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    /* ── QUESTIONS ───────────────────────────────────────────────────────── */
    {
      "id": "question.create",
      "method": "POST",
      "path": "/api/questions",
      "tags": [
        "questions"
      ],
      "handlerName": "QuestionController.create",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "body": {
            "type": "object",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "question.getAll",
      "method": "GET",
      "path": "/api/questions",
      "tags": [
        "questions"
      ],
      "handlerName": "QuestionController.getAll",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "page",
          "in": "query",
          "type": "number",
          "required": false
        },
        {
          "name": "limit",
          "in": "query",
          "type": "number",
          "required": false
        },
        {
          "name": "examId",
          "in": "query",
          "type": "string",
          "required": false
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            },
            "meta": {
              "$ref": "#/models/PaginatedMeta"
            }
          }
        }
      }
    },
    {
      "id": "question.delete",
      "method": "DELETE",
      "path": "/api/questions/:id",
      "tags": [
        "questions"
      ],
      "handlerName": "QuestionController.delete",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "message": {
              "type": "string"
            }
          }
        }
      }
    },
    /* ── RESULTS ─────────────────────────────────────────────────────────── */
    {
      "id": "result.create",
      "method": "POST",
      "path": "/api/results",
      "tags": [
        "results"
      ],
      "handlerName": "ResultController.create",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "questionAttempts": {
            "type": "array",
            "required": true
          },
          "userId": {
            "type": "string",
            "required": true
          },
          "examId": {
            "type": "string",
            "required": true
          },
          "attempted_questions": {
            "type": "number",
            "required": false
          },
          "total_questions": {
            "type": "number",
            "required": false
          },
          "createdAt": {
            "type": "string",
            "required": false,
            "format": "date-time"
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "result.getByUser",
      "method": "GET",
      "path": "/api/results/user/:userId",
      "tags": [
        "results"
      ],
      "handlerName": "ResultController.getByUser",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "userId",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    /* ── INVITES ─────────────────────────────────────────────────────────── */
    {
      "id": "invite.create",
      "method": "POST",
      "path": "/api/invites",
      "tags": [
        "invites"
      ],
      "handlerName": "InviteController.create",
      "security": [
        "bearerAuth"
      ],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "email": {
            "type": "string",
            "required": true,
            "format": "email"
          },
          "workspaceId": {
            "type": "string",
            "required": true
          },
          "role": {
            "type": "string",
            "required": true,
            "enum": [
              "admin",
              "teacher",
              "student"
            ]
          },
          "classId": {
            "type": "string",
            "required": false
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    {
      "id": "invite.list",
      "method": "GET",
      "path": "/api/invites",
      "tags": [
        "invites"
      ],
      "handlerName": "InviteController.list",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "data": {
              "type": "array"
            }
          }
        }
      }
    },
    {
      "id": "invite.revoke",
      "method": "DELETE",
      "path": "/api/invites/:id",
      "tags": [
        "invites"
      ],
      "handlerName": "InviteController.revoke",
      "security": [
        "bearerAuth"
      ],
      "idempotent": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "type": "string",
          "required": true
        }
      ],
      "requestBody": {
        "contentType": "application/json",
        "required": false,
        "fields": {}
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "success": {
              "type": "boolean"
            },
            "data": {
              "type": "object"
            }
          }
        }
      }
    },
    /* ── LICENSE ─────────────────────────────────────────────────────────── */
    {
      "id": "license.verify",
      "method": "POST",
      "path": "/api/license/verify",
      "tags": [
        "license"
      ],
      "handlerName": "LicenseController.verify",
      "security": [],
      "idempotent": true,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "licenseKey": {
            "type": "string",
            "required": true
          },
          "deviceId": {
            "type": "string",
            "required": true
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "message": {
              "type": "string"
            },
            "valid": {
              "type": "boolean"
            },
            "workspace": {
              "type": "object"
            },
            "maxStudents": {
              "type": "number"
            }
          }
        }
      }
    },
    /* ── DEPLOYMENTS ─────────────────────────────────────────────────────── */
    {
      "id": "deployment.create",
      "method": "POST",
      "path": "/api/deployments",
      "tags": [
        "deployments"
      ],
      "handlerName": "DeploymentController.create",
      "security": [],
      "idempotent": false,
      "requestBody": {
        "contentType": "application/json",
        "required": true,
        "fields": {
          "workspaceId": {
            "type": "string"
          },
          "name": {
            "type": "string"
          }
        }
      },
      "responses": {
        "200": {
          "contentType": "application/json",
          "schema": {
            "deployment": {
              "type": "object"
            }
          }
        }
      }
    }
  ],
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 7 — DATA GENERATORS
     Named factories for synthetic test data. Referenced in workflow steps
     via {{gen.factoryName.fieldName}} or as a block with "generator" key.

     Generator types:
       faker     — uses Faker.js methods (internet.email, name.fullName, etc.)
       template  — string with {{index}} / {{vuId}} / {{timestamp}} tokens
       sequence  — auto-incrementing integer (per-VU or global)
       random    — random number in range
       uuid      — random UUID v4
       pick      — random element from enum list
       file      — load CSV/JSON and iterate rows
       static    — fixed value (same for every VU)
       hash      — hash another field (useful for passwords in fixtures)
       computed  — JS expression (safe subset, no eval; just math + string ops)
  ──────────────────────────────────────────────────────────────────────────── */
  "generators": {
    "studentUser": {
      "$comment": "Generates a unique student account per virtual user",
      "user_name": {
        "type": "template",
        "value": "student_{{vuId}}_{{index}}"
      },
      "user_email": {
        "type": "template",
        "value": "student{{vuId}}{{index}}@testmail.local"
      },
      "user_password": {
        "type": "static",
        "value": "Test@12345"
      },
      "role": {
        "type": "static",
        "value": "student"
      }
    },
    "teacherUser": {
      "user_name": {
        "type": "template",
        "value": "teacher_{{vuId}}"
      },
      "user_email": {
        "type": "template",
        "value": "teacher{{vuId}}@testmail.local"
      },
      "user_password": {
        "type": "static",
        "value": "Teacher@99"
      },
      "role": {
        "type": "static",
        "value": "teacher"
      }
    },
    "adminUser": {
      "user_name": {
        "type": "static",
        "value": "SuperAdmin"
      },
      "user_email": {
        "type": "static",
        "value": "admin@testdomain.local"
      },
      "user_password": {
        "type": "static",
        "value": "Admin@Secret1"
      },
      "role": {
        "type": "static",
        "value": "admin"
      }
    },
    "realisticUser": {
      "$comment": "Faker-powered realistic user data — good for end-to-end demos",
      "user_name": {
        "type": "faker",
        "method": "internet.userName"
      },
      "user_email": {
        "type": "faker",
        "method": "internet.email"
      },
      "user_password": {
        "type": "static",
        "value": "TestPass@9000"
      },
      "first_name": {
        "type": "faker",
        "method": "person.firstName"
      },
      "last_name": {
        "type": "faker",
        "method": "person.lastName"
      }
    },
    "workspace": {
      "name": {
        "type": "template",
        "value": "Workspace_{{vuId}}_{{timestamp}}"
      },
      "description": {
        "type": "faker",
        "method": "lorem.sentence"
      }
    },
    "exam": {
      "exam_name": {
        "type": "template",
        "value": "Exam_{{index}}_{{timestamp}}"
      },
      "minutes": {
        "type": "random",
        "min": 30,
        "max": 120
      },
      "visible": {
        "type": "pick",
        "from": [
          true,
          false
        ]
      }
    },
    "multipleChoiceQuestion": {
      "body": {
        "type": "static",
        "value": {
          "text": "What is 2 + 2?",
          "type": "multiple_choice",
          "options": [
            "2",
            "3",
            "4",
            "5"
          ],
          "answer": "4",
          "points": 1
        }
      }
    },
    "paystackWebhookPayload": {
      "$comment": "Simulates a Paystack charge.success event",
      "event": {
        "type": "static",
        "value": {
          "event": "charge.success",
          "data": {
            "reference": "TEST_REF_{{timestamp}}",
            "status": "success",
            "amount": 500000,
            "currency": "NGN"
          }
        }
      }
    },
    "bulkStudentCsv": {
      "$comment": "Load from CSV — each row becomes one VU's dataset",
      "type": "file",
      "path": "./fixtures/students.csv",
      "format": "csv",
      "fields": {
        "user_name": "name_column",
        "user_email": "email_column",
        "user_password": "password_column"
      }
    }
  },
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 8 — GLOBAL VARIABLES
     Seeded before any workflow runs. Available as {{vars.KEY}}.
     Workflows can read and write these. Scoped versions exist per VU.
  ──────────────────────────────────────────────────────────────────────────── */
  "variables": {
    "adminEmail": "admin@testdomain.local",
    "adminPassword": "Admin@Secret1",
    "defaultWorkspace": null,
    "defaultClassId": null,
    "defaultExamId": null,
    "paystackWebhookSecret": "whsec_test_secret"
  },
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 9 — WORKFLOWS
     Reusable step sequences. Think of these as named "functions".
     Scenarios call workflows (with concurrency settings) to build scenarios.

     Step types:
       request   — HTTP call
       assign    — set a variable
       assert    — standalone assertion (no HTTP call)
       wait      — sleep N ms
       loop      — repeat child steps N times
       foreach   — iterate over an array variable
       parallel  — run child steps concurrently
       condition — if/else branching
       group     — logical grouping (no runtime effect, for readability)

     Variable interpolation tokens:
       {{vars.KEY}}                — global or workflow-local variable
       {{env.KEY}}                 — environment variable
       {{gen.factoryName.field}}   — generate data from a generator
       {{step.STEP_ID.body.PATH}}  — extracted field from a prior response
       {{step.STEP_ID.status}}     — HTTP status of a prior step
       {{index}}                   — current loop iteration index (0-based)
       {{vuId}}                    — virtual user ID (number, unique per VU)
       {{timestamp}}               — Unix timestamp ms at the time of evaluation
       {{uuid}}                    — fresh UUID v4
  ──────────────────────────────────────────────────────────────────────────── */
  "workflows": [
    /* ────────────────────────────────────────────────────────────────────
       WF-001  Admin Login → Verify → Logout
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-admin-login-logout",
      "name": "Admin — Login and Logout",
      "description": "Log in as admin, verify the token, then log out cleanly",
      "tags": [
        "auth",
        "admin",
        "smoke"
      ],
      "steps": [
        {
          "id": "login",
          "name": "POST /api/auth/login",
          "type": "request",
          "endpointId": "auth.login",
          "request": {
            "body": {
              "user_email": "{{vars.adminEmail}}",
              "user_password": "{{vars.adminPassword}}"
            }
          },
          "extract": {
            "accessToken": {
              "from": "body",
              "path": "data.accessToken"
            },
            "refreshToken": {
              "from": "body",
              "path": "data.refreshToken"
            },
            "userRole": {
              "from": "body",
              "path": "user.role"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.accessToken",
              "op": "exists"
            },
            {
              "path": "body.user.role",
              "op": "eq",
              "value": "admin"
            },
            {
              "path": "timing.ms",
              "op": "lt",
              "value": 1000
            }
          ]
        },
        {
          "id": "verify",
          "name": "GET /api/auth/verify-token",
          "type": "request",
          "endpointId": "auth.verifyToken",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            },
            {
              "path": "body.data.user.user_email",
              "op": "eq",
              "value": "{{vars.adminEmail}}"
            }
          ]
        },
        {
          "id": "logout",
          "name": "POST /api/auth/logout",
          "type": "request",
          "endpointId": "auth.logout",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            }
          ]
        }
      ]
    },
    /* ────────────────────────────────────────────────────────────────────
       WF-002  Full Admin Journey: Setup → Class → Exam → Questions → Teardown
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-admin-full-journey",
      "name": "Admin — Full Setup Journey",
      "description": "Admin logs in, creates a class, creates an exam with 3 questions, then cleans up",
      "tags": [
        "admin",
        "e2e",
        "regression"
      ],
      "steps": [
        {
          "id": "login",
          "type": "request",
          "endpointId": "auth.login",
          "request": {
            "body": {
              "user_email": "{{vars.adminEmail}}",
              "user_password": "{{vars.adminPassword}}"
            }
          },
          "extract": {
            "accessToken": {
              "from": "body",
              "path": "data.accessToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "createClass",
          "type": "request",
          "endpointId": "class.create",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            },
            "body": {
              "name": "Class_{{vuId}}_{{timestamp}}"
            }
          },
          "extract": {
            "classId": {
              "from": "body",
              "path": "data.id"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            },
            {
              "path": "body.data.id",
              "op": "exists"
            }
          ]
        },
        {
          "id": "createExam",
          "type": "request",
          "endpointId": "exam.create",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            },
            "body": {
              "exam_name": "{{gen.exam.exam_name}}",
              "minutes": 60,
              "workspaceId": "{{vars.defaultWorkspace}}",
              "classId": "{{step.createClass.body.data.id}}",
              "visible": false
            }
          },
          "extract": {
            "examId": {
              "from": "body",
              "path": "data.id"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.id",
              "op": "exists"
            }
          ]
        },
        {
          "id": "addQuestions",
          "type": "loop",
          "count": 3,
          "steps": [
            {
              "id": "createQuestion",
              "type": "request",
              "endpointId": "question.create",
              "request": {
                "headers": {
                  "Authorization": "Bearer {{step.login.body.data.accessToken}}"
                },
                "body": {
                  "body": {
                    "text": "Question {{index}}: What is {{index}} + {{index}}?",
                    "type": "multiple_choice",
                    "options": [
                      "{{index}}",
                      "{{index + 1}}",
                      "{{index * 2}}",
                      "None"
                    ],
                    "answer": "{{index * 2}}",
                    "examId": "{{step.createExam.body.data.id}}"
                  }
                }
              },
              "assert": [
                {
                  "path": "status",
                  "op": "eq",
                  "value": 200
                }
              ]
            }
          ]
        },
        {
          "id": "verifyExamHasQuestions",
          "type": "request",
          "endpointId": "question.getAll",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            },
            "params": {
              "examId": "{{step.createExam.body.data.id}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.length",
              "op": "gte",
              "value": 3
            }
          ]
        },
        {
          "id": "deleteExam",
          "type": "request",
          "endpointId": "exam.delete",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            },
            "pathParams": {
              "id": "{{step.createExam.body.data.id}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "deleteClass",
          "type": "request",
          "endpointId": "class.delete",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            },
            "pathParams": {
              "id": "{{step.createClass.body.data.id}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "logout",
          "type": "request",
          "endpointId": "auth.logout",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.accessToken}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        }
      ]
    },
    /* ────────────────────────────────────────────────────────────────────
       WF-003  Student: Register → Login → Take Exam → Submit Result → Logout
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-student-exam-flow",
      "name": "Student — Register, Login, Take Exam, Submit, Logout",
      "description": "Complete student journey from sign-up to result submission",
      "tags": [
        "student",
        "e2e"
      ],
      "steps": [
        {
          "id": "register",
          "type": "request",
          "endpointId": "auth.register",
          "request": {
            "body": {
              "user_name": "{{gen.studentUser.user_name}}",
              "user_email": "{{gen.studentUser.user_email}}",
              "user_password": "{{gen.studentUser.user_password}}",
              "inviteToken": "{{vars.inviteToken}}"
            }
          },
          "extract": {
            "accessToken": {
              "from": "body",
              "path": "data.accessToken"
            },
            "userId": {
              "from": "body",
              "path": "data.user.id"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.accessToken",
              "op": "exists"
            }
          ]
        },
        {
          "id": "fetchExam",
          "type": "request",
          "endpointId": "exam.getById",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.register.body.data.accessToken}}"
            },
            "pathParams": {
              "id": "{{vars.defaultExamId}}"
            }
          },
          "extract": {
            "examMinutes": {
              "from": "body",
              "path": "data.minutes"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            }
          ]
        },
        {
          "id": "submitResult",
          "type": "request",
          "endpointId": "result.create",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.register.body.data.accessToken}}"
            },
            "body": {
              "userId": "{{step.register.body.data.user.id}}",
              "examId": "{{vars.defaultExamId}}",
              "questionAttempts": [
                {
                  "questionId": "q1",
                  "answer": "4"
                }
              ],
              "attempted_questions": 1,
              "total_questions": 10
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            }
          ]
        },
        {
          "id": "logout",
          "type": "request",
          "endpointId": "auth.logout",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.register.body.data.accessToken}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        }
      ]
    },
    /* ────────────────────────────────────────────────────────────────────
       WF-004  Billing: Initialize Payment → Webhook → Verify → Get Subscription
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-billing-flow",
      "name": "Billing — Initialize, Webhook, Verify, Get Subscription",
      "tags": [
        "billing",
        "e2e"
      ],
      "steps": [
        {
          "id": "initPayment",
          "type": "request",
          "endpointId": "billing.initialize",
          "request": {
            "body": {
              "workspaceId": "{{vars.defaultWorkspace}}",
              "plan": "pro",
              "amount": 500000,
              "email": "{{vars.adminEmail}}"
            }
          },
          "extract": {
            "paystackRef": {
              "from": "body",
              "path": "data.reference"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            }
          ]
        },
        {
          "id": "simulateWebhook",
          "type": "request",
          "endpointId": "billing.webhook",
          "request": {
            "headers": {
              "x-paystack-signature": "{{hmac(vars.paystackWebhookSecret, body)}}"
            },
            "body": {
              "event": {
                "event": "charge.success",
                "data": {
                  "reference": "{{step.initPayment.body.data.reference}}",
                  "status": "success",
                  "amount": 500000
                }
              }
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "verifyTransaction",
          "type": "request",
          "endpointId": "billing.verifyTransaction",
          "request": {
            "pathParams": {
              "reference": "{{step.initPayment.body.data.reference}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.isPaid",
              "op": "eq",
              "value": true
            },
            {
              "path": "body.data.subscriptionActive",
              "op": "eq",
              "value": true
            }
          ]
        },
        {
          "id": "getSubscription",
          "type": "request",
          "endpointId": "billing.getSubscription",
          "request": {
            "pathParams": {
              "workspaceId": "{{vars.defaultWorkspace}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            }
          ]
        }
      ]
    },
    /* ────────────────────────────────────────────────────────────────────
       WF-005  Invite Flow: Admin invites teacher → Teacher completes registration
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-invite-flow",
      "name": "Invite — Admin Sends Invite → Teacher Registers",
      "tags": [
        "invite",
        "e2e"
      ],
      "steps": [
        {
          "id": "adminLogin",
          "type": "request",
          "endpointId": "auth.login",
          "request": {
            "body": {
              "user_email": "{{vars.adminEmail}}",
              "user_password": "{{vars.adminPassword}}"
            }
          },
          "extract": {
            "adminToken": {
              "from": "body",
              "path": "data.accessToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "sendInvite",
          "type": "request",
          "endpointId": "invite.create",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.adminLogin.body.data.accessToken}}"
            },
            "body": {
              "email": "{{gen.teacherUser.user_email}}",
              "workspaceId": "{{vars.defaultWorkspace}}",
              "role": "teacher"
            }
          },
          "extract": {
            "inviteId": {
              "from": "body",
              "path": "data.id"
            },
            "inviteToken": {
              "from": "body",
              "path": "data.token"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            },
            {
              "path": "body.data.id",
              "op": "exists"
            }
          ]
        },
        {
          "id": "teacherCompleteRegistration",
          "type": "request",
          "endpointId": "auth.completeRegistration",
          "request": {
            "body": {
              "token": "{{step.sendInvite.body.data.token}}",
              "user_name": "{{gen.teacherUser.user_name}}",
              "password": "{{gen.teacherUser.user_password}}"
            }
          },
          "extract": {
            "teacherToken": {
              "from": "body",
              "path": "data.accessToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.accessToken",
              "op": "exists"
            }
          ]
        },
        {
          "id": "revokeInvite",
          "type": "request",
          "endpointId": "invite.revoke",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.adminLogin.body.data.accessToken}}"
            },
            "pathParams": {
              "id": "{{step.sendInvite.body.data.id}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        }
      ]
    },
    /* ────────────────────────────────────────────────────────────────────
       WF-006  Token Refresh Flow
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-token-refresh",
      "name": "Auth — Token Refresh Flow",
      "tags": [
        "auth"
      ],
      "steps": [
        {
          "id": "login",
          "type": "request",
          "endpointId": "auth.login",
          "request": {
            "body": {
              "user_email": "{{vars.adminEmail}}",
              "user_password": "{{vars.adminPassword}}"
            }
          },
          "extract": {
            "refreshToken": {
              "from": "body",
              "path": "data.refreshToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "refreshToken",
          "type": "request",
          "endpointId": "auth.refresh",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.login.body.data.refreshToken}}"
            },
            "body": {
              "refreshToken": "{{step.login.body.data.refreshToken}}"
            }
          },
          "extract": {
            "newAccessToken": {
              "from": "body",
              "path": "data.accessToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.accessToken",
              "op": "exists"
            }
          ]
        },
        {
          "id": "verifyNewToken",
          "type": "request",
          "endpointId": "auth.verifyToken",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.refreshToken.body.data.accessToken}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.success",
              "op": "eq",
              "value": true
            }
          ]
        }
      ]
    },
    /* ────────────────────────────────────────────────────────────────────
       WF-007  Simple student sign-up only (used in load tests)
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-student-signup-only",
      "name": "Student — Sign Up Only",
      "tags": [
        "auth",
        "load"
      ],
      "steps": [
        {
          "id": "register",
          "type": "request",
          "endpointId": "auth.register",
          "request": {
            "body": {
              "user_name": "{{gen.studentUser.user_name}}",
              "user_email": "{{gen.studentUser.user_email}}",
              "user_password": "{{gen.studentUser.user_password}}",
              "inviteToken": "{{vars.inviteToken}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            },
            {
              "path": "body.data.accessToken",
              "op": "exists"
            }
          ]
        }
      ]
    },
    /* ────────────────────────────────────────────────────────────────────
       WF-008  Simple login-logout (used in high-concurrency tests)
    ──────────────────────────────────────────────────────────────────── */
    {
      "id": "wf-login-logout-only",
      "name": "Login and Logout (fast)",
      "tags": [
        "auth",
        "load"
      ],
      "steps": [
        {
          "id": "login",
          "type": "request",
          "endpointId": "auth.login",
          "request": {
            "body": {
              "user_email": "{{gen.studentUser.user_email}}",
              "user_password": "{{gen.studentUser.user_password}}"
            }
          },
          "extract": {
            "accessToken": {
              "from": "body",
              "path": "data.accessToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "in",
              "value": [
                200,
                401
              ]
            }
          ]
        },
        {
          "id": "logout",
          "type": "condition",
          "if": {
            "path": "step.login.status",
            "op": "eq",
            "value": 200
          },
          "then": [
            {
              "id": "doLogout",
              "type": "request",
              "endpointId": "auth.logout",
              "request": {
                "headers": {
                  "Authorization": "Bearer {{step.login.body.data.accessToken}}"
                }
              },
              "assert": [
                {
                  "path": "status",
                  "op": "eq",
                  "value": 200
                }
              ]
            }
          ],
          "else": []
        }
      ]
    }
  ],
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 10 — SCENARIOS
     Executable test plans. Each scenario says: run these workflows,
     under this load, on this environment.

     Scenario types:
       smoke       — 1 VU, 1 pass, verify nothing is broken
       functional  — 1 VU, full CRUD coverage, with assertions
       regression  — 1 VU, all workflows, catch regressions
       load        — sustained traffic with many VUs
       stress      — ramp VUs until failures appear (find the ceiling)
       spike       — sudden jump in VUs, then drop
       soak        — moderate VUs over a long duration (memory leaks etc.)
       chaos       — random failures, slow responses injected

     Load model types:
       constant-vus     — fixed number of VUs throughout
       ramping-vus      — ramp up, sustain, ramp down (stages)
       arrival-rate     — fixed requests/sec regardless of response time
       shared-iterations— all VUs share a pool of total iterations
  ──────────────────────────────────────────────────────────────────────────── */
  "scenarios": [
    /* ── SMOKE ───────────────────────────────────────────────────────────── */
    {
      "id": "scenario-smoke",
      "name": "Smoke Test",
      "description": "Quick pass to confirm the server is alive and auth works",
      "type": "smoke",
      "environment": "local",
      "operations": [
        {
          "workflowId": "wf-admin-login-logout",
          "weight": 1
        }
      ],
      "load": {
        "model": "constant-vus",
        "virtualUsers": 1,
        "iterations": 1
      },
      "thresholds": {
        "http_req_failed": {
          "op": "lt",
          "value": 0.01
        },
        "http_req_duration": {
          "op": "p95_lt",
          "value": 1000
        }
      }
    },
    /* ── FUNCTIONAL ──────────────────────────────────────────────────────── */
    {
      "id": "scenario-functional",
      "name": "Full Functional Test",
      "description": "Complete E2E journeys — admin setup, student exam, billing, invite",
      "type": "functional",
      "environment": "local",
      "operations": [
        {
          "workflowId": "wf-admin-login-logout",
          "order": 1
        },
        {
          "workflowId": "wf-admin-full-journey",
          "order": 2
        },
        {
          "workflowId": "wf-invite-flow",
          "order": 3
        },
        {
          "workflowId": "wf-student-exam-flow",
          "order": 4
        },
        {
          "workflowId": "wf-billing-flow",
          "order": 5
        },
        {
          "workflowId": "wf-token-refresh",
          "order": 6
        }
      ],
      "load": {
        "model": "constant-vus",
        "virtualUsers": 1,
        "iterations": 1
      },
      "stopOnFirstFailure": true,
      "thresholds": {
        "http_req_failed": {
          "op": "eq",
          "value": 0
        }
      }
    },
    /* ── 500 USERS SIGN UP ───────────────────────────────────────────────── */
    {
      "id": "scenario-500-signup",
      "name": "500 Users Simultaneous Sign-Up",
      "description": "500 virtual users each register a unique account. Tests DB write concurrency and invite-token handling under load.",
      "type": "load",
      "environment": "local",
      "operations": [
        {
          "workflowId": "wf-student-signup-only",
          "generator": "studentUser",
          "perVu": true
        }
      ],
      "load": {
        "model": "ramping-vus",
        "stages": [
          {
            "duration": "30s",
            "target": 100
          },
          {
            "duration": "60s",
            "target": 500
          },
          {
            "duration": "30s",
            "target": 0
          }
        ]
      },
      "thresholds": {
        "http_req_failed": {
          "op": "lt",
          "value": 0.05
        },
        "http_req_duration": {
          "op": "p95_lt",
          "value": 2000
        },
        "http_req_duration": {
          "op": "p99_lt",
          "value": 5000
        }
      }
    },
    /* ── 200 USERS LOGIN + LOGOUT SIMULTANEOUSLY ─────────────────────────── */
    {
      "id": "scenario-200-login-logout",
      "name": "200 Users Simultaneous Login + Logout",
      "description": "200 virtual users each log in and immediately log out. Tests auth service concurrency and token issuance under pressure.",
      "type": "load",
      "environment": "local",
      "operations": [
        {
          "workflowId": "wf-login-logout-only",
          "generator": "studentUser",
          "perVu": true
        }
      ],
      "load": {
        "model": "constant-vus",
        "virtualUsers": 200,
        "duration": "2m"
      },
      "thresholds": {
        "http_req_failed": {
          "op": "lt",
          "value": 0.01
        },
        "http_req_duration": {
          "op": "p90_lt",
          "value": 800
        }
      }
    },
    /* ── STRESS TEST ─────────────────────────────────────────────────────── */
    {
      "id": "scenario-stress",
      "name": "Stress — Ramp Until Breaking Point",
      "description": "Ramp from 10 to 1000 VUs to find where the service degrades. Expect some failures above the ceiling.",
      "type": "stress",
      "environment": "local",
      "operations": [
        {
          "workflowId": "wf-login-logout-only",
          "weight": 70
        },
        {
          "workflowId": "wf-student-signup-only",
          "weight": 30
        }
      ],
      "load": {
        "model": "ramping-vus",
        "stages": [
          {
            "duration": "1m",
            "target": 10
          },
          {
            "duration": "2m",
            "target": 100
          },
          {
            "duration": "2m",
            "target": 300
          },
          {
            "duration": "2m",
            "target": 600
          },
          {
            "duration": "2m",
            "target": 1000
          },
          {
            "duration": "1m",
            "target": 0
          }
        ]
      },
      "thresholds": {
        "http_req_duration": {
          "op": "p95_lt",
          "value": 10000
        }
      }
    },
    /* ── SPIKE TEST ──────────────────────────────────────────────────────── */
    {
      "id": "scenario-spike",
      "name": "Spike — Sudden 1000 VU Surge",
      "description": "Instantly jump to 1000 VUs, hold 1 minute, drop to zero. Simulates a flash sale or viral event.",
      "type": "spike",
      "environment": "local",
      "operations": [
        {
          "workflowId": "wf-login-logout-only",
          "weight": 1
        }
      ],
      "load": {
        "model": "ramping-vus",
        "stages": [
          {
            "duration": "5s",
            "target": 1000
          },
          {
            "duration": "1m",
            "target": 1000
          },
          {
            "duration": "5s",
            "target": 0
          }
        ]
      },
      "thresholds": {
        "http_req_failed": {
          "op": "lt",
          "value": 0.10
        }
      }
    },
    /* ── SOAK TEST ───────────────────────────────────────────────────────── */
    {
      "id": "scenario-soak",
      "name": "Soak — 50 VUs Over 1 Hour",
      "description": "Moderate load sustained for 1 hour. Catches memory leaks, DB connection exhaustion, and slow drift.",
      "type": "soak",
      "environment": "staging",
      "operations": [
        {
          "workflowId": "wf-admin-login-logout",
          "weight": 20
        },
        {
          "workflowId": "wf-login-logout-only",
          "weight": 60
        },
        {
          "workflowId": "wf-student-signup-only",
          "weight": 20
        }
      ],
      "load": {
        "model": "constant-vus",
        "virtualUsers": 50,
        "duration": "1h"
      },
      "thresholds": {
        "http_req_failed": {
          "op": "lt",
          "value": 0.01
        },
        "http_req_duration": {
          "op": "p95_lt",
          "value": 3000
        }
      }
    },
    /* ── REGRESSION ──────────────────────────────────────────────────────── */
    {
      "id": "scenario-regression",
      "name": "Regression — All Workflows",
      "description": "Run every workflow in sequence. Zero tolerance for failures. Run before every deploy.",
      "type": "regression",
      "environment": "staging",
      "operations": [
        {
          "workflowId": "wf-admin-login-logout",
          "order": 1
        },
        {
          "workflowId": "wf-token-refresh",
          "order": 2
        },
        {
          "workflowId": "wf-invite-flow",
          "order": 3
        },
        {
          "workflowId": "wf-admin-full-journey",
          "order": 4
        },
        {
          "workflowId": "wf-student-exam-flow",
          "order": 5
        },
        {
          "workflowId": "wf-billing-flow",
          "order": 6
        }
      ],
      "load": {
        "model": "constant-vus",
        "virtualUsers": 1,
        "iterations": 1
      },
      "stopOnFirstFailure": true,
      "thresholds": {
        "http_req_failed": {
          "op": "eq",
          "value": 0
        }
      }
    }
  ],
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 11 — SETUP / TEARDOWN HOOKS
     Named hook definitions. Referenced in settings.hooks.
     The runtime runs these as privileged steps before/after scenarios.
  ──────────────────────────────────────────────────────────────────────────── */
  "hooks": {
    "setup-database": {
      "description": "Seed the test workspace and invite token before any scenario",
      "steps": [
        {
          "id": "createWorkspace",
          "type": "request",
          "endpointId": "workspace.setup",
          "request": {
            "body": {
              "workspace_name": "JeticTestWorkspace",
              "admin_name": "{{vars.adminEmail}}",
              "admin_email": "{{vars.adminEmail}}",
              "admin_password": "{{vars.adminPassword}}"
            }
          },
          "extract": {
            "defaultWorkspace": {
              "from": "body",
              "path": "workspace.id"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "in",
              "value": [
                200,
                409
              ]
            }
          ]
        },
        {
          "id": "setGlobalWorkspace",
          "type": "assign",
          "vars": {
            "defaultWorkspace": "{{step.createWorkspace.body.workspace.id}}"
          }
        },
        {
          "id": "loginToGetToken",
          "type": "request",
          "endpointId": "auth.login",
          "request": {
            "body": {
              "user_email": "{{vars.adminEmail}}",
              "user_password": "{{vars.adminPassword}}"
            }
          },
          "extract": {
            "adminAccessToken": {
              "from": "body",
              "path": "data.accessToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "createClass",
          "type": "request",
          "endpointId": "class.create",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.loginToGetToken.body.data.accessToken}}"
            },
            "body": {
              "name": "DefaultTestClass"
            }
          },
          "extract": {
            "defaultClassId": {
              "from": "body",
              "path": "data.id"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "in",
              "value": [
                200,
                409
              ]
            }
          ]
        },
        {
          "id": "createExam",
          "type": "request",
          "endpointId": "exam.create",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.loginToGetToken.body.data.accessToken}}"
            },
            "body": {
              "exam_name": "DefaultTestExam",
              "minutes": 60,
              "workspaceId": "{{step.createWorkspace.body.workspace.id}}",
              "classId": "{{step.createClass.body.data.id}}",
              "visible": true
            }
          },
          "extract": {
            "defaultExamId": {
              "from": "body",
              "path": "data.id"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "in",
              "value": [
                200,
                409
              ]
            }
          ]
        },
        {
          "id": "createInvite",
          "type": "request",
          "endpointId": "invite.create",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.loginToGetToken.body.data.accessToken}}"
            },
            "body": {
              "email": "open-invite@testmail.local",
              "workspaceId": "{{step.createWorkspace.body.workspace.id}}",
              "role": "student"
            }
          },
          "extract": {
            "inviteToken": {
              "from": "body",
              "path": "data.token"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "in",
              "value": [
                200,
                409
              ]
            }
          ]
        },
        {
          "id": "persistGlobals",
          "type": "assign",
          "vars": {
            "defaultWorkspace": "{{step.createWorkspace.body.workspace.id}}",
            "defaultClassId": "{{step.createClass.body.data.id}}",
            "defaultExamId": "{{step.createExam.body.data.id}}",
            "inviteToken": "{{step.createInvite.body.data.token}}"
          }
        }
      ]
    },
    "teardown-database": {
      "description": "Clean up the test workspace after all scenarios complete",
      "steps": [
        {
          "id": "loginAdmin",
          "type": "request",
          "endpointId": "auth.login",
          "request": {
            "body": {
              "user_email": "{{vars.adminEmail}}",
              "user_password": "{{vars.adminPassword}}"
            }
          },
          "extract": {
            "adminToken": {
              "from": "body",
              "path": "data.accessToken"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "eq",
              "value": 200
            }
          ]
        },
        {
          "id": "deleteWorkspace",
          "type": "request",
          "endpointId": "workspace.delete",
          "request": {
            "headers": {
              "Authorization": "Bearer {{step.loginAdmin.body.data.accessToken}}"
            },
            "pathParams": {
              "id": "{{vars.defaultWorkspace}}"
            },
            "body": {
              "id": "{{vars.defaultWorkspace}}"
            }
          },
          "assert": [
            {
              "path": "status",
              "op": "in",
              "value": [
                200,
                404
              ]
            }
          ]
        }
      ]
    }
  ],
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 12 — ASSERTIONS REFERENCE
     All supported assertion operators. The runtime evaluates these.

     Operators:
       eq       — strict equality
       neq      — not equal
       gt       — greater than
       gte      — greater than or equal
       lt       — less than
       lte      — less than or equal
       in       — value is in array
       nin      — value is NOT in array
       exists   — field is present and not null
       missing  — field is absent or null
       contains — string contains substring
       matches  — string matches regex pattern
       schema   — validates against a named model ($ref)
       p95_lt   — 95th percentile latency (threshold only)
       p99_lt   — 99th percentile latency (threshold only)
       p90_lt   — 90th percentile latency (threshold only)

     Paths:
       status                — HTTP status code
       body.FIELD.NESTED     — dot-path into JSON response body
       headers.HEADER_NAME   — response header (lowercase)
       timing.ms             — response time in ms
       body.ARRAY.length     — length of an array field
  ──────────────────────────────────────────────────────────────────────────── */
  "assertionDocs": {
    "examples": [
      {
        "path": "status",
        "op": "eq",
        "value": 200
      },
      {
        "path": "body.success",
        "op": "eq",
        "value": true
      },
      {
        "path": "body.data.accessToken",
        "op": "exists"
      },
      {
        "path": "body.data",
        "op": "schema",
        "ref": "#/models/User"
      },
      {
        "path": "body.data.length",
        "op": "gte",
        "value": 1
      },
      {
        "path": "status",
        "op": "in",
        "value": [
          200,
          201
        ]
      },
      {
        "path": "headers.content-type",
        "op": "contains",
        "value": "application/json"
      },
      {
        "path": "timing.ms",
        "op": "lt",
        "value": 1000
      },
      {
        "path": "body.data.user.role",
        "op": "eq",
        "value": "admin"
      },
      {
        "path": "body.message",
        "op": "matches",
        "value": "^success"
      }
    ]
  },
  /* ─────────────────────────────────────────────────────────────────────────
     SECTION 13 — DEPENDENCIES
     Optional list of services this backend depends on.
     Runtime can health-check them before starting scenarios.
  ──────────────────────────────────────────────────────────────────────────── */
  "dependencies": [
    {
      "name": "PostgreSQL",
      "type": "database",
      "healthCheck": null
    },
    {
      "name": "Paystack",
      "type": "external-api",
      "healthCheck": "https://api.paystack.co/health"
    },
    {
      "name": "Redis",
      "type": "cache",
      "healthCheck": null
    }
  ]
}