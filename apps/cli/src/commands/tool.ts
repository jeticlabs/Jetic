import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { loadConfig } from '@jetic/core';
import type { ToolsModule } from '@jetic/sdk';

/**
 * Loads the project's `jetic.tools.ts` entry (project.md §23). Only `.js`/`.cjs`
 * entries (or `.ts` already compiled/registered by the host project, e.g. via
 * `tsx`/`ts-node`) can be `require()`-d directly from a plain Node process.
 */
function loadToolsModule(entryPath: string): ToolsModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(entryPath);
  const tools = mod.tools ?? mod.default?.tools;
  if (!Array.isArray(tools)) {
    throw new Error(`"${entryPath}" must export a "tools" array (see @jetic/sdk's defineTool).`);
  }
  return { tools };
}

export const toolCommand = new Command('tool')
  .description('List and inspect tools registered in jetic.tools.ts')
  .addCommand(
    new Command('list')
      .description('List tools exported from the configured tools entry')
      .action(() => {
        const config = loadConfig();
        const entry = config.projectConfig?.tools?.entry || './jetic.tools.ts';
        const entryPath = path.join(config.projectRoot, entry);

        if (!fs.existsSync(entryPath)) {
          console.log(`No tools entry found at ${entryPath}. Create it and export { tools: JeticTool[] } (see @jetic/sdk).`);
          return;
        }

        try {
          const { tools } = loadToolsModule(entryPath);
          console.log(`\nJETIC TOOLS (${entryPath})\n`);
          for (const tool of tools) {
            console.log(`  ${tool.name.padEnd(24)} ${tool.description}`);
          }
          console.log('');
        } catch (err: any) {
          if (entryPath.endsWith('.ts')) {
            console.error(
              `Could not load ${entryPath} directly (TypeScript entries require a loader like tsx/ts-node in this project): ${err.message}`
            );
          } else {
            console.error(`Failed to load tools from ${entryPath}: ${err.message}`);
          }
          process.exitCode = 2;
        }
      })
  );
