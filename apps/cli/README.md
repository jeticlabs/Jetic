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

### Recommended Agent Prompts:
> 1. *"Run `jetic_get_session_phase` and guide me through building the API model for this project."*  
> 2. *"Scan the backend, check endpoint completeness, fill missing descriptions/tags, and run `jetic_verify_model`."*  
> 3. *"What workflow or integration test would you like to simulate against local environment?"*

---

## 💻 CLI Commands

| Command | Description |
|---|---|
| `jetic init` | Scaffold `.jetic/` folder and initial configuration |
| `jetic scan` | Static AST source code scan for Express/TypeScript backends |
| `jetic inspect` | Inspect summary metrics or specific endpoint schemas in terminal |
| `jetic simulate endpoint` | Test live HTTP endpoints against local/staging server |
| `jetic simulate workflow` | Execute multi-step stateful workflows from `.jetic/workflows/` |
| `jetic dev` | Launch local **Jetic Studio** dashboard UI on port `8787` |
| `jetic memory` | View, set, or clear runtime variable memory (`.jetic/memory.json`) |
| `jetic mcp` | Start stdio MCP server for AI IDE integration |

---

## 🖥️ Jetic Studio

Run `jetic dev` to open the local web developer studio:

- **Behavioral Model (`/model`)**: Explore endpoints, request/response schemas, and AST source code lines.
- **AI Simulations (`/simulations`)**: Visual step-by-step workflow runner with real-time SSE execution logs.
- **Memory Inspector (`/memory`)**: Edit captured tokens, fake test data, and session variables.
- **Visual Traces (`/traces`)**: Interactive node-graph execution visualizer powered by ReactFlow.

---

## 📄 Behavioral Model Preview (`.jetic/model.json`)

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

---

<p align="center">
  <i>Built with ❤️ by the Jetic Team.</i>
</p>

