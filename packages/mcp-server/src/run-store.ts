import * as fs from 'fs';
import * as path from 'path';
import { readJsonSync, writeJsonSync } from '@jetic/core';
import type { WorkflowSimulationResult, WorkflowStepResult } from '@jetic/simulator';

export type SimulationRunStatus = 'passed' | 'failed' | 'aborted' | 'running' | 'error';

export type RunStepStatus = 'pending' | 'passed' | 'failed' | 'skipped';

/**
 * One line of live run progress. Present in the status file from the moment the run starts
 * (status 'pending' for the planned steps) and updated as steps complete — this is what
 * jetic_get_run polls while the simulation is still running.
 */
export interface RunStepProgress {
  index: number;
  name: string;
  method: string;
  path: string;
  status: RunStepStatus;
  expectedStatus?: number;
  actualStatus?: number;
  passed?: boolean;
  skipped?: boolean;
  retryCount?: number;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

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
  /** Per-step progress — updated incrementally after every step completes. */
  steps?: RunStepProgress[];
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

/** Projects a simulator step result onto the lightweight progress line stored in the status file. */
export function stepToProgress(r: WorkflowStepResult): RunStepProgress {
  return {
    index: r.stepIndex,
    name: r.name,
    method: r.method,
    path: r.path,
    status: r.skipped ? 'skipped' : r.passed ? 'passed' : 'failed',
    expectedStatus: r.expectedStatus,
    ...(r.skipped ? {} : { actualStatus: r.actualStatus }),
    passed: r.passed,
    skipped: r.skipped,
    ...(r.retryCount > 0 ? { retryCount: r.retryCount } : {}),
    durationMs: r.durationMs,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    ...(r.error ? { error: r.error } : {}),
  };
}

/** Recomputes the stats block from the progress lines (pending steps count towards totals only). */
export function statsFromSteps(steps: RunStepProgress[]) {
  const completed = steps.filter((s) => s.status !== 'pending');
  return {
    totalSteps: steps.length,
    executedSteps: completed.length,
    passedSteps: completed.filter((s) => s.status === 'passed' || s.status === 'skipped').length,
    failedSteps: completed.filter((s) => s.status === 'failed').length,
    skippedSteps: completed.filter((s) => s.status === 'skipped').length,
  };
}

/**
 * Max characters of a single persisted response body. Bodies above this are stored as a
 * truncated preview with a flag — the run report is meant to be readable (and pollable via
 * jetic_get_run), not a data dump.
 */
export const MAX_PERSISTED_BODY_CHARS = 16_384;

/**
 * Deep-clones a simulation result and truncates oversized response bodies so the persisted
 * report stays small and curl-readable. Captures into memory already happened before this.
 */
export function truncateResultForStorage(
  result: WorkflowSimulationResult,
  maxChars = MAX_PERSISTED_BODY_CHARS
): WorkflowSimulationResult {
  const clone: WorkflowSimulationResult = JSON.parse(JSON.stringify(result));
  for (const step of clone.results) {
    if (step.responseBody === undefined || step.responseBody === null) continue;
    const serialized =
      typeof step.responseBody === 'string' ? step.responseBody : JSON.stringify(step.responseBody);
    if (serialized.length <= maxChars) continue;

    const removed = serialized.length - maxChars;
    step.responseBody =
      typeof step.responseBody === 'string'
        ? `${step.responseBody.slice(0, maxChars)}\n…[truncated: ${removed} more characters]`
        : { _truncated: true, preview: serialized.slice(0, maxChars), fullLengthChars: serialized.length };
    step.responseBodyTruncated = true;
  }
  return clone;
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
    result: truncateResultForStorage(result),
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
    steps: result.results.map(stepToProgress),
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

/**
 * Marks a run as started (used by async simulation before the first response).
 * Planned steps are seeded as `pending` so jetic_get_run can show the full route immediately.
 */
export function writeRunningStatus(
  jeticDir: string,
  runId: string,
  meta: {
    workflowName: string;
    environment: string;
    baseUrl: string;
    startedAt: string;
    steps?: Array<{ name: string; method: string; path: string }>;
  }
): void {
  const steps: RunStepProgress[] | undefined = meta.steps?.map((s, i) => ({
    index: i + 1,
    name: s.name,
    method: s.method,
    path: s.path,
    status: 'pending' as const,
  }));
  const doc: SimulationRunStatusFile = {
    type: 'simulation',
    runId,
    workflowName: meta.workflowName,
    environment: meta.environment,
    baseUrl: meta.baseUrl,
    status: 'running',
    startedAt: meta.startedAt,
    stats: {
      totalSteps: steps?.length ?? 0,
      executedSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
    },
    ...(steps ? { steps } : {}),
    reportPath: reportPath(jeticDir, runId),
  };
  writeJsonSync(statusPath(jeticDir, runId), doc);
}

/**
 * Read-modify-write of the status file while a run is in progress. Used by the simulator's
 * onStepResult callback to persist per-step progress. No-op when the file is gone.
 */
export function updateRunStatus(
  jeticDir: string,
  runId: string,
  update: (doc: SimulationRunStatusFile) => void
): void {
  const doc = readJsonSync<SimulationRunStatusFile>(statusPath(jeticDir, runId));
  if (!doc) return;
  update(doc);
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
