import { toErrorResult, toTextResult } from './response-envelope';

describe('MCP response envelope', () => {
  it('wraps successful tool data in the common envelope', () => {
    const result = toTextResult({ endpointCount: 3 });

    expect(JSON.parse(result.content[0].text)).toEqual({
      ok: true,
      data: { endpointCount: 3 },
    });
  });

  it('surfaces the real error message so the agent can self-correct', () => {
    const result = toErrorResult(
      Object.assign(new Error('Endpoint GET /api/x is not in model.json — run jetic_scan first.'), {
        code: 'NOT_FOUND',
      })
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe('NOT_FOUND');
    expect(parsed.error.message).toBe(
      'Endpoint GET /api/x is not in model.json — run jetic_scan first.'
    );
    expect(parsed.error.hint).toBe('Check the project configuration and arguments, then retry.');
  });

  it('keeps a custom hint and truncates very long messages', () => {
    const result = toErrorResult(
      Object.assign(new Error('x'.repeat(800)), { hint: 'Try jetic_scan first.' })
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.message.length).toBeLessThanOrEqual(501);
    expect(parsed.error.message.endsWith('\u2026')).toBe(true);
    expect(parsed.error.hint).toBe('Try jetic_scan first.');
  });

  it('summarizes zod-style validation issues into a field list', () => {
    const result = toErrorResult(
      Object.assign(new Error('validation failed'), {
        name: 'ZodError',
        issues: [
          { path: ['steps', 0, 'method'], message: 'Required' },
          { path: ['name'], message: 'String must contain at least 1 character(s)' },
        ],
      })
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.message).toContain('steps.0.method: Required');
    expect(parsed.error.message).toContain('name: String must contain at least 1 character(s)');
  });

  it('maps unknown error codes to INTERNAL', () => {
    const result = toErrorResult(Object.assign(new Error('failure'), { code: 'UNEXPECTED' }));

    expect(JSON.parse(result.content[0].text).error.code).toBe('INTERNAL');
  });
});
