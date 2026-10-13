/**
 * Tier 2 — CLI execution against a live API (the shop-api fixture, served in-process).
 * Covers endpoint simulation, the saved-workflow runners, authz and CI output.
 * Runner-to-runner agreement lives in t5-parity; condition semantics in the simulator unit tests.
 */
import * as fs from 'fs';
import { expectExit, runCli } from '../harness/cli';
import { happyCheckout, forbiddenAdmin, broken, retryFlaky, humanOtp, VALID_OTP } from '../fixtures/workflows';
import { startShopApi, ShopApi } from '../harness/shop-api';
import { TempProject } from '../harness/project';
import { createShopProject, writeWorkflow } from '../harness/shop-project';
import { getFreePort } from '../harness/wait';

let api: ShopApi;
beforeAll(async () => {
  api = await startShopApi();
});
afterAll(() => api.close());
beforeEach(() => api.reset());

async function cli(project: TempProject, args: string[], codes: number | number[] = 0, env: NodeJS.ProcessEnv = {}) {
  const result = await runCli(args, { cwd: project.dir, env });
  expectExit(args, result, codes);
  return result;
}

const workflows = { 'happy-checkout': happyCheckout, 'forbidden-admin': forbiddenAdmin, broken };
const runWorkflow = (project: TempProject, slug: string, codes: number | number[], extra: string[] = [], env: NodeJS.ProcessEnv = {}) =>
  cli(project, ['simulate', 'workflow', '--workflow', slug, '--env', 'local', ...extra], codes, env);

describe('Tier 2 — simulate endpoint', () => {
  test('SMK-201 a single endpoint is called and validated', async () => {
    const project = await createShopProject({ baseUrl: api.url });
    const result = await cli(project, ['simulate', 'endpoint', 'GET', '/health']);
    expect(result.out).toMatch(/Response: 200/);
    expect(result.out).toContain('PASSED');
    expect(api.hits).toContain('GET /health');
  });

  test('SMK-201b --all calls every modeled endpoint and reports per-endpoint results', async () => {
    const project = await createShopProject({ baseUrl: api.url });
    const result = await runCli(['simulate', 'endpoint', '--all'], { cwd: project.dir });
    expect(result.timedOut).toBe(false);
    expect(result.out).toContain('Simulating 10 endpoints');
    expect(result.out).toMatch(/✓ GET\s+\/health\s+200/);
    expect(result.out).toMatch(/✗ POST\s+\/api\/orders\s+401/); // protected, called without credentials
    expect(result.out).toMatch(/1 passed\s+│\s+9 failed/);
    expect(api.hits).toHaveLength(11); // 10 endpoints + the liveness probe
  });

  test('SMK-201c an unknown endpoint exits 1 and lists the ones that exist', async () => {
    const project = await createShopProject({ baseUrl: api.url });
    const result = await cli(project, ['simulate', 'endpoint', 'GET', '/nope'], 1);
    expect(result.out).toContain('not found in model');
    expect(result.out).toContain('/api/orders/:id');
  });

  test('SMK-201d an unreachable backend exits 1 with a hint', async () => {
    const project = await createShopProject({ baseUrl: `http://127.0.0.1:${await getFreePort()}` });
    const result = await cli(project, ['simulate', 'endpoint', '--all'], 1);
    expect(result.out).toContain('unreachable');
  });

  // The command prints "Simulation Complete (with failures)" and then exits 0, so a CI step cannot tell.
  test.failing('KG-24 simulate endpoint exits non-zero when an endpoint fails', async () => {
    const project = await createShopProject({ baseUrl: api.url });
    const all = await runCli(['simulate', 'endpoint', '--all'], { cwd: project.dir });
    const one = await runCli(['simulate', 'endpoint', 'GET', '/api/me'], { cwd: project.dir });
    expect(all.out).toMatch(/9 failed/);
    expect(one.out).toMatch(/401/);
    expect([all.code, one.code]).not.toContain(0);
  });
});

describe('Tier 2 — jetic simulate workflow', () => {
  test('SMK-202 happy-checkout runs end to end: capture, inject and chained path params', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows });
    await runWorkflow(project, 'happy-checkout', 0);

    // The server saw a real registration and an authenticated order — injection worked.
    expect({ users: api.userCount(), orders: api.orderCount() }).toEqual({ users: 1, orders: 1 });
    expect(api.hits).toEqual(expect.arrayContaining(['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/orders']));
    expect(api.hits.some((h) => /^GET \/api\/orders\/ord_\d+/.test(h))).toBe(true);

    const memory = project.readJson('.jetic', 'memory.json').workflow;
    expect(memory.accessToken.value).toMatch(/^tok_/);
    expect(memory.orderId.value).toMatch(/^ord_/);
    expect(memory.email.value).toContain('@'); // captureInput saved the faker value that was actually sent

    const traces = fs.readdirSync(project.path('.jetic', 'traces')).filter((f) => f.startsWith('trace_'));
    expect(traces).toHaveLength(1);
    const trace = project.readJson('.jetic', 'traces', traces[0]);
    expect(trace).toMatchObject({ workflowName: 'happy-checkout', passed: 4, failed: 0, baseUrl: api.url });
    expect(trace.steps.map((s: any) => s.name)).toEqual(['Register', 'Login', 'Create order', 'Get order']);
  });

  test('SMK-203 a negative workflow passes when the API refuses, and a broken one fails', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows });
    await runWorkflow(project, 'forbidden-admin', 0); // expects 403 and gets it
    const result = await runWorkflow(project, 'broken', 1);
    expect(result.out).toContain('404');
  });

  test('SMK-204 --clear-memory removes stale keys before the run', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows });
    const seed = () => project.writeJson('.jetic/memory.json', { workflow: { stale: { value: 'old' } } });

    seed();
    await runWorkflow(project, 'happy-checkout', 0);
    expect(project.readJson('.jetic', 'memory.json').workflow).toHaveProperty('stale');

    api.reset();
    seed();
    await runWorkflow(project, 'happy-checkout', 0, ['--clear-memory']);
    const after = project.readJson('.jetic', 'memory.json').workflow;
    expect(after).not.toHaveProperty('stale');
    expect(after).toHaveProperty('accessToken');
  });

  test('SMK-205 a {{human:otp}} value comes from JETIC_HUMAN_OTP without prompting', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows: { 'human-otp': humanOtp } });
    await runWorkflow(project, 'human-otp', 0, [], { JETIC_HUMAN_OTP: VALID_OTP });
    await runWorkflow(project, 'human-otp', 1, [], { JETIC_HUMAN_OTP: '000000' }); // wrong code → API says 401
  });

  test('SMK-205b with no value and no terminal, the run fails instead of hanging', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows: { 'human-otp': humanOtp } });
    const result = await runCli(['simulate', 'workflow', '--workflow', 'human-otp', '--env', 'local'], { cwd: project.dir, timeoutMs: 30_000 });
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(result.out.toLowerCase()).toContain('human');
  });

  test('SMK-210 an unreachable server exits 1 with a clear message', async () => {
    const project = await createShopProject({ baseUrl: `http://127.0.0.1:${await getFreePort()}`, workflows });
    const result = await runWorkflow(project, 'happy-checkout', 1);
    expect(result.out).toContain('unreachable');
    expect(result.out).not.toMatch(/UnhandledPromiseRejection|^\s+at /m);
  });
});

describe('Tier 2 — jetic test', () => {
  const report = (stdout: string) => JSON.parse(stdout) as { total: number; passed: number; failed: number; results: any[] };

  test('SMK-207 --ci prints machine-readable JSON and exits 1 on any failure', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows });
    const result = await cli(project, ['test', '--ci'], 1);
    const body = report(result.stdout);

    expect(body).toMatchObject({ total: 3, passed: 2, failed: 1 });
    expect(body.results.map((r) => [r.name, r.passed])).toEqual([['broken', false], ['forbidden-admin', true], ['happy-checkout', true]]);
    expect(body.results[0].failures).toEqual([{ step: 'Missing route', status: 404 }]);

    fs.rmSync(project.path('.jetic', 'workflows', 'broken.json'));
    api.reset();
    const green = await cli(project, ['test', '--ci'], 0);
    expect(report(green.stdout)).toMatchObject({ total: 2, passed: 2, failed: 0 });
  });

  test('SMK-207b human-readable output names the failing step and the reason', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows: { broken } });
    const result = await cli(project, ['test'], 1);
    expect(result.out).toContain('✗ broken');
    expect(result.out).toContain('Missing route');
    expect(result.out).toMatch(/0 passed\s+1 failed/);
  });

  test('SMK-207c --env selects a named environment', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows: { 'happy-checkout': happyCheckout } });
    const model = project.readJson('.jetic', 'model.json');
    model.environments.push({ name: 'dead', baseUrl: `http://127.0.0.1:${await getFreePort()}` });
    project.writeJson('.jetic/model.json', model);

    await cli(project, ['test', '--ci', '--env', 'local'], 0);
    api.reset();
    const dead = await cli(project, ['test', '--ci', '--env', 'dead'], 1);
    expect(report(dead.stdout).failed).toBe(1);
    expect(api.hits).toEqual([]); // the named environment was really used
  });

  // `--env typo` quietly falls back to the first environment, so a staging run can hit local (or the reverse).
  test.failing('KG-25 an unknown --env is an error, not a silent fallback', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows: { 'happy-checkout': happyCheckout } });
    const result = await runCli(['test', '--ci', '--env', 'stagng'], { cwd: project.dir });
    expect(result.code).not.toBe(0);
  });

  test('SMK-208 retry rides out transient 503s, and fails without it', async () => {
    const project = await createShopProject({ baseUrl: api.url, workflows: { 'retry-flaky': retryFlaky(3) } });
    await cli(project, ['test', '--ci'], 0); // two 503s, then 200 on the third attempt

    api.reset();
    writeWorkflow(project, 'retry-flaky', retryFlaky(1));
    const once = await cli(project, ['test', '--ci'], 1);
    expect(report(once.stdout).results[0].failures[0]).toMatchObject({ step: 'Flaky call', status: 503 });
  });

  test('SMK-210b an unreachable server fails the workflow with the connection error, not a hang', async () => {
    const project = await createShopProject({ baseUrl: `http://127.0.0.1:${await getFreePort()}`, workflows: { 'happy-checkout': happyCheckout } });
    const result = await cli(project, ['test', '--ci'], 1);
    const body = report(result.stdout);
    expect(body.failed).toBe(1);
    expect(body.results[0].failures[0].error).toMatch(/fetch failed|ECONNREFUSED/i);
  });

  // 201 is expected, the API answers 200; "any 2xx passes when expecting 2xx" hides that.
  test.failing('KG-06 a step expecting 201 fails when the API answers 200', async () => {
    const wrongStatus = {
      name: 'wrong-status',
      steps: [{ name: 'Health', method: 'GET', path: '/health', expectStatus: 201 }],
    };
    const project = await createShopProject({ baseUrl: api.url, workflows: { 'wrong-status': wrongStatus } });
    const result = await runCli(['test', '--ci'], { cwd: project.dir });
    expect(result.code).toBe(1);
  });
});

describe('Tier 2 — jetic authz', () => {
  test('SMK-209 flags secured endpoints that answer anonymous requests', async () => {
    const project = await createShopProject({ baseUrl: api.url });

    const strict = await cli(project, ['authz'], 0);
    expect(strict.out).toContain('5 secured endpoint(s)');
    expect(strict.out).toContain('0 endpoint(s) allowed anonymous access');
    expect((strict.out.match(/✓/g) ?? []).length).toBe(5);

    api.setMode({ leaky: true });
    const leaky = await cli(project, ['authz'], 1);
    expect(leaky.out).toMatch(/✗ GET\s+\/api\/reports\s+200/);
    expect(leaky.out).toContain('1 endpoint(s) allowed anonymous access');
  });

  test('SMK-209b with no secured endpoint declared it says there is nothing to check', async () => {
    const project = await createShopProject({ baseUrl: api.url });
    const model = project.readJson('.jetic', 'model.json');
    for (const endpoint of model.endpoints) delete endpoint.security;
    project.writeJson('.jetic/model.json', model);
    expect((await cli(project, ['authz'])).out).toContain('nothing to check');
  });

  // Every request fails to connect, yet the summary says "0 endpoints allowed anonymous access" and exit is 0.
  test.failing('KG-26 authz does not report success when the server could not be reached', async () => {
    const project = await createShopProject({ baseUrl: `http://127.0.0.1:${await getFreePort()}` });
    const result = await runCli(['authz'], { cwd: project.dir });
    expect(result.out).toContain('request failed');
    expect(result.code).not.toBe(0);
  });
});
