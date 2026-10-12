/**
 * Tier 5 — runner parity for step conditions.
 *
 * Jetic has several workflow runners (`jetic test`, `jetic simulate workflow`, the MCP server's
 * `jetic_simulate_workflow`, and the `jetic dev` SSE runner behind the dashboard). They must agree:
 * the same workflow file has to produce the same verdict and the same HTTP traffic everywhere,
 * otherwise a workflow can be green in one place and broken in another (KG-01).
 * (A whole journey on the shop fixture: t5-parity-shop.)
 */
import { ALL_RUNNERS, normalizeRequests, Outcome, RunContext, RunnerName, runOn } from '../harness/runners';
import { createShopProject, WorkflowJson, writeWorkflow } from '../harness/shop-project';
import { startStubApi, StubApi } from '../harness/stub-api';

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
  /** The dev runner hands `switch` to the dashboard client instead of running the target itself (KG-02). */
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

describe('Tier 5 — runner parity for conditions', () => {
  let stub: StubApi;
  beforeAll(async () => {
    stub = await startStubApi();
  });
  afterAll(() => stub.close());

  test.each(CASES.map((c) => [c.id, c] as const))(
    'SMK-502 %s: every runner agrees on the verdict and the traffic',
    async (_id, c) => {
      const project = await createShopProject({ baseUrl: stub.url });
      writeWorkflow(project, c.id, { name: c.id, steps: c.steps });
      for (const [slug, steps] of Object.entries(c.others ?? {})) writeWorkflow(project, slug, { name: slug, steps } as WorkflowJson);

      const ctx: RunContext = {
        project,
        slug: c.id,
        baseUrl: stub.url,
        hits: () => stub.hits,
        resetApi: () => stub.reset(),
      };
      const outcomes = await runOn(ctx, ALL_RUNNERS.filter((name) => !c.skip?.includes(name)));

      const expected = (name: RunnerName): Outcome => ({
        passed: c.passed,
        requests: normalizeRequests(name === 'test' ? [...c.requests, ...(c.testExtra ?? [])] : c.requests),
      });
      for (const [name, outcome] of Object.entries(outcomes) as Array<[RunnerName, Outcome]>) {
        expect({ runner: name, ...outcome }).toEqual({ runner: name, ...expected(name) });
      }
    },
    180_000
  );
});
