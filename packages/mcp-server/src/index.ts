#!/usr/bin/env node
/**
 * @jetic/mcp-server — executable entry point + library barrel.
 *
 * As a binary (`jetic-mcp`, `npx @jetic/mcp-server`, or `jetic mcp`) this file
 * launches the MCP server over stdio. As a library it re-exports every tool
 * handler so host applications (e.g. the Jetic CLI) can embed the server.
 *
 * IMPORTANT (MCP stdio rule): never write to stdout except through the
 * StdioServerTransport. All diagnostics go to stderr.
 */
export * from './types';
export * from './tools/model-tools';
export * from './tools/endpoint-tools';
export * from './tools/validation-tools';
export * from './tools/testing-tools';
export * from './tools/environment-tools';
export * from './tools/workflow-tools';
export * from './tools/workflow-authoring-tools';
export * from './server';
export * from './serial-transport';

import * as fs from 'fs';
import * as path from 'path';
import { runMcpServer } from './server';

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // Fall through to default below (e.g. bundled layouts without package.json).
  }
  return '0.1.0';
}

function printHelp(): void {
  const help = [
    'jetic-mcp — Model Context Protocol server for Jetic Behavioral Models',
    '',
    'Usage:',
    '  jetic-mcp                      Start the MCP server over stdio (default)',
    '  jetic mcp                      Same, via the Jetic CLI',
    '  jetic-mcp --help               Show this help and exit',
    '  jetic-mcp --version            Print version and exit',
    '',
    'Environment:',
    '  JETIC_PROJECT_PATH   Default project root (overrides process cwd).',
    '                       Individual tools also accept a "projectPath" argument',
    '                       which takes precedence over this variable.',
    '',
    'Editor setup:',
    '  See packages/mcp-server/README.md for opencode, Antigravity, Cursor,',
    '  Claude Code/Desktop, Windsurf and VS Code configuration snippets.',
    '',
    'Docs: https://github.com/jeticlabs/Jetic',
  ].join('\n');
  process.stderr.write(help + '\n');
}

function isMainModule(): boolean {
  // Works for CommonJS (tsc "module": "CommonJS"). Kept in a helper so the
  // intent is obvious and easy to adapt if the build ever moves to ESM.
  try {
    return require.main === module;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (argv.includes('--version') || argv.includes('-V') || argv.includes('-v')) {
    process.stderr.write(`jetic-mcp v${readPackageVersion()}\n`);
    process.exit(0);
  }

  const unknownFlags = argv.filter((a) => a.startsWith('-'));
  if (unknownFlags.length > 0) {
    process.stderr.write(`jetic-mcp: unknown option(s): ${unknownFlags.join(', ')}\n`);
    printHelp();
    process.exit(2);
  }

  const shutdown = (signal: string) => {
    process.stderr.write(`jetic-mcp: received ${signal}, shutting down.\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  runMcpServer().catch((err) => {
    console.error('Fatal MCP Server error:', err);
    process.exit(1);
  });
}
