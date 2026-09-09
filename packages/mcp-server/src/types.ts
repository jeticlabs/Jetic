import * as fs from 'fs';
import * as path from 'path';
import { BehavioralModel, CURRENT_MODEL_VERSION } from '@jetic/model';

/** Name of the environment variable that pins the server to a project root. */
export const JETIC_PROJECT_PATH_ENV = 'JETIC_PROJECT_PATH';

/**
 * Returns the effective project input: explicit tool argument first,
 * then `JETIC_PROJECT_PATH`, then the server process working directory.
 * AI editors frequently spawn the server with an unrelated cwd, so the env
 * var (or per-call `projectPath`) is the reliable way to target a project.
 */
export function resolveProjectInput(targetPath?: string): string {
  const explicit = (targetPath ?? '').trim();
  if (explicit) return explicit;
  const fromEnv = (process.env[JETIC_PROJECT_PATH_ENV] ?? '').trim();
  if (fromEnv) return fromEnv;
  return process.cwd();
}

/**
 * Resolves the absolute path to `.jetic/model.json`.
 *
 * Accepts a project root, a `.jetic` directory, a direct `model.json` path,
 * or a source file inside the project. When given a directory, walks up the
 * tree so editors that launch the server from a nested subfolder still find
 * the model.
 */
export function resolveModelPath(targetPath?: string): string {
  const input = path.resolve(resolveProjectInput(targetPath));

  if (input.endsWith('model.json')) {
    return input;
  }
  if (path.basename(input) === '.jetic') {
    return path.join(input, 'model.json');
  }

  let dir = input;
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
      dir = path.dirname(dir);
    }
  } catch {
    dir = path.dirname(dir);
  }

  let current = dir;
  for (;;) {
    const candidate = path.join(current, '.jetic', 'model.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.join(dir, '.jetic', 'model.json');
}

export interface LoadedModel {
  model: BehavioralModel;
  filePath: string;
  /** False when no model.json exists yet on disk (an in-memory default is returned). */
  exists: boolean;
}

function createDefaultModel(projectRoot: string): BehavioralModel {
  return {
    version: CURRENT_MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    project: {
      name: path.basename(projectRoot) || 'jetic-project',
      language: 'typescript',
      framework: 'express',
    },
    environments: [
      {
        name: 'local',
        baseUrl: 'http://localhost:3000',
      },
    ],
    securitySchemes: {},
    resources: [],
    endpoints: [],
    dependencies: [],
    workflows: [],
    stateMachines: [],
  };
}

/**
 * Reads and parses `.jetic/model.json`.
 *
 * - Missing file → returns an in-memory default with `exists: false` so
 *   callers can tell the agent to run `jetic init`/`jetic scan` first instead
 *   of silently operating on an empty phantom model.
 * - Corrupt JSON → throws an error naming the file and the parse failure.
 */
export function loadModel(targetPath?: string): LoadedModel {
  const filePath = resolveModelPath(targetPath);

  if (!fs.existsSync(filePath)) {
    const projectRoot = path.basename(path.dirname(filePath)) === '.jetic'
      ? path.dirname(path.dirname(filePath))
      : path.dirname(filePath);
    return { model: createDefaultModel(projectRoot), filePath, exists: false };
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    throw new Error(`Cannot read model file at ${filePath}: ${err?.message || err}`);
  }

  try {
    const model = JSON.parse(content) as BehavioralModel;
    // Tolerate hand-edited models missing optional arrays.
    if (!Array.isArray((model as any).endpoints)) (model as any).endpoints = [];
    if (!Array.isArray((model as any).environments)) (model as any).environments = [];
    return { model, filePath, exists: true };
  } catch (err: any) {
    throw new Error(
      `Invalid JSON in model file at ${filePath}: ${err?.message || err}. ` +
        `Fix the file manually or regenerate it with "jetic init" / "jetic scan".`
    );
  }
}

/**
 * Saves a BehavioralModel atomically to `.jetic/model.json`
 * (creates the directory when needed, refreshes `generatedAt`).
 */
export function saveModel(filePath: string, model: BehavioralModel): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  model.generatedAt = new Date().toISOString();
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(model, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Derives the project root (parent of `.jetic/`) from a model file path.
 * Falls back to the file's own directory for non-standard layouts.
 */
export function projectRootOfModel(filePath: string): string {
  return path.basename(path.dirname(filePath)) === '.jetic'
    ? path.dirname(path.dirname(filePath))
    : path.dirname(filePath);
}
