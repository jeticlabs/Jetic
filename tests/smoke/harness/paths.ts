import * as path from 'path';

export const SMOKE_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(SMOKE_ROOT, '..', '..');

export const CLI_DIR = path.join(REPO_ROOT, 'apps', 'cli');
export const CLI_DIST = path.join(CLI_DIR, 'dist', 'index.js');
export const CLI_PACKAGE_JSON = path.join(CLI_DIR, 'package.json');
export const DASHBOARD_INDEX = path.join(CLI_DIR, 'dist', 'dashboard', 'index.html');
export const MCP_DIST = path.join(REPO_ROOT, 'packages', 'mcp-server', 'dist', 'index.js');

/** Node compile cache for spawned CLIs — cuts ~25% off every spawn of the 13 MB bundle. */
export const COMPILE_CACHE_DIR = path.join(SMOKE_ROOT, '.tmp', 'node-compile-cache');

/** Set SMOKE_NIGHTLY=true to run slow/network tests (packed install, registry checks). */
export const NIGHTLY = process.env.SMOKE_NIGHTLY === 'true' || process.env.SMOKE_NIGHTLY === '1';
