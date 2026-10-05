# @jetic/smoke

Black-box smoke tests for the **built** Jetic CLI, `jetic dev` server and MCP server. Plan and test catalog: [docs/smoke-tests/IMPLEMENTATION_PLAN.md](../../docs/smoke-tests/IMPLEMENTATION_PLAN.md). Background: [docs/kb/](../../docs/kb/README.md).

## Running

```bash
pnpm install
pnpm -r run build          # smoke tests run against apps/cli/dist — rebuild after source changes
pnpm smoke                 # from the repo root

# a subset
pnpm --filter @jetic/smoke run smoke -- -t "SMK-2"
# include nightly tests (packed-tarball install; needs network)
SMOKE_NIGHTLY=1 pnpm smoke
# keep temp projects for debugging (paths printed to stderr)
KEEP_SMOKE_TMP=1 pnpm smoke
```

## Conventions

- Tests are named `SMK-<tier><nn> …` to match the catalog. A test that pins current-but-wrong behavior is `test.failing('KG-xx …')` and references [known-gaps.md](../../docs/kb/known-gaps.md). When you fix that gap, the test turns red. Convert it to a normal `test` and mark the KG row fixed.
- Spawn the CLI only through `harness/cli.ts` (`runCli`) or `harness/dev-server.ts` (`startDev`). They set `NO_COLOR`, `JETIC_NO_OPEN` and the compile cache, enforce timeouts, and kill whole process trees on Windows and POSIX.
- Each test works in its own `createProject()` temp dir. Never write into the repo or depend on fixed ports. Get one from `getFreePort()`.
- Don't use bare sleeps. Use `waitFor(predicate)`.
