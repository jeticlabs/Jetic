# Monorepo Architecture 🏗️

Jetic is engineered as a **strict `pnpm` TypeScript monorepo** — one repository, 7 packages, 2 apps, single build graph, shared types.

---

## 📦 Workspace Layout

```
jetic/
├── apps/
│   ├── cli/                 # jetic-cli — Commander CLI + bundled Jetic Studio server
│   ├── dashboard/           # @jetic/dashboard — React 19 + Vite + Tailwind + ReactFlow Studio
│   └── docs/                # docs site (this site) — Vite + React + Tailwind
├── packages/
│   ├── core/                # @jetic/core — config, filesystem, errors, logger
│   ├── model/               # @jetic/model — BehavioralModel zod schema & TypeScript types
│   ├── memory/              # @jetic/memory — .jetic/memory.json scoped store
│   ├── scanner/             # @jetic/scanner — ts-morph ExpressScanner + ImportResolver + AI
│   ├── simulator/           # @jetic/simulator — DataGenerator, ResponseValidator, WorkflowSimulator
│   └── mcp-server/          # @jetic/mcp-server — MCP stdio server (20 tools)
├── examples/
│   ├── express-shop/        # Complex Express fixture (tests scanner end-to-end)
│   ├── Backend/             # Real-world BE (Prisma, modules)
│   └── disease-api/         # Minimal API example
├── screenshots/             # 21 dashboard screenshots & videos (mp4)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json             # root: pnpm -r run build / test / lint
```

![Monorepo high-level package dependency graph — core at center, scanner/simulator/memory dependent on model, cli dependent on all, dashboard standalone](/screenshots/mastra.jfif)
*Click image to enlarge — Dependency graph: `core ← model ← scanner/simulator/memory ← cli` and `mcp-server` bridging `model` to IDEs.*

---

## 🔗 Package Dependency Graph

| Package | Depends On | Provides To |
|---|---|---|
| `@jetic/core` | *(none)* | All packages — `loadConfig()`, `readJsonSync`, `ensureDirSync` |
| `@jetic/model` | `core` | `BehavioralModel`, `Endpoint`, `Workflow` types |
| `@jetic/memory` | `core` | `JeticMemory` scoped store |
| `@jetic/scanner` | `core`, `model`, `ts-morph`, `ai` | `ExpressScanner.scan()` → `BehavioralModel` |
| `@jetic/simulator` | `model`, `memory`, `faker` | `EndpointSimulator`, `WorkflowSimulator` |
| `@jetic/mcp-server` | `model`, `memory`, `simulator`, `core`, `@modelcontextprotocol/sdk` | MCP tools |
| `jetic-cli` | `core`, `model`, `memory`, `scanner`, `simulator`, `mcp-server`, `dashboard` (bundled) | `jetic` binary + `jetic dev` server |
| `@jetic/dashboard` | *(none, pure frontend)* | Bundled into `cli/dist/dashboard` |
| `docs` | *(standalone)* | This documentation site |

> [!TIP]
> Change `screenshots/mastra.jfif` placeholder to a generated `pnpm --filter @jetic/dashboard run build` + `madge --image` graph for true dependency visualization.

---

## 🛠️ Build System

- **Manager:** `pnpm@>=9.0.0` with `pnpm-workspace.yaml`
- **Bundler (CLI):** `tsup` → single `dist/index.js` (12.93 MB) — embeds `scanner/simulator/mcp-server` via inlining. Dashboard is copied post-build: `fs.cpSync('../dashboard/dist', './dist/dashboard')`
- **Bundler (Dashboard/Docs):** `vite@7.1.4` + `@vitejs/plugin-react-swc`
- **Types:** `tsconfig.base.json` → `tsconfig.json` per package, `tsc -b` for docs
- **Test:** `jest` + `ts-jest` in `scanner`
- **Lint:** `oxlint` + `oxfmt`

```bash
pnpm install          # install all workspaces
pnpm -r run build     # build packages in topological order (core → model → rest → cli/dashboard/docs)
pnpm --filter jetic-cli run build   # rebuild CLI only (also copies dashboard)
pnpm --filter @jetic/dashboard run build  # dashboard only — then restart jetic dev to see it
pnpm --filter docs run build    # this site
```

---

## 🔄 Workspace Dev Loop

1. Edit `packages/model/src/schema.ts` → `pnpm --filter @jetic/model run build`
2. Edit `apps/dashboard/src/pages/Workspace/*` → `pnpm --filter @jetic/dashboard run build` → restart `jetic dev` (serves `apps/cli/dist/dashboard`, which is a copy of dashboard dist)
3. Edit `apps/cli/src/commands/dev.ts` → `pnpm --filter jetic-cli run build`

> [!WARNING]
> Stale UI bundle is the #1 gotcha: `apps/dashboard/dist` vs `apps/cli/dist/dashboard` are two folders. Our build script now warns `Dashboard build not found. Build it with: pnpm --filter @jetic/dashboard run build` and auto-copies.

---

## 📂 Root Config Files

| File | Purpose |
|---|---|
| `pnpm-workspace.yaml` | Defines `packages/*`, `apps/*` workspaces |
| `tsconfig.base.json` | Shared `strict: true`, `ES2022`, `module: commonjs` |
| `package.json` | Root scripts `build/test/lint`, engines `node>=20.0.0` |
| `.npmrc` / `.oxlintrc.json` / `.oxfmtrc.json` | Registry + lint/format |

![Workspace build pipeline — pnpm topological build order diagram](/screenshots/step2.PNG)
*Click image to enlarge — Build pipeline visualization showing topological order.*
