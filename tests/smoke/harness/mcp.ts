import { ChildProcess } from 'child_process';
import { smokeEnv } from './cli';
import { CLI_DIST } from './paths';
import { killTree, spawnTracked } from './process';
import { waitFor } from './wait';

/** What every Jetic MCP tool returns, parsed from its single text block. */
export interface Envelope<T = any> {
  /** The result carried the MCP-level `isError` flag. */
  isError: boolean;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; hint?: string };
  /** The raw text content, for asserting nothing sensitive leaked. */
  text: string;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: { type: string; properties?: Record<string, any>; required?: string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}

export interface McpStartOptions {
  /** Passed as `--project`. Omit to rely on cwd / JETIC_PROJECT_PATH. */
  project?: string;
  /** Working directory of the server process. */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Command line; defaults to `node dist/index.js mcp [--project …]`. */
  command?: { file: string; args: string[] };
}

/**
 * A persistent JSON-RPC session with the Jetic MCP server over stdio (no SDK needed).
 * Requests may be issued concurrently; responses are matched by id.
 */
export class McpSession {
  readonly stdoutLines: string[] = [];
  serverInfo: { name: string; version: string } = { name: '', version: '' };
  instructions = '';
  private stderrText = '';
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private exit?: { code: number | null; signal: NodeJS.Signals | null };

  private constructor(readonly child: ChildProcess) {
    let buffer = '';
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        this.stdoutLines.push(line);
        try {
          const message = JSON.parse(line);
          const waiter = typeof message.id === 'number' ? this.pending.get(message.id) : undefined;
          if (!waiter) continue;
          this.pending.delete(message.id);
          if (message.error) waiter.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
          else waiter.resolve(message.result);
        } catch {
          // Non-JSON output is kept in stdoutLines; the stdout-purity test asserts on it.
        }
      }
    });
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (this.stderrText += chunk));
    child.once('exit', (code, signal) => {
      this.exit = { code, signal };
      for (const waiter of this.pending.values()) waiter.reject(new Error(`MCP server exited (${code}) with requests in flight.\n${this.stderrText}`));
      this.pending.clear();
    });
  }

  static async start(options: McpStartOptions = {}): Promise<McpSession> {
    const command = options.command ?? {
      file: process.execPath,
      args: [CLI_DIST, 'mcp', ...(options.project ? ['--project', options.project] : [])],
    };
    const child = spawnTracked(command.file, command.args, {
      cwd: options.cwd ?? options.project,
      env: smokeEnv(options.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin!.on('error', () => {});
    const session = new McpSession(child);

    const init = await session.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'jetic-smoke', version: '0' },
    });
    session.serverInfo = init.serverInfo;
    session.instructions = init.instructions ?? '';
    session.notify('notifications/initialized');
    return session;
  }

  stderr(): string {
    return this.stderrText;
  }

  get exited(): boolean {
    return this.exit !== undefined;
  }

  notify(method: string, params: unknown = {}): void {
    this.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  rpc(method: string, params: unknown = {}, timeoutMs = 60_000): Promise<any> {
    const id = this.nextId++;
    const response = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${timeoutMs} ms.\nstderr: ${this.stderrText}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
    });
    this.child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return response;
  }

  async listTools(): Promise<McpTool[]> {
    return (await this.rpc('tools/list')).tools;
  }

  /** Calls a tool and parses its envelope. Never throws for tool-level errors (see `isError`). */
  async call<T = any>(name: string, args: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<Envelope<T>> {
    const result = await this.rpc('tools/call', { name, arguments: args }, timeoutMs);
    const text: string = result.content?.[0]?.text ?? '';
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not our envelope (e.g. an SDK-level validation message): surface the raw text.
    }
    return { isError: !!result.isError, ok: parsed.ok === true, data: parsed.data, error: parsed.error, text };
  }

  /** Closes stdin like an editor shutting the connection, then makes sure the process is gone. */
  async close(graceMs = 5_000): Promise<{ exitedOnItsOwn: boolean; code: number | null }> {
    this.child.stdin!.end();
    const exitedOnItsOwn = await waitFor(() => this.exited, { timeoutMs: graceMs, intervalMs: 50 }).then(() => true, () => false);
    if (!exitedOnItsOwn) killTree(this.child);
    await waitFor(() => this.exited, { timeoutMs: 10_000, intervalMs: 50 }).catch(() => {});
    return { exitedOnItsOwn, code: this.exit?.code ?? null };
  }
}
