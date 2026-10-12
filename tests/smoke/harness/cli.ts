import { CLI_DIST, COMPILE_CACHE_DIR } from './paths';
import { killTree, ProcessResult, runProcess, RunOptions, spawnTracked } from './process';

export interface CliResult extends ProcessResult {
  /** stdout + stderr with ANSI escapes stripped — what assertions should usually match against. */
  out: string;
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** Environment every spawned Jetic process gets: no color, no browser, shared compile cache. */
export function smokeEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    JETIC_NO_OPEN: '1',
    NODE_COMPILE_CACHE: COMPILE_CACHE_DIR,
    ...extra,
  };
}

/** Runs the built CLI (`node apps/cli/dist/index.js ...args`). Never throws on non-zero exit. */
export async function runCli(args: string[], options: RunOptions = {}): Promise<CliResult> {
  const result = await runProcess(process.execPath, [CLI_DIST, ...args], {
    ...options,
    env: smokeEnv(options.env),
    timeoutMs: options.timeoutMs ?? 60_000,
  });
  return { ...result, out: stripAnsi(result.stdout + result.stderr) };
}

/** Compact failure context for `expect(...)` messages. */
export function describeResult(args: string[], result: ProcessResult): string {
  const tail = (s: string) => (s.length > 2000 ? `…${s.slice(-2000)}` : s);
  return [
    `$ jetic ${args.join(' ')}`,
    `exit=${result.code} signal=${result.signal} timedOut=${result.timedOut} (${result.durationMs} ms)`,
    `--- stdout ---\n${tail(stripAnsi(result.stdout))}`,
    `--- stderr ---\n${tail(stripAnsi(result.stderr))}`,
  ].join('\n');
}

/** Throws with full command context unless the process exited with one of `codes` (and did not time out). */
export function expectExit(args: string[], result: CliResult, codes: number | number[] = 0): void {
  const allowed = Array.isArray(codes) ? codes : [codes];
  if (result.timedOut || result.code === null || !allowed.includes(result.code)) {
    throw new Error(`Expected exit ${allowed.join(' or ')}.\n${describeResult(args, result)}`);
  }
}

/** True when text contains a JS stack frame ("    at fn (file:line:col)") — a raw crash rather than a message. */
export function hasStackTrace(text: string): boolean {
  return /^\s+at\s.+\(?.+:\d+:\d+\)?\s*$/m.test(text);
}

export interface InteractiveStep {
  /** Wait until the process output (ANSI stripped) matches this... */
  waitFor: RegExp;
  /** ...then write this to stdin. */
  send: string;
}

/**
 * Runs the CLI like a person at a terminal: each line is sent only after its prompt appeared.
 * (Piping every answer at once is not equivalent — see KG-22.) Stdin is closed after the last step.
 */
export async function runCliInteractive(
  args: string[],
  script: InteractiveStep[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<CliResult> {
  const started = Date.now();
  const child = spawnTracked(process.execPath, [CLI_DIST, ...args], {
    cwd: options.cwd,
    env: smokeEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout!.setEncoding('utf8').on('data', (c: string) => (stdout += c));
  child.stderr!.setEncoding('utf8').on('data', (c: string) => (stderr += c));
  child.stdin!.on('error', () => {});

  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child);
  }, options.timeoutMs ?? 60_000);

  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal }))
  );

  for (const step of script) {
    const deadline = Date.now() + (options.timeoutMs ?? 60_000);
    while (!step.waitFor.test(stripAnsi(stdout)) && Date.now() < deadline && !timedOut && child.exitCode === null) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (child.exitCode !== null) break;
    child.stdin!.write(step.send);
  }
  child.stdin!.end();

  const { code, signal } = await closed;
  clearTimeout(timer);
  const result: ProcessResult = { code, signal, stdout, stderr, timedOut, durationMs: Date.now() - started };
  return { ...result, out: stripAnsi(stdout + stderr) };
}
