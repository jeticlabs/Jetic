/**
 * Tier 2 — CLI execution against a live API.
 * Phase 0 covers the `simulate endpoint` environment-selection prerequisite (KG-11) using a
 * throwaway HTTP server; the shop-api fixture and the workflow catalog (SMK-201..211) land in Phase 2.
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { describeResult, runCli } from '../harness/cli';
import { createProject, TempProject } from '../harness/project';

interface StubApi {
  url: string;
  hits: string[];
  close(): Promise<void>;
}

/** Answers 200 JSON on every path and records which server instance was hit. */
function startStubApi(name: string): Promise<StubApi> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: name }));
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, hits, close: () => new Promise((r) => server.close(() => r())) });
    })
  );
}

function writeTwoEnvModel(project: TempProject, local: StubApi, staging: StubApi, extra: Record<string, unknown> = {}) {
  project.writeJson('.jetic/model.json', {
    version: '0.3',
    generatedAt: new Date().toISOString(),
    project: { name: 'stub' },
    environments: [
      { name: 'local', baseUrl: local.url },
      { name: 'staging', baseUrl: staging.url },
    ],
    endpoints: [{ id: 'GET /health', method: 'GET', path: '/health', source: { file: 'src/app.ts', line: 1 }, middleware: [] }],
    ...extra,
  });
}

describe('Tier 2 — simulate endpoint environment selection', () => {
  let local: StubApi;
  let staging: StubApi;
  let project: TempProject;

  beforeEach(async () => {
    local = await startStubApi('local');
    staging = await startStubApi('staging');
    project = createProject();
  });
  afterEach(async () => {
    await local.close();
    await staging.close();
  });

  test('SMK-212 multiple environments without a TTY uses the first environment instead of hanging (KG-11)', async () => {
    writeTwoEnvModel(project, local, staging);
    const args = ['simulate', 'endpoint', '--all'];
    const result = await runCli(args, { cwd: project.dir, timeoutMs: 30_000 });

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/Environment: local/);
    expect(local.hits).toContain('GET /health');
    expect(staging.hits).toEqual([]);
  });

  test('SMK-212b without a TTY honors the model default environment', async () => {
    writeTwoEnvModel(project, local, staging, { defaultEnvironment: 'staging' });
    const result = await runCli(['simulate', 'endpoint', 'GET', '/health'], { cwd: project.dir, timeoutMs: 30_000 });

    expect(result.code).toBe(0);
    expect(result.out).toMatch(/Environment: staging/);
    expect(staging.hits).toContain('GET /health');
  });

  test('SMK-213 --env selects a named environment', async () => {
    writeTwoEnvModel(project, local, staging);
    const args = ['simulate', 'endpoint', 'GET', '/health', '--env', 'staging'];
    const result = await runCli(args, { cwd: project.dir });

    expect(result.code).toBe(0);
    expect(staging.hits).toContain('GET /health');
    expect(local.hits.filter((h) => h === 'GET /health')).toEqual([]);
  });

  test('SMK-213b --env with an unknown name exits 2 and lists the environments', async () => {
    writeTwoEnvModel(project, local, staging);
    const args = ['simulate', 'endpoint', '--all', '--env', 'prod'];
    const result = await runCli(args, { cwd: project.dir });

    expect([result.code, describeResult(args, result)]).toEqual([2, expect.stringContaining('Available: local, staging')]);
  });
});
