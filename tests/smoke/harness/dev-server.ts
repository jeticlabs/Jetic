import { ChildProcess } from 'child_process';
import { smokeEnv, stripAnsi } from './cli';
import { CLI_DIST } from './paths';
import { killTree, spawnTracked } from './process';
import { getFreePort, waitFor } from './wait';

export interface DevServer {
  url: string;
  port: number;
  child: ChildProcess;
  /** Combined stdout+stderr so far, ANSI stripped. */
  output(): string;
  stop(): Promise<void>;
}

/** Starts `jetic dev` in `cwd` on a free port and resolves once the HTTP API answers. */
export async function startDev(
  cwd: string,
  options: { args?: string[]; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<DevServer> {
  const port = await getFreePort();
  const child = spawnTracked(process.execPath, [CLI_DIST, 'dev', '--port', String(port), ...(options.args ?? ['--no-open'])], {
    cwd,
    env: smokeEnv(options.env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout!.setEncoding('utf8').on('data', (c: string) => (output += c));
  child.stderr!.setEncoding('utf8').on('data', (c: string) => (output += c));

  const url = `http://127.0.0.1:${port}`;
  const server: DevServer = {
    url,
    port,
    child,
    output: () => stripAnsi(output),
    stop: async () => {
      killTree(child);
      await waitFor(() => child.exitCode !== null || child.signalCode !== null, { timeoutMs: 10_000 }).catch(() => {});
    },
  };

  try {
    await waitFor(
      async () => {
        if (child.exitCode !== null) throw new Error(`jetic dev exited with ${child.exitCode}:\n${server.output()}`);
        const res = await fetch(`${url}/api/model`);
        return res.ok;
      },
      { timeoutMs: options.timeoutMs ?? 30_000, intervalMs: 200, message: 'jetic dev did not become ready' }
    );
  } catch (err) {
    await server.stop();
    throw err;
  }
  return server;
}
