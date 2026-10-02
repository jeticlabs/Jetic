import * as fs from 'fs';
import * as path from 'path';
import { ConfigError } from './errors';

/** Shape of the root `jetic.config.json` file (project.md §4). All fields optional except `project.name`. */
export interface ProjectConfig {
  $schema?: string;
  project: { name: string };
  source?: { root?: string; include?: string[]; exclude?: string[] };
  scanner?: { adapter?: string; incremental?: boolean; watch?: boolean };
  model?: { directory?: string };
  workflows?: { directory?: string };
  agents?: { directory?: string };
  tools?: { entry?: string };
  environments?: { directory?: string; default?: string };
  runtime?: { baseUrl?: string };
  /** Role → credential mapping used by `jetic authz` (JETIC_SPEC_PHASES_1-4 §2.5). */
  auth?: {
    roles?: Record<string, { login?: string; env?: Record<string, string> }>;
    anonymous?: boolean;
  };
}

export interface JeticConfig {
  projectRoot: string;
  jeticDir: string;
  /** Raw `jetic.config.json` contents, if present. */
  projectConfig: ProjectConfig | null;
  /** Resolved absolute directories, falling back to `.jetic` defaults when unset. */
  modelDir: string;
  workflowsDir: string;
  agentsDir: string;
  environmentsDir: string;
  scannerAdapter: string;
}

function readProjectConfig(cwd: string): ProjectConfig | null {
  const configPath = path.join(cwd, 'jetic.config.json');
  if (!fs.existsSync(configPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err: any) {
    throw new ConfigError(`Failed to parse ${configPath}: ${err?.message || err}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`${configPath} must contain a JSON object.`);
  }
  const candidate = parsed as Record<string, unknown>;
  const project = candidate.project as { name?: unknown } | undefined;
  if (!project || typeof project.name !== 'string' || !project.name.trim()) {
    throw new ConfigError(`${configPath} must declare a non-empty "project.name" string.`);
  }

  return parsed as ProjectConfig;
}

export function loadConfig(cwd: string = process.cwd()): JeticConfig {
  const jeticDir = path.join(cwd, '.jetic');
  const projectConfig = readProjectConfig(cwd);

  const resolve = (relDir: string | undefined, fallback: string) =>
    path.join(cwd, relDir || fallback);

  return {
    projectRoot: cwd,
    jeticDir,
    projectConfig,
    modelDir: resolve(projectConfig?.model?.directory, '.jetic/model'),
    workflowsDir: resolve(projectConfig?.workflows?.directory, '.jetic/workflows'),
    agentsDir: resolve(projectConfig?.agents?.directory, '.jetic/agents'),
    environmentsDir: resolve(projectConfig?.environments?.directory, '.jetic/environments'),
    scannerAdapter: projectConfig?.scanner?.adapter || 'auto',
  };
}
