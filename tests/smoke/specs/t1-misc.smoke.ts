/**
 * Tier 1 (memory, tools and commands that need a model) — CLI with no server running.
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

describe('Tier 1 — memory, tools and commands that need a model', () => {
  test('SMK-113 memory add (typed at the prompts), list and clear', async () => {
    const project = createProject();
    expect((await cli(project, ['memory'])).out).toContain('Memory is empty.');

    const add = await runCliInteractive(
      ['memory', 'add'],
      [
        { waitFor: /Key\/Identifier:/, send: 'workflow:token\n' },
        { waitFor: /Text:/, send: 'abc123\n' },
      ],
      { cwd: project.dir }
    );
    expectExit(['memory', 'add'], add, 0);
    expect(add.out).toContain('Successfully added workflow:token');
    expect(project.readJson('.jetic', 'memory.json').workflow.token.value).toBe('abc123');

    const list = await cli(project, ['memory']);
    expect(list.out).toContain('workflow:token');
    expect(list.out).toContain('abc123');

    expect((await cli(project, ['memory', 'clear'])).out).toContain('Memory cleared.');
    expect(project.exists('.jetic', 'memory.json')).toBe(false);
    expect((await cli(project, ['memory'])).out).toContain('Memory is empty.');
  });

  // With all answers piped at once, readline drops the second line and the command exits 0 having saved nothing.
  test.failing('KG-22 memory add with piped input either saves the value or fails loudly', async () => {
    const project = createProject();
    const result = await runCli(['memory', 'add'], { cwd: project.dir, input: 'workflow:token\nabc123\n' });
    const saved = project.exists('.jetic', 'memory.json');
    expect(saved || result.code !== 0).toBe(true);
  });

  describe('SMK-114 tool list', () => {
    test('explains a missing entry, lists tools from a .js entry, and exits 2 on a bad export', async () => {
      const project = createProject();
      project.writeJson('jetic.config.json', { project: { name: 'tools' }, tools: { entry: './jetic.tools.js' } });

      expect((await cli(project, ['tool', 'list'])).out).toContain('No tools entry found');

      project.writeFile(
        'jetic.tools.js',
        "exports.tools = [{ name: 'create_test_user', description: 'Create a test user' }, { name: 'seed_orders', description: 'Seed orders' }];\n"
      );
      const listed = await cli(project, ['tool', 'list']);
      expect(listed.out).toMatch(/create_test_user\s+Create a test user/);
      expect(listed.out).toMatch(/seed_orders\s+Seed orders/);

      project.writeFile('jetic.tools.js', 'exports.nothing = [];\n');
      expect((await cli(project, ['tool', 'list'], 2)).out).toContain('must export a "tools" array');
    });
  });

  describe('SMK-115 workflow commands without a server', () => {
    test('simulate workflow --list shows saved workflows, and explains when there are none', async () => {
      const project = await createShopProject();
      expect((await cli(project, ['simulate', 'workflow', '--list'])).out).toContain('No workflows found');

      writeWorkflow(project, 'happy-checkout', happyCheckout);
      const listed = await cli(project, ['simulate', 'workflow', '--list']);
      expect(listed.out).toContain('happy-checkout');
      expect(listed.out).toContain('4 steps');
    });

    test('simulate workflow needs --workflow, a model, and a reachable server', async () => {
      const project = await createShopProject({ workflows: { 'happy-checkout': happyCheckout } });
      expect((await cli(project, ['simulate', 'workflow'], 2)).out).toContain('--workflow');
      expect((await cli(createProject(), ['simulate', 'workflow', '--workflow', 'x'], 1)).out).toContain('jetic scan');
      // Nothing listens on the model's baseUrl (localhost:3456) in this file's scope.
      const unreachable = await cli(project, ['simulate', 'workflow', '--workflow', 'happy-checkout', '--env', 'local'], 1);
      expect(unreachable.out).toContain('unreachable');
    });

    test('test explains missing models and empty workflow folders', async () => {
      expect((await cli(createProject(), ['test'], 2)).out).toContain('No model found');
      const project = await createShopProject();
      expect((await cli(project, ['test'])).out).toContain('Nothing to test');
    });
  });

  test('SMK-116 commands the README documents but the CLI does not implement (KG-13)', async () => {
    const project = createProject();
    // `memory get/set/delete` are not subcommands: they fall through to the default list action.
    const get = await runCli(['memory', 'get', 'workflow:token'], { cwd: project.dir });
    expect(get.out).toContain('Memory is empty');
  });

  test.failing('KG-13 `memory set <scope:key> <value>` stores the value, as the README documents', async () => {
    const project = createProject();
    await runCli(['memory', 'set', 'workflow:token', 'abc123'], { cwd: project.dir });
    expect(project.exists('.jetic', 'memory.json')).toBe(true);
  });
});

describe('Tier 1 — describeResult', () => {
  // Guards the failure output every other test relies on to be debuggable.
  test('includes the command, exit code and both streams', async () => {
    const args = ['--version'];
    const text = describeResult(args, await runCli(args));
    expect(text).toMatch(/\$ jetic --version\nexit=0 /);
    expect(text).toContain('--- stdout ---');
    expect(text).toContain('--- stderr ---');
  });
});
