import * as net from 'net';

/** Polls `predicate` until it returns a truthy value or the timeout elapses. Never use bare sleeps in specs. */
export async function waitFor<T>(
  predicate: () => T | Promise<T>,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {}
): Promise<NonNullable<T>> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value as NonNullable<T>;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, options.intervalMs ?? 100));
  }
  const reason = lastError instanceof Error ? ` (last error: ${lastError.message})` : '';
  throw new Error(`${options.message ?? 'waitFor timed out'} after ${options.timeoutMs ?? 10_000} ms${reason}`);
}

/** Asks the OS for an unused TCP port on localhost. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
