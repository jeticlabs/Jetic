/**
 * Tier 4 — MCP server, workflow side: authoring (scaffold → validate → create → update → delete),
 * live execution against the fixture API, environments, agents, and change tracking.
 */
import * as fs from 'fs';
import { McpSession } from '../harness/mcp';
import { checkoutWithMemoryId, happyCheckout } from '../fixtures/workflows';
import { startShopApi, ShopApi } from '../harness/shop-api';
import { TempProject } from '../harness/project';
import { createShopProject } from '../harness/shop-project';
import { getFreePort } from '../harness/wait';

let api: ShopApi;
beforeAll(async () => {
  api = await startShopApi();
});
afterAll(() => api.close());
beforeEach(() => api.reset());

const meStep = (token = '{{workflow:accessToken}}') => ({
  name: 'Me', method: 'GET', path: '/api/me', inject: { 'header:Authorization': `Bearer ${token}` }, expectStatus: 200,
});
const withName = (name: string) => ({ name, steps: checkoutWithMemoryId.steps });

describe('Tier 4 — workflow authoring', () => {
  let project: TempProject;
  let session: McpSession;
  beforeAll(async () => {
    project = await createShopProject({ baseUrl: api.url });
    session = await McpSession.start({ project: project.dir });
  });
  afterAll(() => session.close());

  test('SMK-407 scaffold drafts ordered steps and flags what is missing', async () => {
    const scaffold = await session.call('jetic_scaffold_workflow', {
      endpoints: ['POST /api/auth/register', 'POST /api/auth/login', { method: 'GET', path: '/api/me' }],
      workflowName: 'scaffolded',
    });
    expect(scaffold.data).toMatchObject({ workflowName: 'scaffolded', stepsCount: 3 });
    expect(scaffold.data.draftSteps.map((s: any) => `${s.method} ${s.path}`)).toEqual(['POST /api/auth/register', 'POST /api/auth/login', 'GET /api/me']);
    expect(Object.keys(scaffold.data.missingFields)).toEqual(['GET /api/me']); // protected: nothing says where the token comes from
    expect(scaffold.data.instructions).toContain('jetic_validate_workflow');
  });

  test('SMK-407b validate (inline) accepts a sound workflow and explains an unsound one', async () => {
    const good = await session.call('jetic_validate_workflow', { definition: withName('checkout-memory-id') });
    expect(good.data).toMatchObject({ saved: false, valid: true, errorsCount: 0 });

    const bad = await session.call('jetic_validate_workflow', {
      definition: { name: 'bad', steps: [{ name: 'Me', method: 'GET', path: '/api/me', inject: { 'header:Authorization': 'Bearer {{workflow:token}}' } }] },
    });
    expect(bad.data.valid).toBe(false);
    expect(bad.data.errors[0]).toMatchObject({ code: 'UNDEFINED_MEMORY_REF', stepIndex: 1 });
    expect(bad.data.errors[0].fix).toContain('workflow:token');

    const unknownEndpoint = await session.call('jetic_validate_workflow', {
      definition: { name: 'unknown', steps: [{ name: 'Nope', method: 'GET', path: '/api/nope' }] },
    });
    expect(unknownEndpoint.data.errors.map((e: any) => e.code)).toContain('UNKNOWN_ENDPOINT');
  });

  test('SMK-407c create → list → validate saved → update → delete, with the file on disk at each step', async () => {
    const created = await session.call('jetic_create_workflow', withName('Checkout Flow'));
    expect(created.data).toMatchObject({ success: true, action: 'created', slug: 'checkout-flow', stepsCount: 4, validation: { valid: true } });
    expect(project.exists('.jetic', 'workflows', 'checkout-flow.json')).toBe(true);
    expect(project.readJson('.jetic', 'workflows', 'checkout-flow.json')).toMatchObject({ name: 'Checkout Flow' });

    const listed = await session.call('jetic_list_workflows');
    expect(listed.data.workflows.map((w: any) => [w.id, w.stepsCount, w.source])).toEqual([['checkout-flow', 4, 'workflows_dir']]);

    expect((await session.call('jetic_validate_workflow', { workflow: 'checkout-flow' })).data).toMatchObject({ valid: true });

    const updated = await session.call('jetic_update_workflow', { workflow: 'checkout-flow', description: 'Buy something', appendSteps: [meStep()] });
    expect(updated.data).toMatchObject({ success: true, action: 'updated', slug: 'checkout-flow', stepsCount: 5 });
    expect(project.readJson('.jetic', 'workflows', 'checkout-flow.json')).toMatchObject({ description: 'Buy something' });
    expect(project.readJson('.jetic', 'workflows', 'checkout-flow.json').steps).toHaveLength(5);

    const deleted = await session.call('jetic_delete_workflow', { workflow: 'checkout-flow' });
    expect(deleted.ok).toBe(true);
    expect(project.exists('.jetic', 'workflows', 'checkout-flow.json')).toBe(false);
    expect((await session.call('jetic_delete_workflow', { workflow: 'checkout-flow' })).data).toMatchObject({ success: false });
    expect((await session.call('jetic_list_workflows')).data.workflows).toEqual([]);
  });

  test('SMK-407d create refuses invalid workflows and duplicates, and validateOnly writes nothing', async () => {
    const invalid = await session.call('jetic_create_workflow', {
      name: 'invalid',
      steps: [{ name: 'Me', method: 'GET', path: '/api/me', inject: { 'header:Authorization': 'Bearer {{workflow:token}}' } }],
    });
    expect(invalid.isError).toBe(true);
    expect(project.exists('.jetic', 'workflows', 'invalid.json')).toBe(false);

    const dry = await session.call('jetic_create_workflow', { ...withName('dry-run'), validateOnly: true });
    expect(dry.ok).toBe(true);
    expect(project.exists('.jetic', 'workflows', 'dry-run.json')).toBe(false);

    await session.call('jetic_create_workflow', withName('dup'));
    expect((await session.call('jetic_create_workflow', withName('dup'))).isError).toBe(true);
    expect((await session.call('jetic_create_workflow', { ...withName('dup'), overwrite: true })).data).toMatchObject({ success: true });
  });

  test('SMK-407e a workflow with a condition is validated in both forms', async () => {
    const rules = { rules: { all: [{ left: '{{workflow:accessToken}}', operator: 'exists' }] }, onFail: 'abort' };
    const legacy = { if: '{{workflow:accessToken}}', exists: true };
    const withCondition = (condition: unknown) => ({
      name: 'conditional',
      steps: [...checkoutWithMemoryId.steps.slice(0, 2), { ...meStep(), condition }],
    });

    expect((await session.call('jetic_validate_workflow', { definition: withCondition(rules) })).data.valid).toBe(true);
    expect((await session.call('jetic_validate_workflow', { definition: withCondition(legacy) })).data.valid).toBe(true);

    const unrecognized = await session.call('jetic_validate_workflow', { definition: withCondition({ onFail: 'abort' }) });
    expect(unrecognized.isError).toBe(true); // rejected before the handler: matches neither accepted shape
  });

  // Both styles are valid: a memory key matching the param name (`workflow:id`) or a body injection
  // (`inject: { "body:id": "workflow:orderId" }`), which every runner merges before path resolution.
  test('KG-31 the validator accepts a path param supplied through inject "body:<name>"', async () => {
    const result = await session.call('jetic_validate_workflow', { definition: happyCheckout });
    expect(result.data.valid).toBe(true);
  });
});

describe('Tier 4 — live execution', () => {
  let project: TempProject;
  let session: McpSession;
  beforeAll(async () => {
    project = await createShopProject({ baseUrl: api.url, workflows: { 'checkout-memory-id': checkoutWithMemoryId } });
    session = await McpSession.start({ project: project.dir });
  });
  afterAll(() => session.close());

  test('SMK-408 test_endpoint calls the API and validates the response', async () => {
    const result = await session.call('jetic_test_endpoint', { method: 'GET', path: '/health' });
    expect(result.data).toMatchObject({ success: true, targetUrl: `${api.url}/health`, response: { status: 200, body: { status: 'ok' } }, validation: { passed: true } });
    expect(api.hits).toEqual(['GET /health']);

    const refused = await session.call('jetic_test_endpoint', { id: 'GET /api/me', customHeaders: { Authorization: 'Bearer nope' } });
    expect(refused.data.response.status).toBe(401);
    expect(api.hits).toContain('GET /api/me');
  });

  test('SMK-408b simulate_workflow runs the saved workflow end to end; the alias behaves the same', async () => {
    const run = await session.call('jetic_simulate_workflow', { workflow: 'checkout-memory-id', includeStepResults: true });
    expect(run.data).toMatchObject({ success: true, stats: { totalSteps: 4, executedSteps: 4, passedSteps: 4, failedSteps: 0 } });
    expect(run.data.results.map((r: any) => [r.name, r.actualStatus])).toEqual([['Register', 201], ['Login', 200], ['Create order', 201], ['Get order', 200]]);
    expect(run.data.runId).toBeTruthy();
    expect(run.data.reportPath).toContain('simulation-report.json');
    expect({ users: api.userCount(), orders: api.orderCount() }).toEqual({ users: 1, orders: 1 });
    expect(project.readJson('.jetic', 'memory.json').workflow.accessToken.value).toMatch(/^tok_/);

    api.reset();
    // Default (no includeStepResults): compact summary — steps, no full result bodies.
    const alias = await session.call('jetic_simulate', { workflow: 'checkout-memory-id', clearMemory: true });
    expect(alias.data).toMatchObject({ success: true, stats: { passedSteps: 4 } });
    expect(alias.data.results).toBeUndefined();
    expect(alias.data.steps.map((s: any) => s.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
    expect({ users: api.userCount(), orders: api.orderCount() }).toEqual({ users: 1, orders: 1 });

    // The compact runId leads to the full stored report.
    const stored = await session.call('jetic_get_run', { runId: alias.data.runId });
    expect(stored.data).toMatchObject({ found: true, type: 'simulation', status: 'passed' });
    expect(stored.data.result.results[0].requestBody.email).toBeTruthy();
  });

  test('SMK-408c a failing run reports success:false with the failing step; unknown workflows are errors', async () => {
    const failing = { name: 'failing', steps: [{ name: 'Missing', method: 'GET', path: '/api/nope', expectStatus: 200 }] };
    await session.call('jetic_create_workflow', { ...failing, allowUnknownEndpoints: true });
    const run = await session.call('jetic_simulate_workflow', { workflow: 'failing', includeStepResults: true });
    expect(run.ok).toBe(true); // the tool worked; the workflow did not
    expect(run.data).toMatchObject({ success: false, status: 'failed', stats: { failedSteps: 1 } });
    expect(run.data.results[0]).toMatchObject({ actualStatus: 404, passed: false });

    expect((await session.call('jetic_simulate_workflow', { workflow: 'does-not-exist' })).isError).toBe(true);
  });

  test('SMK-408d an unreachable server is detected up front — no requests, clear reason', async () => {
    const dead = `http://127.0.0.1:${await getFreePort()}`;
    api.reset();
    const run = await session.call('jetic_simulate_workflow', { workflow: 'checkout-memory-id', baseUrl: dead });
    expect(run.ok).toBe(true); // the run failed; the tool call itself did not throw
    expect(run.data).toMatchObject({ success: false, status: 'aborted', stats: { executedSteps: 0 } });
    expect(run.data.preflight).toMatchObject({ verdict: 'unreachable', aborted: true });
    expect(run.data.abortReason).toMatch(/refused|listening|Cannot reach/i);
    expect(run.data.steps).toEqual([]); // stopped before step 1

    const stored = await session.call('jetic_get_run', { runId: run.data.runId });
    expect(stored.data.status).toBe('aborted');
  });

  test('SMK-408e runs persist under .jetic/runs/ and can be listed; async mode returns immediately', async () => {
    api.reset();
    const started = await session.call('jetic_simulate_workflow', {
      workflow: 'checkout-memory-id',
      async: true,
      clearMemory: true,
    });
    expect(started.data).toMatchObject({ status: 'running' });
    const runId = started.data.runId as string;
    expect(runId).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Poll the persisted status until the background run finishes.
    let status = 'running';
    for (let i = 0; i < 50 && status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await session.call('jetic_get_run', { runId })).data.status;
    }
    expect(status).toBe('passed');

    const full = await session.call('jetic_get_run', { runId });
    expect(full.data.result.results.map((r: any) => r.name)).toEqual(['Register', 'Login', 'Create order', 'Get order']);
    expect(project.readJson('.jetic', 'runs', runId, 'simulation-status.json').status).toBe('passed');

    const listed = await session.call('jetic_list_runs', {});
    expect(listed.data.runs[0]).toMatchObject({ runId, type: 'simulation', status: 'passed' });

    const missing = await session.call('jetic_get_run', { runId: 'no-such-run' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('not found');
  });

  test('SMK-408f progress is pollable and every stored step carries the curl-style payload', async () => {
    api.reset();
    const started = await session.call('jetic_simulate_workflow', {
      workflow: 'checkout-memory-id',
      async: true,
      clearMemory: true,
    });
    const runId = started.data.runId as string;

    // The planned route is visible from the first poll — pending until each step completes.
    const first = await session.call('jetic_get_run', { runId });
    expect(first.data.found).toBe(true);
    expect(first.data.steps).toHaveLength(4);
    expect(first.data.steps.map((s: any) => s.status)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(pending|passed|failed|skipped)$/)])
    );

    let status = first.data.status as string;
    for (let i = 0; i < 50 && status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await session.call('jetic_get_run', { runId })).data.status;
    }
    expect(status).toBe('passed');

    const done = await session.call('jetic_get_run', { runId });
    expect(done.data.steps.map((s: any) => [s.index, s.status])).toEqual([
      [1, 'passed'], [2, 'passed'], [3, 'passed'], [4, 'passed'],
    ]);

    const [, loginStep, createStep, getStep] = done.data.result.results;
    // Request side: final URL, real headers (Content-Type + the actual Bearer value).
    expect(loginStep.resolvedUrl).toBe(`${api.url}/api/auth/login`);
    expect(loginStep.requestHeaders['Content-Type']).toBe('application/json');
    expect(loginStep.requestHeaders.Authorization).toBeUndefined();
    expect(createStep.requestHeaders.Authorization).toMatch(/^Bearer tok_/);
    expect(getStep.resolvedUrl).toMatch(/\/api\/orders\/[^/]+$/);
    expect(getStep.resolvedUrl).not.toContain(':id');
    // Response side + timing.
    expect(loginStep.responseHeaders['content-type']).toContain('application/json');
    expect(Date.parse(loginStep.startedAt)).toBeLessThanOrEqual(Date.parse(loginStep.finishedAt));
  });
});

describe('Tier 4 — environments, agents and change tracking', () => {
  let project: TempProject;
  let session: McpSession;
  beforeAll(async () => {
    project = await createShopProject({ baseUrl: api.url });
    session = await McpSession.start({ project: project.dir });
  });
  afterAll(() => session.close());

  test('SMK-409 environments can be listed, added, updated and deleted', async () => {
    const names = (r: any) => r.data.environments.map((e: any) => e.name);
    expect(names(await session.call('jetic_manage_environment', { action: 'list' }))).toEqual(['local']);

    const added = await session.call('jetic_manage_environment', { action: 'add', name: 'staging', baseUrl: 'https://staging.example.test' });
    expect(added.data).toMatchObject({ success: true, action: 'added' });
    expect(names(added)).toEqual(['local', 'staging']);

    const updated = await session.call('jetic_manage_environment', { action: 'update', name: 'staging', baseUrl: 'https://staging2.example.test' });
    expect(updated.data.environments.find((e: any) => e.name === 'staging').baseUrl).toBe('https://staging2.example.test');
    expect(project.readJson('.jetic', 'model.json').environments).toHaveLength(2);

    const deleted = await session.call('jetic_manage_environment', { action: 'delete', name: 'staging' });
    expect(names(deleted)).toEqual(['local']);
  });

  test('SMK-409b agents: list, run model-watcher, and an unknown agent is an error', async () => {
    const list = await session.call('jetic_list_agents');
    expect(list.data.agents.map((a: any) => a.id).sort()).toEqual(['model-watcher', 'workflow-impact']);

    const first = await session.call('jetic_run_agent', { agent: 'model-watcher' });
    expect(first.data).toMatchObject({ status: 'completed', agentId: 'model-watcher', summary: 'Initial snapshot recorded (10 endpoints).' });
    expect(fs.existsSync(first.data.reportPath)).toBe(true);

    await session.call('jetic_add_endpoint', { method: 'GET', path: '/api/new-thing' });
    const second = await session.call('jetic_run_agent', { agent: 'model-watcher' });
    expect(second.data.summary).toContain('1 endpoint(s) added');
    expect(second.data.findings).toEqual([{ kind: 'endpoint_added', endpointId: 'GET /api/new-thing' }]);

    expect((await session.call('jetic_run_agent', { agent: 'no-such-agent' })).isError).toBe(true);
  });

  test('SMK-409c get_changes / clear_changes work on the change log `jetic dev` maintains', async () => {
    expect((await session.call('jetic_get_changes')).data).toMatchObject({ hasChanges: false, changes: [] });

    project.writeJson('.jetic/changes.json', {
      version: 1,
      watchedSince: '2026-01-01T00:00:00.000Z',
      projectRoot: project.dir,
      changes: [{ filePath: 'src/routes/orders.ts', absolutePath: project.path('src', 'routes', 'orders.ts'), changedAt: '2026-01-01T00:00:01.000Z', eventType: 'change' }],
    });
    const changed = await session.call('jetic_get_changes');
    expect(changed.data.hasChanges).toBe(true);
    expect(changed.data.changes.map((c: any) => c.filePath ?? c.file)).toContain('src/routes/orders.ts');

    expect((await session.call('jetic_clear_changes')).data.success).toBe(true);
    expect((await session.call('jetic_get_changes')).data.hasChanges).toBe(false);
  });
});
