import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const KEEP = process.env.KEEP_SMOKE_TMP === '1';
const created: TempProject[] = [];

export interface TempProject {
  dir: string;
  jeticDir: string;
  path(...segments: string[]): string;
  exists(...segments: string[]): boolean;
  readJson<T = any>(...segments: string[]): T;
  writeJson(relPath: string, data: unknown): void;
  writeFile(relPath: string, content: string): void;
  cleanup(): void;
}

/**
 * Creates an isolated project directory under the OS temp dir, optionally seeded
 * from a fixture directory. Each spec gets its own cwd, so `.jetic/` (including
 * the cwd-relative memory.json) never leaks between tests.
 */
export function createProject(options: { from?: string; name?: string } = {}): TempProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-smoke-'));
  const dir = path.join(root, options.name ?? 'project');
  if (options.from) {
    fs.cpSync(options.from, dir, {
      recursive: true,
      filter: (src) => !src.split(path.sep).includes('node_modules') && !src.split(path.sep).includes('.jetic'),
    });
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }

  const resolve = (...segments: string[]) => path.join(dir, ...segments);
  const project: TempProject = {
    dir,
    jeticDir: resolve('.jetic'),
    path: resolve,
    exists: (...segments) => fs.existsSync(resolve(...segments)),
    readJson: (...segments) => JSON.parse(fs.readFileSync(resolve(...segments), 'utf8')),
    writeJson: (relPath, data) => project.writeFile(relPath, JSON.stringify(data, null, 2)),
    writeFile: (relPath, content) => {
      fs.mkdirSync(path.dirname(resolve(relPath)), { recursive: true });
      fs.writeFileSync(resolve(relPath), content, 'utf8');
    },
    cleanup: () => {
      if (KEEP) return;
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    },
  };
  created.push(project);
  return project;
}

if (typeof afterAll === 'function') {
  afterAll(() => {
    if (KEEP) {
      for (const p of created) process.stderr.write(`[smoke] kept temp project: ${p.dir}\n`);
    }
    while (created.length) created.pop()!.cleanup();
  });
}
