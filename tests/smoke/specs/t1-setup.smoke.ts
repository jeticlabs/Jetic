/**
 * Tier 1 (init, IDE configuration and config) — CLI with no server running.
 * Split from one file so Jest can run the groups in parallel.
 *
 * Tests named `KG-xx …` use `test.failing`: they assert the INTENDED behavior of a known gap
 * (docs/kb/known-gaps.md) and pass today because the behavior is wrong. When the gap is fixed the
 * test turns red; convert it to a normal test and mark the register row fixed.
 */
import * as fs from 'fs';
import { describeResult, expectExit, hasStackTrace, runCli, runCliInteractive } from '../harness/cli';
import { maybeUpdateGolden, readGolden, toGolden } from '../harness/golden';
import { createProject, TempProject } from '../harness/project';
import { createShopProject, writeWorkflow } from '../harness/shop-project';
import { happyCheckout } from '../fixtures/workflows';

const EXPECTED_DIRS = [
  'model/paths', 'model/schemas', 'model/security', 'workflows', 'agents',
  'environments', 'activity', 'index', 'runs', 'reports', 'cache',
];

/** A route file the scanner picks up without any mounting: `GET /extra-ping`. */
function addExtraRoute(project: TempProject, file = 'src/routes/extra.ts') {
  project.writeFile(
    file,
    "import { Router } from 'express';\nconst router = Router();\nrouter.get('/extra-ping', (_req, res) => res.json({ ok: true }));\nexport default router;\n"
  );
}

/** Runs `args` in `project`, asserts the exit code, and returns the result. */
async function cli(project: TempProject, args: string[], codes: number | number[] = 0) {
  const result = await runCli(args, { cwd: project.dir });
  expectExit(args, result, codes);
  return result;
}

describe('Tier 1 — project setup', () => {
  test('SMK-101 init creates the config and every .jetic subdirectory, and keeps an edited config', async () => {
    const project = createProject({ name: 'my-service' });
    await cli(project, ['init']);

    const config = project.readJson('jetic.config.json');
    expect(config.project.name).toBe('my-service');
    expect(config.scanner).toEqual({ adapter: 'auto', incremental: true, watch: true });
    for (const dir of EXPECTED_DIRS) expect(project.exists('.jetic', dir)).toBe(true);

    project.writeJson('jetic.config.json', { ...config, project: { name: 'renamed-by-hand' } });
    await cli(project, ['init']);
    expect(project.readJson('jetic.config.json').project.name).toBe('renamed-by-hand');
  });

  describe('SMK-102 init --ide vscode', () => {
    const mcpFile = ['.vscode', 'mcp.json'];

    test('--dry-run writes nothing, a real run writes the server entry, a repeat is a no-op', async () => {
      const project = createProject();

      const dry = await cli(project, ['init', '--ide', 'vscode', '--dry-run']);
      expect(dry.out).toContain('Dry run');
      expect(project.exists(...mcpFile)).toBe(false);

      await cli(project, ['init', '--ide', 'vscode']);
      expect(project.readJson(...mcpFile).servers.jetic).toMatchObject({ type: 'stdio', command: 'npx', args: ['-y', 'jetic-cli', 'mcp'] });
      expect(project.exists('jetic.config.json')).toBe(false); // IDE mode never runs the normal init

      const before = fs.readFileSync(project.path(...mcpFile), 'utf8');
      const again = await cli(project, ['init', '--ide', 'vscode']);
      expect(again.out).toContain('already configured');
      expect(fs.readFileSync(project.path(...mcpFile), 'utf8')).toBe(before);
    });

    test('refuses to overwrite a different "jetic" server and rejects unknown IDEs (exit 2)', async () => {
      const project = createProject();
      const custom = JSON.stringify({ servers: { jetic: { command: 'node', args: ['custom.js'] } } });
      project.writeFile(mcpFile.join('/'), custom);

      const conflict = await cli(project, ['init', '--ide', 'vscode'], 2);
      expect(conflict.out).toContain('A different "jetic" MCP server is already configured');
      expect(fs.readFileSync(project.path(...mcpFile), 'utf8')).toBe(custom);

      const unknown = await cli(project, ['init', '--ide', 'cursor'], 2);
      expect(unknown.out).toContain('Unsupported IDE target "cursor"');
    });
  });

  describe('SMK-103 config', () => {
    test('prints the resolved configuration', async () => {
      const project = await createShopProject();
      const result = await cli(project, ['config']);
      expect(result.out).toMatch(/'jetic\.config\.json'\s*│\s*'found'/); // the table row, not "not found"
      expect(result.out).toContain('shop-api');
      expect(result.out).toContain('Scanner Adapter');
    });

    test.each([
      ['malformed JSON', '{ not json'],
      ['a missing project.name', JSON.stringify({ project: {} })],
    ])('exits 1 for %s', async (_label, content) => {
      const project = createProject();
      project.writeFile('jetic.config.json', content);
      const result = await cli(project, ['config'], 1);
      expect(result.out).toMatch(/jetic\.config\.json/);
    });

    test.failing('KG-14 a bad config reports a message, not a raw stack trace', async () => {
      const project = createProject();
      project.writeFile('jetic.config.json', JSON.stringify({ project: {} }));
      const result = await runCli(['config'], { cwd: project.dir });
      expect(hasStackTrace(result.out)).toBe(false);
    });
  });
});
