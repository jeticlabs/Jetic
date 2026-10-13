import { ChildProcess, spawn, SpawnOptions, spawnSync } from 'child_process';

const IS_WINDOWS = process.platform === 'win32';
const live = new Set<ChildProcess>();

export interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Written to stdin, which is then closed. stdin is always closed so readline commands can't block. */
  input?: string;
  timeoutMs?: number;
}

/**
 * Spawns a process tracked by the harness. POSIX children get their own process
 * group so the whole tree can be killed; Windows uses `taskkill /T`.
 */
export function spawnTracked(command: string, args: string[], options: SpawnOptions = {}): ChildProcess {
  const child = spawn(command, args, {
    ...options,
    detached: !IS_WINDOWS,
    windowsHide: true,
  });
  live.add(child);
  child.once('exit', () => live.delete(child));
  return child;
}

export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    // Already gone.
  }
}

export function killAllTracked(): void {
  for (const child of live) killTree(child);
}

export function trackedPids(): number[] {
  return [...live].map((c) => c.pid).filter((pid): pid is number => pid !== undefined);
}

export function runProcess(command: string, args: string[], options: RunOptions = {}): Promise<ProcessResult> {
  const started = Date.now();
  const child = spawnTracked(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout!.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  child.stdin!.on('error', () => {}); // EPIPE when the child exits before reading stdin.
  child.stdin!.end(options.input ?? '');

  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child);
  }, options.timeoutMs ?? 60_000);

  return new Promise((resolve, reject) => {
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, durationMs: Date.now() - started });
    });
  });
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Jest runs each spec file in its own module registry; make sure nothing outlives it.
if (typeof afterAll === 'function') {
  afterAll(() => killAllTracked());
}
