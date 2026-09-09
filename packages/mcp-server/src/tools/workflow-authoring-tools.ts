import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { loadModel, projectRootOfModel, resolveModelPath } from '../types';
import { handleListWorkflows } from './workflow-tools';
import type { WorkflowDef, WorkflowStepDef } from '@jetic/simulator';

// ── Step schema (file-workflow dialect — the only dialect the simulator runs) ──
// NOTE: this deliberately excludes `condition` (declared in WorkflowStepDef but
// ignored by the simulator) and the model-embedded fields (`call`, `auth`,
// `bind`). The validator warns when those appear so AI authors don't rely on
// silently-ignored fields.

export const workflowStepSchema = z.object({
  name: z.string().min(1).describe('Step name (must be unique within the workflow)'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).describe('HTTP method'),
  path: z.string().min(1).describe('Route path; :params resolve from body/memory (NOT from {{templates}} — those only work in body/inject)'),
  description: z.string().optional().describe('What this step does'),
  body: z.record(z.any()).optional().describe('Request payload. Values support {{faker.*}}, {{scope:key}} and {{workflow:key}} templates'),
  inject: z.record(z.string()).optional().describe('Memory/header injection: "header:Name" or "body:field" (or bare header name) -> "scope:key" or "{{template}}"'),
  capture: z.record(z.string()).optional().describe('Save RESPONSE fields to memory: "scope:key" -> "dot.path.in.response"'),
  captureInput: z.record(z.string()).optional().describe('Save REQUEST body fields to memory BEFORE sending: "scope:key" -> "bodyField"'),
  expectStatus: z.number().int().positive().optional().describe('Expected HTTP status (default 200; any 2xx passes when expecting 2xx)'),
  // NOTE: .passthrough() is intentional — unknown keys must REACH the validator
  // (MODEL_DIALECT_KEY / UNKNOWN_STEP_KEY diagnostics). Zod's default strip
  // behavior would silently swallow the exact mistakes we need to report.
}).passthrough();

const inlineWorkflowSchema = z.object({
  name: z.string().min(1).describe('Workflow name (also used to derive the file slug)'),
  description: z.string().optional(),
  environment: z.string().optional().describe('Target environment name from the model (e.g. local)'),
  steps: z.array(workflowStepSchema).min(1).describe('Ordered steps; later steps can use memory captured by earlier ones'),
}).passthrough();

// ── Validation report ───────────────────────────────────────────────────────

export interface WorkflowValidationIssue {
  severity: 'error' | 'warning';
  stepIndex?: number;
  stepName?: string;
  code: string;
  message: string;
  fix: string;
}

export interface WorkflowValidationReport {
  valid: boolean;
  errorsCount: number;
  warningsCount: number;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const KNOWN_WORKFLOW_KEYS = new Set(['name', 'description', 'environment', 'steps', 'generatedAt']);
const KNOWN_STEP_KEYS = new Set([
  'name', 'method', 'path', 'description', 'inject', 'capture',
  'captureInput', 'expectStatus', 'body', 'condition',
]);
// Keys from the OTHER (model-embedded) workflow dialect — always a mistake here.
const MODEL_DIALECT_KEYS = new Set(['call', 'auth', 'bind']);

function err(list: WorkflowValidationIssue[], stepIndex: number | undefined, stepName: string | undefined,
  code: string, message: string, fix: string) {
  list.push({ severity: 'error', stepIndex, stepName, code, message, fix });
}

function warn(list: WorkflowValidationIssue[], stepIndex: number | undefined, stepName: string | undefined,
  code: string, message: string, fix: string) {
  list.push({ severity: 'warning', stepIndex, stepName, code, message, fix });
}

function splitMemKey(raw: string): { scope: string; key: string } {
  const idx = raw.indexOf(':');
  if (idx <= 0) return { scope: 'workflow', key: raw };
  return { scope: raw.slice(0, idx), key: raw.slice(idx + 1) };
}

/** Collects `scope:key` entries already persisted in <project>/.jetic/memory.json. */
function readMemoryKeys(projectRoot: string): Set<string> {
  const keys = new Set<string>();
  try {
    const memPath = path.join(projectRoot, '.jetic', 'memory.json');
    if (!fs.existsSync(memPath)) return keys;
    const data = JSON.parse(fs.readFileSync(memPath, 'utf-8')) as Record<string, Record<string, unknown>>;
    for (const [scope, entries] of Object.entries(data || {})) {
      if (!entries || typeof entries !== 'object') continue;
      for (const key of Object.keys(entries)) keys.add(`${scope}:${key}`);
    }
  } catch {
    // Corrupt/missing memory file → treat as empty (runtime state, not fatal).
  }
  return keys;
}

function collectTemplateRefs(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    TEMPLATE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEMPLATE_RE.exec(value)) !== null) out.push(m[1].trim());
  } else if (Array.isArray(value)) {
    for (const v of value) collectTemplateRefs(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectTemplateRefs(v, out);
  }
}

function suggestEndpoints(model: { method: string; path: string }[], method: string, wfPath: string): string[] {
  const samePath = model.filter((e) => e.path === wfPath).map((e) => `${e.method} ${e.path}`);
  if (samePath.length > 0) return samePath.slice(0, 3);
  const prefix = wfPath.split('/').slice(0, 3).join('/');
  return model
    .filter((e) => e.path.startsWith(prefix))
    .map((e) => `${e.method} ${e.path}`)
    .slice(0, 3);
}

/**
 * Deep-validates a workflow definition: structure, endpoint cross-checks
 * against model.json, and full memory data-flow analysis (every {{scope:key}}
 * must be produced by an earlier step or exist in memory.json).
 */
export function validateWorkflowDefinition(
  wf: { name?: string; description?: string; environment?: string; steps?: Array<Record<string, any>> },
  opts?: { projectPath?: string; allowUnknownEndpoints?: boolean }
): WorkflowValidationReport {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];
  const { model } = loadModel(opts?.projectPath);
  const projectRoot = projectRootOfModel(resolveModelPath(opts?.projectPath));
  const persistedMemory = readMemoryKeys(projectRoot);

  if (!wf || typeof wf !== 'object') {
    err(errors, undefined, undefined, 'NOT_AN_OBJECT', 'Workflow must be an object with name + steps.', 'Pass { name, steps: [...] }.');
    return toReport(errors, warnings);
  }
  if (!wf.name || typeof wf.name !== 'string' || !wf.name.trim()) {
    err(errors, undefined, undefined, 'MISSING_NAME', 'Workflow needs a non-empty "name".', 'Set a descriptive name like "User onboarding".');
  }
  if (!Array.isArray(wf.steps) || wf.steps.length === 0) {
    err(errors, undefined, undefined, 'NO_STEPS', 'Workflow needs at least one step.', 'Add steps with { name, method, path }.');
    return toReport(errors, warnings);
  }

  if (wf.environment && !(model.environments || []).some((e) => e.name === wf.environment)) {
    warn(warnings, undefined, undefined, 'UNKNOWN_ENVIRONMENT',
      `Environment "${wf.environment}" is not declared in model.json.`,
      `Use one of: ${(model.environments || []).map((e) => e.name).join(', ') || '(none declared)'}, or add it with jetic_manage_environment.`);
  }

  for (const key of Object.keys(wf)) {
    if (!KNOWN_WORKFLOW_KEYS.has(key)) {
      warn(warnings, undefined, undefined, 'UNKNOWN_WORKFLOW_KEY',
        `Top-level key "${key}" is not part of the file-workflow format and will be ignored.`,
        'Valid keys: name, description, environment, steps.');
    }
  }

  const seenNames = new Set<string>();
  const defined = new Set<string>(); // scope:key available from earlier steps

  wf.steps.forEach((rawStep, i) => {
    const stepNo = i + 1;
    const sName = typeof rawStep?.name === 'string' ? rawStep.name : undefined;

    if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) {
      err(errors, stepNo, undefined, 'STEP_NOT_AN_OBJECT', `Step ${stepNo} must be an object.`, 'Use { name, method, path, ... }.');
      return;
    }
    const step = rawStep as Record<string, any>;

    // Unknown / dialect-mixing keys.
    for (const key of Object.keys(step)) {
      if (MODEL_DIALECT_KEYS.has(key)) {
        err(errors, stepNo, sName, 'MODEL_DIALECT_KEY',
          `Step ${stepNo} uses "${key}" from the model-embedded workflow dialect, which file workflows ignore.`,
          'File-workflow equivalent: split "call" into method+path; replace auth/bind with inject/capture.');
      } else if (!KNOWN_STEP_KEYS.has(key)) {
        warn(warnings, stepNo, sName, 'UNKNOWN_STEP_KEY',
          `Step ${stepNo} has unknown key "${key}" which the simulator ignores.`,
          'Remove it or check the field name (valid: name, method, path, description, body, inject, capture, captureInput, expectStatus).');
      }
    }
    if ('condition' in step) {
      warn(warnings, stepNo, sName, 'CONDITION_IGNORED',
        `"condition" is accepted but currently ignored by the simulator — the step always runs.`,
        'Encode branching as separate workflows, or gate with expectStatus per step.');
    }

    if (!sName || !sName.trim()) {
      err(errors, stepNo, undefined, 'STEP_MISSING_NAME', `Step ${stepNo} needs a non-empty "name".`, 'Give every step a unique descriptive name.');
    } else if (seenNames.has(sName)) {
      warn(warnings, stepNo, sName, 'DUPLICATE_STEP_NAME', `Duplicate step name "${sName}".`, 'Rename steps so logs stay readable.');
    } else {
      seenNames.add(sName);
    }

    const method = typeof step.method === 'string' ? step.method.toUpperCase() : undefined;
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
    if (!method || !validMethods.includes(method)) {
      err(errors, stepNo, sName, 'BAD_METHOD', `Step ${stepNo} has invalid method ${JSON.stringify(step.method)}.`, `Use one of: ${validMethods.join(', ')}.`);
      return;
    }
    if (typeof step.path !== 'string' || !step.path.trim()) {
      err(errors, stepNo, sName, 'BAD_PATH', `Step ${stepNo} needs a "path" string.`, 'Use the route path, e.g. "/api/users/:id".');
      return;
    }
    const wfPath: string = step.path.startsWith('/') ? step.path : `/${step.path}`;

    // Endpoint cross-check.
    const endpoint = (model.endpoints || []).find(
      (e) => e.method.toUpperCase() === method && e.path === wfPath
    );
    if (!endpoint) {
      const suggestions = suggestEndpoints(model.endpoints || [], method, wfPath);
      const msg = `Step ${stepNo} (${method} ${wfPath}) matches no endpoint in model.json.` +
        (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(' | ')}?` : '');
      if (opts?.allowUnknownEndpoints) {
        warn(warnings, stepNo, sName, 'UNKNOWN_ENDPOINT', msg, 'Add the endpoint with jetic_add_endpoint so future runs stay verifiable.');
      } else {
        err(errors, stepNo, sName, 'UNKNOWN_ENDPOINT', msg, 'Add it with jetic_add_endpoint, fix the method/path, or re-run with allowUnknownEndpoints.');
      }
    } else if (step.expectStatus !== undefined) {
      const codes = Object.keys(endpoint.responses || {});
      const exp = Number(step.expectStatus);
      const in2xx = exp >= 200 && exp < 300;
      const modelHas2xx = codes.some((c) => Number(c) >= 200 && Number(c) < 300);
      if (!codes.includes(String(exp)) && !(in2xx && modelHas2xx)) {
        warn(warnings, stepNo, sName, 'UNEXPECTED_STATUS',
          `Step ${stepNo} expects ${exp} but the model declares [${codes.join(', ') || 'none'}] for ${method} ${wfPath}.`,
          'Align expectStatus with the model, or update the endpoint responses.');
      }
    }

    // Body checks.
    if (step.body !== undefined && (typeof step.body !== 'object' || step.body === null || Array.isArray(step.body))) {
      err(errors, stepNo, sName, 'BAD_BODY', `Step ${stepNo} "body" must be an object of field -> value.`, 'Use { "email": "{{faker.internet.email}}" }.');
    }
    if ((method === 'GET' || method === 'HEAD') && step.body && Object.keys(step.body).length > 0) {
      warn(warnings, stepNo, sName, 'GET_WITH_BODY',
        `Step ${stepNo} is ${method} with a body — it will be sent as URL query params, not a JSON body.`,
        'This is usually what you want for filters; otherwise switch to POST.');
    }
    if (endpoint?.requestBody?.fields && step.body && typeof step.body === 'object') {
      for (const field of Object.keys(step.body)) {
        if (!(field in endpoint.requestBody.fields)) {
          warn(warnings, stepNo, sName, 'UNKNOWN_BODY_FIELD',
            `Step ${stepNo} sends body field "${field}" not declared on ${method} ${wfPath}.`,
            'Check the spelling, or extend the endpoint with jetic_update_endpoint.');
        }
      }
    }

    // :path params need a source (body field or defined memory). A param with
    // no source stays literal ("/api/users/:id") and the request WILL fail,
    // so this is an error, not a warning.
    const pathParams = wfPath.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
    for (const p of pathParams) {
      const pname = p.substring(1);
      const inBody = step.body && typeof step.body === 'object' && pname in step.body;
      const inMemory = [...defined].some((d) => d.split(':')[1] === pname) ||
        [...persistedMemory].some((d) => d.split(':')[1] === pname);
      if (!inBody && !inMemory) {
        err(errors, stepNo, sName, 'UNRESOLVED_PATH_PARAM',
          `Path param ":${pname}" in step ${stepNo} has no body field or memory source — the URL will literally contain ":${pname}" and fail.`,
          `Add "${pname}" to this step's body, or capture it as memory in an earlier step (capture: { "workflow:${pname}": "data.${pname}" }).`);
      }
    }
    if (/\{\{[^}]+\}\}/.test(wfPath)) {
      warn(warnings, stepNo, sName, 'PATH_TEMPLATE',
        `Step ${stepNo} path contains a {{template}} — paths only resolve :params, templates work in body/inject.`,
        'Use "/api/users/:id" with an "id" body field or captured memory key.');
    }

    // Template reference analysis (body + inject values).
    const refs: string[] = [];
    collectTemplateRefs(step.body, refs);
    if (step.inject && typeof step.inject === 'object') {
      for (const v of Object.values(step.inject)) collectTemplateRefs(v, refs);
    }
    for (const ref of refs) {
      if (ref.startsWith('faker.')) {
        if (ref.split('.').length < 3) {
          warn(warnings, stepNo, sName, 'SUSPICIOUS_FAKER',
            `"{{${ref}}}" looks like an incomplete faker path.`,
            'Use full paths like {{faker.internet.email}} or {{faker.string.uuid}}.');
        }
        continue;
      }
      if (!ref.includes(':')) {
        err(errors, stepNo, sName, 'BAD_TEMPLATE',
          `"{{${ref}}}" in step ${stepNo} needs a scope ("{{workflow:key}}", "{{scope:key}}") or faker ("{{faker.x.y}}").`,
          'Bare {{key}} is left literal — add the scope prefix.');
        continue;
      }
      const { scope, key } = splitMemKey(ref);
      if (!key) {
        err(errors, stepNo, sName, 'BAD_TEMPLATE', `"{{${ref}}}" has an empty key.`, 'Use {{scope:key}} with a real key.');
        continue;
      }
      const full = `${scope}:${key}`;
      if (!defined.has(full) && !persistedMemory.has(full)) {
        err(errors, stepNo, sName, 'UNDEFINED_MEMORY_REF',
          `"{{${ref}}}" in step ${stepNo} is never captured by an earlier step and is not in memory.json — it resolves to "".`,
          `Capture "${full}" in an earlier step (capture/captureInput), or seed it first.`);
      } else if (!defined.has(full)) {
        warn(warnings, stepNo, sName, 'MEMORY_FILE_DEPENDENT',
          `"{{${ref}}}" in step ${stepNo} only exists in the current memory.json, not from an earlier step — reruns after memory clear will break.`,
          `Capture "${full}" inside this workflow instead.`);
      }
    }

    // inject / capture / captureInput shape checks.
    if (step.inject !== undefined) {
      if (typeof step.inject !== 'object' || step.inject === null || Array.isArray(step.inject)) {
        err(errors, stepNo, sName, 'BAD_INJECT', `Step ${stepNo} "inject" must be an object.`, 'Use { "header:Authorization": "Bearer {{workflow:accessToken}}" }.');
      } else {
        for (const [target, memRef] of Object.entries(step.inject)) {
          if (!target.trim() || typeof memRef !== 'string' || !memRef.trim()) {
            err(errors, stepNo, sName, 'BAD_INJECT', `Step ${stepNo} has an empty inject target or value.`, 'Use "header:Name"/"body:field" -> "scope:key".');
          }
        }
      }
    }
    for (const field of ['capture', 'captureInput'] as const) {
      const cap = step[field];
      if (cap === undefined) continue;
      if (typeof cap !== 'object' || cap === null || Array.isArray(cap)) {
        err(errors, stepNo, sName, 'BAD_CAPTURE', `Step ${stepNo} "${field}" must be an object.`, `Use { "workflow:myVar": "${field === 'capture' ? 'data.id' : 'bodyField'}" }.`);
        continue;
      }
      for (const [memKey, srcPath] of Object.entries(cap)) {
        if (!memKey.trim() || typeof srcPath !== 'string' || !srcPath.trim()) {
          err(errors, stepNo, sName, 'BAD_CAPTURE', `Step ${stepNo} "${field}" has an empty key or path.`, 'Use { "workflow:myVar": "data.id" }.');
          continue;
        }
        if (field === 'captureInput' && (!step.body || typeof step.body !== 'object' || !(srcPath in step.body))) {
          warn(warnings, stepNo, sName, 'CAPTURE_INPUT_MISSING_FIELD',
            `captureInput "${memKey}" reads body field "${srcPath}" which step ${stepNo} does not send.`,
            'Add the field to body, or capture from the response with "capture" instead.');
        }
      }
    }

    // Register this step's captures for later steps.
    for (const field of ['capture', 'captureInput'] as const) {
      const cap = step[field];
      if (cap && typeof cap === 'object' && !Array.isArray(cap)) {
        for (const memKey of Object.keys(cap)) {
          const { scope, key } = splitMemKey(memKey);
          if (key) defined.add(`${scope}:${key}`);
        }
      }
    }
  });

  return toReport(errors, warnings);
}

function toReport(errors: WorkflowValidationIssue[], warnings: WorkflowValidationIssue[]): WorkflowValidationReport {
  return {
    valid: errors.length === 0,
    errorsCount: errors.length,
    warningsCount: warnings.length,
    errors,
    warnings,
  };
}

// ── Slug + file helpers ─────────────────────────────────────────────────────

export function slugifyWorkflowName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return slug || 'workflow';
}

function workflowsDir(projectPath?: string): string {
  return path.join(path.dirname(resolveModelPath(projectPath)), 'workflows');
}

function workflowFilePath(projectPath: string | undefined, slug: string): string {
  return path.join(workflowsDir(projectPath), `${slug}.json`);
}

/** Resolves a slug, workflow name, or file path to an existing FILE workflow. */
function resolveFileWorkflow(projectPath: string | undefined, ref: string): { slug: string; filePath: string; def: WorkflowDef } {
  const listing = handleListWorkflows({ projectPath });
  const search = ref.toLowerCase();
  const item = listing.workflows.find(
    (w) =>
      w.id.toLowerCase() === search ||
      w.name.toLowerCase() === search ||
      (w.filePath && path.resolve(w.filePath).toLowerCase() === path.resolve(ref).toLowerCase())
  );
  if (!item) {
    throw new Error(
      `Workflow "${ref}" not found. Available: ${listing.workflows.map((w) => w.id).join(', ') || '(none)'}.`
    );
  }
  if (item.source === 'model_json' || !item.filePath) {
    throw new Error(
      `Workflow "${ref}" lives inside model.json, which this tool cannot edit. ` +
        `Migrate it with jetic_create_workflow { fromModelWorkflow: "${item.name}" } first.`
    );
  }
  let def: WorkflowDef;
  try {
    def = JSON.parse(fs.readFileSync(item.filePath, 'utf-8'));
  } catch (e: any) {
    throw new Error(`Cannot read workflow file at ${item.filePath}: ${e?.message || e}`);
  }
  return { slug: item.id, filePath: item.filePath, def };
}

/** Converts a model-embedded workflow (call/auth/bind dialect) to a file workflow. */
function migrateModelWorkflow(
  modelWorkflow: { name: string; description?: string; steps: Array<Record<string, any>> }
): { def: Omit<WorkflowDef, 'name'> & { name: string }; notes: string[] } {
  const notes: string[] = [];
  const steps: WorkflowStepDef[] = (modelWorkflow.steps || []).map((s, i) => {
    let method = 'GET';
    let reqPath = '/';
    if (typeof s.call === 'string' && s.call.includes(' ')) {
      const parts = s.call.split(' ');
      method = parts[0].toUpperCase();
      reqPath = parts.slice(1).join(' ');
    } else if (typeof s.call === 'string') {
      reqPath = s.call;
    }
    if (s.auth) notes.push(`Step ${i + 1}: model "auth: ${s.auth}" has no file equivalent — express it with inject (header:Authorization).`);
    if (s.bind) notes.push(`Step ${i + 1}: model "bind" has no file equivalent — express it with capture/captureInput.`);
    return {
      name: s.description || `${method} ${reqPath}`,
      method,
      path: reqPath,
      description: s.description,
      body: s.body,
      expectStatus: s.expectStatus,
    };
  });
  return { def: { name: modelWorkflow.name, description: modelWorkflow.description, steps }, notes };
}

function writeWorkflowFile(filePath: string, def: WorkflowDef): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = { ...def, generatedAt: new Date().toISOString() };
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// ── jetic_validate_workflow ─────────────────────────────────────────────────

export const validateWorkflowSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  workflow: z.string().optional().describe('Workflow slug, name, or file path to validate (omit when passing inline "definition")'),
  definition: inlineWorkflowSchema.optional().describe('Inline workflow to dry-run validate WITHOUT saving (for pre-save checks)'),
  allowUnknownEndpoints: z.boolean().optional().default(false).describe('Downgrade unknown-endpoint errors to warnings (endpoint exists on server but not in model yet)'),
});

export function handleValidateWorkflow(args: z.infer<typeof validateWorkflowSchema>) {
  if (!args.workflow && !args.definition) {
    throw new Error('Provide either "workflow" (slug/name/file) or an inline "definition" to validate.');
  }
  let def: WorkflowDef;
  let filePath: string | undefined;
  if (args.definition) {
    def = args.definition as WorkflowDef;
  } else {
    const resolved = resolveFileWorkflow(args.projectPath, args.workflow!);
    // Embedded model workflows resolve above with a clear error; file ones land here.
    def = resolved.def;
    filePath = resolved.filePath;
  }
  const report = validateWorkflowDefinition(def, {
    projectPath: args.projectPath,
    allowUnknownEndpoints: args.allowUnknownEndpoints === true,
  });
  return { ...(filePath ? { filePath } : { saved: false }), ...report };
}

// ── jetic_create_workflow ───────────────────────────────────────────────────

export const createWorkflowSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  name: z.string().min(1).optional().describe('Workflow name (required unless fromModelWorkflow is used)'),
  slug: z.string().optional().describe('File slug override (default: derived from name, e.g. "User Onboarding" -> "user-onboarding")'),
  description: z.string().optional(),
  environment: z.string().optional().describe('Target environment name from the model (e.g. local)'),
  steps: z.array(workflowStepSchema).min(1).optional().describe('Ordered steps (required unless fromModelWorkflow is used)'),
  fromModelWorkflow: z.string().optional().describe('Migrate an embedded model.json workflow by name instead of authoring steps manually'),
  overwrite: z.boolean().optional().default(false).describe('Overwrite the file if the slug already exists (default false — safe creation)'),
  validateOnly: z.boolean().optional().default(false).describe('Only validate, do not write any file (dry run)'),
  allowUnknownEndpoints: z.boolean().optional().default(false).describe('Save even when steps reference endpoints missing from model.json (recorded as warnings)'),
});

export function handleCreateWorkflow(args: z.infer<typeof createWorkflowSchema>) {
  let def: WorkflowDef;
  const migrationNotes: string[] = [];

  if (args.fromModelWorkflow) {
    const { model } = loadModel(args.projectPath);
    const raw = (model.workflows || []).find((w) => w.name === args.fromModelWorkflow);
    if (!raw) {
      throw new Error(
        `Embedded workflow "${args.fromModelWorkflow}" not found in model.json. Available: ${(model.workflows || []).map((w) => w.name).join(', ') || '(none)'}.`
      );
    }
    const migrated = migrateModelWorkflow(raw as unknown as { name: string; description?: string; steps: Array<Record<string, any>> });
    def = {
      ...(args.name ? { name: args.name } : {}),
      ...migrated.def,
      ...(args.description ? { description: args.description } : {}),
      ...(args.environment ? { environment: args.environment } : {}),
      ...(args.steps ? { steps: args.steps as WorkflowStepDef[] } : {}),
    } as WorkflowDef;
    migrationNotes.push(...migrated.notes);
  } else {
    if (!args.name) throw new Error('"name" is required to create a workflow (or use fromModelWorkflow to migrate one).');
    if (!args.steps || args.steps.length === 0) {
      throw new Error('"steps" with at least one step is required (or use fromModelWorkflow to migrate one).');
    }
    def = {
      name: args.name,
      ...(args.description ? { description: args.description } : {}),
      ...(args.environment ? { environment: args.environment } : {}),
      steps: args.steps as WorkflowStepDef[],
    };
  }

  const report = validateWorkflowDefinition(def, {
    projectPath: args.projectPath,
    allowUnknownEndpoints: args.allowUnknownEndpoints === true,
  });
  const warnings = [...report.warnings];
  for (const note of migrationNotes) {
    warnings.push({ severity: 'warning', code: 'MIGRATION_NOTE', message: note, fix: 'Adjust the saved file with jetic_update_workflow.' });
  }

  if (!report.valid) {
    throw new Error(
      `Workflow "${def.name}" has ${report.errorsCount} error(s) and was NOT saved:\n` +
        report.errors.map((e) => `- [step ${e.stepIndex ?? '-'}] ${e.message} Fix: ${e.fix}`).join('\n')
    );
  }

  const slug = args.slug?.trim() ? slugifyWorkflowName(args.slug) : slugifyWorkflowName(def.name);
  const filePath = workflowFilePath(args.projectPath, slug);
  // NOTE: zod `.default(false)` only applies through MCP transport validation;
  // direct callers may omit flags, so compare explicitly against `true`.
  const overwrite = args.overwrite === true;
  const validateOnly = args.validateOnly === true;

  if (validateOnly) {
    return {
      success: true,
      action: 'validated',
      saved: false as const,
      slug,
      filePath,
      stepsCount: def.steps.length,
      validation: { ...report, warnings },
    };
  }

  if (fs.existsSync(filePath) && !overwrite) {
    throw new Error(
      `Workflow file already exists at ${filePath}. Pass overwrite: true to replace it, use jetic_update_workflow to edit it, or pick another slug.`
    );
  }
  const existedBefore = fs.existsSync(filePath);

  writeWorkflowFile(filePath, def);

  return {
    success: true,
    action: existedBefore ? 'overwritten' : 'created',
    slug,
    filePath,
    stepsCount: def.steps.length,
    validation: { ...report, warnings },
    next: `Run it with jetic_simulate_workflow { "workflow": "${slug}" }.`,
  };
}

// ── jetic_update_workflow ───────────────────────────────────────────────────

export const updateWorkflowSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  workflow: z.string().describe('Workflow slug, name, or file path to update'),
  name: z.string().min(1).optional().describe('Rename the workflow (file slug stays the same)'),
  description: z.string().optional().describe('Replace the description'),
  environment: z.string().optional().describe('Replace the target environment'),
  steps: z.array(workflowStepSchema).min(1).optional().describe('REPLACE all steps (use appendSteps to only add)'),
  appendSteps: z.array(workflowStepSchema).optional().describe('Append steps to the end (memory from existing steps stays usable)'),
  validateOnly: z.boolean().optional().default(false).describe('Only validate the result, do not write'),
  allowUnknownEndpoints: z.boolean().optional().default(false),
});

export function handleUpdateWorkflow(args: z.infer<typeof updateWorkflowSchema>) {
  const resolved = resolveFileWorkflow(args.projectPath, args.workflow);
  const def: WorkflowDef = {
    ...resolved.def,
    ...(args.name ? { name: args.name } : {}),
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.environment !== undefined ? { environment: args.environment } : {}),
    steps: [
      ...((args.steps ? [] : resolved.def.steps || []) as WorkflowStepDef[]),
      ...((args.steps || []) as WorkflowStepDef[]),
      ...((args.appendSteps || []) as WorkflowStepDef[]),
    ],
  };

  const report = validateWorkflowDefinition(def, {
    projectPath: args.projectPath,
    allowUnknownEndpoints: args.allowUnknownEndpoints === true,
  });
  if (!report.valid) {
    throw new Error(
      `Updated workflow has ${report.errorsCount} error(s) and was NOT saved:\n` +
        report.errors.map((e) => `- [step ${e.stepIndex ?? '-'}] ${e.message} Fix: ${e.fix}`).join('\n')
    );
  }
  if (args.validateOnly === true) {
    return { success: true, action: 'validated', saved: false as const, slug: resolved.slug, filePath: resolved.filePath, stepsCount: def.steps.length, validation: report };
  }

  writeWorkflowFile(resolved.filePath, def);
  return {
    success: true,
    action: 'updated',
    slug: resolved.slug,
    filePath: resolved.filePath,
    stepsCount: def.steps.length,
    validation: report,
    next: `Run it with jetic_simulate_workflow { "workflow": "${resolved.slug}" }.`,
  };
}

// ── jetic_delete_workflow ───────────────────────────────────────────────────

export const deleteWorkflowSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  workflow: z.string().describe('Workflow slug, name, or file path to delete'),
});

export function handleDeleteWorkflow(args: z.infer<typeof deleteWorkflowSchema>) {
  const listing = handleListWorkflows({ projectPath: args.projectPath });
  const search = args.workflow.toLowerCase();
  const item = listing.workflows.find(
    (w) =>
      w.id.toLowerCase() === search ||
      w.name.toLowerCase() === search ||
      (w.filePath && path.resolve(w.filePath).toLowerCase() === path.resolve(args.workflow).toLowerCase())
  );
  if (!item) {
    return { success: false, message: `Workflow "${args.workflow}" not found.` };
  }
  if (item.source === 'model_json' || !item.filePath) {
    throw new Error(
      `Workflow "${args.workflow}" is embedded in model.json and cannot be deleted by this tool. Remove it by editing .jetic/model.json directly.`
    );
  }
  fs.rmSync(item.filePath, { force: true });
  return { success: true, action: 'deleted', slug: item.id, filePath: item.filePath };
}
