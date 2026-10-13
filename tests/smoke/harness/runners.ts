/**
 * The four ways Jetic runs a saved workflow, behind one signature, for parity tests:
 *   test → `jetic test --ci`            (WorkflowSimulator)
 *   cli  → `jetic simulate workflow`    (inline CLI runner)
 *   mcp  → MCP `jetic_simulate_workflow` (WorkflowSimulator, served from an unrelated cwd)
 *   dev  → `POST /api/workflows/run`    (inline SSE runner behind the dashboard)
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCli } from './cli';
import { startDev } from './dev-server';
import { McpSession } from './mcp';
import { TempProject } from './project';
import { SseStream } from './sse';

export type RunnerName = 'test' | 'cli' | 'mcp' | 'dev';
export const ALL_RUNNERS: RunnerName[] = ['test', 'cli', 'mcp', 'dev'];

export interface Outcome {
  passed: boolean;
  /** "METHOD /path" in order, with probes and volatile parts removed (see {@link normalizeRequests}). */
  requests: string[];
}

export interface RunContext {
  project: TempProject;
  /** Workflow file slug, which is also its `name`. */
  slug: string;
  baseUrl: string;
  /** Extra environment for the spawned process (e.g. JETIC_HUMAN_OTP). */
  env?: NodeJS.ProcessEnv;
  /** Raw requests the API under test has received since its last reset. */
  hits: () => string[];
  /** Clears the API under test, so the next runner starts from the same state. */
  resetApi: () => void;
}

/**
 * Makes request logs comparable across runners: drops the `GET /` liveness probes, query strings
 * (some runners append body fields to GET requests, others do not) and generated ids.
 */
export function normalizeRequests(hits: string[]): string[] {
  return hits
    .filter((hit) => hit !== 'GET /')
    .map((hit) => hit.split('?')[0].replace(/\/(ord|u|tok)_\d+/g, '/$1_N'));
}

async function viaTest(ctx: RunContext): Promise<Outcome> {
  const result = await runCli(['test', '--ci'], { cwd: ctx.project.dir, env: ctx.env });
  const report = JSON.parse(result.stdout);
  return { passed: report.results.find((r: any) => r.name === ctx.slug).passed, requests: normalizeRequests(ctx.hits()) };
}

async function viaCli(ctx: RunContext): Promise<Outcome> {
  const result = await runCli(['simulate', 'workflow', '--workflow', ctx.slug, '--env', 'local'], { cwd: ctx.project.dir, env: ctx.env });
  if (result.timedOut || ![0, 1].includes(result.code ?? -1)) {
    throw new Error(`simulate workflow crashed or hung (exit ${result.code}):\n${result.out}`); // a crash is not a verdict
  }
  return { passed: result.code === 0, requests: normalizeRequests(ctx.hits()) };
}

async function viaMcp(ctx: RunContext): Promise<Outcome> {
  // Serve the project from an UNRELATED working directory, as an editor does with `jetic mcp --project X`.
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-smoke-elsewhere-'));
  const session = await McpSession.start({ project: ctx.project.dir, cwd: elsewhere, env: ctx.env });
  try {
    const run = await session.call('jetic_simulate_workflow', { workflow: ctx.slug, baseUrl: ctx.baseUrl });
    if (!run.ok) throw new Error(`jetic_simulate_workflow failed: ${run.text}`);
    // Memory belongs to the served project, never to the server's working directory (KG-07).
    if (fs.existsSync(path.join(elsewhere, '.jetic', 'memory.json'))) {
      throw new Error('MCP server wrote memory.json into its working directory instead of the served project');
    }
    return { passed: run.data.success, requests: normalizeRequests(ctx.hits()) };
  } finally {
    await session.close();
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
}

async function viaDev(ctx: RunContext): Promise<Outcome> {
  const dev = await startDev(ctx.project.dir, { env: ctx.env });
  try {
    const stream = await SseStream.open(`${dev.url}/api/workflows/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: `workflows/${ctx.slug}.json`, baseUrl: ctx.baseUrl }),
    });
    const events = await stream.all();
    const last = events[events.length - 1];
    return { passed: last?.type === 'done' && last.failed === 0, requests: normalizeRequests(ctx.hits()) };
  } finally {
    await dev.stop();
  }
}

export const RUNNERS: Record<RunnerName, (ctx: RunContext) => Promise<Outcome>> = {
  test: viaTest,
  cli: viaCli,
  mcp: viaMcp,
  dev: viaDev,
};

/** Runs one workflow through each runner from identical starting state (fresh memory, fresh API). */
export async function runOn(ctx: RunContext, runners: RunnerName[] = ALL_RUNNERS): Promise<Partial<Record<RunnerName, Outcome>>> {
  const outcomes: Partial<Record<RunnerName, Outcome>> = {};
  for (const name of runners) {
    fs.rmSync(ctx.project.path('.jetic', 'memory.json'), { force: true });
    ctx.resetApi();
    outcomes[name] = await RUNNERS[name](ctx);
  }
  return outcomes;
}
