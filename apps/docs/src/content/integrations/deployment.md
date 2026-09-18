# Deployment & Global Install 🚀

How `jetic-cli` ships to users and how `jetic dev` serves the dashboard in production.

---

## 📦 NPM Publishing

`apps/cli/package.json:4` `"name": "jetic-cli"`, `bin: { jetic: "dist/index.js" }`.

Build:
```bash
pnpm --filter @jetic/dashboard run build   # vite → dashboard/dist
pnpm --filter jetic-cli run build          # tsup → cli/dist/index.js (12.93 MB) + fs.cpSync('../dashboard/dist', './dist/dashboard')
npm pack --dry-run   # verify 13 files (dist/index.js + dist/dashboard/*)
npm publish
```

Users:
```bash
npm install -g jetic-cli
jetic --help
jetic init   # inside any backend repo
```

> [!NOTE]
> Global vs workspace dev loop: `jetic mcp` resolves dashboard via `require.resolve('@jetic/dashboard/package.json')` with fallback `path.join(__dirname, 'dashboard')`. Workspace `pnpm --filter docs run build` does not affect global users — they need `npm update -g jetic-cli`.

---

## 🌐 Environments

`model.json → environments: [{ name: "local", baseUrl: "http://localhost:3000" }, { name: "staging", ... }]`

- CLI: `jetic simulate endpoint --all --env staging` or `jetic simulate workflow --workflow foo --env local`
- MCP: `jetic_manage_environment { action: "add", name: "staging", baseUrl: "https://api.staging.com" }` then `jetic_simulate_workflow { envName: "staging" }`
- Dashboard: environment switcher in `/model` header, persisted to `model.json → defaultEnvironment`.

---

## 🔒 Security Schemes

`model.json → securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", obtainedFrom: { endpoint: "POST /api/auth/login", field: "data.accessToken" } } }`

Simulator auto-calls `obtainedFrom` endpoint if no `workflow:accessToken` in memory — no manual token pasting.

---

## 🖼️ Deployment Diagram Placeholder

![Deployment diagram — npm global install → jetic dev server → dashboard + SSE → API backend](/screenshots/jetic_dot.png)
*Click image to enlarge — Replace with infra diagram.*
