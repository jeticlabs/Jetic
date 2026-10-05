import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { WorkflowDef, WorkflowSimulator } from './workflow-simulator';

interface Stub {
  baseUrl: string;
  hits: string[];
  close(): Promise<void>;
}

function startStub(): Promise<Stub> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/login') return void res.end(JSON.stringify({ data: { role: 'user' } }));
    if (req.url === '/missing') {
      res.statusCode = 404;
      return void res.end(JSON.stringify({ error: 'nope' }));
    }
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        hits,
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
});
