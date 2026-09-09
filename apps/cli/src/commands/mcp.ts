import { Command } from 'commander';
import { runMcpServer } from '@jetic/mcp-server';

export const mcpCommand = new Command('mcp')
  .description('Launch Model Context Protocol (MCP) server over stdio for AI IDE integration (opencode, Antigravity, Cursor, Claude Code/Desktop, Windsurf, VS Code)')
  .option('-p, --project <path>', 'Project root (or .jetic folder) to serve. Same as setting JETIC_PROJECT_PATH.')
  .action(async (options: { project?: string }) => {
    try {
      if (options.project) {
        process.env.JETIC_PROJECT_PATH = options.project;
      }
      await runMcpServer();
    } catch (err: any) {
      console.error('Fatal MCP Server error:', err.message || err);
      process.exit(1);
    }
  });
