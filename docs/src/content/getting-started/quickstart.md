# Quickstart Guide ⚡

Get started with **Jetic** in under 2 minutes.

---

## 📦 Installation

### Option A: Install via NPM (Global CLI)

```bash
# Install package globally via npm
npm install -g jetic-cli

# Verify installation
jetic --help
```

### Option B: Monorepo Source Setup

```bash
git clone https://github.com/your-username/jetic.git
cd jetic
pnpm install
pnpm build
cd apps/cli
pnpm link --global
```

---

## 🤖 Option 1: Start with Your AI IDE (Recommended, No AI Key Needed)

The fastest way to use Jetic is through the AI assistant already inside your code editor (opencode, Antigravity, Cursor, Claude Code, Windsurf, or VS Code). Your editor's LLM drives Jetic's 20 MCP tools directly — **no OpenRouter/OpenAI key and no `jetic scan` needed to begin**.

### Step 1 — Initialize Your Backend

```bash
cd path/to/your-backend
jetic init
```

### Step 2 — Connect MCP Server to Your Editor

For **opencode** (`opencode.json` in global config or project root):

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

> [!TIP]
> On macOS/Linux, use `"command": ["jetic", "mcp"]`. Point `cwd` at your project root.

Restart your editor (or refresh its MCP panel) and confirm `jetic_*` tools appear.

### Step 3 — Onboard with Chat Prompts 💬

Paste these prompts into your editor's AI chat panel:

1. **Meet Jetic**:
   > I've installed the Jetic MCP tools. Summarize what you can do with them, then read my project's model summary and tell me what's in it.

2. **Build Behavioral Model**:
   > Help me re-analyse the whole project: find ALL API endpoints in this codebase — routes, controllers, middleware, auth guards, request/response shapes — and add every missing endpoint to my .jetic/model.json using the jetic tools.

3. **Generate & Run Workflow**:
   > Help create a workflow called "User Registration & Profile Update" with faker credentials, capture access token, validate, save, and simulate it against http://localhost:3000.

---

## 💻 Option 2: Terminal Scan & CLI Flow (Requires AI Key)

If you prefer using the terminal command line directly with automatic Express AST scanner:

```bash
cd your-express-backend

# 1. Initialize Jetic workspace
jetic init

# 2. Configure AI provider
jetic config ai --provider openrouter --model anthropic/claude-3.5-sonnet --key-env OPENROUTER_API_KEY

# 3. Scan AST source code
jetic scan

# 4. Inspect model
jetic inspect

# 5. Simulate AI workflow against local server
jetic simulate workflow --goal "User registers, logs in, and fetches profile"

# 6. Launch Jetic Studio web dashboard
jetic dev
```
