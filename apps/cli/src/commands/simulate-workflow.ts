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

// ─── Condition Types ──────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'greater_than_or_equal'
  | 'less_than' | 'less_than_or_equal'
  | 'exists' | 'not_exists'
  | 'is_empty' | 'is_not_empty'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with';

export interface ConditionRule {
  left: string;
  operator: ConditionOperator;
  right?: string;
}

export interface ConditionGroup {
  all?: ConditionRule[];  // AND
  any?: ConditionRule[];  // OR
}

export type ConditionOnFail = 'abort' | 'continue' | 'switch';

export interface StepCondition {
  rules: ConditionGroup;
  onFail: ConditionOnFail;
  switchToWorkflow?: string;
  returnOnComplete?: boolean;
}

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
   * Optional condition evaluated after the step runs.
   * If the condition fails, `onFail` controls whether to abort, continue,
   * or switch to another workflow.
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

  // ── Rich endpoint catalogue ──────────────────────────────────────────────
  const endpointSummary = model.endpoints.map((ep) => {
    const mw   = ep.middleware.map((m) => m.name).join(', ');
    const auth = mw ? ` [requiresAuth: ${mw}]` : ' [public]';

    // Full body field list with types
    const bodyFields = ep.requestBody?.fields
      ? Object.entries(ep.requestBody.fields)
          .map(([k, v]: [string, any]) => `${k}:${(v as any).type ?? 'string'}`)
          .join(', ')
      : '';
    const bodyStr = bodyFields ? ` body={${bodyFields}}` : '';

    // All response schemas (every status code)
    const respParts: string[] = [];
    for (const [status, def] of Object.entries(ep.responses ?? {})) {
      const schema = (def as any).schema;
      if (schema) {
        const keys = Object.keys(schema).slice(0, 10).join(', ');
        respParts.push(`${status}:{${keys}}`);
      }
    }
    const respStr = respParts.length ? ` response=[${respParts.join(' | ')}]` : '';

    return `${ep.method} ${ep.path}${auth}${bodyStr}${respStr}`;
  }).join('\n');

  const canonicalExample = `
CANONICAL WORKFLOW FORMAT — follow this EXACTLY:
{
  "name": "Admin creates workspace, invites teacher, creates class and logs out",
  "steps": [
    {
      "name": "Admin creates a workspace",
      "method": "POST",
      "path": "/api/workspaces/setup",
      "description": "Register a new workspace with an admin account",
      "body": {
        "workspace_name": "{{faker.company.name}}",
        "admin_name": "{{faker.internet.username}}",
        "admin_email": "{{faker.internet.email}}",
        "admin_password": "{{faker.internet.password}}"
      },
      "captureInput": {
        "workflow:adminEmail": "admin_email",
        "workflow:adminPassword": "admin_password",
        "workflow:adminName": "admin_name",
        "workflow:workspaceName": "workspace_name"
      },
      "capture": {
        "workflow:workspaceID": "data.workspace.id",
        "workflow:adminID": "data.admin.id"
      },
      "expectStatus": 201
    },
    {
      "name": "Admin logs in",
      "method": "POST",
      "path": "/api/auth/login",
      "description": "Authenticate with the created admin credentials",
      "body": {
        "user_email": "{{workflow:adminEmail}}",
        "user_password": "{{workflow:adminPassword}}",
        "deviceId": "{{faker.string.uuid}}",
        "deviceName": "{{faker.commerce.productName}}"
      },
      "capture": {
        "workflow:accessToken": "data.accessToken",
        "workflow:refreshToken": "data.refreshToken"
      },
      "expectStatus": 200
    },
    {
      "name": "Admin creates a class",
      "method": "POST",
      "path": "/api/classes",
      "description": "Create a class inside the workspace using the access token",
      "inject": {
        "header:Authorization": "Bearer {{workflow:accessToken}}"
      },
      "body": {
        "name": "{{faker.word.noun}} Class",
        "workspaceId": "{{workflow:workspaceID}}"
      },
      "capture": {
        "workflow:classID": "data.id"
      },
      "expectStatus": 201
    },
    {
      "name": "Admin logs out",
      "method": "POST",
      "path": "/api/auth/logout",
      "description": "Invalidate the admin session",
      "inject": {
        "header:Authorization": "Bearer {{workflow:accessToken}}"
      },
      "body": {},
      "expectStatus": 200
    }
  ]
}`;

  const prompt = `You are an expert API integration test designer.
Output a workflow JSON that exercises a real end-to-end user journey for the API below.

━━━ PROJECT ━━━
Name: ${model.project.name}
Framework: ${model.project.framework}
Workflow goal: "${workflowName}"

━━━ API ENDPOINTS ━━━
${endpointSummary}

━━━ TEMPLATE SYNTAX ━━━
Use EXACTLY these placeholders in body/inject values:
  {{faker.internet.email}}         random email
  {{faker.internet.password}}      random password
  {{faker.internet.username}}      random username
  {{faker.company.name}}           random company name
  {{faker.person.fullName}}        random full name
  {{faker.word.noun}}              random noun
  {{faker.word.adjective}}         random adjective
  {{faker.string.uuid}}            UUID v4
  {{faker.commerce.productName}}   product name
  {{faker.phone.number}}           phone number
  {{workflow:KEY}}                 value captured from a previous step
  {{human:KEY}}                    ask the human at runtime (interactive prompt, waits for input).
                                   Use ONLY for values unknowable beforehand (OTP/2FA codes,
                                   CAPTCHAs, real personal secrets). First entry is saved to
                                   human:KEY memory; JETIC_HUMAN_KEY env var skips the prompt.

 ━━━ FIELD RULES ━━━
"body"         — request body. Use {{faker.*}} for generated fields, {{workflow:KEY}} for previously captured values.
                 Use {{human:KEY}} SPARINGLY and only when no other source exists (OTP codes, real secrets) —
                 it pauses execution waiting for a person to type a value.

"captureInput" — save RESOLVED body field values to memory BEFORE the HTTP call.
               Only for faker-generated fields you need to re-use in later steps.
               Format: { "workflow:KEY": "bodyFieldName" }
               Example: { "workflow:adminEmail": "admin_email" }
               ⚠ Only capture fields present in THIS step's body.

"capture"      — save RESPONSE body field values to memory AFTER success.
               Format: { "workflow:KEY": "dot.notation.path" }
               Example: { "workflow:accessToken": "data.accessToken" }
               ⚠ Use exact dot-notation paths from the response schema shown above.
               ⚠ Only capture values that subsequent steps actually need.

"inject"       — inject memory values into headers/body before this step runs.
               Bearer auth: { "header:Authorization": "Bearer {{workflow:accessToken}}" }
               Body inject: { "body:fieldName": "{{workflow:KEY}}" }
               ⚠ EVERY endpoint marked [requiresAuth] MUST inject the Authorization header.

"expectStatus" — 201 for resource creation, 200 for login/logout/GET, 204 for DELETE.

━━━ ORDERING ━━━
1. Registration / setup  (public, faker body, captureInput for credentials)
2. Authentication        (login with captured creds, capture tokens)
3. CRUD operations       (inject auth, reference captured IDs in body)
4. Cleanup / logout      (inject auth)

━━━ EXAMPLE ━━━
${canonicalExample}

━━━ GENERATE ━━━
Using ONLY the endpoints listed above (exact methods and paths), generate a complete
workflow JSON for: "${workflowName}".
Requirements: 5-12 steps, every step has name/method/path/description/body/expectStatus,
all [requiresAuth] endpoints inject Authorization, captures wired correctly between steps.
`;

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

  // ── Strict Zod schema — matches canonical format exactly ──────────────────
  const StepSchema = z.object({
    name:         z.string().describe('Short label for this step, e.g. "Admin logs in"'),
    method:       z.string().describe('HTTP method in uppercase: GET, POST, PUT, PATCH, DELETE'),
    path:         z.string().describe('Exact endpoint path, e.g. /api/auth/login'),
    description:  z.string().optional().describe('One sentence describing what this step does'),
    body:         z.record(z.string(), z.any()).optional()
                    .describe('Request body. Use {{faker.X}} for generated values, {{workflow:KEY}} for captured values, {{human:KEY}} only for OTP/secret values a person must type at runtime'),
    captureInput: z.record(z.string(), z.string()).optional()
                    .describe('Save resolved request body fields to memory BEFORE the HTTP call. Format: { "workflow:KEY": "bodyFieldName" }'),
    capture:      z.record(z.string(), z.string()).optional()
                    .describe('Save response body fields to memory AFTER success. Format: { "workflow:KEY": "dot.path" }'),
    inject:       z.record(z.string(), z.string()).optional()
                    .describe('Inject memory values into headers/body. Use "header:Authorization" for Bearer auth'),
    expectStatus: z.number().int().min(100).max(599)
                    .describe('Expected HTTP status: 201 for creates, 200 for others, 204 for deletes'),
  });

  const WorkflowSchema = z.object({
    name:  z.string().describe('Descriptive workflow name summarising the journey tested'),
    steps: z.array(StepSchema).min(3).max(15),
  });

  const { object } = await generateObject({
    model:     aiModelObj,
    mode:      'json',
    maxTokens: 4000,
    schema:    WorkflowSchema,
    prompt,
  });

  return {
    name:        object.name as string,
    generatedAt: new Date().toISOString(),
    steps:       object.steps as WorkflowStepDef[],
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

// ─── Condition Evaluator ──────────────────────────────────────────────────────
// Resolves {{scope:key}} refs from JeticMemory and evaluates the 14 operators.

const UNARY_OPS: ConditionOperator[] = ['exists', 'not_exists', 'is_empty', 'is_not_empty'];

async function resolveConditionRef(ref: string, context = 'condition'): Promise<string> {
  return ref.replace(/\{\{([^}]+)\}\}/g, () => '').trim() === ref.trim()
    ? ref // literal value, no templates
    : await resolveTemplateString(ref, context);
}

async function evalConditionRule(rule: ConditionRule, context = 'condition'): Promise<boolean> {
  const left = await resolveConditionRef(rule.left, context);
  const right = rule.right !== undefined ? await resolveConditionRef(rule.right, context) : undefined;
  const op = rule.operator;

  switch (op) {
    case 'equals':                return left === right;
    case 'not_equals':            return left !== right;
    case 'greater_than':          return Number(left) > Number(right);
    case 'greater_than_or_equal': return Number(left) >= Number(right);
    case 'less_than':             return Number(left) < Number(right);
    case 'less_than_or_equal':    return Number(left) <= Number(right);
    case 'exists':                return left !== '' && left !== undefined;
    case 'not_exists':            return left === '' || left === undefined;
    case 'is_empty':              return left === '';
    case 'is_not_empty':          return left !== '';
    case 'contains':              return right !== undefined && left.includes(right);
    case 'not_contains':          return right !== undefined && !left.includes(right);
    case 'starts_with':           return right !== undefined && left.startsWith(right);
    case 'ends_with':             return right !== undefined && left.endsWith(right);
    default:                      return false;
  }
}

async function evaluateStepCondition(
  condition: StepCondition,
  context = 'condition',
): Promise<{ passed: boolean; reason: string }> {
  const { rules } = condition;
  const ruleList = rules.all ?? rules.any ?? [];
  const isAnd = !!rules.all;

  if (ruleList.length === 0) return { passed: true, reason: 'No rules defined' };

  const results: { rule: ConditionRule; ok: boolean }[] = [];
  for (const rule of ruleList) {
    results.push({ rule, ok: await evalConditionRule(rule, context) });
  }

  const passed = isAnd ? results.every(r => r.ok) : results.some(r => r.ok);
  const failing = results.filter(r => !r.ok);
  const reason = passed
    ? `All conditions met (${isAnd ? 'AND' : 'OR'})`
    : `Failed: ${failing.map(r =>
        `${r.rule.left} ${r.rule.operator}${r.rule.right !== undefined ? ' ' + r.rule.right : ''}`
      ).join(', ')}`;

  return { passed, reason };
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

// ─── Resolve {{faker.*}} and {{scope:*}} templates in body values ─────────────

async function resolveBodyTemplates(
  body: Record<string, any>,
  context?: string,
): Promise<Record<string, any>> {
  const resolved: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    resolved[key] = typeof value === 'string'
      ? await resolveTemplateString(value, context)
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
  conditionResult?: { passed: boolean; reason: string };
}

async function executeStep(
  step: WorkflowStepDef,
  baseUrl: string,
  defaultBody: Record<string, any>,
): Promise<StepResult> {
  const startTime = Date.now();

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

  // Show condition evaluation result
  if (result.conditionResult) {
    const { passed: condPassed, reason } = result.conditionResult;
    const condIcon = condPassed ? `${c.magenta}◇${c.reset}` : `${c.yellow}◈${c.reset}`;
    const condColor = condPassed ? c.magenta : c.yellow;
    console.log(`  ${CHAIN}   ${condIcon} ${condColor}condition ${condPassed ? 'passed' : 'failed'}${c.reset}  ${c.dim}${reason}${c.reset}`);
    if (!condPassed && result.step.condition) {
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
  .description('Generate and execute a full end-to-end workflow test from model.json')
  .option('--goal <text>', 'Describe the workflow goal', 'Full user journey')
  .option('--env <name>', 'Environment name to use from model.json')
  .option('--workflow <value>', 'Workflow name/slug or file path to use instead of generating')
  .option('--generate-only', 'Only generate the workflow file without executing')
  .option('--clear-memory', 'Clear Jetic memory before running', false)
  .option('--list', 'List all available workflows in .jetic/workflows/')
  .action(async (options: {
    goal: string;
    env?: string;
    workflow?: string;
    generateOnly?: boolean;
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
        console.log(`  ${c.dim}Run \`jetic simulate workflow --goal "<description>"\` to generate one.${c.reset}\n`);
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
      // Generate with AI — save to .jetic/workflows/<slug>.json
      const slug = options.goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow';
      workflowPath = path.join(workflowsDir, `${slug}.json`);

      const spinner = new Spinner();
      spinner.start(`${c.magenta}🤖 AI generating workflow for: "${options.goal}"...${c.reset}`);

      try {
        workflow = await generateWorkflow(model, config, options.goal);
        spinner.stop(`  ${TICK} Workflow generated: ${c.bold}${workflow.name}${c.reset}  ${c.dim}(${workflow.steps.length} steps)${c.reset}`);

        fs.mkdirSync(workflowsDir, { recursive: true });
        fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2), 'utf-8');
        console.log(`  ${c.dim}   Saved to ${workflowPath}${c.reset}\n`);
      } catch (err: any) {
        spinner.stop(`  ${c.red}✗${c.reset} Failed to generate workflow`);
        console.error(`\n  ${c.red}${err.message}${c.reset}\n`);
        console.error(`  ${c.dim}Make sure AI is configured: jetic config ai${c.reset}\n`);
        process.exit(1);
      }
    }

    // ── Generate-only mode ────────────────────────────────────────────────────
    if (options.generateOnly) {
      renderWorkflowHeader(workflow);
      console.log(`  ${c.green}✓${c.reset} Workflow saved. Run without ${c.bold}--generate-only${c.reset} to execute.\n`);
      process.exit(0);
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
        result = await executeStep(step, baseUrl, {});

        // ── Evaluate condition (if present) ───────────────────────────────────
        if (step.condition) {
          const condResult = await evaluateStepCondition(step.condition, `condition of step "${step.name || step.path}"`);
          result.conditionResult = condResult;

        if (!condResult.passed) {
          const { onFail, switchToWorkflow } = step.condition;

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
            const switchPath = path.join(workflowsDir, `${switchToWorkflow}.json`);
            if (fs.existsSync(switchPath)) {
              try {
                const switchedWorkflow: WorkflowDef = JSON.parse(fs.readFileSync(switchPath, 'utf-8'));
                console.log(`  ${TICK} Loaded switch workflow: ${c.bold}${switchedWorkflow.name}${c.reset}\n`);
                renderWorkflowHeader(switchedWorkflow);
                console.log(`  ${c.magenta}🚀${c.reset} Executing sub-workflow...\n`);
                for (let si = 0; si < switchedWorkflow.steps.length; si++) {
                  const switchStep = switchedWorkflow.steps[si];
                  const switchLabel = `${c.dim}${si + 1}/${switchedWorkflow.steps.length}${c.reset}  ${getMethodColor(switchStep.method)}${switchStep.method}${c.reset} ${switchStep.path}`;
                  const switchSpinner = new Spinner();
                  switchSpinner.start(`${switchLabel}  ${c.dim}${switchStep.name}${c.reset}...`);
                  const switchResult = await executeStep(switchStep, baseUrl, {});
                  if (switchStep.condition) {
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
                console.log(`  ${c.red}✗ Failed to load switch workflow: ${e.message}${c.reset}\n`);
              }
            } else {
              console.log(`  ${c.yellow}⚠ Switch workflow not found: ${switchPath}${c.reset}\n`);
            }

            if (step.condition.returnOnComplete) {
              console.log(`  ${c.green}↩ Sub-workflow complete. Returning to main workflow...${c.reset}\n`);
              continue; // Resume main workflow loop!
            } else {
              stopOnFailure = true;
              break;
            }
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
          passed: r.passed,
          durationMs: r.durationMs,
          captured: Object.fromEntries((r.captured ?? []).map((cap: string) => [cap, '(captured)'])),
          injected: r.injected ?? {},
          requestBody: r.step?.body,
          responseBody: r.responseBody,
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
