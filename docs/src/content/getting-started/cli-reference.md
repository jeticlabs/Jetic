# CLI Command Reference 💻

Complete reference for all `jetic` CLI commands and options.

---

## `jetic init`

Initializes a `.jetic/` workspace directory with default `config.json` and storage.

```bash
jetic init
```

---

## `jetic scan`

Parses backend source code (Express + TypeScript via `ts-morph` AST parser), extracts endpoints, schemas, constraints, and source file line references, and writes `.jetic/model.json`.

```bash
jetic scan
```

---

## `jetic inspect`

Displays summary metrics or deep inspection details for discovered API endpoints.

```bash
# Display project summary (endpoint count, methods breakdown, security rules)
jetic inspect

# Inspect a specific endpoint (shows AST source provenance, parameters, response schema)
jetic inspect endpoint GET /api/orders/:id
```

---

## `jetic simulate endpoint`

Simulates single endpoints or the entire API model against a target server using generated data.

```bash
# Simulate all endpoints in model.json
jetic simulate endpoint --all

# Simulate a specific endpoint with detailed response logs
jetic simulate endpoint POST /api/auth/login --verbose

# Run simulations against a specific environment defined in model.json
jetic simulate endpoint --all --env staging
```

---

## `jetic simulate workflow`

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

## `jetic dev`

Starts the **Jetic Studio** backend API server and serves the local web dashboard interface.

```bash
# Launch Jetic Studio on default port 8787
jetic dev

# Launch Jetic Studio on a custom port
jetic dev --port 9000
```

---

## `jetic memory`

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

## `jetic mcp`

Launches the **Jetic Model Context Protocol (MCP) Server** over stdio, providing 20 typed tools to AI code assistants.

```bash
# Launch MCP Server over stdio
jetic mcp

# Specify project root directory explicitly
jetic mcp --project C:/path/to/your-backend
```

---

## `jetic config`

Configures AI providers, API key environment variables, and project settings.

```bash
# Configure AI provider settings
jetic config ai --provider openrouter --model anthropic/claude-3.5-sonnet --key-env OPENROUTER_API_KEY

# View current configuration
jetic config list
```
