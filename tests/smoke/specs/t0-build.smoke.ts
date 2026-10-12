/**
 * Tier 0 — build & packaging. No fixture, no network (except SMK-006, nightly).
 * Proves the shipped artifact loads, exposes every command, and is self-contained.
 */
import * as fs from 'fs';
import * as path from 'path';
import { builtinModules } from 'module';
import { describeResult, runCli, smokeEnv, stripAnsi } from '../harness/cli';
import { rawMcpExchange } from '../harness/mcp-raw';
import { runNpm } from '../harness/npm';
import { CLI_DIR, CLI_DIST, CLI_PACKAGE_JSON, DASHBOARD_INDEX, MCP_DIST, NIGHTLY } from '../harness/paths';
import { mapPool, runProcess } from '../harness/process';
import { createProject } from '../harness/project';

const cliPackage = JSON.parse(fs.readFileSync(CLI_PACKAGE_JSON, 'utf8'));

const EXPECTED_COMMANDS = [
  'init', 'scan', 'inspect', 'config', 'model', 'adapter', 'agent', 'doctor', 'activity',
  'tool', 'test', 'authz', 'memory', 'simulate', 'dev', 'upgrade', 'mcp',
];

/** Parses commander's "Commands:" block into command names (first token of each entry). */
function parseCommands(helpText: string): string[] {
  const lines = stripAnsi(helpText).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === 'Commands:');
  if (start < 0) return [];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) break;
    const entry = /^ {2}(\S+)/.exec(line); // wrapped description lines are indented further
    if (entry && entry[1] !== 'help') names.push(entry[1].split('|')[0]);
  }
  return names;
}

describe('Tier 0 — build & packaging', () => {
  test('SMK-001 --version matches apps/cli/package.json', async () => {
    const result = await runCli(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(cliPackage.version);
  });

  test('SMK-002a --help lists exactly the expected top-level commands', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(parseCommands(result.stdout).sort()).toEqual([...EXPECTED_COMMANDS].sort());
  });

  test('SMK-002b every command and subcommand loads and prints its help', async () => {
    // Discover the tree from help output so new subcommands are covered automatically.
    const topLevel = await mapPool(EXPECTED_COMMANDS, 6, async (cmd) => ({
      path: [cmd],
      result: await runCli([cmd, '--help']),
    }));
    const subcommandPaths = topLevel.flatMap(({ path: p, result }) =>
      parseCommands(result.stdout).map((sub) => [...p, sub])
    );
    const nested = await mapPool(subcommandPaths, 6, async (p) => ({ path: p, result: await runCli([...p, '--help']) }));

    const failures = [...topLevel, ...nested]
      .filter(({ path: p, result }) => result.code !== 0 || !result.out.includes(`Usage: jetic ${p.join(' ')}`))
      .map(({ path: p, result }) => describeResult([...p, '--help'], result));

    expect(failures).toEqual([]);
    // Guard against the discovery silently finding nothing.
    expect(subcommandPaths.length).toBeGreaterThanOrEqual(10);
  });

  describe('SMK-003 bundle is self-contained', () => {
    const bundle = fs.readFileSync(CLI_DIST, 'utf8');
    const builtins = new Set(builtinModules);
    const packageName = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(\/.*)?$/;

    /** Bare `require("x")` calls that execute at runtime (skips ones embedded in string literals, e.g. ajv codegen). */
    const runtimeRequires = (() => {
      const specs = new Set<string>();
      for (const match of bundle.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
        const preceding = bundle[match.index! - 1];
        if (preceding === "'" || preceding === '"' || preceding === '`') continue;
        const spec = match[1];
        if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
        if (!packageName.test(spec)) continue;
        specs.add(spec);
      }
      return [...specs].sort();
    })();
    const basePackage = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

    test('no workspace (@jetic/*) or MCP SDK requires remain external', () => {
      const leaked = runtimeRequires.filter((s) => s.startsWith('@jetic/') || s.startsWith('@modelcontextprotocol/'));
      expect(leaked).toEqual([]);
    });

    test('every external require is a Node builtin or a declared dependency', () => {
      const declared = new Set(Object.keys(cliPackage.dependencies ?? {}));
      const undeclared = runtimeRequires.filter((s) => !builtins.has(basePackage(s)) && !declared.has(basePackage(s)));
      expect(undeclared).toEqual([]);
    });

    // KG-20 (fixed): the bundled MCP SDK requires the zod/v3 + zod/v4-mini subpaths (zod >= 3.25).
    // jetic-cli used to declare ^3.23.8, so a deduped zod 3.23/3.24 in a user's tree crashed the CLI at startup.
    test('SMK-003c declared zod range guarantees the zod/v* subpaths the bundle requires (KG-20)', () => {
      const needsSubpaths = runtimeRequires.some((s) => /^zod\/v\d/.test(s));
      const declaredMin = String(cliPackage.dependencies.zod).replace(/^[^\d]*/, '').split('.').map(Number);
      const [major, minor] = declaredMin;
      expect(needsSubpaths).toBe(true);
      expect(major > 3 || (major === 3 && minor >= 25)).toBe(true);
    });
  });

  test('SMK-004 dashboard is bundled and packed with the CLI', async () => {
    const html = fs.readFileSync(DASHBOARD_INDEX, 'utf8');
    expect(html).toContain('<title>Jetic Studio</title>');
    const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]);
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(fs.existsSync(path.join(path.dirname(DASHBOARD_INDEX), asset))).toBe(true);
    }

    const pack = await runNpm(['pack', '--dry-run', '--json'], { cwd: CLI_DIR, timeoutMs: 120_000 });
    expect(pack.code).toBe(0);
    const files: string[] = JSON.parse(pack.stdout)[0].files.map((f: { path: string }) => f.path);
    expect(files).toEqual(expect.arrayContaining(['package.json', 'dist/index.js', 'dist/dashboard/index.html']));
    expect(files.filter((f) => f.startsWith('src/'))).toEqual([]);
  });

  describe('SMK-005 standalone jetic-mcp bin', () => {
    const runBin = (args: string[]) =>
      runProcess(process.execPath, [MCP_DIST, ...args], { env: smokeEnv(), timeoutMs: 30_000 });

    test.each([['--help'], ['--version']])('%s exits 0 and writes only to stderr', async (flag) => {
      const result = await runBin([flag]);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/jetic-mcp/);
    });

    test('unknown flag exits 2', async () => {
      const result = await runBin(['--bogus']);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('--bogus');
    });
  });

  (NIGHTLY ? test : test.skip)('SMK-117 upgrade --check reaches the registry and reports a version (network)', async () => {
    const result = await runCli(['upgrade', '--check'], { timeoutMs: 60_000 });
    expect(result.code).toBe(0);
    expect(result.out).toContain(`Current version: v${cliPackage.version}`);
    expect(result.out).toMatch(/Target version:\s+v\d+\.\d+\.\d+/);
  });

  (NIGHTLY ? test : test.skip)(
    'SMK-006 packed tarball installs and runs outside the workspace',
    async () => {
      const work = createProject({ name: 'consumer' });
      const pack = await runNpm(['pack', '--json', '--pack-destination', work.dir], { cwd: CLI_DIR });
      expect(pack.code).toBe(0);
      const tarball = path.join(work.dir, JSON.parse(pack.stdout)[0].filename);

      work.writeJson('package.json', { name: 'jetic-smoke-consumer', version: '0.0.0', private: true });
      const install = await runNpm(['install', tarball, '--no-audit', '--no-fund'], { cwd: work.dir, timeoutMs: 600_000 });
      expect(install.code).toBe(0);

      const installed = work.path('node_modules', 'jetic-cli', 'dist', 'index.js');
      expect(work.exists('node_modules', '.bin', process.platform === 'win32' ? 'jetic.cmd' : 'jetic')).toBe(true);

      const version = await runProcess(process.execPath, [installed, '--version'], { cwd: work.dir, env: smokeEnv() });
      expect(version.stdout.trim()).toBe(cliPackage.version);

      const init = await runProcess(process.execPath, [installed, 'init'], { cwd: work.dir, env: smokeEnv() });
      expect(init.code).toBe(0);
      expect(work.exists('jetic.config.json')).toBe(true);

      const session = await rawMcpExchange(process.execPath, [installed, 'mcp'], [{ method: 'tools/list' }], {
        cwd: work.dir,
      });
      expect(session.responses.get(2)?.result?.tools?.length).toBeGreaterThan(0);
    },
    900_000
  );
});
