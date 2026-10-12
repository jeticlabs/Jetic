/**
 * Tier 3 — `jetic dev` HTTP API, workflow side: saved-workflow CRUD, the SSE run endpoint
 * (including pausing for {{human:key}} input), runtime memory, and traces.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DevServer, startDev } from '../harness/dev-server';
import { forbiddenAdmin, broken, happyCheckout, humanOtp, VALID_OTP } from '../fixtures/workflows';
import { startShopApi, ShopApi } from '../harness/shop-api';
import { TempProject } from '../harness/project';
import { createShopProject } from '../harness/shop-project';
import { SseStream } from '../harness/sse';
import { getFreePort } from '../harness/wait';

const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const send = (dev: DevServer, method: string, route: string, body?: unknown) =>
  fetch(`${dev.url}${route}`, { method, ...(body === undefined ? {} : json(body)) });
const get = async (dev: DevServer, route: string) => (await fetch(`${dev.url}${route}`)).json() as Promise<any>;
const run = (dev: DevServer, body: unknown) => SseStream.open(`${dev.url}/api/workflows/run`, { method: 'POST', ...json(body) });

let api: ShopApi;
beforeAll(async () => {
  api = await startShopApi();
});
afterAll(() => api.close());
beforeEach(() => api.reset());

describe('Tier 3 — workflows CRUD', () => {
  let project: TempProject;
  let dev: DevServer;
  beforeAll(async () => {
    project = await createShopProject();
    dev = await startDev(project.dir);
  });
  afterAll(() => dev.stop());

  test('SMK-305 create, list, update and delete a workflow', async () => {
    expect(await get(dev, '/api/workflows')).toEqual([]);

    const created = await (await send(dev, 'POST', '/api/workflows', { name: 'My Flow' })).json();
    expect(created).toMatchObject({ ok: true, slug: 'my-flow', _file: 'workflows/my-flow.json', name: 'My Flow', steps: [] });
    expect(project.exists('.jetic', 'workflows', 'my-flow.json')).toBe(true);

    expect((await send(dev, 'POST', '/api/workflows', { name: 'My Flow' })).status).toBe(409);
    expect((await send(dev, 'POST', '/api/workflows', { name: '  ' })).status).toBe(400);

    const steps = [{ name: 'Health', method: 'GET', path: '/health', expectStatus: 200 }];
    const updated = await (await send(dev, 'PUT', '/api/workflows/my-flow', { steps })).json();
    expect(updated).toMatchObject({ ok: true, name: 'My Flow', steps });
    expect(project.readJson('.jetic', 'workflows', 'my-flow.json').steps).toEqual(steps);

    const listed = await get(dev, '/api/workflows');
    expect(listed.map((w: any) => w._file)).toEqual(['workflows/my-flow.json']);

    expect((await send(dev, 'PUT', '/api/workflows/nope', { steps: [] })).status).toBe(404);

    expect((await (await send(dev, 'DELETE', '/api/workflows/my-flow')).json()).ok).toBe(true);
    expect(project.exists('.jetic', 'workflows', 'my-flow.json')).toBe(false);
    expect((await send(dev, 'DELETE', '/api/workflows/my-flow')).status).toBe(404);
    expect(await get(dev, '/api/workflows')).toEqual([]);
  });

  test('SMK-305b run validates its input', async () => {
    expect((await send(dev, 'POST', '/api/workflows/run', {})).status).toBe(400);
    expect((await send(dev, 'POST', '/api/workflows/run', { file: 'workflows/missing.json' })).status).toBe(404);
    project.writeFile('.jetic/workflows/garbage.json', '{ not json');
    expect((await send(dev, 'POST', '/api/workflows/run', { file: 'workflows/garbage.json' })).status).toBe(400);
  });

  // `file` is joined to .jetic unless absolute, and an absolute path is read as-is and executed.
  test.failing('KG-12b the workflow runner refuses workflow files outside the project', async () => {
    const outside = path.join(os.tmpdir(), `jetic-smoke-outside-wf-${process.pid}.json`);
    fs.writeFileSync(outside, JSON.stringify({ name: 'outside', steps: [] }));
    try {
      const res = await send(dev, 'POST', '/api/workflows/run', { file: outside });
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

describe('Tier 3 — workflow runs over SSE', () => {
  let project: TempProject;
  let dev: DevServer;
  beforeAll(async () => {
    project = await createShopProject({
      baseUrl: api.url,
      workflows: { 'happy-checkout': happyCheckout, 'forbidden-admin': forbiddenAdmin, broken, 'human-otp': humanOtp },
    });
    dev = await startDev(project.dir);
  });
  afterAll(() => dev.stop());

  test('SMK-306 a run streams start, per-step results and done', async () => {
    const stream = await run(dev, { file: 'workflows/happy-checkout.json', baseUrl: api.url });
    const events = await stream.all();

    expect(stream.types()).toEqual(['start', ...Array(4).fill(['step_start', 'step_result']).flat(), 'done']);
    expect(events[0]).toMatchObject({ name: 'happy-checkout', totalSteps: 4, baseUrl: api.url });
    expect(events[0].runId).toEqual(expect.any(String));

    const results = events.filter((e) => e.type === 'step_result');
    expect(results.map((r) => [r.step.name, r.status, r.passed])).toEqual([
      ['Register', 201, true], ['Login', 200, true], ['Create order', 201, true], ['Get order', 200, true],
    ]);
    expect(results[1].captured).toEqual(['workflow:accessToken ← data.accessToken']);
    expect(results[2].injected.Authorization).toMatch(/^Bearer tok_/); // injection resolved from memory
    expect(events[events.length - 1]).toMatchObject({ type: 'done', passed: 4, failed: 0, total: 4 });
    expect({ users: api.userCount(), orders: api.orderCount() }).toEqual({ users: 1, orders: 1 });
  });

  test('SMK-306b a failing status is reported without aborting; a negative workflow passes', async () => {
    const failing = await (await run(dev, { file: 'workflows/broken.json', baseUrl: api.url })).all();
    expect(failing.find((e) => e.type === 'step_result')).toMatchObject({ status: 404, passed: false });
    expect(failing[failing.length - 1]).toMatchObject({ type: 'done', passed: 0, failed: 1 });

    const negative = await (await run(dev, { file: 'workflows/forbidden-admin.json', baseUrl: api.url })).all();
    expect(negative[negative.length - 1]).toMatchObject({ type: 'done', passed: 3, failed: 0 });
  });

  test('SMK-306c an unreachable server aborts the run with the connection error', async () => {
    const stream = await run(dev, { file: 'workflows/happy-checkout.json', baseUrl: `http://127.0.0.1:${await getFreePort()}` });
    const events = await stream.all();
    expect(events[events.length - 1]).toMatchObject({ type: 'aborted' });
    expect(events.find((e) => e.type === 'step_result')).toMatchObject({ status: 0, passed: false });
  });

  test('SMK-306d with no baseUrl it uses the model\'s default environment', async () => {
    const events = await (await run(dev, { file: 'workflows/broken.json' })).all();
    expect(events[0]).toMatchObject({ type: 'start', baseUrl: api.url });
  });

  describe('SMK-307 {{human:otp}}', () => {
    test('the run pauses for input and resumes when it is posted', async () => {
      const stream = await run(dev, { file: 'workflows/human-otp.json', baseUrl: api.url });
      try {
        const start = await stream.waitFor('start');
        expect(start.humanKeys).toEqual([{ key: 'otp', source: 'prompt' }]);

        const asked = await stream.waitFor('human_input_required');
        expect(asked).toMatchObject({ key: 'otp', stepIndex: 0, runId: start.runId });
        expect(stream.types()).not.toContain('step_result'); // paused: the request has not been sent yet

        expect((await send(dev, 'POST', '/api/workflows/human-input', { runId: 'wrong', key: 'otp', value: VALID_OTP })).status).toBe(404);
        expect((await send(dev, 'POST', '/api/workflows/human-input', { key: 'otp' })).status).toBe(400);
        expect((await send(dev, 'POST', '/api/workflows/human-input', { runId: start.runId, key: 'otp', value: VALID_OTP })).status).toBe(200);

        expect(await stream.waitFor('human_resolved')).toMatchObject({ key: 'otp', source: 'prompt' });
        const events = await stream.all();
        expect(events.find((e) => e.type === 'step_result')).toMatchObject({ status: 200, passed: true });
        expect(events[events.length - 1]).toMatchObject({ type: 'done', passed: 1, failed: 0 });
      } finally {
        stream.close();
      }

      // The answer is stored in the `human` memory scope.
      expect(project.readJson('.jetic', 'memory.json').human.otp.value).toBe(VALID_OTP);
    });

    // The run header says the stored value is "ready" (source: memory), yet the runner asks again: it
    // checks the run, env and prompt, never the stored value. `jetic test` and the CLI runner do use it.
    test.failing('KG-29 a stored human value is used instead of prompting again', async () => {
      project.writeJson('.jetic/memory.json', { human: { otp: { value: VALID_OTP } } });
      const stream = await run(dev, { file: 'workflows/human-otp.json', baseUrl: api.url });
      try {
        expect((await stream.waitFor('start')).humanKeys).toEqual([{ key: 'otp', source: 'memory' }]);
        const next = await stream.waitFor((e) => e.type === 'human_input_required' || e.type === 'done', 8_000);
        expect(next.type).toBe('done');
      } finally {
        stream.close();
      }
    });

    test('a value supplied up front (humanInputs) or by environment never prompts', async () => {
      fs.rmSync(project.path('.jetic', 'memory.json'), { force: true });
      const upFront = await run(dev, { file: 'workflows/human-otp.json', baseUrl: api.url, humanInputs: { otp: VALID_OTP } });
      expect((await upFront.waitFor('start')).humanKeys).toEqual([{ key: 'otp', source: 'run' }]);
      const events = await upFront.all();
      expect(upFront.types()).not.toContain('human_input_required');
      expect(events[events.length - 1]).toMatchObject({ type: 'done', passed: 1, failed: 0 });

      const envDev = await startDev(project.dir, { env: { JETIC_HUMAN_OTP: VALID_OTP } });
      try {
        const viaEnv = await run(envDev, { file: 'workflows/human-otp.json', baseUrl: api.url });
        const start = await viaEnv.waitFor('start');
        // The server may report the (now persisted) memory copy or the env value; either way, no prompt.
        expect(['env', 'memory']).toContain(start.humanKeys[0].source);
        await viaEnv.all();
        expect(viaEnv.types()).not.toContain('human_input_required');
      } finally {
        await envDev.stop();
      }
    });

    // The runner listens for the REQUEST's `close`, which Node emits as soon as the body is read, so a
    // client that disconnects mid-prompt is never noticed: the run keeps waiting (up to 10 minutes).
    test.failing('KG-30 disconnecting while paused ends the run instead of leaking it', async () => {
      fs.rmSync(project.path('.jetic', 'memory.json'), { force: true });
      const stream = await run(dev, { file: 'workflows/human-otp.json', baseUrl: api.url });
      const start = await stream.waitFor('start');
      await stream.waitFor('human_input_required');
      stream.close();

      // The waiter is gone: answering now is "no pending input", not a hang or a crash.
      await new Promise((r) => setTimeout(r, 300));
      expect((await send(dev, 'POST', '/api/workflows/human-input', { runId: start.runId, key: 'otp', value: VALID_OTP })).status).toBe(404);
      expect(await get(dev, '/api/workflows')).toHaveLength(4); // server still healthy
    });
  });
});

describe('Tier 3 — memory and traces', () => {
  let project: TempProject;
  let dev: DevServer;
  beforeAll(async () => {
    project = await createShopProject();
    dev = await startDev(project.dir);
  });
  afterAll(() => dev.stop());

  test('SMK-308 memory entries can be written, listed and deleted by scope:key', async () => {
    expect(await get(dev, '/api/memory')).toEqual([]);

    expect((await (await send(dev, 'POST', '/api/memory', { key: 'workflow:token', value: 'abc' })).json()).ok).toBe(true);
    await send(dev, 'POST', '/api/memory', { key: 'plain', value: 'in-global-scope' }); // no scope → global
    expect(await get(dev, '/api/memory')).toEqual(expect.arrayContaining([
      { key: 'workflow:token', value: 'abc' },
      { key: 'global:plain', value: 'in-global-scope' },
    ]));
    expect(project.readJson('.jetic', 'memory.json').workflow.token.value).toBe('abc');

    expect((await send(dev, 'POST', '/api/memory', { key: 'workflow:no-value' })).status).toBe(400);
    expect((await send(dev, 'DELETE', '/api/memory', {})).status).toBe(400);

    await send(dev, 'DELETE', '/api/memory', { key: 'workflow:token' });
    expect((await get(dev, '/api/memory')).map((e: any) => e.key)).toEqual(['global:plain']);
  });

  const record = (id: string, startedAt: string) => ({ id, workflowName: `wf-${id}`, startedAt, passed: 1, failed: 0, steps: [] });

  test('SMK-309 traces can be stored, listed newest first, and deleted', async () => {
    expect(await get(dev, '/api/traces')).toEqual([]);

    await send(dev, 'POST', '/api/traces', record('older', '2026-01-01T00:00:00.000Z'));
    await send(dev, 'POST', '/api/traces', record('newer', '2026-02-01T00:00:00.000Z'));
    expect((await send(dev, 'POST', '/api/traces', { workflowName: 'no id' })).status).toBe(400);

    expect((await get(dev, '/api/traces')).map((t: any) => t.id)).toEqual(['newer', 'older']);
    expect(project.exists('.jetic', 'traces', 'trace_older.json')).toBe(true);

    await send(dev, 'DELETE', '/api/traces/older');
    expect((await get(dev, '/api/traces')).map((t: any) => t.id)).toEqual(['newer']);

    await send(dev, 'DELETE', '/api/traces');
    expect(await get(dev, '/api/traces')).toEqual([]);
    expect((await fetch(`${dev.url}/api/traces/missing`)).status).toBe(404);
  });

  // POST stores `trace_<id>.json` but GET /:id looks for `<id>.json`, so a stored trace cannot be fetched by its id.
  test.failing('KG-04 a stored trace can be fetched by the id it was stored under', async () => {
    await send(dev, 'POST', '/api/traces', record('fetchable', '2026-03-01T00:00:00.000Z'));
    const res = await fetch(`${dev.url}/api/traces/fetchable`);
    expect(res.status).toBe(200);
  });
});
