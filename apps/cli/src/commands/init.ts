import { Command } from 'commander';
import { loadConfig, ensureDirSync, writeJsonSync } from '@jetic/core';
import { configureVSCodeMcp, formatVSCodeMcpDiff } from '../lib/ide-config';
import * as fs from 'fs';
import * as path from 'path';

export const initCommand = new Command('init')
  .description('Initialize Jetic or configure an IDE MCP server')
  .option('--ide <target>', 'Configure an IDE MCP server (currently: vscode)')
  .option('--dry-run', 'Show the IDE configuration change without writing it')
  .action(async (options: { ide?: string; dryRun?: boolean }) => {
    if (options.ide) {
      if (options.ide !== 'vscode') {
        console.error(`Unsupported IDE target "${options.ide}". Currently supported: vscode.`);
        process.exitCode = 2;
        return;
      }

      try {
        const result = configureVSCodeMcp(process.cwd(), options.dryRun);
        if (!result.changed) {
          console.log(`VS Code MCP server is already configured in ${result.filePath}.`);
        } else if (result.dryRun) {
          console.log(`Dry run: would add the Jetic MCP server to ${result.filePath}.`);
          console.log(formatVSCodeMcpDiff(result.filePath));
        } else {
          console.log(`Configured the Jetic MCP server in ${result.filePath}.`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
      }
      return;
    }

    const config = loadConfig();
    const projectConfigPath = path.join(config.projectRoot, 'jetic.config.json');
    const projectConfig = {
      $schema: 'https://jetic.dev/schema/config.json',
      project: { name: path.basename(config.projectRoot) },
      source: {
        root: '.',
        include: ['src/**/*.{ts,tsx,js,jsx}'],
        exclude: ['node_modules/**', 'dist/**', 'build/**', '.next/**', 'coverage/**'],
      },
      scanner: { adapter: 'auto', incremental: true, watch: true },
      model: { directory: '.jetic/model' },
      workflows: { directory: '.jetic/workflows' },
      agents: { directory: '.jetic/agents' },
      tools: { entry: './jetic.tools.ts' },
      environments: { directory: '.jetic/environments', default: 'local' },
      runtime: { baseUrl: 'http://localhost:3000' },
    };

    if (!fs.existsSync(projectConfigPath)) {
      writeJsonSync(projectConfigPath, projectConfig);
    }

    for (const directory of [
      'model/paths',
      'model/schemas',
      'model/security',
      'workflows',
      'agents',
      'environments',
      'activity',
      'index',
      'runs',
      'reports',
      'cache',
    ]) {
      ensureDirSync(path.join(config.jeticDir, directory));
    }

    console.log('\x1b[36mJetic Static Analyzer\x1b[0m\n');

    const banner = `
\x1b[36m
 __        __   _                            _____ 
 \\ \\      / /__| | ___ ___  _ __ ___   ___  |_   _|__ 
  \\ \\ /\\ / / _ \\ |/ __/ _ \\| '_ \` _ \\ / _ \\   | |/ _ \\
   \\ V  V /  __/ | (_| (_) | | | | | |  __/   | | (_) |
    \\_/\\_/ \\___|_|\\___\\___/|_| |_| |_|\\___|   |_|\\___/
                                                      
      _ _____ _____ ___ ___ 
     | | ____|_   _|_ _/ __|
  _  | |  _|   | |  | | |   
 | |_| | |___  | |  | | |__ 
  \\___/|_____| |_| |___\\___|
\x1b[0m`;

    console.log(banner);
    console.log(`\x1b[32m✓\x1b[0m Successfully initialized Jetic in \x1b[1m${config.jeticDir}\x1b[0m\n`);
    console.log(`Project configuration: ${projectConfigPath}`);
    console.log('Available Commands:');
    console.log('  \x1b[36mjetic scan\x1b[0m     Statically scan Express routes into the behavioral model');
    console.log('  \x1b[36mjetic inspect\x1b[0m  Inspect discovered endpoints and details');
    console.log('');
  });
