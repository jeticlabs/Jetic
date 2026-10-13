/**
 * Tier 5 — consistency between the places that read or write the same artifacts:
 * three ways to scan a project, and four ways to find the saved workflows.
 */
import { runCli } from '../harness/cli';
import { startDev } from '../harness/dev-server';
import { toGolden } from '../harness/golden';
import { McpSession } from '../harness/mcp';
import { createProject } from '../harness/project';
import { createShopProject } from '../harness/shop-project';
import { happyCheckout } from '../fixtures/workflows';

describe('Tier 5 — consistency', () => {
  test('SMK-503 the CLI scan, the MCP scan and the dashboard rescan produce the same model', async () => {
    const viaCli = await createShopProject({ scan: false });
    expect((await runCli(['scan'], { cwd: viaCli.dir })).code).toBe(0);

    const viaMcp = await createShopProject({ scan: false });
    const session = await McpSession.start({ project: viaMcp.dir });
    try {
      await session.call('jetic_init');
      expect((await session.call('jetic_scan', { mode: 'overwrite' })).ok).toBe(true);
    } finally {
      await session.close();
    }

    const viaDev = await createShopProject({ scan: false });
    const dev = await startDev(viaDev.dir);
    try {
      expect((await (await fetch(`${dev.url}/api/model/scan`, { method: 'POST' })).json()).ok).toBe(true);
    } finally {
      await dev.stop();
    }

    // Endpoints, middleware, security and params must match exactly. (Environments are KG-33 below.)
    const golden = (project: typeof viaCli) => ({ ...toGolden(project.readJson('.jetic', 'model.json'), project.dir), environments: [] });
    const reference = golden(viaCli);
    expect(reference.endpoints).toHaveLength(10);
    expect(golden(viaMcp)).toEqual(reference);
    expect(golden(viaDev)).toEqual(reference);
  });

  // The MCP protocol is init → scan. `jetic_init` writes a default `local → http://localhost:3000`
  // before `jetic_scan` can read the project's `.env` PORT, and the scan keeps the existing environment.
  test.failing('KG-33 the MCP init → scan flow picks up the project\'s .env PORT like `jetic scan` does', async () => {
    const viaCli = await createShopProject({ scan: false });
    await runCli(['scan'], { cwd: viaCli.dir });

    const viaMcp = await createShopProject({ scan: false });
    const session = await McpSession.start({ project: viaMcp.dir });
    try {
      await session.call('jetic_init');
      await session.call('jetic_scan');
    } finally {
      await session.close();
    }

    expect(viaCli.readJson('.jetic', 'model.json').environments[0].baseUrl).toBe('http://localhost:3456');
    expect(viaMcp.readJson('.jetic', 'model.json').environments[0].baseUrl).toBe('http://localhost:3456');
  });

  describe('SMK-505 a custom workflows directory', () => {
    const CUSTOM = 'custom/wf';
    const setup = async () => {
      const project = await createShopProject();
      const config = project.readJson('jetic.config.json');
      project.writeJson('jetic.config.json', { ...config, workflows: { directory: CUSTOM } });
      project.writeJson(`${CUSTOM}/happy-checkout.json`, { generatedAt: new Date().toISOString(), ...happyCheckout });
      return project;
    };

    test('is honored by `jetic test` and `jetic doctor`', async () => {
      const project = await setup();
      expect(project.exists(...CUSTOM.split('/'), 'happy-checkout.json')).toBe(true);

      const test = await runCli(['test', '--ci'], { cwd: project.dir });
      expect(JSON.parse(test.stdout).total).toBe(1); // found (it then fails: nothing is serving the API)

      const doctor = await runCli(['doctor'], { cwd: project.dir });
      expect(doctor.out).toContain('Workflows valid (1 found)');
    });

    // `jetic simulate workflow`, the dashboard server and the MCP server hardcode `.jetic/workflows`,
    // so the same project shows a different set of workflows depending on which surface asks.
    test.failing('KG-03 every surface sees the workflows in the configured directory', async () => {
      const project = await setup();
      const seen: Record<string, boolean> = {};

      seen.cli = (await runCli(['simulate', 'workflow', '--list'], { cwd: project.dir })).out.includes('happy-checkout');

      const dev = await startDev(project.dir);
      try {
        seen.dev = (await (await fetch(`${dev.url}/api/workflows`)).json()).length === 1;
      } finally {
        await dev.stop();
      }

      const session = await McpSession.start({ project: project.dir });
      try {
        seen.mcp = (await session.call('jetic_list_workflows')).data.totalCount === 1;
      } finally {
        await session.close();
      }

      expect(seen).toEqual({ cli: true, dev: true, mcp: true });
    });
  });

  test('SMK-503b a project served with no model at all reads the same everywhere: empty, not an error', async () => {
    const project = createProject();
    expect((await runCli(['model', 'list'], { cwd: project.dir })).code).toBe(2);

    const dev = await startDev(project.dir);
    try {
      expect(await (await fetch(`${dev.url}/api/model`)).json()).toBeNull();
    } finally {
      await dev.stop();
    }

    const session = await McpSession.start({ project: project.dir });
    try {
      expect((await session.call('jetic_read_model', { summaryOnly: true })).data.modelExists).toBe(false);
    } finally {
      await session.close();
    }
  });
});
