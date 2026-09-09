<p align="center">
  <img src="https://avatars.githubusercontent.com/u/275651463?s=200&v=4" alt="Jetic Banner" width="160">
</p>

<h1 align="center">Jetic 🚀</h1>

<p align="center">
  <strong>AI-Native API Behavior Testing, Discovery & Observability Platform</strong>
</p>

<p align="center">
  <em>Scan backend source code → Extract behavioral models → Synthesize & run stateful AI workflows → Inspect visual traces</em>
</p>

<p align="center">
  <a href="#-key-features">Features</a> •
  <a href="#-how-jetic-works">How It Works</a> •
  <a href="#-monorepo-architecture">Monorepo Architecture</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-start-with-your-ai-ide-recommended-no-ai-key">AI IDE Setup</a> •
  <a href="#-cli-command-reference">CLI Reference</a> •
  <a href="#-jetic-studio-dashboard">Jetic Studio</a> •
  <a href="#-artifact--file-schemas">File Schemas</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/jetic-cli"><img src="https://img.shields.io/npm/v/jetic-cli.svg" alt="NPM Version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node Version">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange" alt="PNPM Workspace">
  <img src="https://img.shields.io/badge/React-19-blue" alt="React 19">
  <img src="https://img.shields.io/badge/AST-ts--morph-blueviolet" alt="ts-morph">
  <img src="https://img.shields.io/badge/license-ISC-green.svg" alt="License">
</p>

---

## ⚡ The Problem

Traditional API testing tools (Postman, Insomnia, generic test runners) force developers to manually write hundreds of repetitive test scripts, hardcode authorization tokens, guess parameter validation limits, and painstakingly string together sequential operations (*Register User → Login → Save Token → Create Resource → Update Resource → Delete Resource*).

Furthermore, conventional HTTP runners only check if an endpoint returns a `200 OK`. They do **not** understand what your API is actually *supposed* to do, what business constraints govern your handlers, or how state flows across endpoint boundaries.

---

## 💡 The Jetic Solution

**Jetic** is an agentic, code-native developer platform that **automatically understands, models, simulates, and traces an application's API behavior directly from its backend source code.**

1. 🔍 **Zero-Execution Source Code Scanning**: Jetic parses your TypeScript/Express Abstract Syntax Tree (AST via `ts-morph`) without running your server. It follows imports across controllers, services, middleware, and type declarations to discover routes, parameters, validation constraints, and auth schemes.
2. 🧠 **Declarative Behavioral Graph (`model.json`)**: Generates a versioned, strongly-typed behavioral graph mapping paths, HTTP methods, request schemas, response shapes, and exact source code provenance (file + line numbers).
3. 🤖 **AI-Driven Stateful Workflow Generation**: Uses AI to synthesize multi-step, end-to-end user journeys (`.jetic/workflows/*.json`).
4. 💾 **Pre/Post State Capture & Dynamic Injection**: Captures input parameters (like faker-generated email/password) before HTTP calls and response fields (like JWT tokens and resource IDs via JSONPath) after HTTP calls into `.jetic/memory.json`, automatically injecting them into subsequent headers (e.g. `Authorization: Bearer {{workflow:accessToken}}`) or body fields.
5. 📈 **ReactFlow Execution Traces in Jetic Studio**: Visually inspect step-by-step simulation node graphs, HTTP headers, request payloads, response bodies, latencies, and state passing in **Jetic Studio** local IDE.

> [!NOTE]
> **Framework & Language Support**: Automated AST source code scanning currently supports **Node.js & Express (TypeScript)** projects.
> For backends built with other languages or frameworks (e.g., Python/FastAPI, Go, Rust, Java, NestJS), you can manually add and manage endpoints directly inside **Jetic Studio** on the **Behavioral Model** page (`/model`) using the **"Add Endpoint"** button.
> **Easiest option for any stack**: use the [AI IDE setup below](#-start-with-your-ai-ide-recommended-no-ai-key) — your editor's AI reads the code and authors the model through Jetic MCP tools, no scanner or AI key required.

---

## ✨ Key Features

- 🔍 **AST Source Discovery**: Deeply inspects Express/TypeScript source code using `ts-morph`. Recursively resolves imported controllers, services, helpers, and types up to configurable depths.
- 🧩 **Nested Router & Middleware Resolution**: Seamlessly flattens complex nested Express router chains (e.g. `app.use('/api/orders', ordersRouter)` $\rightarrow$ `router.post('/checkout')`).
- 🧠 **Constraint & Business Logic Extraction**: Extracts validation logic directly from `if` statements (e.g. `if (password.length < 8)` $\rightarrow$ `minLength: 8`) and schema definitions, enabling intelligent data generation rather than blind fuzzing.
- 🔗 **Stateful Workflow Engine**: Synthesizes and executes multi-step workflows with full variable interpolation, auto-generating dynamic test data via `@faker-js/faker`.
- 📥 **Input & Output Memory Capture**:
  - `captureInput`: Saves generated request body values (e.g. `admin_email`) to `.jetic/memory.json` *before* firing requests so subsequent steps can reuse them.
  - `capture`: Saves response JSONPath fields (e.g. `data.accessToken`, `data.workspace.id`) to `.jetic/memory.json` *after* success.
  - `inject`: Automatically injects memory values into headers (e.g. `header:Authorization = Bearer {{workflow:accessToken}}`) or body fields.
- 🖥️ **Jetic Studio Dashboard**: Modern React 19 + Vite + TailwindCSS + ReactFlow local developer web IDE (`jetic dev`) for visual API exploration, AST source code viewing, real-time SSE workflow execution, runtime memory editing, and node-graph trace debugging.
- 💻 **Feature-Rich CLI**: Lightweight command-line interface bringing API intelligence, scanning, simulation, memory control, and config management straight to your terminal.

---

## ⚙️ How Jetic Works

```
 ┌────────────────────────┐
 │  Backend Source Code   │ (TypeScript / Express)
 └───────────┬────────────┘
             │
             ▼
 ┌────────────────────────┐
 │   packages/scanner     │ (AST parsing via ts-morph & ImportResolver)
 └───────────┬────────────┘
             │
             ▼
 ┌────────────────────────┐
 │  .jetic/model.json     │ (Behavioral Model: Endpoints, Schemas, Constraints, Auth, Source Provenance)
 └───────────┬────────────┘
             │
      ┌──────┴───────────────────────────┐
      ▼                                  ▼
┌──────────────┐             ┌────────────────────────┐
│  jetic scan  │             │  jetic simulate        │ (Single-endpoint or AI Workflows)
└──────────────┘             └───────────┬────────────┘
                                         │
                    ┌────────────────────┴───────────────────┐
                    ▼                                        ▼
      ┌─────────────────────────┐               ┌────────────────────────┐
      │  .jetic/memory.json     │               │  Jetic Studio         │
      │  (Capture & Inject State)│               │  (/traces Observability)│
      └─────────────────────────┘               └────────────────────────┘
```

1. **Scan (`jetic scan`)**: `ExpressScanner` and `ImportResolver` inspect your project root and `tsconfig.json`. They extract route paths, parameters, middleware chains, controller logic, and TypeScript types.
2. **Model (`.jetic/model.json`)**: Normalizes scanner output into a strongly typed `BehavioralModel` containing endpoint metadata, discovered constraints, expected request/response schemas, security schemes, and source references (`routes/auth.ts:42`).
3. **Synthesize Workflows (`jetic simulate workflow`)**: AI analyzes `model.json` to create end-to-end integration workflows. Step dependencies, input/output captures, and header injections are configured automatically.
4. **Run & Capture / Inject**: The simulator engine executes requests step-by-step. `captureInput` saves faker credentials pre-flight, `capture` reads response JSONPath fields post-flight, and `inject` dynamically constructs request headers/bodies for downstream steps.
5. **Trace & Observe**: Results are persisted as execution trace records and rendered in **Jetic Studio** (`/traces`) as an interactive ReactFlow node graph.

> [!TIP]
> **No AI key? Any backend stack? Skip steps 1–3 as terminal commands.** Connect [`jetic mcp`](#jetic-mcp) to your AI code editor and let the agent do the same flow conversationally — it reads your code, builds `model.json`, authors workflows, and runs them, using your editor's own model. See [Start with Your AI IDE](#-start-with-your-ai-ide-recommended-no-ai-key).

---

## 🏗️ Monorepo Architecture

Jetic is engineered as a clean TypeScript `pnpm` monorepo:

```
jetic/
├── apps/
│   ├── cli/             # jetic-cli — Command-line executable & workflow runner
│   └── dashboard/       # @jetic/dashboard — Jetic Studio local web IDE (React 19, Vite, TailwindCSS, ReactFlow)
├── packages/
│   ├── core/            # @jetic/core — Config management (.jetic/config.json), filesystem sync, logger & errors
│   ├── memory/          # @jetic/memory — Scoped runtime key-value store (.jetic/memory.json)
│   ├── model/           # @jetic/model — BehavioralModel schema types, Zod validators, interfaces
│   ├── scanner/         # @jetic/scanner — ts-morph AST parser, ExpressScanner, ImportResolver, AIAnalyzer
│   └── simulator/       # @jetic/simulator — Data generator (Faker), ResponseValidator, EndpointSimulator
├── examples/
│   └── express-shop/    # Complex Express fixture application for testing
├── screenshots/         # Jetic Studio screenshots and visual documentation assets
├── package.json         # Workspace root package manifest
├── pnpm-workspace.yaml  # pnpm workspace configuration
└── tsconfig.base.json   # Base TypeScript configuration
```

### Package Details

| Package | Package Name | Responsibility |
| :--- | :--- | :--- |
| **`apps/cli`** | `jetic-cli` | Commander-based CLI executable (`jetic`). Runs scanner, single endpoint simulations, AI workflows, memory CLI, config wizard, and embedded express server for Jetic Studio (`jetic dev`). |
| **`apps/dashboard`** | `@jetic/dashboard` | **Jetic Studio** local web app. Features Overview, Model Explorer, Endpoint Inspect with AST source viewer, AI Workflow Builder/Runner with SSE streaming, Memory Inspector, and ReactFlow Trace Graph Observability. |
| **`packages/scanner`** | `@jetic/scanner` | Static AST analysis engine built on `ts-morph`. Features `ExpressScanner` (route discovery), `ImportResolver` (deep file resolution across controllers/types), `PathResolver`, `AIAnalyzer`, and `Normalizer`. |
| **`packages/model`** | `@jetic/model` | Canonical schema definitions for `BehavioralModel`, `Endpoint`, `Parameter`, `Constraint`, `SecurityScheme`, `Workflow`, `StateMachine`, `Environment`, and `SourceReference`. |
| **`packages/simulator`** | `@jetic/simulator` | Execution engine. Generates fake data adhering to discovered constraints (`DataGenerator`), validates HTTP status and JSON response shapes (`ResponseValidator`), and manages endpoint testing (`EndpointSimulator`). |
| **`packages/memory`** | `@jetic/memory` | Persistence engine for `.jetic/memory.json`. Handles scoped state storage (`workflow`, `global`), atomic reads/writes, clearing, and variable string template resolution. |
| **`packages/core`** | `@jetic/core` | Core framework abstractions, `.jetic` workspace initialization, `.jetic/config.json` reader/writer, and file utility helpers. |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **pnpm**: `v9.0.0` or higher

### 1. Installation

#### Option A: Install via NPM (Global CLI)

```bash
# Install package globally via npm
npm install -g jetic-cli

# Or run directly via npx
npx jetic-cli --help
```

#### Option B: Build from Source (Monorepo Workspace)

```bash
# Clone repository
git clone https://github.com/your-username/jetic.git
cd jetic

# Install monorepo dependencies
pnpm install

# Build all packages and apps
pnpm build

# Link CLI executable globally
cd apps/cli
pnpm link --global
```

> [!NOTE]
> **Package Name vs Executable Command**: The CLI package is published on NPM as **`jetic-cli`** (`npm install -g jetic-cli`). Upon installation, npm registers the **`jetic`** binary executable command in your system `PATH` (`jetic init`, `jetic scan`, `jetic dev`, etc.).

### 2. Start with Your AI IDE (Recommended, No AI Key)

The fastest way to use Jetic is **through the AI assistant already inside your code editor** — opencode, Antigravity, Cursor, Claude Code, Windsurf, or VS Code. Your editor's model drives Jetic's 16 MCP tools directly: **no OpenRouter/OpenAI key, no `jetic config ai`, and no `jetic scan` needed to begin**. This path also works for **any backend stack** (Express, FastAPI, Go, Java, NestJS…), because the AI reads your code and models it via MCP.

#### Step 1 — Initialize your backend (10 seconds, once per project)

```bash
cd path/to/your-backend
jetic init
```

#### Step 2 — Connect the MCP server to your editor (once per editor)

opencode (`opencode.json` — global or project root):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "jetic": {
      "type": "local",
      "command": ["cmd", "/c", "jetic", "mcp"],
      "cwd": "C:/path/to/your-backend",
      "enabled": true
    }
  }
}
```

> Windows needs `cmd /c` (npm shims are `.cmd` files); on macOS/Linux use `"command": ["jetic", "mcp"]`. Point `cwd` at your backend root so Jetic finds `.jetic/model.json`. Using Antigravity, Cursor, Claude Code/Desktop, Windsurf, or VS Code? Same `jetic mcp` server — grab your editor's snippet from [packages/mcp-server/README.md](packages/mcp-server/README.md).

Restart the editor (or refresh its MCP panel) and confirm the `jetic_*` tools appear.

#### Step 3 — Onboard with copy-paste prompts 💬

Paste these into your editor's agent chat, in order:

**1. Meet Jetic** — *first message in a fresh project:*
> I've installed the Jetic MCP tools. Summarize what you can do with them, then read my project's model summary and tell me what's in it.

**2. Re-analyse the whole project** — *builds your entire `model.json` from code:*
> Help me re-analyse the whole project: find ALL API endpoints in this codebase — routes, controllers, middleware, auth guards, request/response shapes — and add every missing endpoint to my .jetic/model.json using the jetic tools. Include security, middleware chains, parameters, and response schemas. When done, run jetic_verify_model and fix all errors.

**3. Zoom into one area** — *repeat per module until coverage is complete:*
> Analyse ONLY src/modules/payments: add/update all of its endpoints in the model with full detail (middleware, auth, validation constraints), then verify.

**4. Create a workflow** — *the agent validates before saving, then runs it:*
> Help create a workflow called "Shopper checkout" with these steps: (1) register a user with a faker email and capture the credentials, (2) log in and capture the access token, (3) create an order with the Bearer token and expect 201. Validate it BEFORE saving, then save it and simulate it against http://localhost:3000.

**5. Negative / conditional test** — *expect a specific status:*
> Help create a workflow called "Forbidden admin action" where a normal non-admin user logs in and calls DELETE /api/admin/users/:id expecting 403. Validate, save, and simulate it.

**6. Live-test & verify loop** — *anytime your API changes:*
> Test POST /api/auth/login against my local server at http://localhost:4000 with a realistic payload and tell me whether the response matches the model. Then verify the whole model and fix any issues.

Behind the scenes the agent uses `jetic_add_endpoint` (middleware, security, constraints), `jetic_verify_model`, `jetic_validate_workflow` → `jetic_create_workflow` → `jetic_simulate_workflow`. If a step fails, just paste the error back — the validation messages say exactly how to fix it.

### 3. Quickstart with Included Example (Terminal Flow — Needs an AI Key)

Prefer the terminal, or want Express auto-discovery? This flow uses `jetic scan` plus AI workflow generation, which requires your own AI provider key (`jetic config ai`). The [AI IDE path above](#-start-with-your-ai-ide-recommended-no-ai-key) needs no key.

```bash
cd examples/express-shop

# Configure AI credentials for workflow generation (OpenRouter or OpenAI)
# Windows PowerShell: $env:OPENROUTER_API_KEY="your-key"
# Linux/macOS: export OPENROUTER_API_KEY="your-key"

# Initialize Jetic workspace directory (.jetic/)
jetic init

# Configure AI provider
jetic config ai --provider openrouter --model anthropic/claude-3.5-sonnet --key-env OPENROUTER_API_KEY

# Scan source code and generate .jetic/model.json
jetic scan

# Inspect discovered API model
jetic inspect

# Run AI workflow simulation against live local backend
jetic simulate workflow --goal "Admin registers workspace, logs in, creates class and logs out"

# Launch Jetic Studio local web dashboard
jetic dev
```

---

## 💻 CLI Command Reference

### `jetic init`
Initializes a `.jetic/` directory in the current working directory with a default `config.json`.

```bash
jetic init
```

---

### `jetic scan`
Parses backend source code (via `tsconfig.json` and AST AST resolution), extracts endpoints, schemas, constraints, and source provenance, and writes `.jetic/model.json`.

```bash
jetic scan
```

---

### `jetic inspect`
Displays summary metrics or deep inspection details for discovered API endpoints.

```bash
# Display project summary (endpoint count, methods breakdown, security rules)
jetic inspect

# Inspect a specific endpoint (shows AST source provenance, parameters, response schema)
jetic inspect endpoint GET /api/orders/:id
```

---

### `jetic simulate endpoint`
Simulates single endpoints or the entire API model against a target environment server using generated data.

```bash
# Simulate all endpoints in model.json
jetic simulate endpoint --all

# Simulate a specific endpoint with detailed response logs
jetic simulate endpoint POST /api/auth/login --verbose

# Run simulations against a specific environment defined in model.json
jetic simulate endpoint --all --env staging
```

---

### `jetic simulate workflow`
Generates and executes multi-step AI-driven workflow integration tests with automatic state capture and header injection.

```bash
# Generate and run an AI workflow for a custom natural-language goal
jetic simulate workflow --goal "User signs up, verifies email, creates project, and invites member"

# List all saved workflows in .jetic/workflows/
jetic simulate workflow --list

# Execute an existing workflow JSON file
jetic simulate workflow --workflow .jetic/workflows/user-onboarding.json

# Generate workflow JSON without running HTTP requests
jetic simulate workflow --goal "Create order and pay" --generate-only

# Clear runtime memory before executing
jetic simulate workflow --workflow .jetic/workflows/user-onboarding.json --clear-memory
```

---

### `jetic dev`
Starts the **Jetic Studio** backend API server and serves the local web dashboard interface.

```bash
# Launch Jetic Studio on default port 8787
jetic dev

# Launch Jetic Studio on a custom port
jetic dev --port 9000
```

---

### `jetic memory`
Views and manages key-value entries stored in `.jetic/memory.json`.

```bash
# List all stored memory keys and values across scopes
jetic memory list

# Get value for a key (defaults to global scope or specify scope:key)
jetic memory get workflow:accessToken

# Set a key-value entry
jetic memory set workflow:accessToken "eyJhbGciOi..."

# Delete a key
jetic memory delete workflow:accessToken

# Clear all entries in memory.json
jetic memory clear
```

---

### `jetic mcp`
Launches the **Jetic Model Context Protocol (MCP) Server** over stdio, giving the AI assistant inside your code editor 16 typed tools to inspect, author, validate, and live-test endpoints and workflows — no AI key needed (the editor's own model is used).

```bash
# Launch MCP Server over stdio (uses current directory as project root)
jetic mcp

# Pin to a project explicitly (same as JETIC_PROJECT_PATH env var)
jetic mcp --project C:/path/to/your-backend
```

> **Start here instead:** [Start with Your AI IDE](#-start-with-your-ai-ide-recommended-no-ai-key) — install, one `jetic init`, one editor config snippet, and copy-paste chat prompts. Per-editor configs (opencode, Antigravity, Cursor, Claude Code/Desktop, Windsurf, VS Code): [packages/mcp-server/README.md](packages/mcp-server/README.md).

#### MCP Tools Provided to IDE Assistants (16):
- **Read**: `jetic_read_model` (full model or summary) · `jetic_list_endpoints` (filter by method/tag/resource/path) · `jetic_get_endpoint` (full structural detail) · `jetic_verify_model` (duplicates, unbound params, bad status codes, dangling sources) · `jetic_list_workflows`
- **Author endpoints** (full fidelity: middleware chains, security, pagination, rate limits, ownership, produces/consumes, constraints): `jetic_add_endpoint` · `jetic_update_endpoint` · `jetic_delete_endpoint` · `jetic_manage_environment`
- **Author workflows** (validate → create → simulate loop with memory data-flow checks): `jetic_validate_workflow` · `jetic_create_workflow` · `jetic_update_workflow` · `jetic_delete_workflow`
- **Run live** (needs a running server): `jetic_test_endpoint` (custom headers/body/query supported) · `jetic_simulate_workflow` (+ `jetic_simulate` alias)

---

### `jetic config`
Configures AI providers, API key environment variables, and project settings.

```bash
# Interactively or explicitly configure AI provider settings
jetic config ai --provider openrouter --model anthropic/claude-3.5-sonnet --key-env OPENROUTER_API_KEY

# View current configuration
jetic config list
```

---

### `jetic upgrade`
Checks for updates and upgrades Jetic dependencies across the workspace.

```bash
jetic upgrade
```

---

## 🖥️ Jetic Studio Dashboard

**Jetic Studio** (`jetic dev`) is a sleek, dark-mode local web application designed specifically for visual API discovery, source provenance checking, AI workflow debugging, runtime memory control, and visual trace observability.

---

### 1. 📊 Workspace Overview (`/overview`)
The command center for your API model. Provides high-level metrics, endpoint distribution charts, security posture summaries, and quick links to recently discovered routes and workflow runs.

- **Key Highlights**: Endpoint totals, method breakdown bar, secured route percentages, recent endpoint shortcuts, active workflow list, and top memory keys preview.

![Jetic Studio - Workspace Overview](screenshots/jetic_overview.JPG)

---

### 2. 🧩 Behavioral Model (`/model`)
Interactive visual explorer for `.jetic/model.json`.

- **Key Highlights**: HTTP method filtering (GET, POST, PUT, DELETE, PATCH), full-text search, request/response schema inspection cards, security badges (JWT, Bearer, API Keys), middleware lists, environment switcher, and instant **Inspect** trigger buttons.
- **Manual Endpoint Creation ("Add Endpoint")**: For non-Express/TypeScript projects or custom routes, click the **"Add Endpoint"** button to manually define HTTP methods, paths, parameters, schemas, and authentication requirements directly from the interface.

![Jetic Studio - Behavioral Model](screenshots/jetic_model_list.JPG)

<!-- 🖼️ SCREENSHOT PLACEHOLDER: ADD ENDPOINT BUTTON & MODAL -->
![Jetic Studio - Add Endpoint Modal Placeholder](screenshots/jetic_add_endpoint.JPG)
---

### 3. 🔬 Endpoint Inspect (`/inspect`)
Deep-dive inspection page for any single API endpoint.

- **Key Highlights**:
  - **AST Source Code Viewer**: Live preview of the backend handler source code centered on the exact line number (e.g. `routes/orders.ts:42`).
  - **Related Files Navigator**: Automatically parses imports to show connected controllers, services, and type declaration files.
  - **Schema Explorer**: Field-by-field breakdown of request body, query parameters, path params, response definitions, and discovered constraints.
  - **Interactive REST Client**: Test live endpoints directly from the browser using real or auto-generated fake data with authorization header injection.

![Jetic Studio - Endpoint Inspect](screenshots/jetic_endpoint_inspect.JPG)

---

### 4. 💎 AI Workflow Simulations (`/simulations`)
Visual AI workflow builder and step-by-step runner.

- **Key Highlights**:
  - **Goal-Based Generation**: Type any prompt (e.g. *"Admin creates workspace, invites teacher, creates class, logs out"*) to synthesize full workflow graphs.
  - **SSE Live Streaming**: Watch steps execute in real time via Server-Sent Events (SSE).
  - **Payload & Injection Inspection**: Expand steps to inspect resolved body values, injected headers (`Authorization`), expected vs actual status codes, and captured variables.

![Jetic Studio - AI Workflow Simulations](screenshots/jetic_smulations_expandable.JPG)

---

### 5. 🗄️ Memory Inspector (`/memory`)
Real-time state and key-value store inspector for `.jetic/memory.json`.

- **Key Highlights**:
  - View authorization tokens (JWTs, session cookies), user credentials, resource IDs, and custom variables.
  - Add, edit, or delete entries across `workflow` and `global` memory scopes.
  - Clear state between simulation runs.

![Jetic Studio - Memory Inspector](screenshots/jetic_memory.JPG)

---

### 6. 📈 Observability & Execution Traces (`/traces`)
Interactive ReactFlow node-graph visualizer for workflow execution traces.

- **Key Highlights**:
  - **Node Graph Flow**: Visualizes steps as HTTP nodes connected by variable capture memory nodes.
  - **Timeline Bar**: Proportional duration breakdown (ms) showing step latencies and pass/fail statuses.
  - **Step Detail Drawer**: Click any node to open a side drawer detailing HTTP headers (injected vs standard), raw request body, JSON response body, expected status checks, and JSONPath capture rules.

![Jetic Studio - Execution Traces](screenshots/jetic_traces.JPG)

---

## 📄 Artifact & File Schemas

### `.jetic/model.json` (Behavioral Model)

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
      "middleware": []
    }
  ]
}
```

---

### `.jetic/workflows/admin-onboarding.json` (Workflow Definition)

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

### `.jetic/memory.json` (Runtime State)

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

---

## 🗺️ Roadmap & Vision

- [x] **Zero-Execution AST Scanner**: Deep TypeScript/Express source parser via `ts-morph` with import resolver.
- [x] **Declarative Behavioral Modeling**: Versioned `.jetic/model.json` schema with source code line references.
- [x] **Stateful AI Workflow Engine**: Multi-step simulation generation with `captureInput`, `capture`, and `inject`.
- [x] **Jetic Studio Local Dashboard**: React 19 IDE with REST simulator, AI builder, memory editor, and ReactFlow trace visualizer.
- [ ] **State-Machine Transition Testing**: Automatic state transition verification (e.g. `payment.capture()` valid when `authorized`, invalid when `refunded`).
- [ ] **Security & Authorization Vulnerability Auditor**: Automatic IDOR (Insecure Direct Object Reference) and privilege escalation scenario synthesizer.
- [ ] **Plugin Ecosystem SDK**: Custom extensions for GraphQL, Webhooks, gRPC, and custom LLM tool-calling agent test suites.

---

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) guide for instructions on setting up your local development environment, running tests across monorepo packages, and submitting Pull Requests.

---

## 📝 License

This project is licensed under the [ISC License](LICENSE).

---

<p align="center">
  <i>Built with ❤️ by the Jetic Team. If you find Jetic useful, please consider giving us a ⭐ on GitHub!</i>
</p>
