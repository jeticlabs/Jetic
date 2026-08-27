<p align="center">
  <img src="https://avatars.githubusercontent.com/u/275651463?s=200&v=4" alt="Jetic Banner" width="120">
</p>

<h1 align="center">jetic-cli 🚀</h1>

<p align="center">
  <strong>AI-Native API Behavior Testing & Discovery Platform</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/jetic-cli"><img src="https://img.shields.io/npm/v/jetic-cli.svg" alt="NPM Version"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node Version"></a>
  <a href="https://github.com/jeticlabs/jetic/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-ISC-green.svg" alt="License"></a>
</p>

---

## ⚡ What is Jetic?

**Jetic** is a programmable developer platform that **automatically understands, models, and tests an application's API behavior directly from its source code.**

It connects to your Node.js/Express backend, statically analyzes the codebase using AST parsing (`ts-morph`), discovers endpoint structures and business logic constraints (e.g. `quantity > 0` or `role === "admin"`), builds a live behavioral graph, and uses AI to generate and execute end-to-end multi-step workflow tests.

---

## ✨ Key Features

- 🔍 **Zero-Execution Source Code Discovery**: Statically inspects TypeScript/Node.js/Express projects without running them.
- 🧩 **Deep Nested Router Resolution**: Flattens middleware and nested router handlers automatically.
- 🧠 **Intelligent Constraint Extraction**: Pulls validation rules and business logic conditions directly from handler source code.
- 🔗 **AI-Powered Workflow Simulations**: Automatically strings operations together (e.g., *Register → Login → Get Token → Create Order*) and manages session state.
- 🖥️ **Jetic Studio Dashboard**: Includes a sleek, dark-mode local IDE (`jetic dev`) for visual exploration, endpoint inspection, and memory management.

---

## 🚀 Quickstart

### Installation

```bash
# Install globally via npm
npm install -g jetic-cli

# Or run directly via npx
npx jetic-cli --help
```

### Initializing and Scanning a Project

Navigate to your TypeScript/Express backend directory:

```bash
# Initialize Jetic configuration (.jetic/config.json)
jetic init

# Scan backend AST and build the Behavioral Model (.jetic/model.json)
jetic scan
```

---

## 💻 CLI Command Reference

### `jetic init`
Initializes `.jetic/config.json` in your current project.

### `jetic scan`
Parses backend source code and generates `.jetic/model.json`.

```bash
jetic scan
```

### `jetic inspect`
Lists all discovered endpoints and paths.

```bash
# Inspect all endpoints
jetic inspect

# Inspect a specific endpoint in detail with file & line provenance
jetic inspect endpoint GET /api/orders/:id
```

### `jetic simulate`
Runs request simulations against live server endpoints.

```bash
# Simulate all endpoints
jetic simulate endpoint --all

# Verbose single endpoint simulation
jetic simulate endpoint GET /api/orders/:id --verbose
```

### `jetic simulate workflow` 🧠
Runs AI-powered end-to-end multi-step workflow simulations with token state injection.

```bash
# Generate and execute AI workflow
jetic simulate workflow

# Test a custom natural-language goal
jetic simulate workflow --goal "Admin creates exam, student enrolls, completes, gets results"

# Clear workflow memory before running
jetic simulate workflow --clear-memory
```

### `jetic dev` 🖥️
Launches **Jetic Studio Dashboard** locally in your web browser:

```bash
jetic dev
```

---

## 🖥️ Local Studio Dashboard (`jetic dev`)

Running `jetic dev` launches **Jetic Studio** on `http://localhost:8787` locally:

- 📊 **Workspace Overview (`/overview`)**: Stats breakdown, endpoint counts, and memory preview.
- 🧩 **Behavioral Model (`/model`)**: Interactive schema explorer and method filters.
- 🔬 **Endpoint Inspect (`/inspect`)**: AST source code viewer showing exact handler file and line numbers.
- 💎 **Simulations (`/simulations`)**: Visual step-by-step workflow runner.
- 🗄️ **Memory Inspector (`/memory`)**: Live session key-value store (`.jetic/memory.json`).

---

## 📄 License & Community

- **Website**: [jetic.online](https://jetic.online)
- **Documentation**: [docs.jetic.online](https://docs.jetic.online)
- **GitHub**: [github.com/jeticlabs/jetic](https://github.com/jeticlabs/jetic)
- **License**: ISC License
