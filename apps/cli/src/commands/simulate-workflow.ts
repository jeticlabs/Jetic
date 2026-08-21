import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';
import { loadConfig, readJsonSync } from '@jetic/core';
import { BehavioralModel, Endpoint, Environment } from '@jetic/model';
import { JeticMemory } from '@jetic/memory';
import { z } from 'zod';
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
}

export interface WorkflowDef {
  name: string;
  description?: string;
  generatedAt: string;
  environment?: string;
  steps: WorkflowStepDef[];
}

// ─── AI workflow generator ────────────────────────────────────────────────────

async function generateWorkflow(
  model: BehavioralModel,
  config: { ai?: { provider: string; model: string; apiKeyEnvVar: string } },
  workflowName: string,
): Promise<WorkflowDef> {
  if (!config.ai) {
    throw new Error('AI is not configured. Run `jetic config ai` first.');
  }

  const { provider, model: aiModel, apiKeyEnvVar } = config.ai;
  const apiKey = process.env[apiKeyEnvVar];
  if (!apiKey) throw new Error(`Missing API key in env var: ${apiKeyEnvVar}`);
  if (provider !== 'openai' && provider !== 'openrouter') {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  // Build a concise endpoint summary for the prompt
  const endpointSummary = model.endpoints
    .map((ep) => {
      const mw = ep.middleware.map((m) => m.name).join(', ');
      const auth = mw ? ` [auth: ${mw}]` : '';
      const resp = ep.responses?.['200']?.schema
        ? ' → ' + Object.keys(ep.responses['200'].schema).slice(0, 5).join(', ')
        : '';
      const body = ep.requestBody?.fields
        ? ' body:' + Object.keys(ep.requestBody.fields).slice(0, 5).join(',')
        : '';
      return `${ep.method} ${ep.path}${auth}${body}${resp}`;
    })
    .join('\n');

  const prompt = `You are an expert API test workflow designer.
Given this API's endpoints, design a realistic end-to-end workflow that tests the most important user journey.

Project: ${model.project.name} (${model.project.framework})
Workflow goal: "${workflowName}"

Endpoints:
${endpointSummary}

Rules:
1. Order steps logically (auth first, then CRUD operations, then cleanup/logout).
2. For each step, specify which response fields to "capture" into memory (e.g., accessToken, refreshToken, userId, workspaceId, examId etc.)
3. For each step, specify which memory keys to "inject" — headers or body fields needed by this request.
   - Use prefix "header:" for HTTP headers (e.g., "header:Authorization" → "Bearer {token}") 
   - Use prefix "body:" for body fields injection
   - Memory keys are in format "scope:key" e.g. "workflow:accessToken"
4. The memory key format for capture is "scope:key" → "response.field.path" (dot-notation).
   Bearer tokens should be stored with the full "Bearer " prefix if needed.
5. For body fields that must be generated (email, password, name), use realistic placeholder values.
6. Mark "expectStatus": 201 for creation routes, 200 for others, 204 for deletes.
7. Include between 5-12 steps covering the full lifecycle.

Return a JSON object matching this schema exactly.`;

  const importDynamic = new Function('modulePath', 'return import(modulePath)');
  const { generateObject } = await importDynamic('ai');

  let aiModelObj: any;
  if (provider === 'openai') {
    const { createOpenAI } = await importDynamic('@ai-sdk/openai');
    aiModelObj = createOpenAI({ apiKey })(aiModel);
  } else {
    const { createOpenRouter } = await importDynamic('@openrouter/ai-sdk-provider');
    aiModelObj = createOpenRouter({ apiKey })(aiModel);
  }

  const StepSchema = z.object({
    name: z.string(),
    method: z.string(),
    path: z.string(),
    description: z.string().optional(),
    inject: z.record(z.string(), z.string()).optional(),
    capture: z.record(z.string(), z.string()).optional(),
    expectStatus: z.number().optional(),
    body: z.record(z.string(), z.any()).optional(),
  });

  const WorkflowSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    steps: z.array(StepSchema),
  });

  const { object } = await generateObject({
    model: aiModelObj,
    mode: 'json',
    maxTokens: 2000,
    schema: WorkflowSchema,
    prompt,
  });

  return {
    name: object.name as string,
    description: object.description as string | undefined,
    generatedAt: new Date().toISOString(),
    steps: object.steps as WorkflowStepDef[],
  };
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

// ─── Shared template string resolver ────────────────────────────────────────
// Resolves all {{faker.*}} and {{scope:key}} placeholders in a single string.

async function resolveTemplateString(value: string): Promise<string> {
  const templateRe = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  const replacements: Array<{ placeholder: string; resolved: string }> = [];

  while ((match = templateRe.exec(value)) !== null) {
    const expr = match[1].trim();

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

// ─── Resolve {{faker.*}} and {{scope:*}} templates in body values ─────────────

async function resolveBodyTemplates(
  body: Record<string, any>,
): Promise<Record<string, any>> {
  const resolved: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    resolved[key] = typeof value === 'string'
      ? await resolveTemplateString(value)
      : value;
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
): Promise<{ headers: Record<string, string>; body: Record<string, any> }> {
  const headers: Record<string, string> = {};
  const body: Record<string, any> = {};
  if (!inject) return { headers, body };

  for (const [target, memKeyOrTemplate] of Object.entries(inject)) {
    let strValue: string;

    if (memKeyOrTemplate.includes('{{')) {
      // Template mode: resolve {{...}} placeholders (supports Bearer prefix etc.)
      strValue = await resolveTemplateString(memKeyOrTemplate);
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
  passed: boolean;
  captured: string[];
  error?: string;
  injected: Record<string, string>;
}

async function executeStep(
  step: WorkflowStepDef,
  baseUrl: string,
  defaultBody: Record<string, any>,
): Promise<StepResult> {
  const startTime = Date.now();

  // Resolve memory injections
  const memory = new JeticMemory({ scope: 'workflow' });
  const { headers, body: injectedBody } = await resolveInjections(step.inject, memory, memory);

  // Resolve {{faker.*}} / {{workflow:*}} templates in the step body
  const resolvedStepBody = await resolveBodyTemplates(step.body || {});

  // Merge body: step.body overrides defaults, injectedBody adds to body
  const requestBody = { ...defaultBody, ...injectedBody, ...resolvedStepBody };

  // Capture resolved request body fields into memory BEFORE the HTTP call
  // so subsequent steps can reference faker-generated values via {{workflow:key}}
  const inputCaptured = await captureInputToMemory(step.captureInput, requestBody);

  // Resolve path params
  const resolvedPath = await resolvePathParams(step.path, requestBody);
  const url = `${baseUrl.replace(/\/$/, '')}${resolvedPath}`;

  const expectedStatus = step.expectStatus ?? 200;

  try {
    const fetchOptions: RequestInit = {
      method: step.method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
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
      passed,
      captured: [...inputCaptured, ...captured],
      injected: headers,
    };
  } catch (err: any) {
    return {
      step,
      status: 0,
      responseBody: null,
      durationMs: Date.now() - startTime,
      passed: false,
      captured: inputCaptured,
      error: err.message || String(err),
      injected: headers,
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
  .description('Generate and execute a full end-to-end workflow test from model.json')
  .option('--goal <text>', 'Describe the workflow goal', 'Full user journey')
  .option('--env <name>', 'Environment name to use from model.json')
  .option('--workflow <file>', 'Use an existing workflow.json instead of generating')
  .option('--generate-only', 'Only generate workflow.json without executing')
  .option('--clear-memory', 'Clear Jetic memory before running', false)
  .action(async (options: {
    goal: string;
    env?: string;
    workflow?: string;
    generateOnly?: boolean;
    clearMemory?: boolean;
  }) => {
    console.log('');
    console.log(`  ${c.bgCyan}${c.black}${c.bold} JETIC ${c.reset}  ${c.cyan}${c.bold}Workflow Runner${c.reset}`);
   // console.log(`  ${SEP}`);
    console.log('');

    // ── Load config & model ────────────────────────────────────────────
    const config = loadConfig();
    const modelPath = path.join(config.jeticDir, 'model.json');
    const model = readJsonSync<BehavioralModel>(modelPath);

    if (!model) {
      console.error(`  ${c.red}✗${c.reset} No model.json found. Run ${c.bold}jetic scan${c.reset} first.\n`);
      process.exit(1);
    }

    console.log(`  ${c.dim}Model: ${model.project.name} • ${model.endpoints.length} endpoints${c.reset}\n`);

    // ── Optionally clear memory ────────────────────────────────────────
    if (options.clearMemory) {
      JeticMemory.clearAllMemory();
      console.log(`  ${c.yellow}🧹${c.reset} Jetic memory cleared\n`);
    }

    // ── Load or generate workflow ──────────────────────────────────────
    let workflow: WorkflowDef;
    const workflowPath = options.workflow
      ? path.resolve(options.workflow)
      : path.join(config.jeticDir, 'workflow.json');

    if (options.workflow && fs.existsSync(workflowPath)) {
      // Use provided workflow file
      try {
        workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
        console.log(`  ${TICK} Loaded workflow: ${c.bold}${workflow.name}${c.reset}  ${c.dim}(${workflowPath})${c.reset}\n`);
      } catch {
        console.error(`  ${c.red}✗${c.reset} Failed to parse workflow file: ${workflowPath}\n`);
        process.exit(1);
      }
    } else {
      // Generate with AI
      const spinner = new Spinner();
      spinner.start(`${c.magenta}🤖 AI generating workflow for: "${options.goal}"...${c.reset}`);

      try {
        workflow = await generateWorkflow(model, config, options.goal);
        spinner.stop(`  ${TICK} Workflow generated: ${c.bold}${workflow.name}${c.reset}  ${c.dim}(${workflow.steps.length} steps)${c.reset}`);

        // Save workflow.json
        fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
        fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2), 'utf-8');
        console.log(`  ${c.dim}   Saved to ${workflowPath}${c.reset}\n`);
      } catch (err: any) {
        spinner.stop(`  ${c.red}✗${c.reset} Failed to generate workflow`);
        console.error(`\n  ${c.red}${err.message}${c.reset}\n`);
        console.error(`  ${c.dim}Make sure AI is configured: jetic config ai${c.reset}\n`);
        process.exit(1);
      }
    }

    // ── Generate-only mode ─────────────────────────────────────────────
    if (options.generateOnly) {
      renderWorkflowHeader(workflow);
      console.log(`  ${c.green}✓${c.reset} Workflow saved. Run without ${c.bold}--generate-only${c.reset} to execute.\n`);
      process.exit(0);
    }

    // ── Pick environment ───────────────────────────────────────────────
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

    // ── Check Backend Health ───────────────────────────────────────────
    const checkSpinner = new Spinner();
    checkSpinner.start(`Checking if backend is active at ${baseUrl}...`);
    try {
      await fetch(baseUrl);
      checkSpinner.stop(`  ${c.green}✓${c.reset} Backend is active`);
      console.log('');
    } catch (e) {
      checkSpinner.stop();
      console.log(`  ${c.red}✗${c.reset} Backend is unreachable at ${c.bold}${baseUrl}${c.reset}`);
      console.log(`  ${c.yellow}⚠${c.reset} Please run/initialize your backend project and try again.\n`);
      process.exit(1);
    }

    // ── Render workflow graph ──────────────────────────────────────────
    renderWorkflowHeader(workflow);
    console.log(`  ${c.magenta}🚀${c.reset} Executing workflow steps...\n`);

    // ── Execute steps ──────────────────────────────────────────────────
    const results: StepResult[] = [];
    const totalStart = Date.now();
    let stopOnFailure = false;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepLabel = `${c.dim}${i + 1}/${workflow.steps.length}${c.reset}  ${getMethodColor(step.method)}${step.method}${c.reset} ${step.path}`;

      const spinner = new Spinner();
      spinner.start(`${stepLabel}  ${c.dim}${step.name}${c.reset}...`);

      const result = await executeStep(step, baseUrl, {});
      results.push(result);

      const icon = result.passed ? TICK : CROSS;
      spinner.stop(`  ${icon} ${stepLabel}  ${formatStatus(result.status)}  ${c.dim}${result.durationMs}ms${c.reset}`);

      renderStepResult(result, i, workflow.steps.length);

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
    process.exit(failed > 0 ? 1 : 0);
  });
