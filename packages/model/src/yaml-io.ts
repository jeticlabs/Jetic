import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { BehavioralModel, Endpoint, SecurityScheme } from './schema';

function ensureDirSync(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function writeYamlSync(filePath: string, data: unknown) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, yaml.dump(data, { noRefs: true, lineWidth: 100 }), 'utf-8');
}

function readYamlSync<T>(filePath: string): T {
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) as T;
}

/** Groups endpoints into one file per first path segment, e.g. /auth/login -> paths/auth.yaml */
function groupNameForEndpoint(endpoint: Endpoint): string {
  const segment = endpoint.path.split('/').filter(Boolean)[0];
  return segment ? segment.replace(/[^a-zA-Z0-9_-]/g, '-') : 'root';
}

/**
 * Splits a BehavioralModel into the project.md §16 layout: an `api.yaml`
 * index plus `paths/<group>.yaml` and `security/authentication.yaml`.
 */
export function saveModelToDir(model: BehavioralModel, modelDir: string): void {
  ensureDirSync(modelDir);
  ensureDirSync(path.join(modelDir, 'paths'));
  ensureDirSync(path.join(modelDir, 'schemas'));
  ensureDirSync(path.join(modelDir, 'security'));

  const groups = new Map<string, Endpoint[]>();
  for (const endpoint of model.endpoints) {
    const group = groupNameForEndpoint(endpoint);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(endpoint);
  }

  const pathFiles: string[] = [];
  for (const [group, endpoints] of groups) {
    const relFile = `./paths/${group}.yaml`;
    writeYamlSync(path.join(modelDir, 'paths', `${group}.yaml`), { endpoints });
    pathFiles.push(relFile);
  }

  const securityFiles: string[] = [];
  if (model.securitySchemes && Object.keys(model.securitySchemes).length > 0) {
    writeYamlSync(path.join(modelDir, 'security', 'authentication.yaml'), {
      securitySchemes: model.securitySchemes,
    });
    securityFiles.push('./security/authentication.yaml');
  }

  writeYamlSync(path.join(modelDir, 'api.yaml'), {
    version: model.version,
    generatedAt: model.generatedAt,
    project: model.project,
    environments: model.environments ?? [],
    resources: model.resources ?? [],
    dependencies: model.dependencies ?? [],
    workflows: model.workflows ?? [],
    stateMachines: model.stateMachines ?? [],
    paths: pathFiles,
    security: securityFiles,
  });
}

/** Reassembles a BehavioralModel from the split YAML layout written by {@link saveModelToDir}. */
export function loadModelFromDir(modelDir: string): BehavioralModel {
  const indexPath = path.join(modelDir, 'api.yaml');
  const index = readYamlSync<Record<string, any>>(indexPath);

  const endpoints: Endpoint[] = [];
  for (const relFile of index.paths ?? []) {
    const doc = readYamlSync<{ endpoints?: Endpoint[] }>(path.join(modelDir, relFile));
    endpoints.push(...(doc.endpoints ?? []));
  }

  let securitySchemes: Record<string, SecurityScheme> = {};
  for (const relFile of index.security ?? []) {
    const doc = readYamlSync<{ securitySchemes?: Record<string, SecurityScheme> }>(
      path.join(modelDir, relFile)
    );
    securitySchemes = { ...securitySchemes, ...(doc.securitySchemes ?? {}) };
  }

  return {
    version: index.version,
    generatedAt: index.generatedAt,
    project: index.project,
    environments: index.environments ?? [],
    securitySchemes,
    resources: index.resources ?? [],
    endpoints,
    dependencies: index.dependencies ?? [],
    workflows: index.workflows ?? [],
    stateMachines: index.stateMachines ?? [],
  };
}

/**
 * Loads a workflow definition file (project.md §20 authored as YAML; existing
 * projects keep `.json`). Extension decides the parser; shape is unchanged.
 */
export function readWorkflowDefinitionFile<T = unknown>(filePath: string): T {
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return readYamlSync<T>(filePath);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

/** Lists workflow definition files (.json, .yaml, .yml) in a directory, sorted by name. */
export function listWorkflowFiles(workflowsDir: string): string[] {
  if (!fs.existsSync(workflowsDir)) return [];
  return fs
    .readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();
}

/** True when a split-YAML model (api.yaml index) exists at `modelDir`. */
export function hasYamlModel(modelDir: string): boolean {
  return fs.existsSync(path.join(modelDir, 'api.yaml'));
}

/**
 * Loads a model preferring the split YAML layout at `modelDir`, falling back to
 * the legacy single `<jeticDir>/model.json`. Returns `null` when neither exists.
 */
export function loadModelCompat(jeticDir: string, modelDir: string): BehavioralModel | null {
  if (hasYamlModel(modelDir)) return loadModelFromDir(modelDir);

  const jsonPath = path.join(jeticDir, 'model.json');
  if (!fs.existsSync(jsonPath)) return null;
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as BehavioralModel;
}

