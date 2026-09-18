# Tech Stack & Dependencies 🧱

Every runtime and tooling choice in Jetic is visible in `package.json` files — no hidden globals.

---

## 🖥️ Runtime

| Tech | Version | Where | Why |
|---|---|---|---|
| `Node.js` | `>=20.19.0` | `engines` in all packages | `fetch` native, `fs.cpSync`, `readline/promises` |
| `pnpm` | `>=9.0.0` | `packageManager` | Workspace symlinks, `workspace:*` protocol |
| `TypeScript` | `5.8.3` | `devDependencies` | Strict types for `BehavioralModel` |
| `tsx` | `4.x` | CLI dev | Run TS without build |

---

## 📦 Core Libraries

### `packages/model` — No runtime deps
Pure types + `zod` validators for `BehavioralModel`. Single source of truth imported by every package.

### `packages/scanner`
| Dep | Purpose |
|---|---|
| `ts-morph@21.0.1` | AST parse `Project`, `SourceFile`, `Node`, `ImportDeclaration` |
| `ai@7.65` + `@ai-sdk/openai@4.0.41` + `@openrouter/ai-sdk-provider@3.0.0` | `generateObject()` with `z.object()` schema for AI analysis |
| `zod@3.23.8` | Validate AI output |

### `packages/simulator`
| Dep | Purpose |
|---|---|
| `@faker-js/faker@9.0.0` | `{{faker.internet.email}}`, `{{faker.string.uuid}}` |
| `zod` | Response field validation |

### `packages/memory`
Zero deps — pure `fs` + `path` on `.jetic/memory.json`. TTL via `expiresAt`.

### `packages/mcp-server` & `apps/cli`
| Dep | Purpose |
|---|---|
| `@modelcontextprotocol/sdk@1.6.0` | `McpServer`, `StdioServerTransport`, `SerializedTransport` |
| `commander@12.0.0` | `jetic` CLI arg parsing |
| `express@4.21.2` | `jetic dev` server (`/api/model`, `/api/workflows/run` SSE) |
| `ai` + OpenAI/OpenRouter | Workflow generation `generateWorkflow()` |

---

## 🎨 Frontend

| Tech | Version | Where |
|---|---|---|
| `react@19.1.1` + `react-dom@19.1.1` | Dashboard + Docs |
| `vite@7.1.4` + `@vitejs/plugin-react-swc@4.0.1` | Bundler |
| `tailwindcss@4.1.12` + `@tailwindcss/vite@4.1.12` | Styling — dark `bg-[#090b11]` `zinc-800` |
| `reactflow@11.11.4` | `/traces` node-graph |
| `lucide-react@1.33.0` | Icons (consistent `strokeWidth={2}`) |
| `react-markdown@10.1.0` | Docs rendering |

---

## 🧪 Tooling

| Tool | Config | Purpose |
|---|---|---|
| `jest@29.7.0` + `ts-jest` | `packages/scanner/jest.config.js` | Scanner unit tests (`express-scanner.test.ts`) |
| `oxlint@1.74.0` | `.oxlintrc.json` | Lint (faster than eslint) |
| `oxfmt@0.59.0` | `.oxfmtrc.json` | Format |
| `eslint@9.0.0` | Root `eslint.config` | Monorepo lint |
| `tsup@8.5.1` | `apps/cli/tsup.config.ts` | CLI bundling |

---

## 📸 Stack Visualization

![Tech stack logos — Node, TypeScript, React, Vite, Tailwind, pnpm](/screenshots/jetic_dot.png)
*Click image to enlarge — Stack logo collage. Replace with custom stack diagram.*

> [!NOTE]
> To update this page, run `pnpm list --depth=0` and `npm view jetic-cli dependencies` and paste output here.
