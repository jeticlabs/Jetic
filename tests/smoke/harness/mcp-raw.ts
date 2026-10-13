import { smokeEnv } from './cli';
import { killTree, spawnTracked } from './process';

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  result?: any;
  error?: any;
}

export interface RawMcpSession {
  /** Every stdout line, in order — used to prove stdout carries nothing but JSON-RPC. */
  stdoutLines: string[];
  stderr: string;
  responses: Map<number, JsonRpcMessage>;
}

/**
 * Minimal line-oriented MCP exchange without the SDK: sends `initialize`, the
 * `initialized` notification and `requests`, waits for every response id, then
 * kills the server. Used where we must observe raw stdout (bin packaging, stdout purity).
 */
export async function rawMcpExchange(
  command: string,
  args: string[],
  requests: Array<{ method: string; params?: unknown }>,
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<RawMcpSession> {
  const child = spawnTracked(command, args, {
    cwd: options.cwd,
    env: smokeEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const session: RawMcpSession = { stdoutLines: [], stderr: '', responses: new Map() };
  const expectedIds = new Set<number>([1, ...requests.map((_, i) => i + 2)]);
  let buffer = '';

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`MCP exchange timed out; got ids [${[...session.responses.keys()]}]. stderr:\n${session.stderr}`));
    }, options.timeoutMs ?? 30_000);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };

    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        session.stdoutLines.push(line);
        try {
          const msg = JSON.parse(line) as JsonRpcMessage;
          if (typeof msg.id === 'number') session.responses.set(msg.id, msg);
        } catch {
          // Non-JSON stdout is recorded in stdoutLines; the caller asserts on it.
        }
        if ([...expectedIds].every((id) => session.responses.has(id))) finish();
      }
    });
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (session.stderr += chunk));
    child.once('exit', (code) => {
      if (![...expectedIds].every((id) => session.responses.has(id))) {
        clearTimeout(timer);
        reject(new Error(`MCP server exited (${code}) early. stderr:\n${session.stderr}`));
      }
    });
  });

  const send = (msg: object) => child.stdin!.write(JSON.stringify(msg) + '\n');
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'jetic-smoke', version: '0' } },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  requests.forEach((req, i) => send({ jsonrpc: '2.0', id: i + 2, method: req.method, params: req.params ?? {} }));

  try {
    await done;
  } finally {
    killTree(child);
  }
  return session;
}
