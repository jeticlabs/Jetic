<!-- PROJECT LOGO OR ANIMATED BANNER GOES HERE -->
<!-- 💡 TIP: Replace this placeholder image with a high-quality animated GIF or banner showcasing Jetic CLI and Studio Dashboard in action. -->
<p align="center">
  <img src="https://avatars.githubusercontent.com/u/275651463?s=200&v=4" alt="Jetic Banner">
</p>

<h1 align="center">Jetic 🚀</h1>

<p align="center">
  <strong>AI-Native API Behavior Testing & Discovery Platform</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#cli-commands">CLI Commands</a> •
  <a href="#local-dashboard">Local Dashboard</a> •
  <a href="#how-it-works">How it Works</a> •
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.1.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node Version">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange" alt="PNPM">
  <img src="https://img.shields.io/badge/license-ISC-green.svg" alt="License">
</p>

---

## ⚡ The Problem

Traditional API testing requires developers to manually write hundreds of tests, configure every endpoint, generate test data, and manually string together workflows (e.g., *Register → Login → Get Token → Create Resource*). Existing tools only test whether an endpoint *responds*; they don't understand what the API is *supposed* to do.

## 💡 The Jetic Solution

**Jetic** is a programmable developer platform that **automatically understands, models, and tests an application's API behavior directly from its source code.** 

It connects to your project, statically analyzes the backend, discovers the API structure and behavioral constraints (e.g., `quantity > 0` or `role === "admin"`), builds a live behavioral graph, and uses AI to automatically generate and execute end-to-end tests through both a **blazing fast CLI** and a **rich local web dashboard (Jetic Studio)**.

<!-- 💡 TIP: ARCHITECTURE DIAGRAM PLACEHOLDER -->
<!-- Add a Mermaid diagram or a graphic here showing Scanner -> API Discovery -> Behavioral Model -> Test Planner & Dashboard flow. -->

---

## ✨ Key Features

- 🔍 **Zero-Execution Source Code Discovery**: Deeply inspects TypeScript/Node.js/Express projects without running them using AST parsing (`ts-morph`).
- 🧩 **Deep Nested Router Resolution**: Seamlessly connects prefix strings to actual route handlers (e.g., maps `app.use('/api/orders', ordersRouter)` to `router.get('/:id')`).
- 🧠 **Intelligent Constraint Discovery**: Extracts business logic conditions (e.g., password minimum lengths, role requirements) directly from `if`-statements in the handler code.
- 🔗 **AI-Powered Workflow Inference**: Automatically determines dependencies between operations and injects state. It knows that `POST /orders` requires the JWT obtained from `POST /login`.
- 📊 **Declarative Behavioral Modeling**: Outputs a versioned `.jetic/model.json` schema mapping HTTP methods, paths, and source provenance (exact file/line numbers).
- 🖥️ **Jetic Studio Dashboard**: A state-of-the-art dark-mode local IDE for visual API discovery, source inspection, live endpoint interactive simulation, workflow execution, and memory management.
- 💻 **Blazing Fast CLI**: A lightweight command-line interface bringing full API intelligence directly to your terminal.

---

## 🏗️ Architecture & Monorepo Structure

Jetic is organized as a modern `pnpm` monorepo using TypeScript:

- 📂 **`apps/cli`**: The main `jetic` command-line executable.
- 📂 **`apps/dashboard`**: **Jetic Studio** — sleek React 19 + Vite + TailwindCSS local developer web interface.
- 📦 **`packages/core`**: Core configuration, error handling, and filesystem abstractions.
- 📦 **`packages/model`**: The strongly-typed `BehavioralModel` schema definitions.
- 📦 **`packages/scanner`**: The static analysis engine (AST parsing, path resolution, and normalization).
- 🧪 **`examples/express-shop`**: An intentionally complex Express fixture for automated testing.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v20+) and [pnpm](https://pnpm.io/) (v9+) installed.

### 1. Installation & Build

```bash
# Clone the repository
git clone https://github.com/your-username/jetic.git
cd jetic

# Install dependencies and build the monorepo
pnpm install
pnpm build
```

### 2. Exploring the Example Project

The fastest way to understand Jetic is to run it against the included `express-shop` example.

```bash
cd examples/express-shop

# Set your OpenRouter API key for AI generation features
# (On Windows use SET, on Mac/Linux use export)
export OPENROUTER_API_KEY="your_api_key_here"

# Initialize Jetic configuration
jetic-cli init

# Scan the project and build the Behavioral Model
jetic-cli scan
```

---

## 💻 CLI Commands

<!-- 💡 TIP: CLI DEMO GIF PLACEHOLDER -->
<!-- Add an animated GIF here showing the CLI 'scan' and 'simulate' commands in action. -->

### Inspect Discovered APIs
```bash
# View all discovered endpoints
jetic-cli inspect

# Inspect a specific endpoint in detail (shows exact source provenance)
jetic-cli inspect endpoint GET /api/orders/:id
```

### Simulate and Test Endpoints
```bash
# Simulate all endpoints against the live server
jetic-cli simulate endpoint --all

# Simulate a specific endpoint with verbose output
jetic-cli simulate endpoint GET /api/orders/:id --verbose
```

### AI-Powered Workflow Simulation 🧠
Jetic automatically deduces and executes entire API workflows (e.g., *Register → Login → Create Order → Get Receipt*) and passes tokens intelligently via memory injection.

```bash
# Generate and execute an AI-driven workflow
jetic-cli simulate workflow

# Test a custom natural-language goal
jetic-cli simulate workflow --goal "Admin creates exam, student enrolls, completes, gets results"

# Generate a workflow.json graph without executing it
jetic-cli simulate workflow --generate-only

# Execute an existing generated workflow
jetic-cli simulate workflow --workflow .jetic/workflow.json

# Clear state/memory before running
jetic-cli simulate workflow --clear-memory
```

---

## 🖥️ Local Dashboard (Jetic Studio)

Jetic includes a premium, local developer dashboard (**Jetic Studio**) designed for visual API exploration, interactive testing, source provenance viewing, AI workflow debugging, and runtime state inspection.

### Running the Dashboard

```bash
# Start the dashboard locally from the monorepo
pnpm --filter @jetic/dashboard dev

# Or launch it directly via CLI (when linked)
jetic-cli dev
```

---

### 📌 Dashboard Pages & Features Overview

#### 1. 📊 Workspace: Overview (`/overview`)
The central command dashboard summarizing project metrics, endpoint breakdown, security posture, and runtime memory.
- **Key Features**: High-level stat cards (Endpoints count, Workflows, Memory Keys, Secured routes %), HTTP method distribution graph, recent endpoint shortcut list, recent AI workflows list, and active memory key preview.

<!-- 🖼️ SCREENSHOT PLACEHOLDER: WORKSPACE OVERVIEW -->
<!-- Place screenshot of the Workspace Overview page here -->
![Jetic Studio - Workspace Overview](/screenshots/jetic_overview.JPG)

---

#### 2. 🧩 Workspace: Model (`/model`)
Comprehensive visual explorer for your application's Behavioral Model (`.jetic/model.json`).
- **Key Features**: Instant search & HTTP method filtering (GET, POST, PUT, DELETE), detailed request/response schema inspect cards, security scheme badges (JWT, Bearer), middleware list, and quick **Inspect** trigger buttons.

<!-- 🖼️ SCREENSHOT PLACEHOLDER: WORKSPACE MODEL -->
<!-- Place screenshot of the Behavioral Model page here -->
![Jetic Studio - Behavioral Model](/screenshots/jetic_model_list.JPG)

---

#### 3. 🔬 Workspace: Inspect (`/inspect`)
Deep-dive inspection page for any single API endpoint.
- **Key Features**:
  - **Source Code Viewer**: Live AST preview showing the exact backend source file and handler line number (e.g., `routes/orders.ts:42`).
  - **Related Files**: Automatically resolves imported helper files and data models tied to the endpoint.
  - **Request & Response Schemas**: Field definitions, data types, format requirements, and HTTP response codes.
  - **Interactive Endpoint Simulator**: Run live requests using real or auto-generated fake data with authorization token headers.

<!-- 🖼️ SCREENSHOT PLACEHOLDER: WORKSPACE INSPECT -->
<!-- Place screenshot of the Endpoint Inspect page here -->
![Jetic Studio - Endpoint Inspect](/screenshots/jetic_endpoint_inspect.JPG)

---

#### 4. 💎 Workspace: Simulations (`/simulations`)
Visual AI workflow builder and step-by-step simulation runner.
- **Key Features**: Run multi-step user journeys generated by AI or custom natural language goals, inspect request/response payloads at each step, track step execution status, and visualize state passing between steps.

<!-- 🖼️ SCREENSHOT PLACEHOLDER: WORKSPACE SIMULATIONS -->
<!-- Place screenshot of the Simulations page here -->
![Jetic Studio - AI Workflow Simulations](/screenshots/jetic_smulations_expandable.JPG)

---

#### 5. 🗄️ Agent: Memory (`/memory`)
Runtime state and key-value store inspector (`.jetic/memory.json`).
- **Key Features**: View stored authorization tokens (JWTs, session IDs), global variables, dynamic runtime keys, and manage session memory across simulation runs.

<!-- 🖼️ SCREENSHOT PLACEHOLDER: AGENT MEMORY -->
<!-- Place screenshot of the Memory page here -->
![Jetic Studio - Memory Inspector](/screenshots/jetic_memory.JPG)
---

#### 8. 📈 Observability: Traces & Events (`/traces`, `/events`) (coming soon)
Real-time API request monitoring and event log viewer.
- **Key Features**: Live timeline traces, request duration latencies, status code distribution, and execution event stream logs.

<!-- 🖼️ SCREENSHOT PLACEHOLDER: OBSERVABILITY TRACES & EVENTS -->
<!-- Place screenshot of Observability pages here -->
![Jetic Studio - Observability Traces](https://via.placeholder.com/1200x675.png?text=Placeholder:+Observability+Traces+Page+Screenshot)

---

#### ⚡ Jetic AI Assistant (Copilot Drawer) (coming soon)
Interactive AI assistant accessible anywhere in Jetic Studio via the sidebar or `Sparkles` trigger.
- **Key Features**: Ask questions about your API structure, generate simulation goals, diagnose failing endpoints, and get instant recommendations directly within your workflow.

<!-- 🖼️ SCREENSHOT PLACEHOLDER: AI ASSISTANT -->
<!-- Place screenshot of the Jetic AI Assistant drawer here -->
![Jetic Studio - AI Assistant Drawer](https://via.placeholder.com/1200x675.png?text=Placeholder:+AI+Assistant+Drawer+Screenshot)

---

## 🛠️ How It Works Deep Dive

1. **AST Extraction**: Running `jetic scan` triggers the `ExpressScanner` to parse the Abstract Syntax Tree (AST) of your backend via your `tsconfig.json`.
2. **Path Resolution**: Middleware (`app.use`) and standalone Routers are detected and flattened.
3. **Constraint & Logic Discovery**: The scanner extracts business logic (`password.length < 8` → minimum length: 8) preventing the need for arbitrary fuzzing.
4. **Behavioral Model Construction**: Data is normalized into `.jetic/model.json`.
5. **AI Workflow Generation**: The AI analyzes the `model.json` to create a `workflow.json` test graph, storing authorization tokens (like JWTs) in `.jetic/memory.json` to inject into subsequent requests automatically.
6. **Studio Synchronization**: Jetic Studio reads `.jetic/model.json` and `.jetic/memory.json` in real time to present live insights and interactive testing tools.

---

## 🗺️ Roadmap & Vision

- [x] **Web Dashboard (Jetic Studio)**: An API observability IDE providing deep insights into API health, constraints, source provenance, and workflow execution.
- [ ] **`jetic test`**: Synthesize smart, targeted requests checking boundary values and auth errors based on discovered constraints.
- [ ] **State-Aware Testing**: Understand that `refund()` should work on `captured` payments, but fail on `refunded` ones.
- [ ] **Custom Plugin Ecosystem**: SDK for adding support for Security testing, GraphQL, Webhooks, or custom AI Agents.

---

## 📚 Documentation

For deep dives into the architecture, workflow simulations, and plugin system, please check our [Documentation Folder](./docs).

---

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to set up the development environment, run tests, and submit Pull Requests.

---

## 📝 License

This project is licensed under the [ISC License](LICENSE).

---

<p align="center">
  <i>If you find Jetic useful, please consider giving us a ⭐ on GitHub!</i>
</p>
