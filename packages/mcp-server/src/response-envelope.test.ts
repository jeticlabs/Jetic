import { toErrorResult, toTextResult } from './response-envelope';

describe('MCP response envelope', () => {
  it('wraps successful tool data in the common envelope', () => {
    const result = toTextResult({ endpointCount: 3 });

    expect(JSON.parse(result.content[0].text)).toEqual({
      ok: true,
      data: { endpointCount: 3 },
    });
  });

  it('returns a structured error without exposing exception details', () => {
    const result = toErrorResult(Object.assign(new Error('secret value'), { code: 'NOT_FOUND' }));

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Tool execution failed.',
        hint: 'Check the project configuration and arguments, then retry.',
      },
    });
    expect(result.content[0].text).not.toContain('secret value');
  });

  it('maps unknown error codes to INTERNAL', () => {
    const result = toErrorResult(Object.assign(new Error('failure'), { code: 'UNEXPECTED' }));

    expect(JSON.parse(result.content[0].text).error.code).toBe('INTERNAL');
  });
});