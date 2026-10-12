/**
 * Tier 1 (scan, inspect, model export and adapters) — CLI with no server running.
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

describe('Tier 1 — scan, inspect and the model', () => {
  let scanned: TempProject;
  beforeAll(async () => {
    scanned = await createShopProject({ realScan: true }); // this file tests the scanner itself
  });

  test('SMK-104b projects copied from the cached scan are equivalent to a real scan (harness guard)', async () => {
    const copy = await createShopProject();
    const real = toGolden(scanned.readJson('.jetic', 'model.json'), scanned.dir);
    expect(toGolden(copy.readJson('.jetic', 'model.json'), copy.dir)).toEqual(real);

    const model = copy.readJson('.jetic', 'model.json');
    for (const endpoint of model.endpoints) {
      expect(fs.existsSync(endpoint.source.file)).toBe(true); // paths were relocated, not left pointing at the template
    }
  });

  test('SMK-104 scan produces the golden model, with real source locations', async () => {
    const model = scanned.readJson('.jetic', 'model.json');
    const actual = toGolden(model, scanned.dir);
    if (maybeUpdateGolden(actual)) return;

    expect(actual).toEqual(readGolden());

    // Environment comes from the project's .env PORT.
    expect(model.environments[0].baseUrl).toBe('http://localhost:3456');

    // source.file/line must point at the registration call itself.
    for (const endpoint of model.endpoints) {
      const line = fs.readFileSync(endpoint.source.file, 'utf8').split(/\r?\n/)[endpoint.source.line - 1];
      expect(line).toContain(`.${endpoint.method.toLowerCase()}(`);
    }
    expect(scanned.exists('.jetic', 'activity', 'activity.ndjson')).toBe(false); // first scan has nothing to diff
  });

  test('SMK-105 rescanning records added/removed endpoints and keeps custom environments', async () => {
    const project = await createShopProject();
    const model = project.readJson('.jetic', 'model.json');
    model.environments.push({ name: 'staging', baseUrl: 'https://staging.example.test' });
    project.writeJson('.jetic/model.json', model);

    addExtraRoute(project);
    await cli(project, ['scan']);
    const afterAdd = project.readJson('.jetic', 'model.json');
    expect(afterAdd.endpoints.map((e: any) => e.id)).toContain('GET /extra-ping');
    expect(afterAdd.environments.map((e: any) => e.name)).toEqual(['local', 'staging']);

    fs.rmSync(project.path('src', 'routes', 'extra.ts'));
    await cli(project, ['scan']);

    const events = fs.readFileSync(project.path('.jetic', 'activity', 'activity.ndjson'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l));
    expect(events.map((e) => [e.kind, e.endpointId])).toEqual([
      ['endpoint_added', 'GET /extra-ping'],
      ['endpoint_removed', 'GET /extra-ping'],
    ]);

    const list = await cli(project, ['activity', 'list']);
    const lines = list.out.split('\n').filter((l) => l.includes('GET /extra-ping'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('endpoint_removed'); // newest first
    expect(lines[1]).toContain('endpoint_added');
  });

  // `jetic scan` overwrites model.json from the source; the MCP scan merges and keeps hand-added endpoints.
  test.failing('KG-17 jetic scan keeps endpoints that were added by hand', async () => {
    const project = await createShopProject();
    const model = project.readJson('.jetic', 'model.json');
    model.endpoints.push({ id: 'GET /hand-added', method: 'GET', path: '/hand-added', source: { file: 'manual', line: 1 }, middleware: [] });
    project.writeJson('.jetic/model.json', model);

    await cli(project, ['scan']);
    expect(project.readJson('.jetic', 'model.json').endpoints.map((e: any) => e.id)).toContain('GET /hand-added');
  });

  test('SMK-105b activity list explains an empty history', async () => {
    const project = createProject();
    const result = await cli(project, ['activity', 'list']);
    expect(result.out).toContain('No activity recorded yet');
  });

  test('SMK-106 scan without a tsconfig.json fails', async () => {
    const project = createProject();
    const result = await cli(project, ['scan'], 1);
    expect(result.out).toContain('tsconfig.json');
  });

  test.failing('KG-14 scan without a tsconfig.json reports a message, not a raw stack trace', async () => {
    const project = createProject();
    const result = await runCli(['scan'], { cwd: project.dir });
    expect(hasStackTrace(result.out)).toBe(false);
  });

  test('SMK-107 inspect lists endpoints and shows one endpoint\'s source', async () => {
    const list = await cli(scanned, ['inspect']);
    expect(list.out).toContain('Endpoints (10)');
    expect(list.out).toContain('DELETE /api/admin/users/:id');

    const one = await cli(scanned, ['inspect', 'endpoint', 'GET', '/api/orders/:id']);
    expect(one.out).toMatch(/Source:\s+\S*orders\.ts:\d+/);
  });

  test('SMK-107b inspect says so when the endpoint or the model is missing', async () => {
    const notFound = await runCli(['inspect', 'endpoint', 'GET', '/nope'], { cwd: scanned.dir });
    expect(notFound.out).toContain('Endpoint not found');

    const empty = await runCli(['inspect'], { cwd: createProject().dir });
    expect(empty.out).toContain('No behavioral model found');
  });

  test.failing('KG-10 inspect exits non-zero when the endpoint or the model is missing', async () => {
    const notFound = await runCli(['inspect', 'endpoint', 'GET', '/nope'], { cwd: scanned.dir });
    const noModel = await runCli(['inspect'], { cwd: createProject().dir });
    expect([notFound.code, noModel.code]).not.toContain(0);
  });

  describe('SMK-108 model list / export', () => {
    test('lists the endpoints, exports the split YAML layout, and lists the same set from it', async () => {
      const project = await createShopProject();
      const before = await cli(project, ['model', 'list']);
      expect(before.out).toContain('10 endpoints');

      await cli(project, ['model', 'export', '--yaml']);
      for (const file of ['api.yaml', 'paths/api.yaml', 'paths/health.yaml']) {
        expect(project.exists('.jetic', 'model', file)).toBe(true);
      }

      const after = await cli(project, ['model', 'list']);
      const endpointLines = (text: string) => text.split('\n').filter((l) => /^\s+[A-Z]+\s+\//.test(l)).sort();
      expect(endpointLines(after.out)).toEqual(endpointLines(before.out));
      expect(endpointLines(after.out)).toHaveLength(10);
    });

    test('export needs --yaml and a model (exit 2)', async () => {
      expect((await cli(scanned, ['model', 'export'], 2)).out).toContain('--yaml');
      expect((await cli(createProject(), ['model', 'export', '--yaml'], 2)).out).toContain('jetic scan');
      expect((await cli(createProject(), ['model', 'list'], 2)).out).toContain('jetic scan');
    });

    test.failing('KG-15 after export, a rescan is reflected by `model list`', async () => {
      const project = await createShopProject();
      await cli(project, ['model', 'export', '--yaml']);
      addExtraRoute(project);
      await cli(project, ['scan']);
      expect((await cli(project, ['model', 'list'])).out).toContain('11 endpoints');
    });
  });

  test('SMK-109 adapter list detects Express only; inspect scans; unknown ids exit 2', async () => {
    const list = await cli(scanned, ['adapter', 'list']);
    const detected = Object.fromEntries(
      [...list.out.matchAll(/^\s*([✓○])\s+(\w+)/gm)].map(([, mark, id]) => [id, mark === '✓'])
    );
    expect(detected).toEqual({ express: true, fastify: false, nextjs: false, nestjs: false, hono: false });

    const express = await cli(scanned, ['adapter', 'inspect', 'express']);
    expect(express.out).toContain('detected: true');
    expect(express.out).toContain('endpoints: 10');

    expect((await cli(scanned, ['adapter', 'inspect', 'fastify'])).out).toContain('detected: false');
    expect((await cli(scanned, ['adapter', 'inspect', 'nope'], 2)).out).toContain('Unknown adapter "nope"');
  });
});
