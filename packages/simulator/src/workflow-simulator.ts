import { BehavioralModel, Environment } from '@jetic/model';
import { JeticMemory } from '@jetic/memory';
import { faker } from '@faker-js/faker';
import {
  conditionKind,
  describeInvalidCondition,
  evaluateLegacyCondition,
  evaluateRules,
  RulesCondition,
  StepCondition,
} from './conditions';

// Conditions live in ./conditions (shared with the CLI and dev runners). Both the canonical
// rules shape and the legacy pre-step guard are accepted; see that module for semantics.
export type { StepCondition } from './conditions';

export interface WorkflowStepDef {
  name: string;
  method: string;
  path: string;
  description?: string;
  inject?: Record<string, string>;
  capture?: Record<string, string>;
  captureInput?: Record<string, string>;
  expectStatus?: number;
  body?: Record<string, any>;
  /** Explicit URL query parameters (deep-resolved templates). Prefer this over a GET body. */
  query?: Record<string, any>;
  /** Per-step request timeout in ms (overrides the run-level default; 0 disables). */
  timeoutMs?: number;
  /**
   * Rules condition (canonical): evaluated after the step; `onFail` controls the flow.
   * Legacy `{ if, equals… }` guard: evaluated before the step; a miss skips it.
   */
  condition?: StepCondition;
  /** What to do when expectStatus/continueOnStatus check fails. Default: 'abort'. */
  onFailure?: 'abort' | 'continue';
  /** Additional HTTP status codes treated as pass for this step. */
  continueOnStatus?: number[];
  /** Per-step retry (overrides workflow-level default). */
  retry?: { times: number; delayMs?: number };
}

export interface WorkflowDef {
  name: string;
  description?: string;
  generatedAt?: string;
  environment?: string;
  /** Global retry default applied to every step (overridden per step). */
  retry?: { times: number; delayMs?: number };
  steps: WorkflowStepDef[];
}

export interface WorkflowStepResult {
  stepIndex: number;
  name: string;
  method: string;
  path: string;
  targetUrl: string;
  /** Final request URL including the query string, exactly as sent (absent for skipped steps). */
  resolvedUrl?: string;
  expectedStatus: number;
  actualStatus: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  /** True when the step was skipped due to a condition not matching. */
  skipped: boolean;
  /** Number of retry attempts made (0 = first attempt succeeded or no retry). */
  retryCount: number;
  /** Set when onFailure was evaluated after a step failed. */
  failureHandling?: 'aborted' | 'continued';
  /** Set when the step had a condition; shows the resolved value (legacy) or reason (rules) + match result. */
  conditionResult?: { evaluated: string; matched: boolean };
  /** Set when a rules condition did not hold: what the runner did about it. */
  conditionOutcome?: 'abort' | 'continue' | 'switch';
  /** Headers actually sent — includes the default Content-Type and the real Bearer value. */
  requestHeaders: Record<string, string>;
  requestBody: Record<string, any>;
  requestQuery?: Record<string, any>;
  responseBody: any;
  /** True when the persisted response body was truncated for storage (full body stays in memory during the run). */
  responseBodyTruncated?: boolean;
  responseHeaders?: Record<string, string>;
  capturedMemory: string[];
  error?: string;
}

/** Live progress snapshot handed to `onStepResult` after every recorded step. */
export interface SimulationProgress {
  totalSteps: number;
  executedSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
}

export interface PreflightProbe {
  url: string;
  verdict: 'healthy' | 'server-error' | 'unreachable';
  status?: number;
  message: string;
  /** True when the run was stopped before step 1 because of this probe. */
  aborted: boolean;
}

export interface WorkflowSimulationResult {
  success: boolean;
  workflow: {
    name: string;
    description?: string;
    stepsCount: number;
  };
  environment: {
    name: string;
    baseUrl: string;
  };
  stats: {
    totalSteps: number;
    executedSteps: number;
    passedSteps: number;
    failedSteps: number;
    totalTimeMs: number;
  };
  results: WorkflowStepResult[];
  /** Present when a target health probe ran before the workflow. */
  preflight?: PreflightProbe;
  /** Why the run stopped before executing every step (e.g. unreachable target). */
  abortReason?: string;
}

/** Error codes treated as "the target is unreachable" (aborts the run early). */
export const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function networkErrorCode(error: any): string | undefined {
  const raw = error?.cause?.code ?? error?.cause?.errno ?? error?.code ?? error?.errno;
  return typeof raw === 'string' ? raw : undefined;
}

function deepGet(obj: any, dotPath: string): any {
  if (obj === null || obj === undefined) return undefined;
  const parts = dotPath.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export interface SimulateWorkflowOptions {
  clearMemory?: boolean;
  /** Resolves another workflow (by slug or name) for `onFail: "switch"` conditions. */
  loadWorkflow?: (slugOrName: string) => WorkflowDef | null | Promise<WorkflowDef | null>;
  /**
   * When true (default), a template or path parameter that resolves to nothing fails the step
   * before any request is sent, instead of silently sending an empty value.
   */
  strictTemplates?: boolean;
  /** Probe the target before step 1. Default 'off'; MCP simulation opts into 'abort'. */
  preflight?: 'abort' | 'warn' | 'off';
  /** Health-probe timeout in ms (default 3000). */
  preflightTimeoutMs?: number;
  /** Default per-request timeout in ms (default 30000; 0 disables). */
  requestTimeoutMs?: number;
  /**
   * Called after every recorded step (passed, failed or skipped) with the step result and a
   * live progress snapshot. Hosts use this to persist incremental run state (poll-able via
   * jetic_get_run). Callback failures are swallowed — telemetry must never fail a run.
   */
  onStepResult?: (step: WorkflowStepResult, progress: SimulationProgress) => void | Promise<void>;
}

export interface WorkflowSimulatorRuntime {
  /**
   * Project that owns `.jetic/memory.json`. Defaults to `process.cwd()`; hosts that serve a
   * project from a different working directory (the MCP server) must set it.
   */
  projectRoot?: string;
}

interface RunState {
  results: WorkflowStepResult[];
  allPassed: boolean;
  /** A failure (not a quiet `continue` branch) ended the run. */
  halted: boolean;
}

export class WorkflowSimulator {
  private strictTemplates = true;
  private requestTimeoutMs = 30_000;

  constructor(
    private model: BehavioralModel,
    private environment: Environment,
    private runtime: WorkflowSimulatorRuntime = {}
  ) {}

  private memory(scope: string): JeticMemory {
    return new JeticMemory({ scope, projectRoot: this.runtime.projectRoot });
  }

  public async simulateWorkflow(
    workflow: WorkflowDef,
    options?: SimulateWorkflowOptions
  ): Promise<WorkflowSimulationResult> {
    if (options?.clearMemory) {
      JeticMemory.clearAllMemory(this.runtime.projectRoot);
    }

    this.strictTemplates = options?.strictTemplates ?? true;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 30_000;

    const startTime = Date.now();
    const preflightMode = options?.preflight ?? 'off';
    const preflight =
      preflightMode !== 'off' && workflow.steps.length > 0
        ? await probeTarget(this.environment.baseUrl, options?.preflightTimeoutMs ?? 3000)
        : undefined;

    if (preflight && preflightMode === 'abort' && preflight.verdict === 'unreachable') {
      preflight.aborted = true;
      return {
        success: false,
        workflow: {
          name: workflow.name,
          description: workflow.description,
          stepsCount: workflow.steps.length,
        },
        environment: {
          name: this.environment.name,
          baseUrl: this.environment.baseUrl,
        },
        stats: {
          totalSteps: workflow.steps.length,
          executedSteps: 0,
          passedSteps: 0,
          failedSteps: 0,
          totalTimeMs: Date.now() - startTime,
        },
        results: [],
        preflight,
        abortReason: preflight.message,
      };
    }

    const state: RunState = { results: [], allPassed: true, halted: false };
    await this.runSteps(workflow, options, state, [workflow.name]);
    const stepResults = state.results;
    const totalTimeMs = Date.now() - startTime;

    return {
      success: state.allPassed,
      workflow: {
        name: workflow.name,
        description: workflow.description,
        stepsCount: workflow.steps.length,
      },
      environment: {
        name: this.environment.name,
        baseUrl: this.environment.baseUrl,
      },
      stats: {
        totalSteps: workflow.steps.length,
        executedSteps: stepResults.length,
        passedSteps: stepResults.filter((r) => r.passed).length,
        failedSteps: stepResults.filter((r) => !r.passed).length,
        totalTimeMs,
      },
      results: stepResults,
      ...(preflight ? { preflight } : {}),
    };
  }

  /**
   * Runs one workflow's steps, appending to `state`. Returns `'stop'` when the remaining steps
   * of THIS workflow must not run (failure, `onFail: continue|switch`), else `'done'`.
   * `state.halted` is set only for failures, so a caller resuming after a switch knows whether to go on.
   */
  private async runSteps(
    workflow: WorkflowDef,
    options: SimulateWorkflowOptions | undefined,
    state: RunState,
    lineage: string[]
  ): Promise<'done' | 'stop'> {
    const baseUrl = this.environment.baseUrl;
    // Conditions are guards: a missing value should make the condition false, not fail the step.
    const resolve = (value: string) => this.resolveTemplateString(value, false);

    // Every recorded step is pushed AND emitted to the host's progress callback so hosts can
    // persist incremental state (poll-able while the run is still in progress).
    const record = async (result: WorkflowStepResult) => {
      state.results.push(result);
      if (!options?.onStepResult) return;
      try {
        await options.onStepResult(result, {
          totalSteps: workflow.steps.length,
          executedSteps: state.results.length,
          passedSteps: state.results.filter((r) => r.passed).length,
          failedSteps: state.results.filter((r) => !r.passed).length,
          skippedSteps: state.results.filter((r) => r.skipped).length,
        });
      } catch {
        // Progress telemetry is best-effort — never fail a run because a host callback threw.
      }
    };

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepStartTime = Date.now();
      const stepName = step.name || `${step.method} ${step.path}`;
      const kind = step.condition === undefined ? undefined : conditionKind(step.condition);

      // ── Unrecognized condition ───────────────────────────────────────────
      // Never ignore it: a step that was meant to be guarded would run (or be skipped)
      // unchecked and the workflow could report green.
      if (kind === 'invalid') {
        const reason = describeInvalidCondition(step.condition);
        await record({
          stepIndex: i + 1,
          name: stepName,
          method: step.method,
          path: step.path,
          targetUrl: '',
          expectedStatus: step.expectStatus ?? 200,
          actualStatus: 0,
          durationMs: Date.now() - stepStartTime,
          startedAt: new Date(stepStartTime).toISOString(),
          finishedAt: new Date().toISOString(),
          passed: false,
          skipped: false,
          retryCount: 0,
          requestHeaders: {},
          requestBody: {},
          responseBody: null,
          capturedMemory: [],
          error: `Step ${i + 1} "${stepName}": ${reason}`,
        });
        state.allPassed = false;
        state.halted = true;
        return 'stop';
      }

      // ── Legacy pre-step guard ────────────────────────────────────────────
      // A miss skips the step; skipped steps count as passed so the workflow continues.
      if (kind === 'legacy') {
        const condResult = await evaluateLegacyCondition(step.condition as any, resolve);
        if (!condResult.matched) {
          await record({
            stepIndex: i + 1,
            name: stepName,
            method: step.method,
            path: step.path,
            targetUrl: '',
            expectedStatus: step.expectStatus ?? 200,
            actualStatus: 0,
            durationMs: Date.now() - stepStartTime,
            startedAt: new Date(stepStartTime).toISOString(),
            finishedAt: new Date().toISOString(),
            passed: true,
            skipped: true,
            retryCount: 0,
            conditionResult: condResult,
            requestHeaders: {},
            requestBody: {},
            responseBody: null,
            capturedMemory: [],
          });
          continue;
        }
      }

      // ── Resolve templates once before any retry attempts ─────────────────
      let injectedHeaders: Record<string, string> = {};
      let finalBody: Record<string, any> = {};
      let resolvedQuery: Record<string, any> = {};
      let resolvedPath = step.path;
      let fullUrl = '';
      let inputCaptured: string[] = [];
      try {
        const injections = await this.resolveInjections(step.inject);
        injectedHeaders = injections.headers;
        const resolvedBody = await this.resolveBodyTemplates(step.body || {});
        finalBody = { ...injections.body, ...resolvedBody };
        resolvedQuery = await this.resolveBodyTemplates(step.query || {});
        inputCaptured = await this.captureInputToMemory(step.captureInput, finalBody);
        resolvedPath = await this.resolvePathParams(step.path, finalBody);
        fullUrl = `${baseUrl.replace(/\/$/, '')}${resolvedPath}`;
      } catch (err: any) {
        await record({
          stepIndex: i + 1,
          name: stepName,
          method: step.method,
          path: step.path,
          targetUrl: '',
          expectedStatus: step.expectStatus ?? 200,
          actualStatus: 0,
          durationMs: Date.now() - stepStartTime,
          startedAt: new Date(stepStartTime).toISOString(),
          finishedAt: new Date().toISOString(),
          passed: false,
          skipped: false,
          retryCount: 0,
          requestHeaders: {},
          requestBody: {},
          responseBody: null,
          capturedMemory: [],
          error: `Step ${i + 1} "${stepName}": ${err?.message || err}`,
        });
        state.allPassed = false;
        state.halted = true;
        return 'stop';
      }
      const expectedStatus = step.expectStatus ?? 200;

      // ── Final request URL (with query string) ────────────────────────────
      // Computed once here: it does not change between retry attempts.
      let requestUrl = fullUrl;
      {
        const upperMethod = step.method.toUpperCase();
        const bodyAsQuery = ['GET', 'HEAD'].includes(upperMethod) && Object.keys(finalBody).length > 0;
        if (Object.keys(resolvedQuery).length > 0 || bodyAsQuery) {
          const params = new URLSearchParams();
          const append = (source: Record<string, any>) => {
            for (const [k, v] of Object.entries(source)) {
              if (v === undefined || v === null) continue;
              if (Array.isArray(v)) {
                for (const item of v) params.append(k, typeof item === 'object' ? JSON.stringify(item) : String(item));
              } else {
                params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
              }
            }
          };
          append(resolvedQuery);
          if (bodyAsQuery) append(finalBody);
          const qs = params.toString();
          if (qs) requestUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${qs}`;
        }
      }

      // Headers actually sent on every attempt (default Content-Type + injections/Bearer).
      const actualRequestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...injectedHeaders,
      };

      // ── Retry loop ────────────────────────────────────────────────────────
      // Per-step retry takes precedence over the workflow-level global default.
      const maxAttempts = Math.max(1, step.retry?.times ?? workflow.retry?.times ?? 1);
      const retryDelayMs = step.retry?.delayMs ?? workflow.retry?.delayMs ?? 0;

      let attempts = 0;
      let responseStatus = 0;
      let responseBody: any = null;
      let responseHeaders: Record<string, string> | undefined;
      let stepPassed = false;
      let errorMsg: string | undefined;
      let connectionCode: string | undefined;

      while (attempts < maxAttempts) {
        attempts++;
        if (attempts > 1 && retryDelayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, retryDelayMs));
        }
        responseStatus = 0;
        responseBody = null;
        responseHeaders = undefined;
        errorMsg = undefined;
        connectionCode = undefined;

        const timeoutMs = step.timeoutMs ?? this.requestTimeoutMs;
        try {
          const upperMethod = step.method.toUpperCase();
          const fetchOptions: RequestInit = {
            method: upperMethod,
            headers: actualRequestHeaders,
          };

          if (!['GET', 'HEAD'].includes(upperMethod) && Object.keys(finalBody).length > 0) {
            fetchOptions.body = JSON.stringify(finalBody);
          }
          if (timeoutMs > 0) {
            fetchOptions.signal = AbortSignal.timeout(timeoutMs);
          }

          const resp = await fetch(requestUrl, fetchOptions);
          responseStatus = resp.status;
          responseHeaders = Object.fromEntries(resp.headers.entries());

          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            try { responseBody = await resp.json(); } catch { responseBody = null; }
          } else {
            responseBody = await resp.text();
          }

          // ── Pass check: expectStatus + continueOnStatus ─────────────────
          const in2xx = (s: number) => s >= 200 && s < 300;
          stepPassed =
            resp.status === expectedStatus ||
            (in2xx(resp.status) && in2xx(expectedStatus)) ||
            (step.continueOnStatus || []).includes(resp.status);

          if (stepPassed) break; // success — stop retrying
        } catch (err: any) {
          stepPassed = false;
          connectionCode = networkErrorCode(err);
          if (err?.name === 'TimeoutError' || connectionCode === 'ETIMEDOUT') {
            errorMsg = `Request timed out after ${timeoutMs}ms (${step.method} ${resolvedPath}).`;
          } else if (connectionCode === 'ECONNREFUSED') {
            errorMsg = `Connection refused (ECONNREFUSED) at ${baseUrl} — the server is not accepting connections.`;
          } else {
            errorMsg = err?.message || String(err);
          }
        }
      }

      // ── Captures (only when step passed) ─────────────────────────────────
      const responseCaptured = stepPassed
        ? await this.captureToMemory(step.capture, responseBody)
        : [];

      // ── Record the step; onFailure decides whether a failed step ends the run ─
      const onFailure = step.onFailure ?? 'abort';
      const result: WorkflowStepResult = {
        stepIndex: i + 1,
        name: stepName,
        method: step.method,
        path: step.path,
        targetUrl: fullUrl,
        resolvedUrl: requestUrl,
        expectedStatus,
        actualStatus: responseStatus,
        durationMs: Date.now() - stepStartTime,
        startedAt: new Date(stepStartTime).toISOString(),
        finishedAt: new Date().toISOString(),
        passed: stepPassed,
        skipped: false,
        retryCount: attempts - 1,
        requestHeaders: actualRequestHeaders,
        requestBody: finalBody,
        ...(Object.keys(resolvedQuery).length > 0 ? { requestQuery: resolvedQuery } : {}),
        responseBody,
        ...(responseHeaders ? { responseHeaders } : {}),
        capturedMemory: stepPassed ? [...inputCaptured, ...responseCaptured] : [...inputCaptured],
        ...(stepPassed
          ? {}
          : {
              failureHandling: onFailure === 'continue' ? ('continued' as const) : ('aborted' as const),
              error: errorMsg,
            }),
      };
      await record(result);

      if (!stepPassed) {
        state.allPassed = false;
        if (connectionCode && CONNECTION_ERROR_CODES.has(connectionCode)) {
          const remaining = workflow.steps.length - (i + 1);
          result.failureHandling = 'aborted';
          result.error = `${result.error || 'Connection failed'}; aborting early because the target is unreachable${
            remaining > 0 ? ` (${remaining} step(s) not executed)` : ''
          }.`;
          state.halted = true;
          return 'stop';
        }
        if (onFailure === 'abort') {
          state.halted = true;
          return 'stop';
        }
      }

      // ── Rules condition: evaluated after the step; onFail steers the run ──
      if (kind === 'rules') {
        const condition = step.condition as RulesCondition;
        const outcome = await evaluateRules(condition.rules, resolve);
        result.conditionResult = { evaluated: outcome.reason, matched: outcome.passed };
        if (outcome.passed) continue;

        result.conditionOutcome = condition.onFail;
        const fail = (message: string) => {
          result.passed = false;
          result.error = result.error ? `${result.error}; ${message}` : message;
          state.allPassed = false;
          state.halted = true;
          return 'stop' as const;
        };

        if (condition.onFail === 'continue') return 'stop'; // branch not applicable: end quietly, not a failure
        if (condition.onFail !== 'switch') return fail(`Condition failed at step ${i + 1}: ${outcome.reason}`);

        // onFail: switch → run another workflow
        const target = condition.switchToWorkflow;
        if (!target) return fail(`Condition failed at step ${i + 1} (${outcome.reason}) and onFail "switch" has no switchToWorkflow`);
        if (!options?.loadWorkflow) {
          return fail(`Condition failed at step ${i + 1} (${outcome.reason}); cannot switch to "${target}": this runner was not given a workflow loader`);
        }
        const switched = await options.loadWorkflow(target);
        if (!switched) return fail(`Condition failed at step ${i + 1} (${outcome.reason}); switch target workflow "${target}" was not found`);
        if (lineage.includes(switched.name)) {
          return fail(`Condition failed at step ${i + 1}; switching to "${switched.name}" would loop (${[...lineage, switched.name].join(' → ')})`);
        }

        await this.runSteps(switched, options, state, [...lineage, switched.name]);
        if (state.halted || !condition.returnOnComplete) return 'stop';
        // returnOnComplete: resume the main workflow with the next step
      }
    }

    return 'done';
  }

  private findPlaceholders(value: string): Array<{ raw: string; expr: string; index: number }> {
    const placeholders: Array<{ raw: string; expr: string; index: number }> = [];
    let i = 0;
    while (i < value.length - 1) {
      if (value[i] !== '{' || value[i + 1] !== '{') {
        i++;
        continue;
      }
      let depth = 0;
      let closed = -1;
      let j = i + 2;
      while (j < value.length) {
        const ch = value[j];
        if (ch === '{') depth++;
        else if (ch === '}') {
          if (depth > 0) depth--;
          else if (value[j + 1] === '}') {
            closed = j;
            break;
          }
        }
        j++;
      }
      if (closed === -1) break;
      placeholders.push({ raw: value.slice(i, closed + 2), expr: value.slice(i + 2, closed).trim(), index: i });
      i = closed + 2;
    }
    return placeholders;
  }

  private async resolveTemplateString(value: string, strict = this.strictTemplates): Promise<string> {
    const placeholders = this.findPlaceholders(value);
    if (placeholders.length === 0) return value;

    let result = '';
    let cursor = 0;
    for (const placeholder of placeholders) {
      result += value.slice(cursor, placeholder.index);
      result += await this.resolveExpression(placeholder.expr, strict, placeholder.raw);
      cursor = placeholder.index + placeholder.raw.length;
    }
    return result + value.slice(cursor);
  }

  private async resolveExpression(expr: string, strict: boolean, raw: string): Promise<string> {
    if (expr.startsWith('faker.')) {
      return this.resolveFakerExpression(expr, strict, raw);
    }

    if (expr.includes(':')) {
      const colonIdx = expr.indexOf(':');
      const scope = expr.slice(0, colonIdx);
      const key = expr.slice(colonIdx + 1);
      const envKey = `JETIC_HUMAN_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

      if (scope === 'human') {
        const envVal = process.env[envKey];
        if (envVal !== undefined && envVal !== '') return envVal;
      }
      const memVal = await this.memory(scope).get(key);
      if (memVal !== null && memVal !== undefined) {
        return typeof memVal === 'string' ? memVal : JSON.stringify(memVal);
      }
      if (!strict) return '';
      if (scope === 'human') {
        throw new Error(
          `missing human input ${raw} — set ${envKey} or seed "human:${key}" memory (non-interactive runners cannot prompt)`
        );
      }
      throw new Error(
        `unresolved template ${raw} — no value for "${scope}:${key}"; capture it in an earlier step or seed it first`
      );
    }

    return raw;
  }

  private resolveFakerExpression(expr: string, strict: boolean, raw: string): string {
    if (/[({]/.test(expr)) {
      if (!strict) return raw;
      throw new Error(
        `unsupported faker expression ${raw} — parameterized calls are not supported; use a parameterless path like {{faker.internet.email}} or a literal value`
      );
    }
    let fn: any = faker;
    for (const part of expr.split('.').slice(1)) fn = fn?.[part];
    if (typeof fn !== 'function') {
      if (!strict) return raw;
      throw new Error(
        `unknown faker path ${raw} — use a complete parameterless path like {{faker.internet.email}} or {{faker.string.uuid}}`
      );
    }
    try {
      return String(fn());
    } catch (err: any) {
      if (!strict) return raw;
      throw new Error(
        `faker expression ${raw} failed: ${err?.message || err} — this faker path needs arguments; parameterized faker calls are not supported`
      );
    }
  }

  private async resolveBodyTemplates(body: Record<string, any>): Promise<Record<string, any>> {
    const resolved = await this.resolveDeep(body);
    return resolved && typeof resolved === 'object' && !Array.isArray(resolved) ? resolved : {};
  }

  private async resolveDeep(value: any): Promise<any> {
    if (typeof value === 'string') return this.resolveTemplateString(value);
    if (Array.isArray(value)) {
      const out: any[] = [];
      for (const item of value) out.push(await this.resolveDeep(item));
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, any> = {};
      for (const [key, item] of Object.entries(value)) out[key] = await this.resolveDeep(item);
      return out;
    }
    return value;
  }

  private async resolveInjections(inject: Record<string, string> | undefined) {
    const headers: Record<string, string> = {};
    const body: Record<string, any> = {};
    if (!inject) return { headers, body };

    for (const [target, memKeyOrTemplate] of Object.entries(inject)) {
      let strValue: string;
      if (memKeyOrTemplate.includes('{{')) {
        strValue = await this.resolveTemplateString(memKeyOrTemplate);
      } else {
        const [scope, key] = memKeyOrTemplate.includes(':')
          ? memKeyOrTemplate.split(':', 2)
          : ['workflow', memKeyOrTemplate];
        const scopedMemory = this.memory(scope);
        const value = await scopedMemory.get(key);
        if (value === null || value === undefined) {
          if (this.strictTemplates) {
            throw new Error(
              `inject target "${target}" references "${scope}:${key}", which is not in memory — capture it earlier or seed it first`
            );
          }
          continue;
        }
        strValue = typeof value === 'string' ? value : JSON.stringify(value);
      }

      const headerName = target.startsWith('header:')
        ? target.slice('header:'.length)
        : target.startsWith('body:')
          ? null
          : target;
      if (
        headerName &&
        headerName.toLowerCase() === 'authorization' &&
        strValue &&
        !/^[A-Za-z][A-Za-z0-9-]*\s/.test(strValue)
      ) {
        strValue = `Bearer ${strValue}`;
      }

      if (target.startsWith('body:')) {
        body[target.slice(5)] = strValue;
      } else if (target.startsWith('header:')) {
        headers[target.slice(7)] = strValue;
      } else {
        headers[target] = strValue;
      }
    }

    return { headers, body };
  }

  private async captureToMemory(capture: Record<string, string> | undefined, responseBody: any): Promise<string[]> {
    const captured: string[] = [];
    if (!capture || !responseBody) return captured;

    for (const [memKey, responsePath] of Object.entries(capture)) {
      const value = deepGet(responseBody, responsePath);
      if (value === undefined || value === null) continue;

      const [scope, key] = memKey.includes(':') ? memKey.split(':', 2) : ['workflow', memKey];
      const memory = this.memory(scope);
      await memory.set(key, value);
      captured.push(`${scope}:${key} = ${JSON.stringify(value)}`);
    }

    return captured;
  }

  private async captureInputToMemory(captureInput: Record<string, string> | undefined, resolvedBody: Record<string, any>): Promise<string[]> {
    const captured: string[] = [];
    if (!captureInput) return captured;

    for (const [memKey, bodyField] of Object.entries(captureInput)) {
      const value = resolvedBody[bodyField];
      if (value === undefined || value === null) continue;

      const [scope, key] = memKey.includes(':') ? memKey.split(':', 2) : ['workflow', memKey];
      const memory = this.memory(scope);
      await memory.set(key, value);
      captured.push(`${scope}:${key} = ${JSON.stringify(value)}`);
    }

    return captured;
  }

  private async resolvePathParams(urlPath: string, body: Record<string, any>): Promise<string> {
    let result = await this.resolveTemplateString(urlPath);
    const paramMatches = result.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (!paramMatches) return result;

    for (const p of [...new Set(paramMatches)].sort((a, b) => b.length - a.length)) {
      const paramName = p.substring(1);
      let value: any = body[paramName];
      if (value === undefined || value === null) {
        value = await this.memory('workflow').get(paramName);
      }
      if (value !== undefined && value !== null) {
        result = result.split(p).join(typeof value === 'string' ? value : String(value));
        continue;
      }
      if (this.strictTemplates) {
        throw new Error(
          `unresolved path parameter "${p}" in "${urlPath}" — provide it through a body field, a {{template}}, or a memory key named "${paramName}"`
        );
      }
    }
    return result;
  }

}

/**
 * Probes a target base URL once and classifies the outcome (used by the MCP preflight option
 * and by CLI runners before executing steps). Distinguishes "nothing listening" (ECONNREFUSED),
 * DNS failures and timeouts so the caller gets a real diagnostic instead of N bogus fetch errors.
 */
export async function probeTarget(baseUrl: string, timeoutMs = 3000): Promise<PreflightProbe> {
  const probe: PreflightProbe = { url: baseUrl, verdict: 'unreachable', message: '', aborted: false };
  try {
    const resp = await fetch(baseUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    probe.status = resp.status;
    if (resp.status >= 500) {
      probe.verdict = 'server-error';
      probe.message = `Server is reachable at ${baseUrl} but responded HTTP ${resp.status} — the app is likely failing (database/init error). Check the server logs before simulating.`;
    } else {
      probe.verdict = 'healthy';
      probe.message = `Server reachable at ${baseUrl} (HTTP ${resp.status}).`;
    }
  } catch (err: any) {
    const code = networkErrorCode(err);
    probe.status = undefined;
    if (err?.name === 'TimeoutError' || code === 'ETIMEDOUT') {
      probe.message = `No response from ${baseUrl} within ${timeoutMs}ms — the server may be down or hanging.`;
    } else if (code === 'ECONNREFUSED') {
      probe.message = `Connection refused at ${baseUrl} — nothing is listening there. Start the app (check its PORT/.env) and retry.`;
    } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      probe.message = `DNS lookup failed for ${baseUrl}${code ? ` (${code})` : ''} — check the host name.`;
    } else {
      probe.message = `Cannot reach ${baseUrl}${code ? ` (${code})` : ''}: ${err?.message || err}`;
    }
  }
  return probe;
}
