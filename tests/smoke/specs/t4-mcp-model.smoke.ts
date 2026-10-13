/**
 * Tier 4 — MCP server over stdio, model side: handshake, tool catalog, the init → scan → verify
 * protocol, endpoint authoring, error envelopes, project resolution, concurrency and shutdown.
 * (Workflow authoring, live execution, environments, agents and changes: t4-mcp-workflows.)
 */
import * as fs from 'fs';
import * as path from 'path';
import { McpSession, McpTool } from '../harness/mcp';
import { CLI_PACKAGE_JSON } from '../harness/paths';
import { createProject, TempProject } from '../harness/project';
import { createShopProject } from '../harness/shop-project';

const VERSION = JSON.parse(fs.readFileSync(CLI_PACKAGE_JSON, 'utf8')).version;

/** Every tool the server must expose, with its MCP annotations. Update deliberately when tools change. */
const CATALOG: Record<string, { readOnly: boolean; destructive?: boolean; openWorld?: boolean }> = {
  jetic_get_session_phase: { readOnly: true },
  jetic_init: { readOnly: false },
  jetic_scan: { readOnly: false },
  jetic_get_changes: { readOnly: true },
  jetic_clear_changes: { readOnly: false },
  jetic_read_model: { readOnly: true },
  jetic_list_endpoints: { readOnly: true },
  jetic_get_endpoint: { readOnly: true },
  jetic_add_endpoint: { readOnly: false },
  jetic_update_endpoint: { readOnly: false },
  jetic_delete_endpoint: { readOnly: false, destructive: true },
  jetic_verify_model: { readOnly: true },
  jetic_test_endpoint: { readOnly: true, openWorld: true },
  jetic_manage_environment: { readOnly: false },
  jetic_list_workflows: { readOnly: true },
  jetic_simulate_workflow: { readOnly: true, openWorld: true },
  jetic_simulate: { readOnly: true, openWorld: true },
  jetic_scaffold_workflow: { readOnly: true },
  jetic_validate_workflow: { readOnly: true },
  jetic_create_workflow: { readOnly: false },
  jetic_update_workflow: { readOnly: false },
  jetic_delete_workflow: { readOnly: false, destructive: true },
  jetic_list_agents: { readOnly: true },
  jetic_run_agent: { readOnly: false },
};

const ERROR_CODES = ['NOT_INITIALIZED', 'MODEL_STALE', 'APP_BOOT_FAILED', 'BUSY', 'TIMEOUT', 'FORBIDDEN_ENV', 'INVALID_INPUT', 'NOT_FOUND', 'WRITE_DISABLED', 'INTERNAL'];

describe('Tier 4 — handshake and catalog', () => {
  let session: McpSession;
  let tools: McpTool[];
  beforeAll(async () => {
    session = await McpSession.start({ project: createProject().dir });
    tools = await session.listTools();
  });
  afterAll(() => session.close());

  test('SMK-401 the server identifies itself with the CLI version and sends usage instructions', () => {
    expect(session.serverInfo).toEqual({ name: 'jetic-mcp-server', version: VERSION });
    expect(session.instructions).toContain('jetic_get_session_phase');
    expect(session.instructions).toContain('STEP 4c'); // conditions: the rules form is taught
    expect(session.instructions).toContain('"rules"');
  });

  test('SMK-402 exactly the expected 24 tools, each documented, with accurate safety annotations', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(CATALOG).sort());

    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('projectPath'); // every tool can target a project explicitly
    }

    const flags = Object.fromEntries(tools.map((t) => [t.name, {
      readOnly: t.annotations?.readOnlyHint === true,
      destructive: t.annotations?.destructiveHint === true,
      openWorld: t.annotations?.openWorldHint === true,
    }]));
    for (const [name, expected] of Object.entries(CATALOG)) {
      expect(flags[name]).toEqual({ readOnly: expected.readOnly, destructive: !!expected.destructive, openWorld: !!expected.openWorld });
    }
  });

  test('SMK-402b required arguments are declared for the tools that need them', () => {
    const required = (name: string) => tools.find((t) => t.name === name)!.inputSchema.required ?? [];
    expect(required('jetic_add_endpoint').sort()).toEqual(['method', 'path']);
    expect(required('jetic_update_endpoint')).toEqual(['updates']);
    expect(required('jetic_manage_environment')).toEqual(['action']);
    expect(required('jetic_run_agent')).toEqual(['agent']);
    expect(required('jetic_scaffold_workflow')).toEqual(['endpoints']);
  });
});

describe('Tier 4 — the init → scan → verify protocol', () => {
  let project: TempProject;
  let session: McpSession;
  beforeAll(async () => {
    project = await createShopProject({ scan: false });
    session = await McpSession.start({ project: project.dir });
  });
  afterAll(() => session.close());

  test('SMK-404 phases advance with the model: init → scan → verify', async () => {
    const phase = async () => (await session.call('jetic_get_session_phase')).data;

    expect(await phase()).toMatchObject({ phase: 1, phaseName: 'init', modelExists: false, endpointsCount: 0 });
    const read = await session.call('jetic_read_model', { summaryOnly: true });
    expect(read.data).toMatchObject({ modelExists: false, stats: { endpointsCount: 0 } });
    expect(read.data.hint).toContain('jetic init');

    const init = await session.call('jetic_init');
    expect(init.ok).toBe(true);
    expect(init.data).toMatchObject({ success: true, action: 'created', scanRecommended: true, detected: { hasExpress: true, hasTsConfig: true } });
    expect(project.exists('.jetic', 'model.json')).toBe(true);
    expect(await phase()).toMatchObject({ phase: 2, phaseName: 'scan', modelExists: true, endpointsCount: 0 });

    const scan = await session.call('jetic_scan');
    expect(scan.data).toMatchObject({ success: true, action: 'scanned', mode: 'merge', stats: { scanned: 10, added: 10, updated: 0, preserved: 0, total: 10 } });
    expect(await phase()).toMatchObject({ phase: 3, phaseName: 'verify', endpointsCount: 10, modelIsValid: true });

    const summary = await session.call('jetic_read_model', { summaryOnly: true });
    expect(summary.data).toMatchObject({ modelExists: true, project: { name: 'shop-api', framework: 'express' }, stats: { endpointsCount: 10 } });
    expect(summary.data.endpoints).toBeUndefined(); // summary mode omits the endpoint bodies

    const verify = await session.call('jetic_verify_model');
    expect(verify.data).toMatchObject({ isValid: true, totalEndpoints: 10, summary: { errorsCount: 0 } });
  });

  test('SMK-404b list_endpoints filters; get_endpoint returns full detail or found:false', async () => {
    const posts = await session.call('jetic_list_endpoints', { method: 'POST' });
    expect(posts.data).toMatchObject({ totalCount: 10, filteredCount: 4 });
    expect(posts.data.endpoints.map((e: any) => e.id).sort()).toEqual(
      ['POST /api/auth/login', 'POST /api/auth/register', 'POST /api/orders', 'POST /api/otp/verify']
    );

    const byPath = await session.call('jetic_list_endpoints', { pathContains: 'orders' });
    expect(byPath.data.endpoints.map((e: any) => e.id).sort()).toEqual(['GET /api/orders/:id', 'POST /api/orders']);

    const one = await session.call('jetic_get_endpoint', { method: 'GET', path: '/api/orders/:id' });
    expect(one.data.found).toBe(true);
    expect(one.data.endpoint).toMatchObject({
      id: 'GET /api/orders/:id',
      middleware: [{ name: 'requireAuth' }],
      parameters: [{ name: 'id', in: 'path', required: true }],
      security: [{ scheme: 'requireAuth', required: true }],
    });
    expect((await session.call('jetic_get_endpoint', { id: 'GET /api/orders/:id' })).data.found).toBe(true);
    expect((await session.call('jetic_get_endpoint', { id: 'GET /nope' })).data).toMatchObject({ found: false });
  });

  test('SMK-405 endpoints can be added, upserted, updated and deleted; ids match the scanner\'s', async () => {
    const added = await session.call('jetic_add_endpoint', { method: 'POST', path: '/api/refunds', name: 'Refund an order', tags: ['orders'] });
    expect(added.data).toMatchObject({ success: true, action: 'added', endpointId: 'POST /api/refunds' });
    expect(added.data.endpoint).toMatchObject({ name: 'Refund an order', tags: ['orders'], source: { file: 'manual-mcp' } });
    expect(project.readJson('.jetic', 'model.json').endpoints.map((e: any) => e.id)).toContain('POST /api/refunds');

    // Adding an existing endpoint updates it in place (documented upsert), it does not duplicate it.
    const again = await session.call('jetic_add_endpoint', { method: 'POST', path: '/api/refunds' });
    expect(again.data).toMatchObject({ action: 'updated', endpointId: 'POST /api/refunds' });
    expect(project.readJson('.jetic', 'model.json').endpoints.filter((e: any) => e.id === 'POST /api/refunds')).toHaveLength(1);

    const updated = await session.call('jetic_update_endpoint', { id: 'POST /api/refunds', updates: { description: 'Refund part of an order', tags: ['orders', 'payments'] } });
    expect(updated.data).toMatchObject({ success: true, action: 'updated', endpointId: 'POST /api/refunds' });
    expect((await session.call('jetic_get_endpoint', { method: 'POST', path: '/api/refunds' })).data.endpoint)
      .toMatchObject({ description: 'Refund part of an order', tags: ['orders', 'payments'] });
    expect((await session.call('jetic_update_endpoint', { method: 'POST', path: '/api/refunds', updates: { deprecated: true } })).ok).toBe(true); // method+path form

    expect((await session.call('jetic_verify_model')).data.summary.errorsCount).toBe(0);

    const deleted = await session.call('jetic_delete_endpoint', { method: 'POST', path: '/api/refunds' });
    expect(deleted.data).toMatchObject({ success: true, action: 'deleted', removedCount: 1 });
    expect((await session.call('jetic_get_endpoint', { id: 'POST /api/refunds' })).data.found).toBe(false);

    const missing = await session.call('jetic_delete_endpoint', { method: 'GET', path: '/zzz' });
    expect(missing.data).toMatchObject({ success: false });
    expect(missing.data.message).toContain('GET /zzz');
  });

  test('SMK-406 scan in merge mode keeps hand-added endpoints; overwrite drops them', async () => {
    await session.call('jetic_add_endpoint', { method: 'GET', path: '/api/hand-added' });

    const merged = await session.call('jetic_scan', { mode: 'merge' });
    expect(merged.data.stats).toMatchObject({ scanned: 10, added: 0, updated: 10, preserved: 1, total: 11 });
    expect((await session.call('jetic_get_endpoint', { id: 'GET /api/hand-added' })).data.found).toBe(true);

    const overwritten = await session.call('jetic_scan', { mode: 'overwrite' });
    expect(overwritten.data.mode).toBe('overwrite');
    expect(overwritten.data.stats.total).toBe(10);
    expect((await session.call('jetic_get_endpoint', { id: 'GET /api/hand-added' })).data.found).toBe(false);
  });

  test('SMK-412 parallel writes are serialized: none is lost', async () => {
    const paths = Array.from({ length: 6 }, (_, i) => `/api/parallel-${i}`);
    const reads = Array.from({ length: 6 }, () => session.call('jetic_read_model', { summaryOnly: true }));
    const writes = paths.map((p) => session.call('jetic_add_endpoint', { method: 'GET', path: p }));
    const results = await Promise.all([...reads, ...writes]);

    expect(results.every((r) => r.ok)).toBe(true);
    const ids = project.readJson('.jetic', 'model.json').endpoints.map((e: any) => e.id);
    for (const p of paths) expect(ids).toContain(`GET ${p}`); // a lost update would drop one
    expect(ids).toHaveLength(10 + paths.length);
  });

  // Runs last on purpose: by now the session has exchanged dozens of messages, including two scans
  // (the scanner prints progress with console.log, which must never reach the MCP stdout channel).
  test('SMK-403 stdout carries nothing but JSON-RPC; diagnostics go to stderr', () => {
    expect(session.stdoutLines.length).toBeGreaterThan(20);
    const stray = session.stdoutLines.filter((line) => {
      try {
        return JSON.parse(line).jsonrpc !== '2.0';
      } catch {
        return true;
      }
    });
    expect(stray).toEqual([]);
    expect(session.stderr()).toContain(`jetic-mcp v${VERSION} listening on stdio`);
    expect(session.stderr()).toContain(project.dir);
  });
});

describe('Tier 4 — error envelopes', () => {
  let session: McpSession;
  beforeAll(async () => {
    session = await McpSession.start({ project: (await createShopProject()).dir });
  });
  afterAll(() => session.close());

  test('SMK-410 failures use the documented envelope and leak no internals', async () => {
    const failure = await session.call('jetic_get_endpoint', {}); // neither id nor method+path
    expect(failure).toMatchObject({ isError: true, ok: false });
    expect(ERROR_CODES).toContain(failure.error!.code);
    expect(failure.error!.hint).toBeTruthy();
    expect(failure.text).not.toMatch(/\bat\s.+\(.+:\d+:\d+\)|node_modules|[A-Za-z]:\\\\/); // no stack frames or file paths
  });

  test('SMK-410b invalid arguments are rejected by the schema before reaching a handler', async () => {
    const result = await session.call('jetic_update_endpoint', { id: 'GET /health' }); // `updates` is required
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Input validation error');
    expect(result.text).toContain('updates');

    const badEnum = await session.call('jetic_list_endpoints', { method: 'FETCH' });
    expect(badEnum.isError).toBe(true);
    expect(badEnum.text).toContain('Input validation error');
  });

  // Handlers throw descriptive errors ("Must specify either id or method+path…", "Endpoint not found…"),
  // but the envelope replaces every one with "Tool execution failed." and code INTERNAL, so the model
  // calling the tool cannot learn what to fix.
  test.failing('KG-08 an error tells the caller what went wrong', async () => {
    const failures = await Promise.all([
      session.call('jetic_get_endpoint', {}),
      session.call('jetic_update_endpoint', { id: 'GET /missing', updates: { description: 'x' } }),
      session.call('jetic_test_endpoint', { method: 'GET', path: '/missing' }),
      session.call('jetic_run_agent', { agent: 'no-such-agent' }),
      session.call('jetic_add_endpoint', { method: 'GET', path: '/health', overwriteIfExists: false }),
    ]);
    for (const failure of failures) {
      expect(failure.isError).toBe(true);
      expect(failure.error!.message).not.toBe('Tool execution failed.');
    }
  });
});

describe('Tier 4 — which project is served', () => {
  const named = (project: TempProject, name: string) => {
    project.writeJson('.jetic/model.json', {
      version: '0.3', generatedAt: '', project: { name }, environments: [{ name: 'local', baseUrl: 'http://localhost:1' }], endpoints: [],
    });
    return project;
  };
  const projectName = async (session: McpSession, args: Record<string, unknown> = {}) =>
    (await session.call('jetic_read_model', { summaryOnly: true, ...args })).data.project.name;

  test('SMK-411 --project, JETIC_PROJECT_PATH, the cwd walk-up and a per-call projectPath resolve in that order', async () => {
    const flagged = named(createProject({ name: 'by-flag' }), 'flag-project');
    const viaEnv = named(createProject({ name: 'by-env' }), 'env-project');
    const viaCwd = named(createProject({ name: 'by-cwd' }), 'cwd-project');
    const perCall = named(createProject({ name: 'by-call' }), 'call-project');
    const elsewhere = createProject({ name: 'elsewhere' });
    viaCwd.writeFile('src/routes/placeholder.txt', '');

    // --project beats everything in the environment, and a per-call projectPath beats --project.
    const withFlag = await McpSession.start({ project: flagged.dir, cwd: elsewhere.dir, env: { JETIC_PROJECT_PATH: viaEnv.dir } });
    try {
      expect(await projectName(withFlag)).toBe('flag-project');
      expect(await projectName(withFlag, { projectPath: perCall.dir })).toBe('call-project');
    } finally {
      await withFlag.close();
    }

    // With no flag, JETIC_PROJECT_PATH is used even though the process runs somewhere else.
    const withEnv = await McpSession.start({ cwd: elsewhere.dir, env: { JETIC_PROJECT_PATH: viaEnv.dir } });
    try {
      expect(await projectName(withEnv)).toBe('env-project');
    } finally {
      await withEnv.close();
    }

    // With neither, the server walks up from its working directory to find .jetic/model.json.
    const withCwd = await McpSession.start({ cwd: path.join(viaCwd.dir, 'src', 'routes'), env: { JETIC_PROJECT_PATH: '' } });
    try {
      expect(await projectName(withCwd)).toBe('cwd-project');
    } finally {
      await withCwd.close();
    }
  });
});

describe('Tier 4 — shutdown', () => {
  test('SMK-413 the server exits by itself, with code 0, when the client closes the connection', async () => {
    const session = await McpSession.start({ project: createProject().dir });
    await session.call('jetic_get_session_phase');
    const closed = await session.close(5_000);
    expect(closed).toEqual({ exitedOnItsOwn: true, code: 0 });
    expect(session.exited).toBe(true);
  });
});
