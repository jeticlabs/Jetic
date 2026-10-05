import { CLI_DIST, COMPILE_CACHE_DIR } from './paths';
import { ProcessResult, runProcess, RunOptions } from './process';

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
