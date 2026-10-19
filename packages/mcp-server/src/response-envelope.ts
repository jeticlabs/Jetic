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

const MAX_MESSAGE_LENGTH = 500;

function errorCodeFrom(error: unknown): McpErrorCode {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'INTERNAL';
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && ERROR_CODES.includes(code as McpErrorCode)
    ? (code as McpErrorCode)
    : 'INTERNAL';
}

function describeError(error: unknown): { message: string; hint: string } {
  const record =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};

  // Zod-style validation errors: turn issues into a concise, actionable list.
  const issues = Array.isArray(record.issues) ? record.issues : undefined;
  if (issues && issues.length > 0) {
    const parts = issues.slice(0, 5).map((issue: any) => {
      const path = Array.isArray(issue?.path) ? issue.path.join('.') : '';
      return `${path ? `${path}: ` : ''}${issue?.message ?? 'invalid'}`;
    });
    const more = issues.length > 5 ? ` (+${issues.length - 5} more)` : '';
    return {
      message: `Invalid input — ${parts.join('; ')}${more}`,
      hint: 'Fix the flagged argument(s) and retry. Use the tool schema for exact field types.',
    };
  }

  const rawMessage = typeof record.message === 'string' ? record.message.trim() : '';
  const message = rawMessage
    ? rawMessage.length > MAX_MESSAGE_LENGTH
      ? `${rawMessage.slice(0, MAX_MESSAGE_LENGTH)}\u2026`
      : rawMessage
    : 'Tool execution failed.';

  const customHint = typeof record.hint === 'string' && record.hint.trim() ? record.hint.trim() : '';
  return {
    message,
    hint: customHint || 'Check the project configuration and arguments, then retry.',
  };
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
  const { message, hint } = describeError(error);
  return {
    isError: true as const,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ok: false,
        error: {
          code: errorCodeFrom(error),
          message,
          hint,
        },
      }, null, 2),
    }],
  };
}
