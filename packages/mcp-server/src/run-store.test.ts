import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { WorkflowSimulationResult, WorkflowStepResult } from '@jetic/simulator';
import {
  MAX_PERSISTED_BODY_CHARS,
  readRunStatus,
  readSimulationRun,
  stepToProgress,
  updateRunStatus,
  writeRunningStatus,
  writeSimulationRun,
} from './run-store';

const step = (over: Partial<WorkflowStepResult> = {}): WorkflowStepResult => ({
  stepIndex: 1,
  name: 'Login',
  method: 'POST',
  path: '/login',
  targetUrl: 'http://x/login',
  resolvedUrl: 'http://x/login',
  expectedStatus: 200,
  actualStatus: 200,
  durationMs: 5,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:00.005Z',
  passed: true,
  skipped: false,
  retryCount: 0,
  requestHeaders: { 'Content-Type': 'application/json' },
  requestBody: {},
  responseBody: { ok: true },
  capturedMemory: [],
  ...over,
});

const result = (results: WorkflowStepResult[], success = results.every((r) => r.passed)): WorkflowSimulationResult => ({
  success,
  workflow: { name: 'wf', stepsCount: results.length },
  environment: { name: 'local', baseUrl: 'http://x' },
  stats: {
    totalSteps: results.length,
    executedSteps: results.length,
    passedSteps: results.filter((r) => r.passed).length,
    failedSteps: results.filter((r) => !r.passed).length,
    totalTimeMs: 42,
  },
  results,
});

describe('run store — live progress and persisted payloads', () => {
  let jeticDir: string;

  beforeEach(() => {
    jeticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-runs-'));
  });
  afterEach(() => fs.rmSync(jeticDir, { recursive: true, force: true }));

  it('seeds planned steps as pending and accepts incremental progress updates', () => {
    const runId = 'run-1';
    writeRunningStatus(jeticDir, runId, {
      workflowName: 'wf',
      environment: 'local',
      baseUrl: 'http://x',
      startedAt: '2026-01-01T00:00:00.000Z',
      steps: [
        { name: 'Login', method: 'POST', path: '/login' },
        { name: 'Orders', method: 'GET', path: '/orders' },
      ],
    });

    const initial = readRunStatus(jeticDir, runId)!;
    expect(initial.status).toBe('running');
    expect(initial.steps?.map((s) => [s.index, s.status])).toEqual([[1, 'pending'], [2, 'pending']]);

    // What workflow-tools does after each completed step:
    updateRunStatus(jeticDir, runId, (doc) => {
      doc.steps = doc.steps!.map((s) => (s.index === 1 ? stepToProgress(step()) : s));
      doc.stats = { totalSteps: 2, executedSteps: 1, passedSteps: 1, failedSteps: 0, skippedSteps: 0 };
    });

    const after = readRunStatus(jeticDir, runId)!;
    expect(after.steps?.map((s) => [s.index, s.status])).toEqual([[1, 'passed'], [2, 'pending']]);
    expect(after.stats.executedSteps).toBe(1);
  });

  it('updateRunStatus is a no-op when the status file does not exist', () => {
    expect(() => updateRunStatus(jeticDir, 'missing', (doc) => (doc.status = 'passed'))).not.toThrow();
    expect(readRunStatus(jeticDir, 'missing')).toBeNull();
  });

  it('persists the final report with per-step progress and truncated oversized bodies', () => {
    const runId = 'run-2';
    const bigBody = { blob: 'x'.repeat(MAX_PERSISTED_BODY_CHARS + 500) };
    const steps = [
      step(),
      step({
        stepIndex: 2,
        name: 'Huge',
        method: 'GET',
        path: '/huge',
        startedAt: undefined as unknown as string,
        responseBody: bigBody,
      }),
    ];
    // startedAt/finishedAt are required on the interface; keep them valid for the second step too.
    steps[1].startedAt = '2026-01-01T00:00:01.000Z';
    steps[1].finishedAt = '2026-01-01T00:00:01.010Z';

    writeSimulationRun(jeticDir, runId, result(steps), {
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:02.000Z',
    });

    const report = readSimulationRun(jeticDir, runId)!;
    // Small bodies stay intact.
    expect(report.result.results[0].responseBody).toEqual({ ok: true });
    expect(report.result.results[0].responseBodyTruncated).toBeUndefined();
    // Oversized bodies become a flagged preview.
    expect(report.result.results[1].responseBodyTruncated).toBe(true);
    expect(report.result.results[1].responseBody).toMatchObject({
      _truncated: true,
      fullLengthChars: expect.any(Number),
    });
    expect((report.result.results[1].responseBody as any).preview.length).toBe(MAX_PERSISTED_BODY_CHARS);

    // The status file mirrors the final step states.
    const status = readRunStatus(jeticDir, runId)!;
    expect(status.status).toBe('passed');
    expect(status.steps?.map((s) => s.status)).toEqual(['passed', 'passed']);
    expect(status.steps?.[0].durationMs).toBe(5);
  });

  it('projects skipped and failed steps onto progress lines', () => {
    expect(stepToProgress(step({ skipped: true, passed: true, actualStatus: 0 }))).toMatchObject({
      status: 'skipped',
      skipped: true,
    });
    expect(
      stepToProgress(step({ passed: false, actualStatus: 404, error: 'expected 200, got 404', retryCount: 2 }))
    ).toMatchObject({ status: 'failed', actualStatus: 404, retryCount: 2, error: 'expected 200, got 404' });
  });
});
