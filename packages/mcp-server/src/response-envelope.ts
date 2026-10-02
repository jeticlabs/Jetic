const ERROR_CODES = [
  'NOT_INITIALIZED',
  'MODEL_STALE',
  'APP_BOOT_FAILED',
  'BUSY',
  'TIMEOUT',
  'FORBIDDEN_ENV',
  'INVALID_INPUT',
  'NOT_FOUND',
  'WRITE_DISABLED',
  'INTERNAL',
] as const;

export type McpErrorCode = (typeof ERROR_CODES)[number];

function errorCodeFrom(error: unknown): McpErrorCode {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'INTERNAL';
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && ERROR_CODES.includes(code as McpErrorCode)
    ? (code as McpErrorCode)
    : 'INTERNAL';
}

export function toTextResult(data: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ ok: true, data }, null, 2),
    }],
  };
}

export function toErrorResult(error: unknown) {
  return {
    isError: true as const,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ok: false,
        error: {
          code: errorCodeFrom(error),
          message: 'Tool execution failed.',
          hint: 'Check the project configuration and arguments, then retry.',
        },
      }, null, 2),
    }],
  };
}