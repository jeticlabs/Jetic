import * as fs from 'fs';
import * as path from 'path';
import { SMOKE_ROOT } from './paths';

/** What the scanner must produce for a fixture, minus anything machine- or edit-specific (absolute paths, line numbers). */
export interface GoldenEndpoint {
  id: string;
  method: string;
  path: string;
  /** Source file relative to the project root, forward slashes. */
  file: string;
  middleware: string[];
  security: string[];
  pathParams: string[];
}

export interface GoldenModel {
  framework: string;
  environments: Array<{ name: string; baseUrl: string }>;
  endpoints: GoldenEndpoint[];
}

export const SHOP_GOLDEN_PATH = path.join(SMOKE_ROOT, 'fixtures', 'shop-api.expected.json');

export function readGolden(file = SHOP_GOLDEN_PATH): GoldenModel {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Reduces a scanned model.json to its golden form, with endpoints sorted by id. */
export function toGolden(model: any, projectDir: string): GoldenModel {
  const root = path.resolve(projectDir).replace(/\\/g, '/');
  return {
    framework: model.project?.framework,
    environments: model.environments,
    endpoints: [...model.endpoints]
      .map((e: any): GoldenEndpoint => ({
        id: e.id,
        method: e.method,
        path: e.path,
        file: String(e.source.file).replace(/\\/g, '/').replace(`${root}/`, ''),
        middleware: (e.middleware ?? []).map((m: any) => m.name),
        security: (e.security ?? []).map((s: any) => s.scheme),
        pathParams: (e.parameters ?? []).filter((p: any) => p.in === 'path').map((p: any) => p.name),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** UPDATE_GOLDEN=1 rewrites the golden file; reviewers see the diff in the PR. */
export function maybeUpdateGolden(actual: GoldenModel, file = SHOP_GOLDEN_PATH): boolean {
  if (process.env.UPDATE_GOLDEN !== '1') return false;
  fs.writeFileSync(file, JSON.stringify(actual, null, 2) + '\n');
  return true;
}
