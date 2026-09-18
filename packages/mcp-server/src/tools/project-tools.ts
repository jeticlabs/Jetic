import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { loadModel, saveModel, resolveModelPath, projectRootOfModel } from '../types';
import { BehavioralModel, Endpoint, CURRENT_MODEL_VERSION } from '@jetic/model';
import type { JeticConfig } from '@jetic/core';

// ── jetic_init ──────────────────────────────────────────────────────────────
// Step 1 of the structured MCP order: scaffold `.jetic/` for repos that don't
// have one yet. Never clobbers an existing model.json unless asked.

export const initProjectSchema = z.object({
  projectPath: z.string().optional().describe('Path to the project root to initialize (defaults to JETIC_PROJECT_PATH / cwd)'),
  projectName: z.string().optional().describe('Project name (default: directory basename)'),
  language: z.string().optional().describe('Primary language (default: "typescript" when tsconfig.json exists, else omitted)'),
  framework: z.string().optional().describe('Framework (default: "express" when express is a dependency, else omitted)'),
  environmentName: z.string().optional().describe('First environment name (default "local")'),
  baseUrl: z.string().optional().describe('First environment base URL (default "http://localhost:3000")'),
  overwrite: z.boolean().optional().describe('Replace an existing .jetic/model.json (default false — never clobber silently)'),
});

interface StackSignals {
  hasPackageJson: boolean;
  hasExpress: boolean;
  hasTsConfig: boolean;
}

function detectStack(projectRoot: string): StackSignals {
  let hasExpress = false;
  let hasPackageJson = false;
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      hasPackageJson = true;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}) };
      hasExpress = 'express' in deps;
    }
  } catch {
    // Unreadable package.json → treat as unknown stack.
  }
  return { hasPackageJson, hasExpress, hasTsConfig: fs.existsSync(path.join(projectRoot, 'tsconfig.json')) };
}

export function handleInitProject(args: z.infer<typeof initProjectSchema>) {
  const filePath = resolveModelPath(args.projectPath);
  const projectRoot = projectRootOfModel(filePath);
  const overwrite = args.overwrite === true;

  if (fs.existsSync(filePath) && !overwrite) {
    const { model } = loadModel(args.projectPath);
    return {
      success: false,
      action: 'already-initialized' as const,
      filePath,
      modelExists: true,
      endpointsCount: model.endpoints?.length || 0,
      message: `Model already exists at ${filePath} — nothing was overwritten. Continue with step 2 (jetic_scan for Express, or jetic_add_endpoint per endpoint).`,
      next: 'If this is an Express+TypeScript project, run jetic_scan next. Otherwise read the code and add endpoints with jetic_add_endpoint, then jetic_verify_model.',
    };
  }

  const stack = detectStack(projectRoot);
  const model: BehavioralModel = {
    version: CURRENT_MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    project: {
      name: args.projectName || path.basename(projectRoot) || 'jetic-project',
      ...(args.language || (stack.hasTsConfig ? 'typescript' : undefined)
        ? { language: args.language || 'typescript' }
        : {}),
      ...(args.framework || (stack.hasExpress ? 'express' : undefined)
        ? { framework: args.framework || 'express' }
        : {}),
    },
    environments: [
      { name: args.environmentName || 'local', baseUrl: args.baseUrl || 'http://localhost:3000' },
    ],
    securitySchemes: {},
    resources: [],
    endpoints: [],
    dependencies: [],
    workflows: [],
    stateMachines: [],
  };

  saveModel(filePath, model);
  fs.mkdirSync(path.join(path.dirname(filePath), 'workflows'), { recursive: true });
  const configPath = path.join(path.dirname(filePath), 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({}, null, 2), 'utf-8');
  }

  const scanRecommended = stack.hasExpress && stack.hasTsConfig;
  return {
    success: true,
    action: overwrite ? ('overwritten' as const) : ('created' as const),
    filePath,
    project: model.project,
    detected: stack,
    scanRecommended,
    next: scanRecommended
      ? 'Step 2: this looks like an Express+TypeScript project — run jetic_scan next to auto-fill model.json (no AI key needed), then refine with jetic_add_endpoint and jetic_verify_model.'
      : 'Step 2: no auto-scan applies here — read the backend code and add each endpoint with jetic_add_endpoint (middleware, security, parameters, responses), then jetic_verify_model until clean. Step 3 (only on request): author workflows with jetic_validate_workflow → jetic_create_workflow → jetic_simulate_workflow.',
  };
}

// ── jetic_scan ──────────────────────────────────────────────────────────────
// Step 2a of the structured order (Express+TypeScript only): static AST scan.
// Runs WITHOUT any AI provider: no keys, no `jetic config ai`. Writes progress
// to stdout, so output is silenced while it runs (MCP stdio must stay clean).

export const scanProjectSchema = z.object({
  projectPath: z.string().optional().describe('Path to the Express project root (must contain tsconfig.json). Defaults to JETIC_PROJECT_PATH / cwd.'),
  mode: z.enum(['merge', 'overwrite']).optional().describe('merge (default): upsert scanned routes, keep hand-added endpoints. overwrite: replace the whole endpoints array.'),
});

async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log;
  const origInfo = console.info;
  const origDebug = (console as any).debug?.bind(console);
  const noop = () => {};
  (process.stdout as any).write = noop;
  console.log = noop as any;
  console.info = noop as any;
  if ((console as any).debug) (console as any).debug = noop;
  try {
    return await fn();
  } finally {
    (process.stdout as any).write = origStdoutWrite;
    console.log = origLog;
    console.info = origInfo;
    if (origDebug) (console as any).debug = origDebug;
  }
}

export async function handleScanProject(args: z.infer<typeof scanProjectSchema>) {
  const filePath = resolveModelPath(args.projectPath);
  const projectRoot = projectRootOfModel(filePath);
  const mode = args.mode || 'merge';

  if (!fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
    throw new Error(
      `Cannot scan ${projectRoot}: no tsconfig.json found. jetic_scan only supports Express+TypeScript projects. ` +
        `For any other stack, read the code and model each endpoint with jetic_add_endpoint instead.`
    );
  }

  // Lazy import keeps server startup fast when scan is never used.
  const { ExpressScanner } = await import('@jetic/scanner');
  const config: JeticConfig = {
    projectRoot,
    jeticDir: path.dirname(filePath),
    // No `ai` key on purpose: static discovery only, no provider, no keys.
  };

  let scanned: BehavioralModel;
  try {
    scanned = await quietly(() => new ExpressScanner(config).scan());
  } catch (err: any) {
    throw new Error(
      `Scan failed for ${projectRoot}: ${err?.message || err}. ` +
        `If this is not an Express+TypeScript codebase, model endpoints manually with jetic_add_endpoint.`
    );
  }

  const { model: existing, exists } = loadModel(args.projectPath);
  let added = 0;
  let updated = 0;
  let preserved = 0;

  if (!exists || mode === 'overwrite') {
    if (mode === 'overwrite' && exists) preserved = 0;
    existing.endpoints = scanned.endpoints;
    added = scanned.endpoints.length;
    if (!existing.environments || existing.environments.length === 0) {
      existing.environments = scanned.environments;
    }
  } else {
    const index = new Map<string, number>();
    existing.endpoints.forEach((e: Endpoint, i: number) =>
      index.set(`${e.method.toUpperCase()} ${e.path}`, i)
    );
    for (const s of scanned.endpoints) {
      const key = `${s.method.toUpperCase()} ${s.path}`;
      const at = index.get(key);
      if (at === undefined) {
        existing.endpoints.push(s);
        added++;
      } else {
        existing.endpoints[at] = s;
        updated++;
      }
    }
    preserved = existing.endpoints.length - added - updated;
    if (!existing.environments || existing.environments.length === 0) {
      existing.environments = scanned.environments;
    }
  }

  // Keep scanned project metadata when the existing one is still a stub.
  if (!existing.project?.framework && scanned.project?.framework) {
    existing.project = { ...scanned.project, ...existing.project };
  }

  saveModel(filePath, existing);

  // Auto-clear changes.json after a successful scan (model is now up-to-date)
  const changesPath = path.join(path.dirname(filePath), 'changes.json');
  if (fs.existsSync(changesPath)) {
    try {
      const changesData = JSON.parse(fs.readFileSync(changesPath, 'utf-8'));
      changesData.changes = [];
      changesData.watchedSince = new Date().toISOString();
      fs.writeFileSync(changesPath, JSON.stringify(changesData, null, 2), 'utf-8');
    } catch { /* changes.json may not exist yet — ignore */ }
  }

  const total = existing.endpoints.length;
  return {
    success: true,
    action: 'scanned' as const,
    filePath,
    mode,
    stats: { scanned: scanned.endpoints.length, added, updated, preserved, total },
    ...(scanned.endpoints.length === 0
      ? {
          warning:
            'Static scan found 0 endpoints. Check that Express routes live under this project root (custom entry points or routers may need manual modeling with jetic_add_endpoint).',
        }
      : {}),
    next:
      total === 0
        ? 'No endpoints yet — model them manually with jetic_add_endpoint, then jetic_verify_model.'
        : `Next: refine with jetic_add_endpoint / jetic_update_endpoint (AI enrichment is skipped in scans — add constraints, examples, ownership by hand), then jetic_verify_model until clean. Step 3 (only on request): workflows via jetic_validate_workflow → jetic_create_workflow → jetic_simulate_workflow.`,
  };
}

// ── jetic_get_changes ────────────────────────────────────────────────────────
// Reads .jetic/changes.json — the lightweight diff log populated by the
// ChangeScanner in `jetic dev`. Returns the list of source files that were
// edited since the last scan/clear so the AI doesn't need to read the whole
// codebase — only the changed files.

export const getChangesSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root (defaults to JETIC_PROJECT_PATH / cwd)'),
});

export function handleGetChanges(args: z.infer<typeof getChangesSchema>) {
  const filePath    = resolveModelPath(args.projectPath);
  const jeticDir    = path.dirname(filePath);
  const changesPath = path.join(jeticDir, 'changes.json');

  if (!fs.existsSync(changesPath)) {
    return {
      hasChanges: false,
      changes: [],
      watchedSince: null,
      message: 'No changes.json found. Start `jetic dev` to enable automatic file change tracking.',
    };
  }

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(changesPath, 'utf-8'));
  } catch {
    return { hasChanges: false, changes: [], watchedSince: null, message: 'changes.json is unreadable or corrupted.' };
  }

  const changes: Array<{ filePath: string; absolutePath: string; changedAt: string; eventType: string }> =
    Array.isArray(data.changes) ? data.changes : [];

  return {
    hasChanges: changes.length > 0,
    totalChanged: changes.length,
    watchedSince: data.watchedSince ?? null,
    projectRoot: data.projectRoot ?? jeticDir,
    changes,
    filePaths: changes.map((c) => c.filePath),
    hint: changes.length > 0
      ? `Read ONLY these ${changes.length} file(s) to update model.json — no need to scan the entire codebase. After updating, call jetic_clear_changes.`
      : 'No file changes recorded since last scan. Model is up-to-date.',
  };
}

// ── jetic_clear_changes ──────────────────────────────────────────────────────
// Clears .jetic/changes.json after the AI has finished updating model.json
// from the changed files. Automatically called by jetic_scan too.

export const clearChangesSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root (defaults to JETIC_PROJECT_PATH / cwd)'),
});

export function handleClearChanges(args: z.infer<typeof clearChangesSchema>) {
  const filePath    = resolveModelPath(args.projectPath);
  const jeticDir    = path.dirname(filePath);
  const changesPath = path.join(jeticDir, 'changes.json');

  if (!fs.existsSync(changesPath)) {
    return { success: true, message: 'changes.json did not exist — nothing to clear.' };
  }

  try {
    const data = JSON.parse(fs.readFileSync(changesPath, 'utf-8'));
    const cleared = Array.isArray(data.changes) ? data.changes.length : 0;
    data.changes = [];
    data.watchedSince = new Date().toISOString();
    fs.writeFileSync(changesPath, JSON.stringify(data, null, 2), 'utf-8');
    return {
      success: true,
      cleared,
      watchedSince: data.watchedSince,
      message: `Cleared ${cleared} change record(s). ChangeScanner will now track future edits from scratch.`,
    };
  } catch (err: any) {
    throw new Error(`Failed to clear changes.json: ${err.message}`);
  }
}
