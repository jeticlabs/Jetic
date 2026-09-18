# Jetic Studio Dashboard (`jetic dev`) 🖥️

**Jetic Studio** is a local web application (`jetic dev`) designed specifically for visual API discovery, AST source code inspecting, AI workflow simulations, memory state editing, and execution trace debugging.

---

## 7 Core Modules

### 1. 📊 Workspace Overview (`/overview`)
High-level dashboard providing endpoint totals, HTTP method distribution breakdown, security posture summary, and recent activity logs.

### 2. 🧩 Behavioral Model Explorer (`/model`)
Visual explorer for `.jetic/model.json`. Allows filtering by HTTP method, text search, schema card inspection, security scheme badges, and manual endpoint creation via the **"Add Endpoint"** modal.

### 3. 🔬 Endpoint Inspect (`/inspect`)
Deep inspection view featuring:
- **AST Source Code Viewer**: Live preview of the backend handler source centered on the exact line number (`src/routes/orders.ts:42`).
- **Related Files Navigator**: Shows connected controllers, services, and type declaration files parsed from imports.
- **REST Test Client**: Test live endpoints directly with generated mock payloads or custom input.

### 4. 💎 AI Workflow Simulations (`/simulations`)
Visual workflow builder and runner:
- Synthesizes workflows from natural language prompts.
- Runs step-by-step with real-time SSE streaming.
- Inspects resolved faker payloads, header injections, status checks, and memory captures.

### 5. 🗄️ Memory Inspector (`/memory`)
Real-time state inspector for `.jetic/memory.json`. View, add, edit, or clear `workflow` and `global` scope key-value pairs.

### 6. 📈 Execution Traces (`/traces`)
Interactive ReactFlow node-graph visualizer for workflow execution traces:
- Renders workflow steps as connected nodes.
- Timeline latency breakdown (ms).
- Side drawer detailing headers, request payloads, response bodies, and JSONPath capture rules.

### 7. 🔄 File Changes (`/changes`)
Real-time file observer powered by SSE stream (`/api/changes/stream`). Tracks modified source files live without Git overhead and notifies when model rescan is recommended.
