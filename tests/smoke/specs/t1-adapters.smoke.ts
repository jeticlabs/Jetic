/**
 * Tier 1 (framework adapters). `jetic adapter inspect <id>` is the only CLI path that runs the
 * non-Express adapters, and it reports counts only, so each mini fixture has a known endpoint count.
 */
import * as path from 'path';
import { expectExit, runCli } from '../harness/cli';
import { SMOKE_ROOT } from '../harness/paths';
import { createProject, TempProject } from '../harness/project';

const ADAPTERS_DIR = path.join(SMOKE_ROOT, 'fixtures', 'adapters');
const ALL = ['express', 'fastify', 'nextjs', 'nestjs', 'hono'];

const CASES = [
  { id: 'fastify', fixture: 'fastify-mini', endpoints: 4 }, // GET /ping, POST /echo, GET /api/v1/users, GET /api/v1/users/:id
  { id: 'hono', fixture: 'hono-mini', endpoints: 3 }, //       GET /hello, POST /items, DELETE /items/:id
  { id: 'nestjs', fixture: 'nestjs-mini', endpoints: 3 }, //   GET /cats, GET /cats/:id, POST /cats
  { id: 'nextjs', fixture: 'nextjs-mini', endpoints: 3 }, //   GET /api/health, GET+DELETE /api/users/:id
];

async function cli(project: TempProject, args: string[], codes: number | number[] = 0) {
  const result = await runCli(args, { cwd: project.dir });
  expectExit(args, result, codes);
  return result;
}

describe('Tier 1 — framework adapters', () => {
  describe.each(CASES)('$id', ({ id, fixture, endpoints }) => {
    const project = createProject({ from: path.join(ADAPTERS_DIR, fixture), name: fixture });

    test(`SMK-120 adapter list detects only ${id} (no tsconfig.json, so Express stays out)`, async () => {
      const list = await cli(project, ['adapter', 'list']);
      const detected = Object.fromEntries([...list.out.matchAll(/^\s*([✓○])\s+(\w+)/gm)].map(([, mark, name]) => [name, mark === '✓']));
      expect(detected).toEqual(Object.fromEntries(ALL.map((name) => [name, name === id])));
    });

    test(`SMK-121 adapter inspect ${id} finds ${endpoints} endpoints`, async () => {
      const result = await cli(project, ['adapter', 'inspect', id]);
      expect(result.out).toContain('detected: true');
      expect(result.out).toContain(`endpoints: ${endpoints}`);
    });
  });

  test('SMK-122 inspecting an adapter the project does not use reports it as undetected', async () => {
    const project = createProject({ from: path.join(ADAPTERS_DIR, 'hono-mini'), name: 'hono-mini' });
    const result = await cli(project, ['adapter', 'inspect', 'fastify']);
    expect(result.out).toContain('detected: false');
    expect(result.out).not.toContain('endpoints:');
  });

  // `jetic scan` (and the MCP scan) always use the Express scanner. The adapters exist but
  // nothing in the scan path calls them, so a project's framework never changes what scan finds.
  test.failing('KG-23 jetic scan finds the endpoints the matching adapter finds (NestJS)', async () => {
    const project = createProject({ from: path.join(ADAPTERS_DIR, 'nestjs-mini'), name: 'nestjs-mini' });
    project.writeJson('tsconfig.json', { compilerOptions: { experimentalDecorators: true } });

    const inspect = await cli(project, ['adapter', 'inspect', 'nestjs']);
    expect(inspect.out).toContain('endpoints: 3');

    await cli(project, ['scan']);
    expect(project.readJson('.jetic', 'model.json').endpoints).toHaveLength(3);
  });
});
