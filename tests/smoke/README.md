# @jetic/smoke

Black-box smoke tests for the **built** Jetic CLI, `jetic dev` server and MCP server. They spawn
`apps/cli/dist/index.js` the way a user (or an editor) does, against a small runnable API.

Plan and results: [docs/smoke-tests/IMPLEMENTATION_PLAN.md](../../docs/smoke-tests/IMPLEMENTATION_PLAN.md).
What the product actually does, and every known gap: [docs/kb/](../../docs/kb/README.md).

## Running

```bash
pnpm install
pnpm -r run build          # the tests run against apps/cli/dist — rebuild after source changes
pnpm smoke                 # from the repo root, 4–5½ minutes on 8 cores

pnpm --filter @jetic/smoke run smoke -- specs/t4-mcp     # one area
pnpm --filter @jetic/smoke run smoke -- -t "SMK-208"     # one test
SMOKE_NIGHTLY=1 pnpm smoke                               # + packed-tarball install, registry check (network)
KEEP_SMOKE_TMP=1 pnpm smoke                              # keep temp projects; their paths are printed
UPDATE_GOLDEN=1 pnpm smoke -- -t SMK-104                 # rewrite fixtures/shop-api.expected.json (review the diff!)
```

## What is where

| Spec | Covers |
| --- | --- |
| `t0-build` | version, every command's `--help`, bundle self-containment, dashboard packing, standalone `jetic-mcp`, packed install (nightly) |
| `t1-*` | the CLI with no server: init, config, scan, inspect, model export, adapters, agents, doctor, memory, tools |
| `t2-*` | `simulate endpoint`, `simulate workflow`, `test --ci`, `authz` against the live fixture API |
| `t3-*` | `jetic dev`: model/environment/source/changes API, workflow CRUD, SSE runs, human input, memory, traces |
| `t4-*` | MCP over stdio: handshake, all 24 tools, error envelopes, project resolution, concurrency, shutdown |
| `t5-*` | the same workflow through all four runners must give the same verdict and traffic; the three scan paths must agree |

## Conventions

- **`SMK-<tier><nn>`** names a behavior that works and must keep working. **`KG-<nn>`** names a known gap
  from [known-gaps.md](../../docs/kb/known-gaps.md).
- A `KG-nn` test is `test.failing`: it asserts the *intended* behavior, so it passes today because the behavior
  is wrong. When someone fixes the gap the test turns red — convert it to a normal `test` and mark the row fixed.
  Before pinning a new gap, run the assertion as a normal test once and confirm it fails at the line that
  encodes the bug, not on setup.
- Spawn the CLI only through `runCli` / `runCliInteractive` (`harness/cli.ts`), `startDev` or `McpSession`.
  They set `NO_COLOR`, `JETIC_NO_OPEN` and the compile cache, enforce timeouts, and kill whole process trees.
- Each test works in its own temp project (`createProject` / `createShopProject`). Never write into the repo
  or rely on fixed ports; take one from `getFreePort()`. The fixture API (`startShopApi`) holds state at module
  level, so run at most one per spec file and call `api.reset()` in `beforeEach`.
- `createShopProject()` is a copy of a scan made once per file, with absolute paths rewritten. Pass
  `realScan: true` only in tests about the scanner itself.
- Never sleep. Use `waitFor(predicate)`.
- Assert on artifacts and exit codes before console text; strip ANSI (`out` already is).
- Port 8787 belongs to `t1-doctor-port` alone.
