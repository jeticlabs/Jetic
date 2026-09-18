# Model Context Protocol Server (`jetic mcp`) 🤖

The **Jetic MCP Server** (`jetic mcp`) bridges Jetic's backend behavioral engine with modern AI code editors (Cursor, Windsurf, Claude Code, Antigravity, VS Code, opencode).

---

## ⚡ Benefits

- **No API Key Required**: Uses your editor's built-in LLM models directly.
- **20 Structured MCP Tools**: Exposes typed tools for model building, endpoint inspection, workflow validation, live HTTP testing, and memory management.
- **Cross-Framework & Stack Support**: Enables AI editors to model backends in any language (TypeScript, Python, Go, Rust, Java, C#).

---

## 🛠️ Complete MCP Tool Catalog

### 1. Setup & Change Tracking
- `jetic_init`: Scaffold `.jetic/` workspace for new repositories.
- `jetic_scan`: Keyless Express+TS AST auto-scan with smart endpoint merging.
- `jetic_get_changes`: Read modified file paths from `.jetic/changes.json`.
- `jetic_clear_changes`: Clear file change log after re-modeling.

### 2. Read & Verification
- `jetic_read_model`: Read full model or quick summary metrics.
- `jetic_list_endpoints`: Filter endpoints by method, tag, path, or resource.
- `jetic_get_endpoint`: Get detailed structural definition of an endpoint.
- `jetic_verify_model`: Verify model for unbound parameters, dangling references, or missing status codes.
- `jetic_list_workflows`: List all saved workflows.

### 3. Endpoint Authoring
- `jetic_add_endpoint`: Add a new endpoint with middleware, auth, and schema constraints.
- `jetic_update_endpoint`: Update existing endpoint definition.
- `jetic_delete_endpoint`: Delete endpoint from model.
- `jetic_manage_environment`: Manage target environment base URLs.

### 4. Workflow Authoring & Simulation
- `jetic_validate_workflow`: Validate workflow step dependencies and capture rules before saving.
- `jetic_create_workflow`: Create a new workflow JSON file.
- `jetic_update_workflow`: Edit existing workflow file.
- `jetic_delete_workflow`: Delete workflow file.
- `jetic_test_endpoint`: Execute single live REST endpoint request.
- `jetic_simulate_workflow`: Simulate full multi-step workflow against target server.
