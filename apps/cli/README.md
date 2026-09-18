<p align="center">
  <img src="public/jetic_white_bg.png" alt="Jetic Banner" width="140">
</p>

<h1 align="center">Jetic CLI</h1>

<p align="center">
  <strong>AI-Native API Behavior Testing, Discovery & Simulation Platform</strong>
</p>

<p align="center">
  <em>Zero-config static source scanning → Behavioral model graph → Automated API simulations & Visual Traces</em>
</p>

<p align="center">
  <a href="#-quickstart">Quickstart</a> •
  <a href="#-the-4-phase-workflow">4-Phase Workflow</a> •
  <a href="#-ai-ide-integration-mcp">AI IDE Setup</a> •
  <a href="#-cli-commands">CLI Reference</a> •
  <a href="#-jetic-studio">Jetic Studio</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/jetic-cli"><img src="https://img.shields.io/npm/v/jetic-cli.svg" alt="NPM Version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node Version">
  <img src="https://img.shields.io/badge/AST-ts--morph-blueviolet" alt="ts-morph">
  <img src="https://img.shields.io/badge/license-ISC-green.svg" alt="License">
</p>

---

## ⚡ Quickstart

Get started in under **60 seconds** — **no AI keys or third-party provider setup required**.

### 1. Install globally
```bash
npm install -g jetic-cli
```

### 2. Initialize & Scan your backend
Navigate to your backend project directory (e.g., Express + TypeScript):
```bash
# Scaffold .jetic/ directory
jetic init

# Static AST scan of backend source code to build .jetic/model.json
jetic scan
```

### 3. Launch Jetic Studio or connect your AI IDE
```bash
# Option A: Launch the visual developer dashboard (http://localhost:8787)
jetic dev

# Option B: Run MCP server for AI IDE assistant (Cursor, Antigravity, VS Code, opencode)
jetic mcp
```

---

## 🔄 The 4-Phase Workflow

Jetic operates on a strict, predictable 4-phase lifecycle for total model fidelity:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. INITIALIZE   │ ──► │ 2. SCAN & MODEL │ ──► │ 3. VERIFY       │ ──► │ 4. SIMULATE     │
│ (jetic init)    │     │ (jetic scan)    │     │ (jetic verify)  │     │ (jetic simulate)│
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. **Phase 1 — Initialize (`jetic init`)**: Scaffolds the `.jetic/` directory and empty `model.json` in your project root.
2. **Phase 2 — Scan & Model (`jetic scan`)**: Keyless AST scan parses routes, controllers, middleware, and TypeScript interfaces. For non-Express backends (FastAPI, Go, NestJS), endpoints can be added manually or via MCP.
3. **Phase 3 — Verify (`jetic_verify_model`)**: Validates model structure and ensures all fields (descriptions, tags, parameter/response details) are complete and error-free.
4. **Phase 4 — Simulate (`jetic simulate`)**: Executes multi-step workflows with dynamic state capture (`captureInput` / `capture`) and header injection (`Authorization: Bearer {{workflow:token}}`).

---

## 🤖 AI IDE Integration (MCP)

Jetic comes with a built-in **Model Context Protocol (MCP)** server so your editor's AI assistant (opencode, Antigravity, Cursor, Claude Code, VS Code) can manage your API model directly — **using your editor's own model with no API keys**.

### Setup (e.g. `opencode.json` or Cursor `mcp.json`):
```json
{
  "mcp": {
    "jetic": {
      "type": "local",
      "command": ["jetic", "mcp"],
      "enabled": true
    }
  }
}
```
*(On Windows, use `"command": ["cmd", "/c", "jetic", "mcp"]`)*

### 💬 Example Prompts for AI IDE

Use these prompt templates with your editor's AI assistant (opencode, Antigravity, Cursor, Claude Code, VS Code) to manage initialization, model creation, and workflow simulation:

#### 🚀 Phase 1: Initialize Project (`init`)
> **Session Health & Quickstart:**  
> *"Call `jetic_get_session_phase`. If the model is not initialized, run `jetic_init` to scaffold `.jetic/` and guide me through setting up the API."*

> **Fresh Repository Scaffold:**  
> *"Initialize Jetic in this workspace (`jetic_init`), configure project metadata for our TypeScript backend, and verify that `.jetic/model.json` exists."*

#### 📐 Phase 2 & 3: Create & Verify Model (`create model`)
> **Automated AST Scan & Verification:**  
> *"Scan our backend codebase (`jetic_scan`) to populate endpoints. Then run `jetic_verify_model` to highlight any missing descriptions, schemas, or tags."*

> **Model Completeness & Audit:**  
> *"Run `jetic_verify_model`. Update every endpoint with missing descriptions or tags using `jetic_update_endpoint`, and re-verify until the model status is 100% complete and valid."*

> **Selective AI Re-Modelling via Change Log (`changes.json`):**  
> *"Check recent file changes (`jetic_get_changes`). Re-analyse ONLY those modified files to update `.jetic/model.json` instead of reading the entire codebase, then clear the change log (`jetic_clear_changes`)."*

#### ⚡ Phase 4: Create & Run Workflows (`create workflow`)
> **Scaffold & Create Workflow:**  
> *"Scaffold a user onboarding workflow (`jetic_scaffold_workflow`) with `POST /api/auth/register` and `GET /api/users/me`. Automatically inject the auth token, validate the workflow, and save it to `.jetic/workflows/user-onboarding.json`."*

> **Advanced Workflow with Conditions & Retry Logic:**  
> *"Build an order fulfillment workflow. Step 1: Login. Step 2: Create Order. Step 3: Payment (add step condition `if {{workflow:userRole}} equals "admin"` and `retry` up to 3 times on failure). Validate (`jetic_validate_workflow`) and save it."*

> **Human Input Workflow (2FA / OTP):**  
> *"Build a sensitive transfer workflow that requires human 2FA. Scaffold the steps, use `{{human:otp_code}}` for the verification payload, set `retry: { "times": 2, "delayMs": 1000 }`, and save to `.jetic/workflows/transfer.json`."*

#### 🎯 All-in-One Master Prompt
> *"Run `jetic_get_session_phase` and follow the Jetic 4-Phase protocol: 1. Initialize `.jetic/` if missing. 2. Scan the source code and verify the model until all endpoint descriptions are complete. 3. Ask me what integration scenario I want to test, then scaffold, validate, and save the workflow."*

---

## 💻 CLI Commands

| Command | Description |
|---|---|
| `jetic init` | Scaffold `.jetic/` folder and initial configuration |
| `jetic scan` | Static AST source code scan for Express/TypeScript backends |
| `jetic inspect` | Inspect summary metrics or specific endpoint schemas in terminal |
| `jetic simulate endpoint` | Test live HTTP endpoints against local/staging server |
| `jetic simulate workflow` | Execute multi-step stateful workflows from `.jetic/workflows/` |
| `jetic dev` | Launch local **Jetic Studio** dashboard UI on port `8787` with real-time SSE file watcher & `changes.json` live stream |
| `jetic memory` | View, set, or clear runtime variable memory (`.jetic/memory.json`) |
| `jetic mcp` | Start stdio MCP server for AI IDE integration (includes `jetic_get_changes` & `jetic_clear_changes`) |

---

## 🖥️ Jetic Studio

Run `jetic dev` to open the local web developer studio:

- **Behavioral Model (`/model`)**: Explore endpoints, request/response schemas, and AST source code lines.
- **AI Simulations (`/simulations`)**: Visual step-by-step workflow runner with real-time SSE execution logs.
- **Files Changes (`/changes`)**: Real-time SSE stream observer for `.jetic/changes.json` — track modified source files live without browser reloads.
- **Memory Inspector (`/memory`)**: Edit captured tokens, fake test data, and session variables.
- **Visual Traces (`/traces`)**: Interactive node-graph execution visualizer powered by ReactFlow.

---

## 📄 Artifact Schemas

### `.jetic/model.json` (Behavioral Model)

```json
{
  "version": "0.3",
  "project": { "name": "my-api", "language": "typescript", "framework": "express" },
  "environments": [{ "name": "local", "baseUrl": "http://localhost:3000" }],
  "endpoints": [
    {
      "id": "post-api-auth-login",
      "method": "POST",
      "path": "/api/auth/login",
      "description": "User authentication endpoint",
      "tags": ["auth"],
      "requestBody": {
        "fields": {
          "email": { "type": "string", "format": "email", "required": true },
          "password": { "type": "string", "minLength": 8, "required": true }
        }
      },
      "responses": {
        "200": { "description": "Returns JWT token", "schema": { "token": "string" } }
      }
    }
  ]
}
```

### `.jetic/changes.json` (File Changes Tracking Log)

```json
{
  "version": 1,
  "watchedSince": "2026-09-18T10:00:00.000Z",
  "projectRoot": "C:/projects/my-api",
  "changes": [
    {
      "filePath": "src/routes/user.routes.ts",
      "absolutePath": "C:/projects/my-api/src/routes/user.routes.ts",
      "changedAt": "2026-09-18T14:20:00.000Z",
      "eventType": "change"
    }
  ]
}
```

---

<p align="center">
  <i>Built with ❤️ by the Jetic Team.</i>
</p>

