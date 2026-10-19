import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateWorkflowDefinition } from './workflow-authoring-tools';

describe('validateWorkflowDefinition — step fields (query, faker, path templates, warnings)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-validate-step-'));
    fs.mkdirSync(path.join(projectDir, '.jetic', 'workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.jetic', 'model.json'),
      JSON.stringify({
        version: '0.3',
        generatedAt: '',
        project: { name: 'p' },
        environments: [],
        endpoints: [
          {
            id: 'GET /search',
            method: 'GET',
            path: '/search',
            parameters: [{ name: 'q', in: 'query' }],
          },
          { id: 'POST /orders', method: 'POST', path: '/orders' },
          { id: 'GET /orders/:id', method: 'GET', path: '/orders/:id' },
        ],
      })
    );
  });
  afterEach(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  const validate = (steps: object[]) =>
    validateWorkflowDefinition({ name: 'wf', steps }, { projectPath: projectDir, allowUnknownEndpoints: true });
  const codes = (report: ReturnType<typeof validate>) => [...report.errors, ...report.warnings].map((i) => i.code);

  it('accepts the query field and stays quiet for declared query params', () => {
    const report = validate([{ name: 'Search', method: 'GET', path: '/search', query: { q: 'shoes' } }]);
    expect(report.errors).toEqual([]);
    expect(codes(report)).not.toContain('UNKNOWN_QUERY_PARAM');
    expect(codes(report)).not.toContain('UNKNOWN_STEP_KEY');
  });

  it('warns about query params the endpoint does not declare', () => {
    const report = validate([{ name: 'Search', method: 'GET', path: '/search', query: { seach: 'shoes' } }]);
    expect(report.valid).toBe(true);
    expect(codes(report)).toContain('UNKNOWN_QUERY_PARAM');
  });

  it('rejects a non-object query', () => {
    const report = validate([{ name: 'Search', method: 'GET', path: '/search', query: ['q'] as any }]);
    expect(report.valid).toBe(false);
    expect(codes(report)).toContain('BAD_QUERY');
  });

  it('warns about GET bodies only when they get stringified (nested values)', () => {
    const flat = validate([{ name: 'Search', method: 'GET', path: '/search', body: { q: 'shoes' } }]);
    expect(codes(flat)).not.toContain('GET_WITH_BODY');

    const nested = validate([{ name: 'Search', method: 'GET', path: '/search', body: { filter: { inStock: true } } }]);
    expect(codes(nested)).toContain('GET_WITH_BODY');
  });

  it('rejects parameterized faker expressions but accepts plain paths', () => {
    const bad = validate([
      { name: 'Bad', method: 'POST', path: '/anywhere', body: { n: '{{faker.number.int({min:1,max:5})}}' } },
    ]);
    expect(bad.valid).toBe(false);
    expect(codes(bad)).toContain('UNSUPPORTED_FAKER_CALL');

    const good = validate([{ name: 'Good', method: 'POST', path: '/anywhere', body: { n: '{{faker.number.int}}' } }]);
    expect(codes(good)).not.toContain('UNSUPPORTED_FAKER_CALL');
  });

  it('accepts {{templates}} in the path and checks their refs against memory', () => {
    const ok = validate([
      { name: 'Capture', method: 'POST', path: '/login', capture: { 'workflow:userId': 'data.id' } },
      { name: 'Fetch', method: 'GET', path: '/users/{{workflow:userId}}' },
    ]);
    expect(ok.errors).toEqual([]);
    expect(codes(ok)).not.toContain('PATH_TEMPLATE');

    const undefined_ = validate([{ name: 'Fetch', method: 'GET', path: '/users/{{workflow:nope}}' }]);
    expect(undefined_.valid).toBe(false);
    expect(codes(undefined_)).toContain('UNDEFINED_MEMORY_REF');
  });

  it('warns about a continue-step capture only when a later step consumes it', () => {
    const unconsumed = validate([
      { name: 'Try', method: 'GET', path: '/maybe', onFailure: 'continue', capture: { 'workflow:extra': 'data.x' } },
      { name: 'Next', method: 'GET', path: '/next' },
    ]);
    expect(codes(unconsumed)).not.toContain('CONTINUE_WITH_CAPTURE');

    const consumed = validate([
      { name: 'Try', method: 'GET', path: '/maybe', onFailure: 'continue', capture: { 'workflow:extra': 'data.x' } },
      { name: 'Next', method: 'GET', path: '/next', body: { ref: '{{workflow:extra}}' } },
    ]);
    expect(codes(consumed)).toContain('CONTINUE_WITH_CAPTURE');
  });

  it('accepts the per-step timeoutMs field', () => {
    const report = validate([{ name: 'Slow', method: 'GET', path: '/search', timeoutMs: 60000 }]);
    expect(codes(report)).not.toContain('UNKNOWN_STEP_KEY');
  });

  it('accepts all runtime-supported :param sources and only flags a genuinely missing one', () => {
    const viaBody = validate([
      { name: 'Create', method: 'POST', path: '/orders', capture: { 'workflow:orderId': 'id' } },
      { name: 'Get', method: 'GET', path: '/orders/:id', body: { id: '{{workflow:orderId}}' } },
    ]);
    expect(codes(viaBody)).not.toContain('UNRESOLVED_PATH_PARAM');

    // KG-31: inject "body:<name>" is merged into the body before path resolution.
    const viaInjectBody = validate([
      { name: 'Create', method: 'POST', path: '/orders', capture: { 'workflow:orderId': 'id' } },
      { name: 'Get', method: 'GET', path: '/orders/:id', inject: { 'body:id': '{{workflow:orderId}}' } },
    ]);
    expect(codes(viaInjectBody)).not.toContain('UNRESOLVED_PATH_PARAM');

    const viaMemory = validate([
      { name: 'Create', method: 'POST', path: '/orders', capture: { 'workflow:id': 'id' } },
      { name: 'Get', method: 'GET', path: '/orders/:id' },
    ]);
    expect(codes(viaMemory)).not.toContain('UNRESOLVED_PATH_PARAM');

    const missing = validate([{ name: 'Get', method: 'GET', path: '/orders/:id' }]);
    expect(missing.valid).toBe(false);
    expect(codes(missing)).toContain('UNRESOLVED_PATH_PARAM');
  });
});
