import * as fs from 'fs';
import { CLI_DIST, COMPILE_CACHE_DIR, MCP_DIST } from './paths';

/** Smoke tests exercise build output; fail fast with a clear instruction if it is missing. */
export default async function globalSetup(): Promise<void> {
  const missing = [CLI_DIST, MCP_DIST].filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `Smoke tests run against built artifacts, but these are missing:\n  ${missing.join('\n  ')}\n` +
        'Run `pnpm -r run build` at the repo root first.'
    );
  }
  fs.mkdirSync(COMPILE_CACHE_DIR, { recursive: true });
}
