# Introduction to Jetic 🚀

**Jetic** is an agentic, code-native developer platform that **automatically understands, models, simulates, and traces an application's API behavior directly from its backend source code.**

---

## ⚡ The Core Problem

Traditional API testing tools (Postman, Insomnia, generic test runners) force developers to manually write hundreds of repetitive test scripts, hardcode authorization tokens, guess parameter validation limits, and painstakingly string together sequential operations (*Register User → Login → Save Token → Create Resource → Update Resource → Delete Resource*).

Furthermore, conventional HTTP runners only check if an endpoint returns a `200 OK`. They do **not** understand what your API is actually *supposed* to do, what business constraints govern your handlers, or how state flows across endpoint boundaries.

---

## 💡 The Jetic Solution

Jetic brings AST source code analysis, declarative behavioral graphs, stateful AI workflow synthesis, and visual ReactFlow traces directly into your developer workflow:

1. 🔍 **Zero-Execution Source Code Scanning**: Jetic parses your TypeScript/Express Abstract Syntax Tree (AST via `ts-morph`) without running your server. It follows imports across controllers, services, middleware, and type declarations to discover routes, parameters, validation constraints, and auth schemes.
2. 🧠 **Declarative Behavioral Graph (`model.json`)**: Generates a versioned, strongly-typed behavioral graph mapping paths, HTTP methods, request schemas, response shapes, and exact source code provenance (file + line numbers).
3. 🤖 **AI-Driven Stateful Workflow Generation**: Uses AI to synthesize multi-step, end-to-end user journeys (`.jetic/workflows/*.json`).
4. 💾 **Pre/Post State Capture & Dynamic Injection**: Captures input parameters (like faker-generated email/password) before HTTP calls and response fields (like JWT tokens and resource IDs via JSONPath) after HTTP calls into `.jetic/memory.json`, automatically injecting them into subsequent headers (e.g. `Authorization: Bearer {{workflow:accessToken}}`) or body fields.
5. 📈 **ReactFlow Execution Traces in Jetic Studio**: Visually inspect step-by-step simulation node graphs, HTTP headers, request payloads, response bodies, latencies, and state passing in **Jetic Studio** local IDE.

> [!NOTE]
> **Framework & Language Support**: Automated AST source code scanning currently supports **Node.js & Express (TypeScript)** projects.
> For backends built with other languages or frameworks (e.g., Python/FastAPI, Go, Rust, Java, NestJS), you can manually add and manage endpoints directly inside **Jetic Studio** on the **Behavioral Model** page (`/model`) or connect your AI editor via `jetic mcp`.

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

---

## 🏗️ Monorepo Architecture

Jetic is structured as a TypeScript `pnpm` monorepo:

| Package | Package Name | Responsibility |
| :--- | :--- | :--- |
| **`apps/cli`** | `jetic-cli` | Commander CLI executable (`jetic`). Scanner, simulator, memory CLI, dev server, and MCP entry point. |
| **`apps/dashboard`** | `@jetic/dashboard` | **Jetic Studio** local web app. Features Overview, Model Explorer, Endpoint Inspect with AST viewer, AI Builder, Memory Inspector, and ReactFlow Traces. |
| **`packages/scanner`** | `@jetic/scanner` | Static AST analysis engine built on `ts-morph` (`ExpressScanner`, `ImportResolver`, `PathResolver`). |
| **`packages/model`** | `@jetic/model` | Schema definitions for `BehavioralModel`, `Endpoint`, `Parameter`, `Constraint`, `SecurityScheme`, `Workflow`. |
| **`packages/simulator`** | `@jetic/simulator` | Execution engine (`DataGenerator`, `ResponseValidator`, `EndpointSimulator`). |
| **`packages/memory`** | `@jetic/memory` | Persistence engine for `.jetic/memory.json` (`workflow` & `global` scopes). |
| **`packages/mcp-server`**| `@jetic/mcp-server` | MCP Server over stdio exposing 20 tools to AI IDEs (Cursor, Windsurf, Claude, Antigravity, opencode). |
