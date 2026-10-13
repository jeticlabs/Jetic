import * as fs from 'fs';
import { runCli } from './cli';
import { createProject, TempProject } from './project';
import { SHOP_FIXTURE_DIR } from './shop-api';

/** A workflow file's JSON: `{ name, steps }` plus whatever extra keys a test needs. */
export type WorkflowJson = { name: string; steps: object[]; [key: string]: unknown };

export interface ShopProjectOptions {
  /** Run `jetic init` and `jetic scan` (default true). */
  scan?: boolean;
  /**
   * Really run `jetic scan` in this project (default false). By default a project is a copy of a
   * scan made once per test file, with the recorded absolute paths rewritten to the new location —
   * indistinguishable for everything except testing the scanner itself.
   */
  realScan?: boolean;
  /** Point the model's `local` environment at this URL instead of the .env PORT. */
  baseUrl?: string;
  /** Workflows to write into `.jetic/workflows/<slug>.json`. */
  workflows?: Record<string, WorkflowJson>;
}

async function run(project: TempProject, args: string[]): Promise<void> {
  const result = await runCli(args, { cwd: project.dir });
  if (result.code !== 0) throw new Error(`jetic ${args.join(' ')} failed:\n${result.out}`);
}

let initialized: Promise<TempProject> | undefined;
let scannedOnce: Promise<TempProject> | undefined;

/**
 * The fixture after a real `jetic init`, made once per test file. `init` output depends only on the
 * directory name (always "shop-api"), so later projects copy it instead of paying for a process start.
 */
function initializedTemplate(): Promise<TempProject> {
  initialized ??= (async () => {
    const template = createProject({ from: SHOP_FIXTURE_DIR, name: 'shop-api' });
    await run(template, ['init']);
    return template;
  })();
  return initialized;
}

/** The initialized fixture after a real `jetic scan`, made once per test file. */
function scannedTemplate(): Promise<TempProject> {
  scannedOnce ??= (async () => {
    const template = createProject({ from: (await initializedTemplate()).dir, name: 'shop-api' });
    await run(template, ['scan']);
    return template;
  })();
  return scannedOnce;
}

/** Rewrites every absolute path of `from` inside a project's model.json to `to` (both slash styles). */
function relocateModel(project: TempProject, from: string, to: string): void {
  const file = project.path('.jetic', 'model.json');
  const forms = (dir: string) => [dir.replace(/\\/g, '/'), JSON.stringify(dir).slice(1, -1)];
  const [fromForward, fromEscaped] = forms(from);
  const [toForward, toEscaped] = forms(to);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split(fromForward).join(toForward).split(fromEscaped).join(toEscaped));
}

/**
 * Copies the shop-api fixture into a fresh temp dir and, unless `scan: false`, gives it the model a
 * user would get from `jetic init` + `jetic scan`.
 */
export async function createShopProject(options: ShopProjectOptions = {}): Promise<TempProject> {
  if (options.scan === false) return finish(createProject({ from: SHOP_FIXTURE_DIR, name: 'shop-api' }), options);

  if (options.realScan) {
    const project = createProject({ from: (await initializedTemplate()).dir, name: 'shop-api' });
    await run(project, ['scan']);
    return finish(project, options);
  }

  const template = await scannedTemplate();
  const project = createProject({ from: template.dir, name: 'shop-api' });
  relocateModel(project, template.dir, project.dir);
  return finish(project, options);
}

function finish(project: TempProject, options: ShopProjectOptions): TempProject {
  if (options.baseUrl) {
    const model = project.readJson('.jetic', 'model.json');
    model.environments = [{ name: 'local', baseUrl: options.baseUrl }];
    project.writeJson('.jetic/model.json', model);
  }
  for (const [slug, workflow] of Object.entries(options.workflows ?? {})) {
    writeWorkflow(project, slug, workflow);
  }
  return project;
}

export function writeWorkflow(project: TempProject, slug: string, workflow: WorkflowJson): void {
  project.writeJson(`.jetic/workflows/${slug}.json`, { generatedAt: new Date().toISOString(), ...workflow });
}
