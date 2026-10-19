import * as fs from 'fs';
import * as path from 'path';
import { readJsonSync, writeJsonSync } from '@jetic/core';
import type { WorkflowSimulationResult, WorkflowStepResult } from '@jetic/simulator';

export type SimulationRunStatus = 'passed' | 'failed' | 'aborted' | 'running' | 'error';

export interface SimulationRunStatusFile {
  type: 'simulation';
  runId: string;
  workflowName: string;
  environment: string;
  baseUrl: string;
  status: SimulationRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  stats: {
    totalSteps: number;
    executedSteps: number;
    passedSteps: number;
    failedSteps: number;
    skippedSteps: number;
  };
  reportPath: string;
}

export interface SimulationReportFile {
  type: 'simulation';
  runId: string;
  workflowName: string;
  workflowFile?: string;
  environment: string;
  baseUrl: string;
  status: SimulationRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  result: WorkflowSimulationResult;
}

/** Filesystem-safe, sortable run id (Windows-compatible: no ":" or "."). */
export function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function runsDir(jeticDir: string): string {
  return path.join(jeticDir, 'runs');
}

export function runDir(jeticDir: string, runId: string): string {
  return path.join(runsDir(jeticDir), runId);
}

function reportPath(jeticDir: string, runId: string): string {
  return path.join(runDir(jeticDir, runId), 'simulation-report.json');
}

function statusPath(jeticDir: string, runId: string): string {
  return path.join(runDir(jeticDir, runId), 'simulation-status.json');
}

export function deriveRunStatus(result: WorkflowSimulationResult): SimulationRunStatus {
  if (result.success) return 'passed';
  if (result.abortReason) return 'aborted';
  return 'failed';
}

/**
 * Persists a finished simulation run: full report + compact status file.
 * Returns the run's directory and report path.
 */
export function writeSimulationRun(
  jeticDir: string,
  runId: string,
  result: WorkflowSimulationResult,
  meta: { startedAt: string; finishedAt: string; workflowFile?: string }
): { runDir: string; reportPath: string } {
  const status = deriveRunStatus(result);
  const durationMs = result.stats?.totalTimeMs ?? 0;

  const report: SimulationReportFile = {
    type: 'simulation',
    runId,
    workflowName: result.workflow?.name || 'workflow',
    workflowFile: meta.workflowFile,
    environment: result.environment?.name || 'unknown',
    baseUrl: result.environment?.baseUrl || '',
    status,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    durationMs,
    result,
  };
  const rPath = reportPath(jeticDir, runId);
  writeJsonSync(rPath, report);

  const sPath = statusPath(jeticDir, runId);
  const statusDoc: SimulationRunStatusFile = {
    type: 'simulation',
    runId,
    workflowName: report.workflowName,
    environment: report.environment,
    baseUrl: report.baseUrl,
    status,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    durationMs,
    stats: {
      totalSteps: result.stats?.totalSteps ?? result.results.length,
      executedSteps: result.stats?.executedSteps ?? 0,
      passedSteps: result.stats?.passedSteps ?? 0,
      failedSteps: result.stats?.failedSteps ?? 0,
      skippedSteps: result.results.filter((r) => r.skipped).length,
    },
    reportPath: rPath,
  };
  writeJsonSync(sPath, statusDoc);

  return { runDir: runDir(jeticDir, runId), reportPath: rPath };
}

export function readSimulationRun(jeticDir: string, runId: string): SimulationReportFile | null {
  return readJsonSync<SimulationReportFile>(reportPath(jeticDir, runId));
}

/** Reads the lightweight status file — present even while a run is still in progress. */
export function readRunStatus(jeticDir: string, runId: string): SimulationRunStatusFile | null {
  return readJsonSync<SimulationRunStatusFile>(statusPath(jeticDir, runId));
}

/** Marks a run as started (used by async simulation before the first response). */
export function writeRunningStatus(
  jeticDir: string,
  runId: string,
  meta: { workflowName: string; environment: string; baseUrl: string; startedAt: string }
): void {
  const doc: SimulationRunStatusFile = {
    type: 'simulation',
    runId,
    workflowName: meta.workflowName,
    environment: meta.environment,
    baseUrl: meta.baseUrl,
    status: 'running',
    startedAt: meta.startedAt,
    stats: { totalSteps: 0, executedSteps: 0, passedSteps: 0, failedSteps: 0, skippedSteps: 0 },
    reportPath: reportPath(jeticDir, runId),
  };
  writeJsonSync(statusPath(jeticDir, runId), doc);
}

/** Records an unexpected run-level failure (not a step failure) so async runs are observable. */
export function writeRunError(
  jeticDir: string,
  runId: string,
  error: unknown,
  meta: { workflowName: string; environment: string; baseUrl: string; startedAt: string }
): void {
  const doc: SimulationRunStatusFile = {
    type: 'simulation',
    runId,
    workflowName: meta.workflowName,
    environment: meta.environment,
    baseUrl: meta.baseUrl,
    status: 'error',
    startedAt: meta.startedAt,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    stats: { totalSteps: 0, executedSteps: 0, passedSteps: 0, failedSteps: 0, skippedSteps: 0 },
    reportPath: reportPath(jeticDir, runId),
  };
  writeJsonSync(statusPath(jeticDir, runId), doc);
}

export interface RunListItem {
  runId: string;
  type: 'simulation' | 'agent';
  name: string;
  status: string;
  startedAt?: string;
  durationMs?: number;
  reportPath?: string;
}

/** Lists recent runs (simulations and agent runs) newest-first. */
export function listRuns(jeticDir: string, limit = 20): RunListItem[] {
  const dir = runsDir(jeticDir);
  if (!fs.existsSync(dir)) return [];

  const items: RunListItem[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;

    const simStatus = readJsonSync<SimulationRunStatusFile>(statusPath(jeticDir, runId));
    if (simStatus) {
      items.push({
        runId,
        type: 'simulation',
        name: simStatus.workflowName,
        status: simStatus.status,
        startedAt: simStatus.startedAt,
        durationMs: simStatus.durationMs,
        reportPath: simStatus.reportPath,
      });
      continue;
    }

    const agentReport = readJsonSync<any>(path.join(runDir(jeticDir, runId), 'agent-report.json'));
    if (agentReport) {
      items.push({
        runId,
        type: 'agent',
        name: agentReport.agentId || 'agent',
        status: agentReport.status || 'completed',
        reportPath: path.join(runDir(jeticDir, runId), 'agent-report.json'),
      });
    }
  }

  // Run ids are ISO timestamps — lexicographic descending == newest first.
  items.sort((a, b) => b.runId.localeCompare(a.runId));
  return items.slice(0, limit);
}

// ── Compact MCP result ───────────────────────────────────────────────────────

export interface CompactStepSummary {
  step: number;
  name: string;
  method: string;
  path: string;
  targetUrl: string;
  status: 'passed' | 'failed' | 'skipped';
  expectedStatus: number;
  actualStatus?: number;
  durationMs: number;
  retryCount?: number;
  condition?: string;
  error?: string;
}

export interface CompactSimulationResult {
  ok: boolean;
  /** Kept alongside `ok` for backward compatibility with existing consumers. */
  success: boolean;
  runId: string;
  status: SimulationRunStatus;
  workflow: string;
  environment: { name: string; baseUrl: string };
  stats: WorkflowSimulationResult['stats'];
  preflight?: WorkflowSimulationResult['preflight'];
  abortReason?: string;
  steps: CompactStepSummary[];
  reportPath: string;
  next: string;
}

/**
 * Token-cheap simulation summary for MCP responses: one line per step, no
 * bodies/headers. The full request/response detail lives in the run report.
 */
export function compactSimulationResult(
  result: WorkflowSimulationResult,
  runId: string,
  reportFilePath: string
): CompactSimulationResult {
  const steps: CompactStepSummary[] = result.results.map((r: WorkflowStepResult) => {
    const summary: CompactStepSummary = {
      // stepIndex is already 1-based (set as i + 1 by the simulator).
      step: r.stepIndex,
      name: r.name,
      method: r.method,
      path: r.path,
      targetUrl: r.targetUrl,
      status: r.skipped ? 'skipped' : r.passed ? 'passed' : 'failed',
      expectedStatus: r.expectedStatus,
      durationMs: r.durationMs,
    };
    if (!r.skipped) summary.actualStatus = r.actualStatus;
    if (r.retryCount > 0) summary.retryCount = r.retryCount;
    if (r.conditionResult) {
      summary.condition = `${r.conditionResult.evaluated} → ${r.conditionResult.matched ? 'matched' : 'not matched'}`;
    }
    if (r.error) summary.error = r.error;
    return summary;
  });

  return {
    ok: result.success,
    success: result.success,
    runId,
    status: deriveRunStatus(result),
    workflow: result.workflow?.name || 'workflow',
    environment: {
      name: result.environment?.name || 'unknown',
      baseUrl: result.environment?.baseUrl || '',
    },
    stats: result.stats,
    ...(result.preflight ? { preflight: result.preflight } : {}),
    ...(result.abortReason ? { abortReason: result.abortReason } : {}),
    steps,
    reportPath: reportFilePath,
    next: result.success
      ? `Full request/response detail: jetic_get_run { "runId": "${runId}" }`
      : `Inspect the failing step in full detail: jetic_get_run { "runId": "${runId}" }`,
  };
}
