import * as fs from 'fs';
import * as path from 'path';
import { runProcess, RunOptions, ProcessResult } from './process';

/**
 * Locates npm's JS entry so it can be run with `node` directly — spawning `npm`
 * itself needs a shell on Windows (npm.cmd), which we avoid for reliable kills.
 */
function npmCliPath(): string {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows installer layout
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // POSIX / setup-node layout
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Could not locate npm-cli.js next to ${process.execPath}`);
  return found;
}

export function runNpm(args: string[], options: RunOptions = {}): Promise<ProcessResult> {
  return runProcess(process.execPath, [npmCliPath(), ...args], { timeoutMs: 300_000, ...options });
}
