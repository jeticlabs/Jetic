/**
 * Tier 5 — cross-surface parity.
 *
 * Jetic has several workflow runners (`jetic test`, `jetic simulate workflow`, the MCP server's
 * `jetic_simulate_workflow`, and the `jetic dev` SSE runner behind the dashboard). They must agree:
 * the same workflow file has to produce the same verdict and the same HTTP traffic everywhere,
 * otherwise a workflow can be green in one place and broken in another (KG-01).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCli } from '../harness/cli';
import { startDev } from '../harness/dev-server';
import { rawMcpExchange } from '../harness/mcp-raw';
import { CLI_DIST } from '../harness/paths';
import { createProject, TempProject } from '../harness/project';
import { startStubApi, StubApi } from '../harness/stub-api';

type RunnerName = 'test' | 'cli' | 'mcp' | 'dev';
interface Outcome {
  passed: boolean;
  requests: string[];
}

const login = { name: 'Login', method: 'POST', path: '/login', capture: { 'workflow:role': 'data.role' } };
const admin = { name: 'Admin', method: 'GET', path: '/admin' };
const roleIs = (role: string, onFail: string, extra: object = {}) => ({
  rules: { all: [{ left: '{{workflow:role}}', operator: 'equals', right: role }] },
  onFail,
  ...extra,
});

interface Case {
  id: string;
  title: string;
  steps: object[];
  /** Other workflows written next to it (slug → steps). */
  others?: Record<string, object[]>;
  passed: boolean;
  requests: string[];
  /** The dev runner hands `switch` to the dashboard client instead of running the target itself. */
  skip?: RunnerName[];
  /** Extra requests `jetic test` makes because it also runs the helper workflows on their own. */
  testExtra?: string[];
}

const CASES: Case[] = [
  {
    id: 'plain',
    title: 'capture + inject across steps',
    steps: [login, { ...admin, inject: { 'header:Authorization': 'Bearer {{workflow:role}}' } }],
    passed: true,
    requests: ['POST /login', 'GET /admin'],
  },
  {
    id: 'rules-abort',
    title: 'rules condition fails with onFail "abort"',
    steps: [{ ...login, condition: roleIs('admin', 'abort') }, admin],
    passed: false,
    requests: ['POST /login'],
  },
  {
    id: 'rules-pass',
    title: 'rules condition holds',
    steps: [{ ...login, condition: roleIs('user', 'abort') }, admin],
    passed: true,
    requests: ['POST /login', 'GET /admin'],
  },
  {
    id: 'rules-continue',
    title: 'rules condition fails with onFail "continue" (quiet stop, not a failure)',
    steps: [{ ...login, condition: roleIs('admin', 'continue') }, admin],
    passed: true,
    requests: ['POST /login'],
  },
  {
    id: 'legacy-skip',
    title: 'legacy "if" guards skip only the unmatched step',
    steps: [
      login,
      { name: 'AdminOnly', method: 'GET', path: '/admin', condition: { if: '{{workflow:role}}', equals: 'admin' } },
      { name: 'UserOnly', method: 'GET', path: '/user', condition: { if: '{{workflow:role}}', equals: 'user' } },
    ],
    passed: true,
    requests: ['POST /login', 'GET /user'],
  },
  {
    id: 'invalid-condition',
    title: 'an unrecognized condition fails the run instead of being ignored (KG-01)',
    steps: [{ ...admin, condition: { onFail: 'abort' } }],
    passed: false,
    requests: [],
  },
  {
    id: 'switch-return',
    title: 'onFail "switch" runs the target and resumes with returnOnComplete',
    steps: [{ ...login, condition: roleIs('admin', 'switch', { switchToWorkflow: 'target-sub', returnOnComplete: true }) }, admin],
    others: { 'target-sub': [{ name: 'Sub', method: 'GET', path: '/sub' }] },
    passed: true,
    requests: ['POST /login', 'GET /sub', 'GET /admin'],
    skip: ['dev'],
    testExtra: ['GET /sub'],
  },
];

function writeWorkflow(project: TempProject, slug: string, steps: object[]) {
  project.writeJson(`.jetic/workflows/${slug}.json`, { name: slug, generatedAt: new Date().toISOString(), steps });
}

const resetMemory = (project: TempProject) => fs.rmSync(project.path('.jetic', 'memory.json'), { force: true });

describe('Tier 5 — runner parity', () => {
  let stub: StubApi;
  beforeAll(async () => {
    stub = await startStubApi();
  });
  afterAll(() => stub.close());

  async function runViaTest(project: TempProject, c: Case): Promise<Outcome> {
    const result = await runCli(['test', '--ci'], { cwd: project.dir });
    const report = JSON.parse(result.stdout);
    return { passed: report.results.find((r: any) => r.name === c.id).passed, requests: stub.requests() };
  }

  async function runViaCliRunner(project: TempProject, c: Case): Promise<Outcome> {
    const result = await runCli(['simulate', 'workflow', '--workflow', c.id, '--env', 'local'], { cwd: project.dir });
    expect([0, 1]).toContain(result.code); // 2+ would be a crash, not a verdict
    return { passed: result.code === 0, requests: stub.requests() };
  }

  async function runViaDev(project: TempProject, c: Case): Promise<Outcome> {
    const dev = await startDev(project.dir);
    try {
      const response = await fetch(`${dev.url}/api/workflows/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: `workflows/${c.id}.json`, baseUrl: stub.url }),
      });
      const events = (await response.text())
        .split('\n\n')
        .map((block) => block.trim())
        .filter((block) => block.startsWith('data:'))
        .map((block) => JSON.parse(block.slice(5).trim()));
      const last = events[events.length - 1];
      return { passed: last?.type === 'done' && last.failed === 0, requests: stub.requests() };
    } finally {
      await dev.stop();
    }
  }

  async function runViaMcp(project: TempProject, c: Case): Promise<Outcome> {
    // Serve the project from an UNRELATED working directory, as `jetic mcp --project X` does from an editor.
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-smoke-elsewhere-'));
    try {
      const session = await rawMcpExchange(
        process.execPath,
        [CLI_DIST, 'mcp', '--project', project.dir],
        [{ method: 'tools/call', params: { name: 'jetic_simulate_workflow', arguments: { workflow: c.id, baseUrl: stub.url } } }],
        { cwd: elsewhere }
      );
      const call = session.responses.get(2)!.result;
      const envelope = JSON.parse(call.content[0].text);
      expect(envelope.ok).toBe(true);

      // KG-07: memory belongs to the served project, never to the server's working directory.
      expect(fs.existsSync(path.join(elsewhere, '.jetic', 'memory.json'))).toBe(false);
      if (c.requests.includes('POST /login')) expect(project.exists('.jetic', 'memory.json')).toBe(true);

      return { passed: envelope.data.success, requests: stub.requests() };
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  }

  const runners: Record<RunnerName, (project: TempProject, c: Case) => Promise<Outcome>> = {
    test: runViaTest,
    cli: runViaCliRunner,
    mcp: runViaMcp,
    dev: runViaDev,
  };

  test.each(CASES.map((c) => [c.id, c] as const))(
    'SMK-50x %s: every runner agrees on the verdict and the traffic',
    async (_id, c) => {
      const project = createProject();
      project.writeJson('.jetic/model.json', {
        version: '0.3',
        generatedAt: new Date().toISOString(),
        project: { name: 'parity' },
        environments: [{ name: 'local', baseUrl: stub.url }],
        endpoints: [],
      });
      writeWorkflow(project, c.id, c.steps);
      for (const [slug, steps] of Object.entries(c.others ?? {})) writeWorkflow(project, slug, steps);

      const outcomes: Partial<Record<RunnerName, Outcome>> = {};
      for (const name of Object.keys(runners) as RunnerName[]) {
        if (c.skip?.includes(name)) continue;
        resetMemory(project);
        stub.reset();
        outcomes[name] = await runners[name](project, c);
      }

      const expected = (name: RunnerName): Outcome => ({
        passed: c.passed,
        requests: name === 'test' ? [...c.requests, ...(c.testExtra ?? [])] : c.requests,
      });
      for (const [name, outcome] of Object.entries(outcomes) as Array<[RunnerName, Outcome]>) {
        expect({ runner: name, ...outcome }).toEqual({ runner: name, ...expected(name) });
      }
    },
    180_000
  );
});
