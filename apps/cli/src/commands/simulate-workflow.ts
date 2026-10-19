import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';
import { loadConfig, readJsonSync } from '@jetic/core';
import { BehavioralModel, Environment } from '@jetic/model';
import { loadWorkflowByName } from '@jetic/model';
import { JeticMemory } from '@jetic/memory';
import {
  RulesCondition,
  StepCondition,
  conditionKind,
  describeInvalidCondition,
  evaluateLegacyCondition,
  evaluateRules,
  isRulesCondition,
  probeTarget,
  networkErrorCode,
  CONNECTION_ERROR_CODES,
} from '@jetic/simulator';
import { faker } from '@faker-js/faker';

// ─── ANSI Helpers ──────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgCyan: '\x1b[46m',
  black: '\x1b[30m',
};

const TICK   = `${c.green}✓${c.reset}`;
const CROSS  = `${c.red}✗${c.reset}`;
const SKIP   = `${c.yellow}⊘${c.reset}`;
const ARROW  = `${c.cyan}→${c.reset}`;
const CHAIN  = `${c.dim}│${c.reset}`;
const SEP    = `${c.dim}──────────────────────────────────────────────────${c.reset}`;

// ─── Spinner ──────────────────────────────────────────────────────────────────

class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private idx = 0;
  private interval: NodeJS.Timeout | null = null;

  start(message: string) {
    this.idx = 0;
    this.interval = setInterval(() => {
      const frame = this.frames[this.idx % this.frames.length];
      process.stdout.write(`\r  ${c.cyan}${frame}${c.reset} ${message}`);
      this.idx++;
    }, 80);
  }

  stop(finalMessage?: string) {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    if (finalMessage) process.stdout.write(`\r${finalMessage}\x1b[K\n`);
    else process.stdout.write(`\r\x1b[K`);
  }
}

// ─── Workflow JSON types ───────────────────────────────────────────────────────

// ─── Condition Types ──────────────────────────────────────────────────────────

// Condition types and operator logic are shared with the other runners: see @jetic/simulator conditions.

export interface WorkflowStepDef {
  /** Step label e.g. "Register User" */
  name: string;
  /** HTTP method */
  method: string;
  /** Endpoint path from the model e.g. "/api/auth/register" */
  path: string;
  /** Description of what this step does */
  description?: string;
  /**
   * Memory keys to read and inject before executing this step.
   * Format: { "Authorization": "workflow:accessToken" } means read
   * key `accessToken` from scope `workflow` and set request header `Authorization`.
   * Prefix with `header:` for headers, `body:` for body fields (default: header).
   */
  inject?: Record<string, string>;
  /**
   * Response fields to capture into Jetic memory after a successful step.
   * Format: { "workflow:accessToken": "data.accessToken" } means read
   * `data.accessToken` from the response body and store it under key
   * `accessToken` in scope `workflow`.
   */
  capture?: Record<string, string>;
  /**
   * Request body fields to capture into Jetic memory BEFORE the HTTP call.
   * Useful for saving faker-generated values (email, password, etc.) so that
   * later steps can reference them via {{workflow:key}}.
   * Format: { "workflow:adminEmail": "admin_email" } reads the resolved
   * request body field `admin_email` and stores it as `workflow:adminEmail`.
   */
  captureInput?: Record<string, string>;
  /** Expected HTTP status code (default 200) */
  expectStatus?: number;
  /** Hardcoded request body overrides */
  body?: Record<string, any>;
  /**
   * Optional condition. A rules condition is evaluated after the step runs and `onFail` controls
   * whether to abort, continue, or switch to another workflow. A legacy `{ if, equals… }` guard is
   * evaluated before the step and skips it on a miss. Anything else fails the step.
   */
  condition?: StepCondition;
}

export interface WorkflowDef {
  name: string;
  description?: string;
  generatedAt: string;
  environment?: string;
  steps: WorkflowStepDef[];
}

// ─── Deep-get value from object using dot-notation ────────────────────────────

function deepGet(obj: any, dotPath: string): any {
  const parts = dotPath.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

// ─── Trace body truncation ────────────────────────────────────────────────────
// Persisted traces are meant to be readable (curl-like), not data dumps: oversized
// response bodies are stored as a truncated preview with a marker.

const TRACE_BODY_CAP = 16_384;

function truncateTraceBody(value: any): any {
  if (value === undefined || value === null) return value;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (serialized.length <= TRACE_BODY_CAP) return value;
  return typeof value === 'string'
    ? `${value.slice(0, TRACE_BODY_CAP)}\n…[truncated: ${serialized.length - TRACE_BODY_CAP} more characters]`
    : { _truncated: true, preview: serialized.slice(0, TRACE_BODY_CAP), fullLengthChars: serialized.length };
}

// ─── Condition Evaluator ──────────────────────────────────────────────────────
// Resolves {{scope:key}} refs from JeticMemory; the operators live in @jetic/simulator.

async function resolveConditionRef(ref: string, context = 'condition'): Promise<string> {
  return ref.replace(/\{\{([^}]+)\}\}/g, () => '').trim() === ref.trim()
    ? ref // literal value, no templates
    : await resolveTemplateString(ref, context);
}

async function evaluateStepCondition(
  condition: RulesCondition,
  context = 'condition',
): Promise<{ passed: boolean; reason: string }> {
  return evaluateRules(condition.rules, (value) => resolveConditionRef(value, context));
}

/**
 * Handles conditions that decide BEFORE the step runs. Returns a finished result when the step
 * must not execute — a legacy guard that missed (skipped, counts as passed) or an unrecognized
 * condition (failed: it is never silently ignored) — or null to run the step normally.
 */
async function preStepCondition(step: WorkflowStepDef): Promise<StepResult | null> {
  if (!step.condition) return null;
  const label = step.name || `${step.method} ${step.path}`;
  const now = new Date().toISOString();
  const base: StepResult = {
    step,
    status: 0,
    responseBody: null,
    durationMs: 0,
    startedAt: now,
    finishedAt: now,
    passed: false,
    captured: [],
    injected: {},
    requestHeaders: {},
    requestBody: {},
    resolvedUrl: '',
  };

  const kind = conditionKind(step.condition);
  if (kind === 'invalid') {
    return { ...base, passed: false, error: `Step "${label}": ${describeInvalidCondition(step.condition)}` };
  }
  if (kind === 'legacy') {
    const outcome = await evaluateLegacyCondition(step.condition as any, (value) =>
      resolveConditionRef(value, `condition of step "${label}"`)
    );
    if (!outcome.matched) {
      return {
        ...base,
        passed: true,
        skipped: true,
        conditionResult: { passed: false, reason: `legacy guard not met (resolved "${outcome.evaluated}")` },
      };
    }
  }
  return null;
}

// ─── Human input ({{human:key}}) ─────────────────────────────────────────────
// Interactive values the runner cannot know beforehand (OTP/2FA codes,
// CAPTCHAs, real personal secrets). Resolution order:
//   1. JETIC_HUMAN_<KEY> env var (uppercased, non-alphanumeric → _)
//   2. Jetic memory scope `human` (saved after the first manual entry)
//   3. Interactive terminal prompt (TTY only) — waits for the human, then saves
//      to memory so later steps/reruns reuse it without asking again.

function envKeyForHuman(key: string): string {
  return `JETIC_HUMAN_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/** Thrown when {{human:key}} cannot be resolved (non-interactive shell, nothing pre-seeded). */
export class HumanInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HumanInputError';
  }
}

/** Heuristic: mask terminal echo for secret-looking keys. */
function isSecretHumanKey(key: string): boolean {
  return /pass|secret|token|pwd|private|credential/i.test(key);
}

async function promptLine(question: string): Promise<string> {
  const readline = await (new Function('modulePath', 'return import(modulePath)') as any)('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function promptSecret(question: string): Promise<string> {
  const readline = await (new Function('modulePath', 'return import(modulePath)') as any)('node:readline');
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    const w = rl as unknown & { _writeToOutput(s: string): void; output: NodeJS.WriteStream };
    const orig = w._writeToOutput.bind(rl);
    w._writeToOutput = (s: string) => {
      // Mask typed characters with '*', keep line breaks intact.
      if (s === '\n' || s === '\r\n' || s === '\r') orig(s);
      else w.output.write('*'.repeat(s.length));
    };
    rl.question('', (answer: string) => {
      w._writeToOutput = orig;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function askHuman(key: string, context?: string): Promise<string> {
  const envName = envKeyForHuman(key);
  const fromEnv = process.env[envName];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;

  const mem = new JeticMemory({ scope: 'human' });
  const cached = await mem.get(key);
  if (cached !== null && cached !== undefined && String(cached) !== '') {
    console.log(`  ${c.dim}↳ using saved human value for "${key}" (jetic memory set human:${key} … to change)${c.reset}`);
    return String(cached);
  }

  if (!process.stdin.isTTY) {
    throw new HumanInputError(
      `Workflow needs human input for "{{human:${key}}}"${context ? ` (${context})` : ''} but the terminal is not interactive. ` +
      `Pre-seed it with: jetic memory set human:${key} <value>  — or export ${envName}=<value>`
    );
  }

  console.log(`\n  ${c.yellow}${c.bold}◉ Human input required${c.reset}${context ? `  ${c.dim}${context}${c.reset}` : ''}`);
  const question = `  ${c.cyan}Enter value for "${key}":${c.reset} `;
  const value = isSecretHumanKey(key) ? await promptSecret(question) : await promptLine(question);

  if (value !== '') {
    await mem.set(key, value);
    console.log(`  ${c.dim}↳ saved to human:${key} memory (reused automatically next time)${c.reset}\n`);
  } else {
    console.log(`  ${c.dim}↳ empty value accepted for "${key}" (not saved)${c.reset}\n`);
  }
  return value;
}

// ─── Shared template string resolver ────────────────────────────────────────
// Resolves all {{faker.*}}, {{scope:key}} and {{human:key}} placeholders.

async function resolveTemplateString(value: string, context?: string): Promise<string> {
  const templateRe = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  const replacements: Array<{ placeholder: string; resolved: string }> = [];

  while ((match = templateRe.exec(value)) !== null) {
    const expr = match[1].trim();

    // ── human:key  → interactive prompt (waits for the human) ────────
    if (!expr.startsWith('faker.')) {
      const colonIdx = expr.indexOf(':');
      if (colonIdx > 0 && expr.slice(0, colonIdx) === 'human') {
        const key = expr.slice(colonIdx + 1);
        replacements.push({ placeholder: match[0], resolved: await askHuman(key, context) });
        continue;
      }
    }

    // ── scope:key  → read from JeticMemory ───────────────────────────
    if (expr.includes(':') && !expr.startsWith('faker.')) {
      const colonIdx = expr.indexOf(':');
      const scope = expr.slice(0, colonIdx);
      const key   = expr.slice(colonIdx + 1);
      const mem   = new JeticMemory({ scope });
      const memVal = await mem.get(key);
      replacements.push({ placeholder: match[0], resolved: memVal != null ? String(memVal) : '' });
      continue;
    }

    // ── faker.x.y  → call faker dynamically ──────────────────────────
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

    // Unknown — leave as-is
    replacements.push({ placeholder: match[0], resolved: match[0] });
  }

  let result = value;
  for (const { placeholder, resolved } of replacements) {
    result = result.replace(placeholder, resolved);
  }
  return result;
}

// ─── Resolve {{faker.*}} and {{scope:*}} templates in body values (deep) ──────

async function resolveDeepValue(value: any, context?: string): Promise<any> {
  if (typeof value === 'string') return resolveTemplateString(value, context);
  if (Array.isArray(value)) {
    const out: any[] = [];
    for (const item of value) out.push(await resolveDeepValue(item, context));
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) out[key] = await resolveDeepValue(item, context);
    return out;
  }
  return value;
}

async function resolveBodyTemplates(
  body: Record<string, any>,
  context?: string,
): Promise<Record<string, any>> {
  const resolved: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    resolved[key] = await resolveDeepValue(value, context);
  }
  return resolved;
}

// ─── Resolve memory injections into request headers/body ─────────────────────
// inject values support two forms:
//   1. Plain memory key:  "workflow:accessToken"  (legacy, direct lookup)
//   2. Template string:   "Bearer {{workflow:accessToken}}"  (resolved via resolveTemplateString)

async function resolveInjections(
  inject: Record<string, string> | undefined,
  memory: JeticMemory,
  allMemory: JeticMemory,
  context?: string,
): Promise<{ headers: Record<string, string>; body: Record<string, any> }> {
  const headers: Record<string, string> = {};
  const body: Record<string, any> = {};
  if (!inject) return { headers, body };

  for (const [target, memKeyOrTemplate] of Object.entries(inject)) {
    let strValue: string;

    if (memKeyOrTemplate.includes('{{')) {
      // Template mode: resolve {{...}} placeholders (supports Bearer prefix etc.)
      strValue = await resolveTemplateString(memKeyOrTemplate, context);
    } else {
      // Legacy mode: treat as a direct "scope:key" memory reference
      const [scope, key] = memKeyOrTemplate.includes(':')
        ? memKeyOrTemplate.split(':', 2)
        : ['workflow', memKeyOrTemplate];
      const scopedMemory = new JeticMemory({ scope });
      const value = await scopedMemory.get(key);
      if (value === null) continue;
      strValue = typeof value === 'string' ? value : JSON.stringify(value);
    }

    // Same auto-prefix rule as the MCP/library simulator: a bare token put into an
    // Authorization header becomes "Bearer <token>"; values already carrying any
    // auth scheme ("Bearer x", "Basic y", …) are left untouched.
    const headerName = target.startsWith('header:')
      ? target.slice(7)
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
      // Default: treat as header
      headers[target] = strValue;
    }
  }

  return { headers, body };
}

// ─── Capture response values into Jetic memory ───────────────────────────────

async function captureToMemory(
  capture: Record<string, string> | undefined,
  responseBody: any,
): Promise<string[]> {
  const captured: string[] = [];
  if (!capture || !responseBody) return captured;

  for (const [memKey, responsePath] of Object.entries(capture)) {
    const value = deepGet(responseBody, responsePath);
    if (value === undefined || value === null) continue;

    const [scope, key] = memKey.includes(':') ? memKey.split(':', 2) : ['workflow', memKey];
    const memory = new JeticMemory({ scope });
    await memory.set(key, value);
    captured.push(`${scope}:${key} ← ${responsePath}`);
  }

  return captured;
}

// ─── Capture resolved REQUEST BODY fields into Jetic memory (pre-call) ────────

async function captureInputToMemory(
  captureInput: Record<string, string> | undefined,
  resolvedBody: Record<string, any>,
): Promise<string[]> {
  const captured: string[] = [];
  if (!captureInput) return captured;

  for (const [memKey, bodyField] of Object.entries(captureInput)) {
    const value = resolvedBody[bodyField];
    if (value === undefined || value === null) continue;

    const [scope, key] = memKey.includes(':') ? memKey.split(':', 2) : ['workflow', memKey];
    const memory = new JeticMemory({ scope });
    await memory.set(key, value);
    captured.push(`${scope}:${key} ← request.${bodyField}`);
  }

  return captured;
}

// ─── Replace path params with values from memory or body ─────────────────────

async function resolvePathParams(
  urlPath: string,
  body: Record<string, any>,
): Promise<string> {
  // e.g. /api/workspaces/:id → try to find :id in memory or body
  return urlPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, param) => {
    // Check body first
    if (body[param] !== undefined) return String(body[param]);
    // Fallback to common memory keys
    return `:${param}`; // leave as-is if not found
  });
}

// ─── Execute a single workflow step ──────────────────────────────────────────

interface StepResult {
  step: WorkflowStepDef;
  status: number;
  responseBody: any;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  captured: string[];
  error?: string;
  injected: Record<string, string>;
  /** Headers actually sent (Content-Type default + injections, incl. the real Bearer value). */
  requestHeaders: Record<string, string>;
  /** Resolved request body (templates replaced) — what was really sent. */
  requestBody: Record<string, any>;
  /** Final URL including query string, exactly as requested. */
  resolvedUrl: string;
  responseHeaders?: Record<string, string>;
  /** The failure was a network-level connection error (target unreachable). */
  connectionError?: boolean;
  conditionResult?: { passed: boolean; reason: string };
  /** A legacy guard did not match, so the step was not run. */
  skipped?: boolean;
}

/** Default per-request timeout, matching the MCP/library simulator. */
const REQUEST_TIMEOUT_MS = 30_000;

async function executeStep(
  step: WorkflowStepDef,
  baseUrl: string,
  defaultBody: Record<string, any>,
): Promise<StepResult> {
  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();

  // Resolve memory injections
  const memory = new JeticMemory({ scope: 'workflow' });
  const stepLabel = step.name || `${step.method} ${step.path}`;
  const { headers, body: injectedBody } = await resolveInjections(step.inject, memory, memory, stepLabel);

  // Resolve {{faker.*}} / {{workflow:*}} / {{human:*}} templates in the step body
  const resolvedStepBody = await resolveBodyTemplates(step.body || {}, stepLabel);

  // Merge body: step.body overrides defaults, injectedBody adds to body
  const requestBody = { ...defaultBody, ...injectedBody, ...resolvedStepBody };

  // Capture resolved request body fields into memory BEFORE the HTTP call
  // so subsequent steps can reference faker-generated values via {{workflow:key}}
  const inputCaptured = await captureInputToMemory(step.captureInput, requestBody);

  // Resolve path params
  const resolvedPath = await resolvePathParams(step.path, requestBody);
  const url = `${baseUrl.replace(/\/$/, '')}${resolvedPath}`;

  const expectedStatus = step.expectStatus ?? 200;
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };

  try {
    const fetchOptions: RequestInit = {
      method: step.method.toUpperCase(),
      headers: requestHeaders,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    // Only add body for non-GET/HEAD requests
    if (!['GET', 'HEAD'].includes(step.method.toUpperCase()) && Object.keys(requestBody).length > 0) {
      fetchOptions.body = JSON.stringify(requestBody);
    }

    // Add query params for GET requests
    let finalUrl = url;
    if (['GET', 'HEAD'].includes(step.method.toUpperCase()) && Object.keys(requestBody).length > 0) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(requestBody)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      finalUrl = `${url}?${params.toString()}`;
    }

    const response = await fetch(finalUrl, fetchOptions);
    const durationMs = Date.now() - startTime;

    let responseBody: any = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { responseBody = await response.json(); } catch { responseBody = null; }
    } else {
      responseBody = await response.text();
    }

    const passed = response.status === expectedStatus || (response.status >= 200 && response.status < 300 && expectedStatus >= 200 && expectedStatus < 300);

    // Capture response fields into memory
    const captured = passed
      ? await captureToMemory(step.capture, responseBody)
      : [];

    return {
      step,
      status: response.status,
      responseBody,
      durationMs,
      startedAt,
      finishedAt: new Date().toISOString(),
      passed,
      captured: [...inputCaptured, ...captured],
      injected: headers,
      requestHeaders,
      requestBody,
      resolvedUrl: finalUrl,
      responseHeaders: Object.fromEntries(response.headers.entries()),
    };
  } catch (err: any) {
    const code = networkErrorCode(err);
    let message = err.message || String(err);
    if (err?.name === 'TimeoutError' || code === 'ETIMEDOUT') {
      message = `Request timed out after ${REQUEST_TIMEOUT_MS}ms (${step.method} ${resolvedPath}).`;
    } else if (code === 'ECONNREFUSED') {
      message = `Connection refused (ECONNREFUSED) at ${baseUrl} — the server is not accepting connections.`;
    }
    return {
      step,
      status: 0,
      responseBody: null,
      durationMs: Date.now() - startTime,
      startedAt,
      finishedAt: new Date().toISOString(),
      passed: false,
      captured: inputCaptured,
      error: message,
      injected: headers,
      requestHeaders,
      requestBody,
      resolvedUrl: url,
      connectionError: code ? CONNECTION_ERROR_CODES.has(code) : false,
    };
  }
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

function formatStatus(status: number): string {
  if (status === 0) return `${c.dim}NO RESPONSE${c.reset}`;
  if (status >= 200 && status < 300) return `${c.green}${status}${c.reset}`;
  if (status >= 300 && status < 400) return `${c.yellow}${status}${c.reset}`;
  if (status >= 400 && status < 500) return `${c.red}${status}${c.reset}`;
  return `${c.red}${c.bold}${status}${c.reset}`;
}

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':    return c.green;
    case 'POST':   return c.yellow;
    case 'PUT':    return c.cyan;
    case 'PATCH':  return c.magenta;
    case 'DELETE': return c.red;
    default:       return c.white;
  }
}

function renderStepResult(result: StepResult, index: number, total: number): void {
  const icon = result.error ? CROSS : (result.passed ? TICK : CROSS);
  const mc = getMethodColor(result.step.method);
  const method = `${mc}${result.step.method.padEnd(6)}${c.reset}`;
  const statusStr = formatStatus(result.status);
  const timeStr = `${c.dim}${result.durationMs}ms${c.reset}`;

  console.log(`  ${icon} ${c.bold}Step ${index + 1}/${total}${c.reset}  ${method} ${c.bold}${result.step.path}${c.reset}  ${statusStr}  ${timeStr}`);
  if (result.step.name) {
    console.log(`  ${CHAIN}   ${c.italic}${c.dim}${result.step.name}${c.reset}`);
  }

  // Show injected headers
  if (Object.keys(result.injected).length > 0) {
    for (const [k, v] of Object.entries(result.injected)) {
      const preview = v.length > 50 ? v.substring(0, 47) + '...' : v;
      console.log(`  ${CHAIN}   ${c.dim}📥 inject ${k}: ${preview}${c.reset}`);
    }
  }

  // Show captured memory
  if (result.captured.length > 0) {
    for (const cap of result.captured) {
      console.log(`  ${CHAIN}   ${c.green}💾 captured ${cap}${c.reset}`);
    }
  }

  // Show condition evaluation result
  if (result.skipped) {
    console.log(`  ${CHAIN}   ${c.yellow}⊘ skipped${c.reset}  ${c.dim}${result.conditionResult?.reason ?? ''}${c.reset}`);
  } else if (result.conditionResult) {
    const { passed: condPassed, reason } = result.conditionResult;
    const condIcon = condPassed ? `${c.magenta}◇${c.reset}` : `${c.yellow}◈${c.reset}`;
    const condColor = condPassed ? c.magenta : c.yellow;
    console.log(`  ${CHAIN}   ${condIcon} ${condColor}condition ${condPassed ? 'passed' : 'failed'}${c.reset}  ${c.dim}${reason}${c.reset}`);
    if (!condPassed && isRulesCondition(result.step.condition)) {
      const { onFail, switchToWorkflow } = result.step.condition;
      const actionStr = onFail === 'switch'
        ? `switching to workflow: ${switchToWorkflow ?? 'unknown'}`
        : onFail === 'continue'
        ? 'continuing without remaining steps'
        : 'aborting workflow';
      console.log(`  ${CHAIN}   ${c.yellow}  → ${actionStr}${c.reset}`);
    }
  }

  // Show error
  if (result.error) {
    console.log(`  ${CHAIN}   ${c.red}Error: ${result.error}${c.reset}`);
  }

  // Show response body preview on failure
  if (!result.passed && result.responseBody && !result.error) {
    const preview = typeof result.responseBody === 'string'
      ? result.responseBody
      : JSON.stringify(result.responseBody, null, 2);
    console.log(`  ${CHAIN}   ${c.red}Response: ${preview}${c.reset}`);
  }

  console.log('');
}

function renderWorkflowHeader(workflow: WorkflowDef): void {
  console.log('');
  console.log(`  ${c.bold}${workflow.name}${c.reset}`);
  if (workflow.description) {
    console.log(`  ${c.dim}${workflow.description}${c.reset}`);
  }
  console.log('');
  console.log(`  ${c.dim}${workflow.steps.length} steps${c.reset}`);

  // Print the workflow graph
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const mc = getMethodColor(step.method);
    const label = `${mc}${step.method}${c.reset} ${step.path}`;
    if (i === 0) {
      console.log(`  ${c.cyan}┌─${c.reset} ${c.bold}${label}${c.reset}  ${c.dim}${step.name}${c.reset}`);
    } else if (i === workflow.steps.length - 1) {
      console.log(`  ${c.cyan}└─${c.reset} ${label}  ${c.dim}${step.name}${c.reset}`);
    } else {
      console.log(`  ${c.cyan}├─${c.reset} ${label}  ${c.dim}${step.name}${c.reset}`);
    }
  }
  console.log('');
}

function renderWorkflowSummary(results: StepResult[], totalMs: number): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const elapsed = (totalMs / 1000).toFixed(2);

  //console.log(SEP);
  const allPassed = failed === 0;
  const icon = allPassed ? `${c.green}✅${c.reset}` : `${c.red}❌${c.reset}`;
  const label = allPassed
    ? `${c.green}${c.bold}Workflow Complete!${c.reset}`
    : `${c.red}${c.bold}Workflow Failed${c.reset}`;

  console.log(`  ${icon} ${label}  ${c.dim}${elapsed}s${c.reset}`);
  console.log('');

  const parts: string[] = [];
  if (passed > 0) parts.push(`${c.green}${passed} passed${c.reset}`);
  if (failed > 0) parts.push(`${c.red}${failed} failed${c.reset}`);
  console.log(`  ${parts.join(`  ${c.dim}│${c.reset}  `)}`);
 // console.log(SEP);
  console.log('');
}

// ─── Environment selector (simple for workflow) ───────────────────────────────

async function pickEnvironment(model: BehavioralModel): Promise<string> {
  const envs = model.environments || [];
  if (envs.length === 0) {
    console.log(`  ${c.yellow}⚠${c.reset}  No environments in model.json. Using ${c.bold}http://localhost:3000${c.reset}\n`);
    return 'http://localhost:3000';
  }
  if (envs.length === 1) {
    const env = envs[0];
    console.log(`  ${c.cyan}🌍${c.reset} Environment: ${c.bold}${env.name}${c.reset}  ${c.dim}${env.baseUrl}${c.reset}\n`);
    return env.baseUrl;
  }

  // Default to first (non-interactive for now; extend with selector if desired)
  const env = envs[0];
  console.log(`  ${c.cyan}🌍${c.reset} Using environment: ${c.bold}${env.name}${c.reset}  ${c.dim}${env.baseUrl}${c.reset}`);
  console.log(`  ${c.dim}(Pass --env <name> to choose a different environment)${c.reset}\n`);
  return env.baseUrl;
}

// ─── Command: jetic simulate workflow ────────────────────────────────────────

export const simulateWorkflowCommand = new Command('workflow')
  .description('Execute a saved multi-step workflow against the API')
  .option('--env <name>', 'Environment name to use from model.json')
  .option('--workflow <value>', 'Workflow slug or file path to execute')
  .option('--clear-memory', 'Clear Jetic memory before running', false)
  .option('--list', 'List all available workflows in .jetic/workflows/')
  .action(async (options: {
    env?: string;
    workflow?: string;
    clearMemory?: boolean;
    list?: boolean;
  }) => {
    const config = loadConfig();
    const jeticDir = config.jeticDir;
    const workflowsDir = path.join(jeticDir, 'workflows');

    // ── --list mode ──────────────────────────────────────────────────────────
    if (options.list) {
      console.log('');
      console.log(`  ${c.bgCyan}${c.black}${c.bold} JETIC ${c.reset}  ${c.cyan}${c.bold}Available Workflows${c.reset}`);
      console.log('');

      const slugs: string[] = [];
      if (fs.existsSync(workflowsDir)) {
        fs.readdirSync(workflowsDir)
          .filter(f => f.endsWith('.json'))
          .forEach(f => slugs.push(f.replace(/\.json$/, '')));
      }

      const legacyPath = path.join(jeticDir, 'workflow.json');
      const hasLegacy = fs.existsSync(legacyPath);

      if (slugs.length === 0 && !hasLegacy) {
        console.log(`  ${c.yellow}No workflows found.${c.reset}`);
        console.log(`  ${c.dim}Create a workflow file in ${workflowsDir}, then run it with --workflow <slug>.${c.reset}\n`);
        process.exit(0);
      }

      for (const slug of slugs) {
        const wfPath = path.join(workflowsDir, `${slug}.json`);
        try {
          const data = JSON.parse(fs.readFileSync(wfPath, 'utf-8'));
          console.log(`  ${c.cyan}◆${c.reset} ${c.bold}${slug}${c.reset}  ${c.dim}${data.name ?? ''}  •  ${data.steps?.length ?? 0} steps${c.reset}`);
        } catch {
          console.log(`  ${c.dim}◆ ${slug}${c.reset}`);
        }
      }

      if (hasLegacy) {
        try {
          const data = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
          console.log(`  ${c.dim}◇ workflow  (legacy .jetic/workflow.json  •  ${data.name ?? ''}  •  ${data.steps?.length ?? 0} steps)${c.reset}`);
        } catch {
          console.log(`  ${c.dim}◇ workflow (legacy)${c.reset}`);
        }
      }

      console.log('');
      process.exit(0);
    }

    if (!options.workflow) {
      console.error(`  ${c.red}Specify --workflow <slug|path> to execute a saved workflow, or use --list.${c.reset}\n`);
      process.exitCode = 2;
      return;
    }

    // ── Banner ────────────────────────────────────────────────────────────────
    console.log('');
    console.log(`  ${c.bgCyan}${c.black}${c.bold} JETIC ${c.reset}  ${c.cyan}${c.bold}Workflow Runner${c.reset}`);
    console.log('');

    // ── Load model ────────────────────────────────────────────────────────────
    const modelPath = path.join(jeticDir, 'model.json');
    const model = readJsonSync<BehavioralModel>(modelPath);

    if (!model) {
      console.error(`  ${c.red}✗${c.reset} No model.json found. Run ${c.bold}jetic scan${c.reset} first.\n`);
      process.exit(1);
    }

    console.log(`  ${c.dim}Model: ${model.project.name} • ${model.endpoints.length} endpoints${c.reset}\n`);

    // ── Optionally clear memory ───────────────────────────────────────────────
    if (options.clearMemory) {
      JeticMemory.clearAllMemory();
      console.log(`  ${c.yellow}🧹${c.reset} Jetic memory cleared\n`);
    }

    // ── Resolve workflow path ─────────────────────────────────────────────────
    let workflow: WorkflowDef;
    let workflowPath: string;

    if (options.workflow) {
      const val = options.workflow;
      // Plain slug (no path separators or .json extension) → look in .jetic/workflows/
      const isSlug = !val.includes('/') && !val.includes('\\') && !val.endsWith('.json');
      if (isSlug) {
        workflowPath = path.join(workflowsDir, `${val}.json`);
        if (!fs.existsSync(workflowPath)) {
          // Legacy convenience: slug "workflow" → .jetic/workflow.json
          const legacyPath = path.join(jeticDir, 'workflow.json');
          if (val === 'workflow' && fs.existsSync(legacyPath)) {
            workflowPath = legacyPath;
          } else {
            console.error(`  ${c.red}✗${c.reset} Workflow "${val}" not found in ${workflowsDir}\n`);
            console.error(`  ${c.dim}Run \`jetic simulate workflow --list\` to see available workflows.${c.reset}\n`);
            process.exit(1);
          }
        }
      } else {
        workflowPath = path.resolve(val);
      }

      if (!fs.existsSync(workflowPath)) {
        console.error(`  ${c.red}✗${c.reset} Workflow file not found: ${workflowPath}\n`);
        process.exit(1);
      }

      try {
        workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
        console.log(`  ${TICK} Loaded workflow: ${c.bold}${workflow.name}${c.reset}  ${c.dim}(${workflowPath})${c.reset}\n`);
      } catch {
        console.error(`  ${c.red}✗${c.reset} Failed to parse workflow file: ${workflowPath}\n`);
        process.exit(1);
      }
    } else {
      process.exitCode = 2;
      return;
    }

    // ── Pick environment ──────────────────────────────────────────────────────
    let baseUrl: string;
    const envs = model.environments || [];

    if (options.env) {
      const found = envs.find((e) => e.name === options.env);
      if (!found) {
        console.error(`  ${c.red}✗${c.reset} Environment "${options.env}" not found in model.json\n`);
        console.error(`  ${c.dim}Available: ${envs.map((e) => e.name).join(', ')}${c.reset}\n`);
        process.exit(1);
      }
      baseUrl = found.baseUrl;
      console.log(`  ${c.cyan}🌍${c.reset} Environment: ${c.bold}${found.name}${c.reset}  ${c.dim}${found.baseUrl}${c.reset}\n`);
    } else {
      baseUrl = await pickEnvironment(model);
    }

    // ── Check Backend Health ──────────────────────────────────────────────────
    // A single classified probe: "nothing listening" aborts with a real diagnostic
    // instead of every step failing with a generic "fetch failed".
    const checkSpinner = new Spinner();
    checkSpinner.start(`Checking if backend is active at ${baseUrl}...`);
    const probe = await probeTarget(baseUrl, 3000);
    if (probe.verdict === 'unreachable') {
      checkSpinner.stop();
      console.log(`  ${c.red}✗${c.reset} Backend is unreachable at ${c.bold}${baseUrl}${c.reset}`);
      console.log(`  ${c.red}${probe.message}${c.reset}`);
      console.log(`  ${c.yellow}⚠${c.reset} Start your backend project and try again.\n`);
      process.exit(1);
    }
    if (probe.verdict === 'server-error') {
      checkSpinner.stop(`  ${c.yellow}⚠${c.reset} Backend reachable but failing (HTTP ${probe.status}) at ${baseUrl}`);
      console.log(`  ${c.yellow}${probe.message}${c.reset}\n`);
    } else {
      checkSpinner.stop(`  ${c.green}✓${c.reset} Backend is active (HTTP ${probe.status})`);
      console.log('');
    }

    // ── Render workflow graph ──────────────────────────────────────────────────
    renderWorkflowHeader(workflow);
    console.log(`  ${c.magenta}🚀${c.reset} Executing workflow steps...\n`);

    // ── Execute steps ─────────────────────────────────────────────────────────
    const results: StepResult[] = [];
    const totalStart = Date.now();
    let stopOnFailure = false;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepLabel = `${c.dim}${i + 1}/${workflow.steps.length}${c.reset}  ${getMethodColor(step.method)}${step.method}${c.reset} ${step.path}`;

      const spinner = new Spinner();
      spinner.start(`${stepLabel}  ${c.dim}${step.name}${c.reset}...`);

      let result: StepResult;
      try {
        const preempted = await preStepCondition(step);
        result = preempted ?? await executeStep(step, baseUrl, {});

        // ── Evaluate rules condition (if present) ─────────────────────────────
        if (!preempted && isRulesCondition(step.condition)) {
          const condResult = await evaluateStepCondition(step.condition, `condition of step "${step.name || step.path}"`);
          result.conditionResult = condResult;

        if (!condResult.passed) {
          const { onFail, switchToWorkflow } = step.condition;

          // An abort is a failed run: the step itself may have passed over HTTP, but the exit code must not.
          if (onFail === 'abort') {
            result.passed = false;
            result.error = `Condition failed: ${condResult.reason}`;
          }

          results.push(result);
          const icon = result.passed ? TICK : CROSS;
          spinner.stop(`  ${icon} ${stepLabel}  ${formatStatus(result.status)}  ${c.dim}${result.durationMs}ms${c.reset}`);
          renderStepResult(result, i, workflow.steps.length);

          if (onFail === 'abort') {
            console.log(`  ${c.red}${c.bold}⚠ Condition failed — aborting workflow.${c.reset}\n`);
            stopOnFailure = true;
            break;
          } else if (onFail === 'continue') {
            console.log(`  ${c.yellow}⊘ Condition failed — skipping remaining steps.${c.reset}\n`);
            stopOnFailure = true;
            break;
          } else if (onFail === 'switch' && switchToWorkflow) {
            console.log(`  ${ARROW} Condition failed — switching to workflow: ${c.bold}${switchToWorkflow}${c.reset}\n`);
            // Load and execute the target workflow
            const switchedWorkflow = loadWorkflowByName<WorkflowDef>(workflowsDir, switchToWorkflow);
            if (switchedWorkflow) {
              try {
                console.log(`  ${TICK} Loaded switch workflow: ${c.bold}${switchedWorkflow.name}${c.reset}\n`);
                renderWorkflowHeader(switchedWorkflow);
                console.log(`  ${c.magenta}🚀${c.reset} Executing sub-workflow...\n`);
                for (let si = 0; si < switchedWorkflow.steps.length; si++) {
                  const switchStep = switchedWorkflow.steps[si];
                  const switchLabel = `${c.dim}${si + 1}/${switchedWorkflow.steps.length}${c.reset}  ${getMethodColor(switchStep.method)}${switchStep.method}${c.reset} ${switchStep.path}`;
                  const switchSpinner = new Spinner();
                  switchSpinner.start(`${switchLabel}  ${c.dim}${switchStep.name}${c.reset}...`);
                  const switchPre = await preStepCondition(switchStep);
                  const switchResult = switchPre ?? await executeStep(switchStep, baseUrl, {});
                  if (!switchPre && isRulesCondition(switchStep.condition)) {
                    switchResult.conditionResult = await evaluateStepCondition(
                      switchStep.condition,
                      `condition of step "${switchStep.name || switchStep.path}"`
                    );
                  }
                  results.push(switchResult);
                  const switchIcon = switchResult.passed ? TICK : CROSS;
                  switchSpinner.stop(`  ${switchIcon} ${switchLabel}  ${formatStatus(switchResult.status)}  ${c.dim}${switchResult.durationMs}ms${c.reset}`);
                  renderStepResult(switchResult, si, switchedWorkflow.steps.length);
                }
              } catch (e: any) {
                console.log(`  ${c.red}✗ Failed to run switch workflow: ${e.message}${c.reset}\n`);
                result.passed = false;
                result.error = `Switch workflow "${switchToWorkflow}" failed: ${e.message}`;
              }
            } else {
              console.log(`  ${c.red}✗ Switch workflow not found: ${switchToWorkflow}${c.reset}\n`);
              result.passed = false;
              result.error = `Switch workflow "${switchToWorkflow}" was not found in ${workflowsDir}`;
            }

            if (step.condition.returnOnComplete) {
              console.log(`  ${c.green}↩ Sub-workflow complete. Returning to main workflow...${c.reset}\n`);
              continue; // Resume main workflow loop!
            } else {
              stopOnFailure = true;
              break;
            }
          }

          if (onFail === 'switch' && !switchToWorkflow) {
            console.log(`  ${c.red}✗ Condition failed and onFail "switch" has no switchToWorkflow.${c.reset}\n`);
            result.passed = false;
            result.error = 'onFail "switch" has no switchToWorkflow';
            stopOnFailure = true;
            break;
          }

          continue; // already pushed & rendered
          }
        }
      } catch (err: any) {
        if (err instanceof HumanInputError || err?.name === 'HumanInputError') {
          spinner.stop(`  ${c.red}✗${c.reset} ${stepLabel}  ${c.dim}needs human input${c.reset}`);
          console.error(`\n  ${c.red}${err.message}${c.reset}\n`);
          process.exit(1);
        }
        throw err;
      }

      results.push(result);

      const icon = result.skipped ? SKIP : result.passed ? TICK : CROSS;
      spinner.stop(`  ${icon} ${stepLabel}  ${formatStatus(result.status)}  ${c.dim}${result.durationMs}ms${c.reset}`);

      renderStepResult(result, i, workflow.steps.length);

      // A connection error means the target died mid-run: stop here instead of
      // emitting dozens of bogus "fetch failed" step failures.
      if (result.connectionError) {
        console.log(`  ${c.red}${c.bold}⚠ Target unreachable — aborting early.${c.reset}\n`);
        stopOnFailure = true;
        break;
      }

      // An unrecognized condition is a hard failure: do not run the rest of a workflow built on it.
      if (!result.passed && result.error && !result.status && conditionKind(step.condition) === 'invalid') {
        console.log(`  ${c.red}${c.bold}⚠ Unrecognized condition — stopping workflow.${c.reset}\n`);
        stopOnFailure = true;
        break;
      }

      // If a critical step fails (auth steps), stop early
      if (!result.passed && (
        step.path.includes('/login') ||
        step.path.includes('/register') ||
        step.path.includes('/auth')
      )) {
        console.log(`  ${c.red}${c.bold}⚠ Auth step failed — stopping workflow to prevent cascading failures.${c.reset}\n`);
        stopOnFailure = true;
        break;
      }
    }

    // ── Summary ────────────────────────────────────────────────────────
    renderWorkflowSummary(results, Date.now() - totalStart);

    // Show memory state
    const memoryState = JeticMemory.getAllMemory();
    const memKeys = Object.entries(memoryState).flatMap(([scope, keys]) =>
      Object.keys(keys as object).map((k) => `${scope}:${k}`)
    );

    if (memKeys.length > 0) {
      console.log(`  ${c.cyan}💾${c.reset} ${c.bold}Jetic Memory${c.reset}  ${c.dim}(captured during run)${c.reset}`);
      for (const key of memKeys) {
        const [scope, k] = key.split(':', 2);
        const val = (memoryState[scope] as any)[k];
        const preview = typeof val === 'string' && val.length > 60
          ? val.substring(0, 57) + '...'
          : String(val);
        console.log(`  ${c.dim}  ${key}${c.reset} = ${c.cyan}${preview}${c.reset}`);
      }
      console.log('');
    }

    const failed = results.filter((r) => !r.passed).length;

    // ── Save trace to .jetic/traces/trace_<id>.json ────────────────────────
    try {
      const tracesDir = path.join(jeticDir, 'traces');
      fs.mkdirSync(tracesDir, { recursive: true });
      const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const traceRecord = {
        id: traceId,
        workflowName: workflow.name,
        workflowFile: workflowPath,
        startedAt: new Date(totalStart).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - totalStart,
        phase: failed === 0 ? 'done' : 'aborted',
        passed: results.filter((r) => r.passed).length,
        failed,
        baseUrl,
        source: 'api',
        steps: results.map((r, idx) => ({
          index: idx,
          name: r.step?.name,
          method: r.step?.method,
          path: r.step?.path,
          description: r.step?.description,
          status: r.status,
          responseStatus: r.status,
          passed: r.passed,
          durationMs: r.durationMs,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          resolvedUrl: r.resolvedUrl,
          requestHeaders: r.requestHeaders,
          requestBody: r.requestBody,
          requestBodySpec: r.step?.body,
          responseHeaders: r.responseHeaders,
          responseBody: truncateTraceBody(r.responseBody),
          captured: Object.fromEntries((r.captured ?? []).map((cap: string) => [cap, '(captured)'])),
          injected: r.injected ?? {},
          error: r.error ?? null,
          expectStatus: r.step?.expectStatus,
          captureSpec: r.step?.capture,
          injectSpec: r.step?.inject,
          conditionSpec: r.step?.condition,
          conditionResult: r.conditionResult,
        })),
      };
      const traceFile = path.join(tracesDir, `trace_${traceId}.json`);
      fs.writeFileSync(traceFile, JSON.stringify(traceRecord, null, 2), 'utf8');
      console.log(`  ${c.dim}📄 Trace saved → ${traceFile}${c.reset}\n`);
    } catch (e: any) {
      console.log(`  ${c.yellow}⚠ Could not save trace: ${e.message}${c.reset}\n`);
    }

    process.exit(failed > 0 ? 1 : 0);
  });
