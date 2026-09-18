# Scanner Engine Deep Dive 🔍

`packages/scanner` — zero-execution static analysis via `ts-morph`. No server run, no runtime.

---

## 🔬 4 Phases of `ExpressScanner.scan()` (`src/express-scanner.ts:169`)

### Phase 1 — Route Discovery (`src/route-discovery.ts`)
Creates `new Project({ tsConfigFilePath })`, walks `app.use('/api/v1', router)` mounts, flattens nested routers, emits raw `{ method, path, handlerName, source: { file, line } }`.

![Route discovery — nested router flattening diagram](/screenshots/step2.PNG)
*Click image to enlarge — `app.use` → `router.post` flattening.*

### Phase 2 — Import Resolution (`src/import-resolver.ts`)
For each unique `routeFile`, `resolveRouteContext(file)` builds `contextFiles: Map<string, string>` — controllers, services, middleware, type declarations, recursively. Cache keyed by file.

### Phase 3 — AI Analysis (`src/ai-analyzer.ts`) — Optional
If `config.ai` is set, for each endpoint:
- Sends `routeFileContent + contextFiles` + `staticMiddleware` names to `generateObject({ model, schema: z.object({ parameters, requestBody, responses, middleware, securitySchemes }) })` via `ai` SDK (OpenAI/OpenRouter)
- Splits `body` vs `non-body` params, injects missing `:path` params, builds `requestBody.fields`, multi-status `responses`, `middleware` chain, `security: [{scheme}]` via `isAuthMiddleware()`.
- Without `config.ai` — still injects `:path` params and static `security` from middleware names for free.

### Phase 4 — Normalization (`src/normalizer.ts` + `src/path-resolver.ts`)
`normalizeDiscoveries()` deduplicates, `extractPathParams()` injects path params, `detectEnvironments()` reads `/.env` / `model.json` environments.

---

## 🧪 Scanner Internals Diagram

```
Project(tsConfig) → discoverRoutes() → normalizeDiscoveries() → endpoints[]
        ↓ routeFile                  ↓ endpoints[].source.file
   resolveRouteContext() → contextFiles ─→ AiAnalyzer.analyzeEndpoint() → enriched endpoints
        ↓
   BehavioralModel { version, project, environments, endpoints, securitySchemes }
        ↓ writeJsonSync
   .jetic/model.json
```

---

## 🔧 Path Resolver & Normalizer

- `PathResolver` — resolves relative imports to absolute `filePath` for import tracing.
- `Normalizer` — ensures `path` starts with `/`, method uppercased, `source` absolute, `middleware: []` default.

---

## 🧪 Tests

`src/express-scanner.test.ts` — Jest + ts-jest, uses in-memory `Project` with virtual files. Run: `pnpm --filter @jetic/scanner test`.

![Scanner test — virtual project with route file and assertion](/screenshots/step3.PNG)
*Click image to enlarge — Test fixture showing virtual route file.*

> [!NOTE]
> `jetic mcp` `jetic_scan` tool calls this in **static-only mode** (`config.ai = undefined`) so it works keyless. Ported progress bars are silenced via `quietly()` to keep MCP stdio clean.
