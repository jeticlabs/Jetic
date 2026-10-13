/**
 * Tier 3 — `jetic dev` HTTP API, model side: model, endpoints, environments, source viewer,
 * rescans, the file-change watcher, and shutdown. (Workflows, memory and traces: t3-dev-workflows.)
 */
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { runCli } from '../harness/cli';
import { DevServer, startDev } from '../harness/dev-server';
import { TempProject } from '../harness/project';
import { createShopProject } from '../harness/shop-project';
import { SseStream } from '../harness/sse';
import { waitFor } from '../harness/wait';

const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const send = (dev: DevServer, method: string, route: string, body?: unknown) =>
  fetch(`${dev.url}${route}`, { method, ...(body === undefined ? {} : json(body)) });
const get = async (dev: DevServer, route: string) => (await fetch(`${dev.url}${route}`)).json() as Promise<any>;
const encode = encodeURIComponent;

describe('Tier 3 — model API', () => {
  let project: TempProject;
  let dev: DevServer;
  beforeAll(async () => {
    project = await createShopProject();
    dev = await startDev(project.dir);
  });
  afterAll(() => dev.stop());

  test('SMK-301b GET /api/model serves the scanned model', async () => {
    const model = await get(dev, '/api/model');
    expect(model.endpoints).toHaveLength(10);
    expect(model.project).toMatchObject({ name: 'shop-api', framework: 'express' });
  });

  test('SMK-302 POST /api/model/endpoint adds an endpoint; method and path are required', async () => {
    const created = await (await send(dev, 'POST', '/api/model/endpoint', { method: 'POST', path: '/api/refunds', description: 'Refund an order' })).json();
    expect(created.ok).toBe(true);
    expect(created.endpoint).toMatchObject({ method: 'POST', path: '/api/refunds', description: 'Refund an order' });
    expect(project.readJson('.jetic', 'model.json').endpoints.map((e: any) => e.path)).toContain('/api/refunds');

    const duplicate = await (await send(dev, 'POST', '/api/model/endpoint', { method: 'POST', path: '/api/refunds' })).json();
    expect(duplicate.endpoint.id).not.toBe(created.endpoint.id); // ids stay unique

    expect((await send(dev, 'POST', '/api/model/endpoint', { path: '/api/x' })).status).toBe(400);
    expect((await send(dev, 'POST', '/api/model/endpoint', { method: 'GET' })).status).toBe(400);
  });

  test('SMK-302b PUT /api/model/endpoint/:id merges fields; unknown ids are 404', async () => {
    const id = 'GET /api/orders/:id';
    const updated = await (await send(dev, 'PUT', `/api/model/endpoint/${encode(id)}`, { description: 'Fetch one order', tags: ['orders'] })).json();
    expect(updated.endpoint).toMatchObject({ id, path: '/api/orders/:id', description: 'Fetch one order', tags: ['orders'] });
    expect(project.readJson('.jetic', 'model.json').endpoints.find((e: any) => e.id === id).description).toBe('Fetch one order');

    expect((await send(dev, 'PUT', `/api/model/endpoint/${encode('GET /nope')}`, { description: 'x' })).status).toBe(404);
  });

  // The scanner and MCP name endpoints "POST /api/refunds"; the dev API invents "post-api-refunds".
  test.failing('KG-05 an endpoint added through the dev API has the same id the scanner and MCP use', async () => {
    const created = await (await send(dev, 'POST', '/api/model/endpoint', { method: 'DELETE', path: '/api/refunds/:id' })).json();
    expect(created.endpoint.id).toBe('DELETE /api/refunds/:id');
  });

  // The dashboard's "Add endpoint" saves no `source`, which `jetic inspect endpoint` then dereferences.
  test.failing('KG-27 an endpoint added through the dev API can be inspected from the CLI', async () => {
    await send(dev, 'POST', '/api/model/endpoint', { method: 'GET', path: '/api/inspectable' });
    const result = await runCli(['inspect', 'endpoint', 'GET', '/api/inspectable'], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(result.out).not.toMatch(/TypeError|Cannot read properties/);
  });

  test('SMK-304 GET /api/model/source returns the handler\'s lines; missing params and files are errors', async () => {
    const model = await get(dev, '/api/model');
    const endpoint = model.endpoints.find((e: any) => e.id === 'GET /api/orders/:id');
    const relative = path.relative(project.dir, endpoint.source.file).replace(/\\/g, '/');

    const result = await get(dev, `/api/model/source?file=${encode(relative)}&line=${endpoint.source.line}`);
    expect(result.source).toContain("router.get('/:id'");
    expect(result.startLine).toBe(endpoint.source.line - 4);
    expect(result.totalLines).toBeGreaterThan(endpoint.source.line);

    expect((await fetch(`${dev.url}/api/model/source?line=1`)).status).toBe(400);
    expect((await fetch(`${dev.url}/api/model/source?file=${encode('src/missing.ts')}`)).status).toBe(404);
  });

  // Any readable file on the machine is returned: the server listens on all interfaces with CORS "*".
  test.failing('KG-12 /api/model/source refuses files outside the project', async () => {
    const outside = path.join(os.tmpdir(), `jetic-smoke-outside-${process.pid}.txt`);
    fs.writeFileSync(outside, 'not part of the project');
    try {
      const res = await fetch(`${dev.url}/api/model/source?file=${encode(outside)}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  test('SMK-304b GET /api/model/related lists the endpoint\'s file and its relative imports', async () => {
    const { files } = await get(dev, `/api/model/related?id=${encode('GET /api/orders/:id')}`);
    const normalized = files.map((f: string) => f.replace(/\\/g, '/'));
    expect(normalized).toEqual(expect.arrayContaining(['src/routes/orders.ts', 'src/middleware/auth.ts', 'src/store.ts']));
    expect(normalized[0]).toBe('src/routes/orders.ts');

    expect((await get(dev, `/api/model/related?id=${encode('GET /unknown')}`)).files).toEqual([]);
    expect((await fetch(`${dev.url}/api/model/related`)).status).toBe(400);
  });
});

describe('Tier 3 — environments API', () => {
  let dev: DevServer;
  beforeAll(async () => {
    dev = await startDev((await createShopProject()).dir);
  });
  afterAll(() => dev.stop());

  test('SMK-303 environments can be created, updated, defaulted and deleted', async () => {
    const initial = await get(dev, '/api/model/environments');
    expect(initial.environments.map((e: any) => e.name)).toEqual(['local']);
    expect(initial.defaultEnvironment).toBe('local');

    const created = await (await send(dev, 'POST', '/api/model/environments', { name: 'staging', baseUrl: 'https://staging.example.test' })).json();
    expect(created.environments.map((e: any) => e.name)).toEqual(['local', 'staging']);

    expect((await send(dev, 'POST', '/api/model/environments', { name: 'staging', baseUrl: 'https://x.test' })).status).toBe(409);
    expect((await send(dev, 'POST', '/api/model/environments', { name: 'broken' })).status).toBe(400);

    const updated = await (await send(dev, 'PUT', '/api/model/environments/staging', { baseUrl: 'https://staging2.example.test' })).json();
    expect(updated.environments.find((e: any) => e.name === 'staging').baseUrl).toBe('https://staging2.example.test');

    const defaulted = await (await send(dev, 'PUT', '/api/model/environments/staging/default')).json();
    expect(defaulted.defaultEnvironment).toBe('staging');
    const afterDefault = await get(dev, '/api/model/environments');
    expect(afterDefault.defaultEnvironment).toBe('staging');
    expect(afterDefault.environments.filter((e: any) => e.default).map((e: any) => e.name)).toEqual(['staging']);

    const deleted = await (await send(dev, 'DELETE', '/api/model/environments/staging')).json();
    expect(deleted.environments.map((e: any) => e.name)).toEqual(['local']);
    expect(deleted.defaultEnvironment).toBe('local'); // the removed default no longer sticks
  });

  test('SMK-303b unknown environments are 404', async () => {
    expect((await send(dev, 'PUT', '/api/model/environments/nope', { baseUrl: 'https://x.test' })).status).toBe(404);
    expect((await send(dev, 'PUT', '/api/model/environments/nope/default')).status).toBe(404);
  });
});

describe('Tier 3 — rescans and the change watcher', () => {
  let project: TempProject;
  let dev: DevServer;
  beforeAll(async () => {
    project = await createShopProject();
    dev = await startDev(project.dir);
  });
  afterAll(() => dev.stop());

  const changedFiles = async () => ((await get(dev, '/api/changes')).changes as Array<{ filePath: string }>).map((c) => c.filePath);

  test('SMK-310 edits to source files are tracked; .jetic, other extensions and unrelated files are not', async () => {
    expect(await changedFiles()).toEqual([]);

    // Open the live stream first so the update is observed as a push, not just by polling.
    const stream = await SseStream.open(`${dev.url}/api/changes/stream`);
    try {
      await stream.waitFor((e) => Array.isArray(e.changes)); // initial snapshot

      project.writeFile('.jetic/ignored.json', '{}'); // inside .jetic
      project.writeFile('notes.txt', 'plain text'); // not a source extension
      project.writeFile('src/routes/orders.ts', fs.readFileSync(project.path('src/routes/orders.ts'), 'utf8') + '\n// edited\n');

      const pushed = await stream.waitFor((e) => Array.isArray(e.changes) && e.changes.length > 0);
      expect(pushed.changes.map((c: any) => c.filePath)).toEqual(['src/routes/orders.ts']);
    } finally {
      stream.close();
    }

    const tracked = await get(dev, '/api/changes');
    expect(tracked.changes).toHaveLength(1);
    expect(tracked.changes[0]).toMatchObject({ filePath: 'src/routes/orders.ts', eventType: 'change' });
    expect(fs.realpathSync(tracked.projectRoot)).toBe(fs.realpathSync(project.dir));
  });

  test('SMK-310b DELETE /api/changes clears the list and tracking continues', async () => {
    await send(dev, 'DELETE', '/api/changes');
    expect(await changedFiles()).toEqual([]);

    project.writeFile('src/app.ts', fs.readFileSync(project.path('src/app.ts'), 'utf8') + '\n// edited again\n');
    await waitFor(async () => (await changedFiles()).includes('src/app.ts'), { timeoutMs: 10_000, message: 'edit was not tracked after clearing' });
  });

  test('SMK-311 POST /api/model/scan rescans the project and clears tracked changes', async () => {
    project.writeFile(
      'src/routes/extra.ts',
      "import { Router } from 'express';\nconst router = Router();\nrouter.get('/extra-ping', (_req, res) => res.json({ ok: true }));\nexport default router;\n"
    );
    await waitFor(async () => (await changedFiles()).includes('src/routes/extra.ts'), { timeoutMs: 10_000 });

    const scan = await (await send(dev, 'POST', '/api/model/scan')).json();
    expect(scan.ok).toBe(true);
    expect(scan.endpointCount).toBe(11);
    expect(project.readJson('.jetic', 'model.json').endpoints.map((e: any) => e.id)).toContain('GET /extra-ping');
    expect(await changedFiles()).toEqual([]);
  });

  // `jetic scan` records the diff in the activity log; the dashboard's rescan does not, so the
  // activity stream and the model-watcher agent miss everything done from Studio.
  test.failing('KG-28 a rescan from the dashboard is recorded in the activity log like `jetic scan`', async () => {
    project.writeFile(
      'src/routes/extra2.ts',
      "import { Router } from 'express';\nconst router = Router();\nrouter.get('/extra-pong', (_req, res) => res.json({ ok: true }));\nexport default router;\n"
    );
    await send(dev, 'POST', '/api/model/scan');
    expect(project.exists('.jetic', 'activity', 'activity.ndjson')).toBe(true);
  });
});

describe('Tier 3 — process lifecycle', () => {
  // "Is something accepting connections?" — binding the port is unreliable on Windows, where
  // 127.0.0.1 can be bound even while a dual-stack listener holds the same port.
  const accepting = (port: number) =>
    new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => (socket.destroy(), resolve(true)));
      socket.once('error', () => resolve(false));
    });

  test('SMK-312 stopping the server closes its port', async () => {
    const dev = await startDev((await createShopProject()).dir);
    expect(await accepting(dev.port)).toBe(true);
    await dev.stop();
    await waitFor(async () => !(await accepting(dev.port)), { timeoutMs: 10_000, message: `port ${dev.port} still accepting connections` });
  });

  const posixOnly = process.platform === 'win32' ? test.skip : test;
  posixOnly('SMK-312b SIGTERM shuts the server down cleanly (exit 0)', async () => {
    const dev = await startDev((await createShopProject()).dir);
    const exited = new Promise<number | null>((resolve) => dev.child.once('exit', (code) => resolve(code)));
    dev.child.kill('SIGTERM');
    expect(await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 10_000))])).toBe(0);
  });
});
