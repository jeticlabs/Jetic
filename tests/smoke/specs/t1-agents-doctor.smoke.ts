/**
 * Tier 1 (agents and doctor) — CLI with no server running.
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

describe('Tier 1 — agents', () => {
  test('SMK-110 agent list and model-watcher snapshots', async () => {
    const project = await createShopProject();
    const list = await cli(project, ['agent', 'list']);
    expect(list.out).toContain('model-watcher');
    expect(list.out).toContain('workflow-impact');

    const first = await cli(project, ['agent', 'run', 'model-watcher']);
    expect(first.out).toContain('Initial snapshot recorded (10 endpoints)');
    const second = await cli(project, ['agent', 'run', 'model-watcher']);
    expect(second.out).toContain('0 endpoint(s) added, 0 removed');

    addExtraRoute(project);
    await cli(project, ['scan']);
    const third = await cli(project, ['agent', 'run', 'model-watcher']);
    expect(third.out).toContain('1 endpoint(s) added, 0 removed');
    expect(third.out).toContain('endpoint_added');

    const reports = fs.readdirSync(project.path('.jetic', 'runs'));
    expect(reports).toHaveLength(3);
    const report = project.readJson('.jetic', 'runs', reports.sort().pop()!, 'agent-report.json');
    expect(report).toMatchObject({ agentId: 'model-watcher', findings: [{ kind: 'endpoint_added', endpointId: 'GET /extra-ping' }] });

    expect((await cli(project, ['agent', 'run', 'nope'], 2)).out).toContain('Unknown agent "nope"');
  });

  describe('SMK-111 workflow-impact', () => {
    const seed = async (changedPath: (project: TempProject, modelFile: string) => string) => {
      const project = await createShopProject({ workflows: { 'happy-checkout': happyCheckout } });
      const modelFile = project.readJson('.jetic', 'model.json').endpoints.find((e: any) => e.id === 'GET /api/orders/:id').source.file;
      project.writeJson('.jetic/changes.json', {
        version: 1,
        watchedSince: new Date().toISOString(),
        projectRoot: project.dir,
        changes: [{ filePath: changedPath(project, modelFile), changedAt: new Date().toISOString(), eventType: 'change' }],
      });
      return project;
    };

    test('without tracked changes it says nothing has changed', async () => {
      const project = await createShopProject({ workflows: { 'happy-checkout': happyCheckout } });
      expect((await cli(project, ['agent', 'run', 'workflow-impact'])).out).toContain('No tracked file changes');
    });

    test('finds the workflows touching an endpoint whose source file changed (absolute path)', async () => {
      const project = await seed((_p, modelFile) => modelFile);
      const result = await cli(project, ['agent', 'run', 'workflow-impact']);
      expect(result.out).toContain('affecting 1 workflow(s)');
      expect(result.out).toContain('workflow_affected');
    });

    // The change watcher records project-RELATIVE paths (see `jetic dev`), but the scanner stores
    // ABSOLUTE source files, so the agent never matches what the watcher writes.
    test.failing('KG-21 finds affected workflows from the project-relative paths `jetic dev` records', async () => {
      const project = await seed(() => 'src/routes/orders.ts');
      const result = await cli(project, ['agent', 'run', 'workflow-impact']);
      expect(result.out).toContain('affecting 1 workflow(s)');
    });
  });
});

describe('Tier 1 — doctor', () => {
  // Port 8787 availability is machine state, so it is excluded here and covered serially in t1-doctor-port.
  const checkLines = (out: string) => out.split('\n').map((l) => l.trim()).filter((l) => /^[✓✗]/.test(l));

  test('SMK-112 a healthy project passes every check except possibly the port', async () => {
    const project = await createShopProject();
    const result = await runCli(['doctor'], { cwd: project.dir });
    const lines = checkLines(result.out).filter((l) => !l.includes('Port 8787'));
    expect(lines.map((l) => l[0])).toEqual(['✓', '✓', '✓', '✓', '✓']);
    expect(lines.join('\n')).toContain('Adapter detection (Express)');
    expect(lines.join('\n')).toContain('Model valid (10 endpoints)');
  });

  test('SMK-112b an invalid workflow file fails the workflows check, and a missing model fails the model check', async () => {
    const project = await createShopProject();
    writeWorkflow(project, 'bad', { name: 'bad', steps: [{ name: 'No method or path' }] });
    const bad = await cli(project, ['doctor'], 1);
    expect(checkLines(bad.out).find((l) => l.includes('Workflows valid'))).toMatch(/^✗.*1 found.*1 invalid/);

    const empty = await cli(createProject(), ['doctor'], 1);
    expect(checkLines(empty.out).find((l) => l.includes('Model valid'))).toMatch(/^✗/);
  });

  test.failing('KG-16 a Fastify project is not reported as Express just because it has a tsconfig.json', async () => {
    const project = createProject();
    project.writeJson('package.json', { name: 'fastify-app', dependencies: { fastify: '^4.0.0' } });
    project.writeJson('tsconfig.json', { compilerOptions: {} });
    const result = await runCli(['doctor'], { cwd: project.dir });
    expect(result.out).toMatch(/Adapter detection \(Fastify\)/);
  });
});
