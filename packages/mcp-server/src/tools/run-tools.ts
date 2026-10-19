import { z } from 'zod';
import * as path from 'path';
import { loadConfig, readJsonSync } from '@jetic/core';
import { resolveProjectInput } from '../types';
import { listRuns, readRunStatus, readSimulationRun } from '../run-store';

export const getRunSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  runId: z
    .string()
    .describe('Run id returned by jetic_simulate_workflow (e.g. "2026-10-19T12-34-56-789Z") or jetic_run_agent'),
});

export const listRunsSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  limit: z.number().int().positive().max(100).optional().default(20).describe('Max runs to return, newest first (default 20)'),
});

export function handleGetRun(args: z.infer<typeof getRunSchema>) {
  const projectRoot = path.resolve(resolveProjectInput(args.projectPath));
  const config = loadConfig(projectRoot);

  const report = readSimulationRun(config.jeticDir, args.runId);
  if (report) return { found: true, ...report };

  // No report yet: the run may still be in progress (async mode) or have failed before finishing.
  const status = readRunStatus(config.jeticDir, args.runId);
  if (status) {
    return {
      found: true,
      type: 'simulation',
      runId: args.runId,
      status: status.status,
      workflowName: status.workflowName,
      environment: status.environment,
      baseUrl: status.baseUrl,
      startedAt: status.startedAt,
      finishedAt: status.finishedAt,
      stats: status.stats,
      reportPath: status.reportPath,
      ...(status.error ? { error: status.error } : {}),
      ...(status.status === 'running' ? { message: 'Run still in progress — poll again shortly.' } : {}),
    };
  }

  const agentReport = readJsonSync<any>(
    path.join(config.jeticDir, 'runs', args.runId, 'agent-report.json')
  );
  if (agentReport) return { found: true, type: 'agent', runId: args.runId, ...agentReport };

  const available = listRuns(config.jeticDir, 10).map((r) => `${r.runId} (${r.type}: ${r.status})`);
  const detail = available.length > 0 ? ` Recent runs: ${available.join(', ')}.` : ' No runs found yet.';
  throw new Error(`Run "${args.runId}" not found under .jetic/runs/.${detail}`);
}

export function handleListRuns(args: z.infer<typeof listRunsSchema>) {
  const projectRoot = path.resolve(resolveProjectInput(args.projectPath));
  const config = loadConfig(projectRoot);
  const runs = listRuns(config.jeticDir, args.limit ?? 20);
  return {
    runsDir: path.join(config.jeticDir, 'runs'),
    totalCount: runs.length,
    runs,
  };
}
