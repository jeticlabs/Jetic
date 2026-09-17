import { BehavioralModel, Environment } from '@jetic/model';
import { JeticMemory } from '@jetic/memory';
import { faker } from '@faker-js/faker';

// ── Step condition ──────────────────────────────────────────────────────────
// Evaluated before the step executes. If the condition is not met, the step
// is skipped (counts as passed so the workflow continues).
export interface StepCondition {
  /** Template expression to resolve, e.g. "{{workflow:role}}" */
  if: string;
  /** Resolved value must equal this string */
  equals?: string;
  /** Resolved value must NOT equal this string */
  notEquals?: string;
  /** Resolved value must contain this substring */
  contains?: string;
  /** true → value must be non-empty; false → value must be empty */
  exists?: boolean;
  /** Numeric greater-than comparison */
  greaterThan?: number;
  /** Numeric less-than comparison */
  lessThan?: number;
  /** Resolved value must be in this list */
  in?: string[];
}

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
  /** Skip this step when condition is not met. */
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
  expectedStatus: number;
  actualStatus: number;
  durationMs: number;
  passed: boolean;
  /** True when the step was skipped due to a condition not matching. */
  skipped: boolean;
  /** Number of retry attempts made (0 = first attempt succeeded or no retry). */
  retryCount: number;
  /** Set when onFailure was evaluated after a step failed. */
  failureHandling?: 'aborted' | 'continued';
  /** Set when the step had a condition; shows the resolved value + match result. */
  conditionResult?: { evaluated: string; matched: boolean };
  requestHeaders: Record<string, string>;
  requestBody: Record<string, any>;
  responseBody: any;
  capturedMemory: string[];
  error?: string;
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

export class WorkflowSimulator {
  constructor(
    private model: BehavioralModel,
    private environment: Environment
  ) {}

  public async simulateWorkflow(
    workflow: WorkflowDef,
    options?: { clearMemory?: boolean }
  ): Promise<WorkflowSimulationResult> {
    if (options?.clearMemory) {
      JeticMemory.clearAllMemory();
    }

    const baseUrl = this.environment.baseUrl;
    const startTime = Date.now();
    const stepResults: WorkflowStepResult[] = [];
    let allPassed = true;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepStartTime = Date.now();

      // ── Condition gate ────────────────────────────────────────────────────
      // If the step declares a condition and it resolves to false, skip the
      // step entirely. Skipped steps count as passed so the workflow continues.
      if (step.condition) {
        const condResult = await this.evaluateCondition(step.condition);
        if (!condResult.matched) {
          stepResults.push({
            stepIndex: i + 1,
            name: step.name || `${step.method} ${step.path}`,
            method: step.method,
            path: step.path,
            targetUrl: '',
            expectedStatus: step.expectStatus ?? 200,
            actualStatus: 0,
            durationMs: Date.now() - stepStartTime,
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
      const { headers: injectedHeaders, body: injectedBody } = await this.resolveInjections(step.inject);
      const resolvedBody = await this.resolveBodyTemplates(step.body || {});
      const finalBody = { ...injectedBody, ...resolvedBody };
      const inputCaptured = await this.captureInputToMemory(step.captureInput, finalBody);
      const resolvedPath = await this.resolvePathParams(step.path, finalBody);
      const fullUrl = `${baseUrl.replace(/\/$/, '')}${resolvedPath}`;
      const expectedStatus = step.expectStatus ?? 200;

      // ── Retry loop ────────────────────────────────────────────────────────
      // Per-step retry takes precedence over the workflow-level global default.
      const maxAttempts = Math.max(1, step.retry?.times ?? workflow.retry?.times ?? 1);
      const retryDelayMs = step.retry?.delayMs ?? workflow.retry?.delayMs ?? 0;

      let attempts = 0;
      let responseStatus = 0;
      let responseBody: any = null;
      let stepPassed = false;
      let errorMsg: string | undefined;

      while (attempts < maxAttempts) {
        attempts++;
        if (attempts > 1 && retryDelayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, retryDelayMs));
        }
        responseStatus = 0;
        responseBody = null;
        errorMsg = undefined;

        try {
          const fetchOptions: RequestInit = {
            method: step.method.toUpperCase(),
            headers: { 'Content-Type': 'application/json', ...injectedHeaders },
          };

          if (!['GET', 'HEAD'].includes(step.method.toUpperCase()) && Object.keys(finalBody).length > 0) {
            fetchOptions.body = JSON.stringify(finalBody);
          }

          let finalUrl = fullUrl;
          if (['GET', 'HEAD'].includes(step.method.toUpperCase()) && Object.keys(finalBody).length > 0) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(finalBody)) {
              if (v !== undefined && v !== null) params.set(k, String(v));
            }
            finalUrl = `${fullUrl}?${params.toString()}`;
          }

          const resp = await fetch(finalUrl, fetchOptions);
          responseStatus = resp.status;

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
          errorMsg = err.message || String(err);
        }
      }

      // ── Captures (only when step passed) ─────────────────────────────────
      const responseCaptured = stepPassed
        ? await this.captureToMemory(step.capture, responseBody)
        : [];

      // ── onFailure handling ────────────────────────────────────────────────
      if (!stepPassed) {
        allPassed = false;
        const onFailure = step.onFailure ?? 'abort';

        stepResults.push({
          stepIndex: i + 1,
          name: step.name || `${step.method} ${step.path}`,
          method: step.method,
          path: step.path,
          targetUrl: fullUrl,
          expectedStatus,
          actualStatus: responseStatus,
          durationMs: Date.now() - stepStartTime,
          passed: false,
          skipped: false,
          retryCount: attempts - 1,
          failureHandling: onFailure === 'continue' ? 'continued' : 'aborted',
          requestHeaders: injectedHeaders,
          requestBody: finalBody,
          responseBody,
          capturedMemory: [...inputCaptured],
          error: errorMsg,
        });

        if (onFailure === 'abort') break;
        // onFailure === 'continue': log the failure and proceed to next step
        continue;
      }

      stepResults.push({
        stepIndex: i + 1,
        name: step.name || `${step.method} ${step.path}`,
        method: step.method,
        path: step.path,
        targetUrl: fullUrl,
        expectedStatus,
        actualStatus: responseStatus,
        durationMs: Date.now() - stepStartTime,
        passed: true,
        skipped: false,
        retryCount: attempts - 1,
        requestHeaders: injectedHeaders,
        requestBody: finalBody,
        responseBody,
        capturedMemory: [...inputCaptured, ...responseCaptured],
      });
    }

    const totalTimeMs = Date.now() - startTime;

    return {
      success: allPassed,
      workflow: {
        name: workflow.name,
        description: workflow.description,
        stepsCount: workflow.steps.length,
      },
      environment: {
        name: this.environment.name,
        baseUrl,
      },
      stats: {
        totalSteps: workflow.steps.length,
        executedSteps: stepResults.length,
        passedSteps: stepResults.filter((r) => r.passed).length,
        failedSteps: stepResults.filter((r) => !r.passed).length,
        totalTimeMs,
      },
      results: stepResults,
    };
  }

  // ── Condition evaluator ────────────────────────────────────────────────────
  // Resolves the `if` template and applies the declared operator. Returns
  // `matched: true` when the condition passes (step should execute).
  private async evaluateCondition(
    condition: StepCondition
  ): Promise<{ matched: boolean; evaluated: string }> {
    const evaluated = await this.resolveTemplateString(condition.if);
    let matched: boolean;

    if (condition.exists !== undefined) {
      const hasValue =
        evaluated !== '' && evaluated !== 'null' && evaluated !== 'undefined';
      matched = condition.exists ? hasValue : !hasValue;
    } else if (condition.equals !== undefined) {
      matched = evaluated === condition.equals;
    } else if (condition.notEquals !== undefined) {
      matched = evaluated !== condition.notEquals;
    } else if (condition.contains !== undefined) {
      matched = evaluated.includes(condition.contains);
    } else if (condition.greaterThan !== undefined) {
      matched = Number(evaluated) > condition.greaterThan;
    } else if (condition.lessThan !== undefined) {
      matched = Number(evaluated) < condition.lessThan;
    } else if (condition.in !== undefined) {
      matched = condition.in.includes(evaluated);
    } else {
      // No explicit operator — truthy check (non-empty, not 'false'/'0'/'null')
      matched =
        evaluated !== '' &&
        evaluated !== 'false' &&
        evaluated !== '0' &&
        evaluated !== 'null' &&
        evaluated !== 'undefined';
    }

    return { matched, evaluated };
  }

  private async resolveTemplateString(value: string): Promise<string> {
    const templateRe = /\{\{([^}]+)\}\}/g;
    let match: RegExpExecArray | null;
    const replacements: Array<{ placeholder: string; resolved: string }> = [];

    while ((match = templateRe.exec(value)) !== null) {
      const expr = match[1].trim();

      if (expr.includes(':') && !expr.startsWith('faker.')) {
        const colonIdx = expr.indexOf(':');
        const scope = expr.slice(0, colonIdx);
        const key = expr.slice(colonIdx + 1);
        if (scope === 'human') {
          // Interactive value: JETIC_HUMAN_<KEY> env or pre-seeded `human:key`
          // memory (see `jetic memory set human:<key>`). Non-interactive
          // runners (like this one) never prompt — unset resolves to ''.
          const envVal = process.env[`JETIC_HUMAN_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
          if (envVal !== undefined && envVal !== '') {
            replacements.push({ placeholder: match[0], resolved: envVal });
            continue;
          }
        }
        const mem = new JeticMemory({ scope });
        const memVal = await mem.get(key);
        replacements.push({ placeholder: match[0], resolved: memVal != null ? String(memVal) : '' });
        continue;
      }

      if (expr.startsWith('faker.')) {
        const parts = expr.split('.');
        try {
          let fn: any = faker;
          for (const part of parts.slice(1)) fn = fn[part];
          const generated = typeof fn === 'function' ? fn() : fn;
          replacements.push({ placeholder: match[0], resolved: String(generated) });
        } catch {
          replacements.push({ placeholder: match[0], resolved: expr });
        }
        continue;
      }

      replacements.push({ placeholder: match[0], resolved: match[0] });
    }

    let result = value;
    for (const { placeholder, resolved } of replacements) {
      result = result.replace(placeholder, resolved);
    }
    return result;
  }

  private async resolveBodyTemplates(body: Record<string, any>): Promise<Record<string, any>> {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      resolved[key] = typeof value === 'string' ? await this.resolveTemplateString(value) : value;
    }
    return resolved;
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
        const scopedMemory = new JeticMemory({ scope });
        const value = await scopedMemory.get(key);
        if (value === null) continue;
        strValue = typeof value === 'string' ? value : JSON.stringify(value);
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
      const memory = new JeticMemory({ scope });
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
      const memory = new JeticMemory({ scope });
      await memory.set(key, value);
      captured.push(`${scope}:${key} = ${JSON.stringify(value)}`);
    }

    return captured;
  }

  private async resolvePathParams(urlPath: string, body: Record<string, any>): Promise<string> {
    let result = urlPath;
    const paramMatches = urlPath.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (!paramMatches) return result;

    for (const p of paramMatches) {
      const paramName = p.substring(1);
      if (body[paramName] !== undefined) {
        result = result.replace(p, String(body[paramName]));
      } else {
        const memory = new JeticMemory({ scope: 'workflow' });
        const memVal = await memory.get(paramName);
        if (memVal !== null) {
          result = result.replace(p, String(memVal));
        }
      }
    }
    return result;
  }
}
