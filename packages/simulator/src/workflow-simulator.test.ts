import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { WorkflowDef, WorkflowSimulator } from './workflow-simulator';

interface Stub {
  baseUrl: string;
  hits: string[];
  authHeaders: Array<string | undefined>;
  bodies: string[];
  close(): Promise<void>;
}

function startStub(): Promise<Stub> {
  const hits: string[] = [];
  const authHeaders: Array<string | undefined> = [];
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    authHeaders.push(req.headers.authorization);
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      bodies.push(raw);
      if (req.url === '/kill') {
        req.socket.destroy();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/login') return void res.end(JSON.stringify({ data: { role: 'user', token: 'tok_seeded' } }));
      if (req.url === '/missing') {
        res.statusCode = 404;
        return void res.end(JSON.stringify({ error: 'nope' }));
      }
      if (req.url?.startsWith('/slow')) {
        setTimeout(() => {
          try {
            res.end(JSON.stringify({ ok: true }));
          } catch {
            // client already aborted the request
          }
        }, 300);
        return;
      }
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        hits,
        authHeaders,
        bodies,
        close: () => new Promise((r) => server.close(() => r())),
      })
    )
  );
}

const login = {
  name: 'Login',
  method: 'POST',
  path: '/login',
  capture: { 'workflow:role': 'data.role' },
};
const adminOnly = (onFail: string, extra: object = {}) => ({
  rules: { all: [{ left: '{{workflow:role}}', operator: 'equals', right: 'admin' }] },
  onFail,
  ...extra,
});
const workflow = (name: string, steps: any[]): WorkflowDef => ({ name, generatedAt: '', steps });

describe('WorkflowSimulator', () => {
  let stub: Stub;
  let projectRoot: string;
  let sim: WorkflowSimulator;

  beforeEach(async () => {
    stub = await startStub();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-sim-'));
    sim = new WorkflowSimulator({ endpoints: [] } as any, { name: 'stub', baseUrl: stub.baseUrl }, { projectRoot });
  });
  afterEach(async () => {
    await stub.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  describe('rules conditions (KG-01)', () => {
    it('onFail: abort fails the workflow and stops before the next step', async () => {
      const result = await sim.simulateWorkflow(
        workflow('abort', [{ ...login, condition: adminOnly('abort') }, { name: 'Admin', method: 'GET', path: '/admin' }])
      );

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ passed: false, conditionOutcome: 'abort' });
      expect(result.results[0].error).toContain('Condition failed at step 1');
      expect(stub.hits).toEqual(['POST /login']);
    });

    it('a satisfied condition lets the workflow continue', async () => {
      await sim.simulateWorkflow(workflow('seed', [login])); // role = user
      const result = await sim.simulateWorkflow(
        workflow('pass', [
          { name: 'Check', method: 'GET', path: '/admin', condition: { rules: { all: [{ left: '{{workflow:role}}', operator: 'equals', right: 'user' }] }, onFail: 'abort' } },
          { name: 'Next', method: 'GET', path: '/next' },
        ])
      );
      expect(result.success).toBe(true);
      expect(result.results.map((r) => r.path)).toEqual(['/admin', '/next']);
      expect(result.results[0].conditionResult?.matched).toBe(true);
    });

    it('onFail: continue ends the remaining steps without failing the workflow', async () => {
      const result = await sim.simulateWorkflow(
        workflow('continue', [{ ...login, condition: adminOnly('continue') }, { name: 'Admin', method: 'GET', path: '/admin' }])
      );
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ passed: true, conditionOutcome: 'continue' });
      expect(stub.hits).toEqual(['POST /login']);
    });

    describe('onFail: switch', () => {
      const sub = workflow('sub', [{ name: 'Sub step', method: 'GET', path: '/sub' }]);
      const loadWorkflow = (slug: string) => (slug === 'sub' ? sub : null);
      const main = (extra: object) =>
        workflow('main', [
          { ...login, condition: adminOnly('switch', { switchToWorkflow: 'sub', ...extra }) },
          { name: 'Admin', method: 'GET', path: '/admin' },
        ]);

      it('runs the target and ends when returnOnComplete is not set', async () => {
        const result = await sim.simulateWorkflow(main({}), { loadWorkflow });
        expect(result.success).toBe(true);
        expect(stub.hits).toEqual(['POST /login', 'GET /sub']);
      });

      it('resumes the main workflow after the target when returnOnComplete is true', async () => {
        const result = await sim.simulateWorkflow(main({ returnOnComplete: true }), { loadWorkflow });
        expect(result.success).toBe(true);
        expect(stub.hits).toEqual(['POST /login', 'GET /sub', 'GET /admin']);
      });

      it('does not resume when the target workflow fails', async () => {
        const failing = workflow('sub', [{ name: 'Boom', method: 'GET', path: '/missing' }]);
        const result = await sim.simulateWorkflow(main({ returnOnComplete: true }), { loadWorkflow: () => failing });
        expect(result.success).toBe(false);
        expect(stub.hits).toEqual(['POST /login', 'GET /missing']);
      });

      it.each([
        ['no loader is available', undefined, 'was not given a workflow loader'],
        ['the target does not exist', () => null, 'was not found'],
      ])('fails loudly when %s', async (_label, loader, message) => {
        const result = await sim.simulateWorkflow(main({}), loader ? { loadWorkflow: loader } : undefined);
        expect(result.success).toBe(false);
        expect(result.results[0].error).toContain(message);
      });

      it('fails when switchToWorkflow is missing', async () => {
        const result = await sim.simulateWorkflow(
          workflow('main', [{ ...login, condition: adminOnly('switch') }]),
          { loadWorkflow }
        );
        expect(result.success).toBe(false);
        expect(result.results[0].error).toContain('no switchToWorkflow');
      });

      it('detects switch cycles', async () => {
        const self = workflow('main', [{ ...login, condition: adminOnly('switch', { switchToWorkflow: 'main' }) }]);
        const result = await sim.simulateWorkflow(self, { loadWorkflow: () => self });
        expect(result.success).toBe(false);
        expect(result.results[0].error).toContain('would loop');
      });
    });
  });

  describe('legacy guard conditions', () => {
    it('skips a step whose guard does not match, counting it as passed', async () => {
      const result = await sim.simulateWorkflow(
        workflow('legacy', [
          login,
          { name: 'Admin', method: 'GET', path: '/admin', condition: { if: '{{workflow:role}}', equals: 'admin' } },
          { name: 'User', method: 'GET', path: '/user', condition: { if: '{{workflow:role}}', equals: 'user' } },
        ])
      );
      expect(result.success).toBe(true);
      expect(result.results.map((r) => [r.path, r.skipped])).toEqual([['/login', false], ['/admin', true], ['/user', false]]);
      expect(stub.hits).toEqual(['POST /login', 'GET /user']);
    });
  });

  describe('unrecognized conditions never pass silently (KG-01)', () => {
    it.each([
      ['no rules or if', { onFail: 'abort' }],
      ['an empty object', {}],
      ['rules that are not an object', { rules: 'admin', onFail: 'abort' }],
    ])('fails the workflow for %s without sending the request', async (_label, condition) => {
      const result = await sim.simulateWorkflow(workflow('bad', [{ name: 'Admin', method: 'GET', path: '/admin', condition }]));
      expect(result.success).toBe(false);
      expect(result.results[0].error).toContain('unrecognized condition');
      expect(stub.hits).toEqual([]);
    });
  });

  describe('memory lives in the project root, not the working directory (KG-07)', () => {
    const memoryAt = (root: string) => path.join(root, '.jetic', 'memory.json');
    const cwdMemory = memoryAt(process.cwd());
    let cwdMemoryBefore: string | null;

    beforeEach(() => {
      cwdMemoryBefore = fs.existsSync(cwdMemory) ? fs.readFileSync(cwdMemory, 'utf8') : null;
    });
    afterEach(() => {
      // The tests below must leave the cwd untouched; assert it.
      const after = fs.existsSync(cwdMemory) ? fs.readFileSync(cwdMemory, 'utf8') : null;
      expect(after).toBe(cwdMemoryBefore);
    });

    it('captures into <projectRoot>/.jetic/memory.json', async () => {
      await sim.simulateWorkflow(workflow('capture', [login]));
      expect(JSON.parse(fs.readFileSync(memoryAt(projectRoot), 'utf8')).workflow.role.value).toBe('user');
    });

    it('clearMemory deletes the project memory only', async () => {
      await sim.simulateWorkflow(workflow('capture', [login]));
      expect(fs.existsSync(memoryAt(projectRoot))).toBe(true);
      await sim.simulateWorkflow(workflow('noop', []), { clearMemory: true });
      expect(fs.existsSync(memoryAt(projectRoot))).toBe(false);
    });

    it('two projects served from one process do not share memory', async () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-sim-other-'));
      try {
        const otherSim = new WorkflowSimulator({ endpoints: [] } as any, { name: 'stub', baseUrl: stub.baseUrl }, { projectRoot: other });
        await sim.simulateWorkflow(workflow('capture', [login]));
        const result = await otherSim.simulateWorkflow(
          workflow('read', [{ name: 'Admin', method: 'GET', path: '/admin', condition: { if: '{{workflow:role}}', equals: 'user' } }])
        );
        expect(result.results[0].skipped).toBe(true); // other project never captured `role`
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });
  });

  describe('request building', () => {
    it('auto-prefixes Authorization with "Bearer " when the injected token has no scheme', async () => {
      const result = await sim.simulateWorkflow(
        workflow('bearer', [
          { ...login, capture: { 'workflow:token': 'data.token' } },
          { name: 'Me', method: 'GET', path: '/me', inject: { 'header:Authorization': '{{workflow:token}}' } },
        ])
      );

      expect(result.success).toBe(true);
      expect(stub.authHeaders[1]).toBe('Bearer tok_seeded');
    });

    it('keeps an explicit scheme untouched', async () => {
      const result = await sim.simulateWorkflow(
        workflow('bearer-explicit', [
          { ...login, capture: { 'workflow:token': 'data.token' } },
          { name: 'Me', method: 'GET', path: '/me', inject: { 'header:Authorization': 'Bearer {{workflow:token}}' } },
        ])
      );

      expect(result.success).toBe(true);
      expect(stub.authHeaders[1]).toBe('Bearer tok_seeded');
    });

    it('resolves templates inside nested objects and arrays', async () => {
      const result = await sim.simulateWorkflow(
        workflow('deep', [
          login,
          {
            name: 'Deep',
            method: 'POST',
            path: '/deep',
            body: {
              profile: { nickname: 'user-{{workflow:role}}' },
              tags: ['{{workflow:role}}', 'static'],
              items: [{ ref: '{{workflow:role}}' }],
            },
          },
        ])
      );

      expect(result.success).toBe(true);
      expect(JSON.parse(stub.bodies[1])).toEqual({
        profile: { nickname: 'user-user' },
        tags: ['user', 'static'],
        items: [{ ref: 'user' }],
      });
    });

    it('fails the step without sending when a template has no value', async () => {
      const result = await sim.simulateWorkflow(
        workflow('strict', [
          { name: 'Broken', method: 'POST', path: '/broken', body: { x: '{{workflow:missing}}' } },
          { name: 'Next', method: 'GET', path: '/next' },
        ])
      );

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].error).toContain('unresolved template');
      expect(stub.hits).toEqual([]);
    });

    it('fails clearly when human input is not provided', async () => {
      const result = await sim.simulateWorkflow(
        workflow('human', [{ name: 'Verify', method: 'POST', path: '/verify', body: { otp: '{{human:otp}}' } }])
      );

      expect(result.success).toBe(false);
      expect(result.results[0].error).toContain('missing human input');
      expect(stub.hits).toEqual([]);
    });

    it('resolves {{templates}} in the path and :params from memory', async () => {
      const result = await sim.simulateWorkflow(
        workflow('path', [
          login,
          { name: 'ByName', method: 'GET', path: '/users/:role' },
          { name: 'ByTemplate', method: 'GET', path: '/users/{{workflow:role}}/profile' },
        ])
      );

      expect(result.success).toBe(true);
      expect(stub.hits).toEqual(['POST /login', 'GET /users/user', 'GET /users/user/profile']);
    });

    it('fails clearly on a parameterized faker expression', async () => {
      const result = await sim.simulateWorkflow(
        workflow('faker', [
          { name: 'Bad faker', method: 'POST', path: '/faker', body: { n: '{{faker.number.int({min:1,max:5})}}' } },
        ])
      );

      expect(result.success).toBe(false);
      expect(result.results[0].error).toContain('parameterized');
      expect(stub.hits).toEqual([]);
    });

    it('sends explicit query params separately from the body', async () => {
      const result = await sim.simulateWorkflow(
        workflow('query', [
          { name: 'Search', method: 'POST', path: '/search', query: { q: 'term', tags: ['a', 'b'] }, body: { page: 1 } },
        ])
      );

      expect(result.success).toBe(true);
      expect(stub.hits[0]).toBe('POST /search?q=term&tags=a&tags=b');
      expect(JSON.parse(stub.bodies[0])).toEqual({ page: 1 });
    });
  });

  describe('resilience', () => {
    it('preflight aborts before step 1 when nothing is listening', async () => {
      const dead = new WorkflowSimulator(
        { endpoints: [] } as any,
        { name: 'dead', baseUrl: 'http://127.0.0.1:1' },
        { projectRoot }
      );
      const result = await dead.simulateWorkflow(workflow('dead', [{ name: 'Step', method: 'GET', path: '/x' }]), {
        preflight: 'abort',
      });

      expect(result.success).toBe(false);
      expect(result.stats.executedSteps).toBe(0);
      expect(result.preflight).toMatchObject({ verdict: 'unreachable', aborted: true });
      expect(result.abortReason).toMatch(/refused|listening|Cannot reach/);
    });

    it('preflight against a live server is healthy and does not block the run', async () => {
      const result = await sim.simulateWorkflow(workflow('healthy', [{ name: 'Ok', method: 'GET', path: '/ok' }]), {
        preflight: 'abort',
      });

      expect(result.success).toBe(true);
      expect(result.preflight).toMatchObject({ verdict: 'healthy', aborted: false });
    });

    it('a hanging endpoint times out with a clear error', async () => {
      const result = await sim.simulateWorkflow(workflow('slow', [{ name: 'Slow', method: 'GET', path: '/slow' }]), {
        requestTimeoutMs: 60,
      });

      expect(result.success).toBe(false);
      expect(result.results[0].error).toMatch(/timed out after 60ms/);
    });

    it('aborts the remaining steps when the connection drops mid-run', async () => {
      const result = await sim.simulateWorkflow(
        workflow('drop', [
          { name: 'Kill', method: 'GET', path: '/kill' },
          { name: 'Never', method: 'GET', path: '/never' },
        ])
      );

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].error).toContain('aborting early');
      expect(stub.hits).toEqual(['GET /kill']);
    });
  });
});
