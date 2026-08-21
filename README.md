<!-- PROJECT LOGO OR ANIMATED BANNER GOES HERE -->
<!-- 💡 TIP: Replace this placeholder image with a high-quality animated GIF or beautiful banner showcasing the Jetic CLI in action. A tool like 'vhs' or 'terminalizer' works great for CLI animations. -->
<p align="center">
  <img src="https://via.placeholder.com/800x300.png?text=Jetic+AI-Native+API+Testing+Platform" alt="Jetic Banner">
</p>

<h1 align="center">Jetic 🚀</h1>

<p align="center">
  <strong>AI-Native API Behavior Testing & Discovery Platform</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#how-it-works">How it Works</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#contributing">Contributing</a>
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

It connects to your project, statically analyzes the backend, discovers the API structure and behavioral constraints (e.g., `quantity > 0` or `role === "admin"`), builds a live behavioral graph, and uses AI to automatically generate and execute end-to-end tests.

<!-- 💡 TIP: ARCHITECTURE DIAGRAM PLACEHOLDER -->
<!-- Add a Mermaid diagram or a beautiful graphic here showing the Scanner -> API Discovery -> Behavioral Model -> Test Planner flow. Visuals significantly boost repository engagement. -->

## ✨ Key Features (v0.1.0 MVP)

- 🔍 **Zero-Execution Source Code Discovery**: Deeply inspects TypeScript/Node.js/Express projects without running them using AST parsing (`ts-morph`).
- 🧩 **Deep Nested Router Resolution**: Seamlessly connects prefix strings to actual route handlers (e.g., maps `app.use('/api/orders', ordersRouter)` to `router.get('/:id')`).
- 🧠 **Intelligent Constraint Discovery**: Extracts business logic conditions (e.g., password minimum lengths, role requirements) directly from `if`-statements in the handler code.
- 🔗 **AI-Powered Workflow Inference**: Automatically determines dependencies between operations and injects state. It knows that `POST /orders` requires the JWT obtained from `POST /login`.
- 📊 **Declarative Behavioral Modeling**: Outputs a versioned `.jetic/model.json` schema mapping HTTP methods, paths, and source provenance (exact file/line numbers).
- 💻 **Blazing Fast CLI**: A lightweight command-line interface bringing full API intelligence directly to your terminal.

---

## 🏗️ Architecture & Monorepo Structure

Jetic is organized as a modern `pnpm` monorepo using TypeScript:

- 📂 **`apps/cli`**: The main `jetic` command-line executable.
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
node ../../apps/cli/dist/index.js init

# Scan the project and build the Behavioral Model
node ../../apps/cli/dist/index.js scan
```

### 3. CLI Commands

<!-- 💡 TIP: CLI DEMO GIF PLACEHOLDER -->
<!-- Add an animated GIF here showing the CLI 'scan' and 'simulate' commands in action. A moving terminal gets the most attention! -->

**Inspect the Discovered API:**
```bash
# View all discovered endpoints
node ../../apps/cli/dist/index.js inspect

# Inspect a specific endpoint in detail (shows exact source provenance)
node ../../apps/cli/dist/index.js inspect endpoint GET /api/orders/:id
```

**Simulate and Test (Ensure the target server is running):**
```bash
# Simulate all endpoints against the live server
node ../../apps/cli/dist/index.js simulate endpoint --all

# Simulate a specific endpoint with verbose output
node ../../apps/cli/dist/index.js simulate endpoint GET /api/orders/:id --verbose
```

### 4. AI-Powered Workflow Simulation 🧠

Jetic can automatically deduce and execute entire API workflows (e.g., *Register → Login → Create Exam → Enroll → Get Results*) and pass tokens intelligently via memory injection.

```bash
# Generate and execute an AI-driven workflow
node ../../apps/cli/dist/index.js simulate workflow

# Test a custom natural-language goal
node ../../apps/cli/dist/index.js simulate workflow --goal "Admin creates exam, student enrolls, completes, gets results"

# Generate a workflow.json graph without executing it
node ../../apps/cli/dist/index.js simulate workflow --generate-only

# Execute an existing generated workflow
node ../../apps/cli/dist/index.js simulate workflow --workflow .jetic/workflow.json

# Clear state/memory before running
node ../../apps/cli/dist/index.js simulate workflow --clear-memory
```

---

## 🛠️ How It Works Deep Dive

1. **AST Extraction**: Running `jetic scan` triggers the `ExpressScanner` to parse the Abstract Syntax Tree (AST) of your backend via your `tsconfig.json`.
2. **Path Resolution**: Middleware (`app.use`) and standalone Routers are detected and flattened.
3. **Constraint & Logic Discovery**: The scanner extracts business logic (`password.length < 8` → minimum length: 8) preventing the need for arbitrary fuzzing.
4. **Behavioral Model Construction**: Data is normalized into `.jetic/model.json`.
5. **AI Workflow Generation**: The AI analyzes the `model.json` to create a `workflow.json` test graph, storing authorization tokens (like JWTs) in `.jetic/memory.json` to inject into subsequent requests automatically.

---

## 🗺️ Roadmap & Vision

- [ ] **`jetic test`**: Synthesize smart, targeted requests checking boundary values and auth errors based on discovered constraints.
- [ ] **State-Aware Testing**: Understand that `refund()` should work on `captured` payments, but fail on `refunded` ones.
- [ ] **Custom Plugin Ecosystem**: SDK for adding support for Security testing, GraphQL, Webhooks, or custom AI Agents.
- [ ] **Web Dashboard**: An API observability IDE that provides deep insights into API health, constraints, and dependencies rather than just generic pass/fail logs.

---

## 📚 Documentation

<!-- 💡 TIP: Add links to your detailed documentation pages here once they are created -->
For deep dives into the architecture, workflow simulations, and plugin system, please check our [Documentation Folder](./docs) (Coming Soon).

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
