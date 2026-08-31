#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { scanCommand } from './commands/scan';
import { inspectCommand } from './commands/inspect';
import { configCommand } from './commands/config';
import { memoryCommand } from './commands/memory';
import { simulateCommand } from './commands/simulate';
import { devCommand } from './commands/dev';
import { upgradeCommand } from './commands/upgrade';

const program = new Command();

program
  .name('jetic')
  .description('AI-Native API Behavior Testing')
  .version('0.1.5');

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(inspectCommand);
program.addCommand(configCommand);
program.addCommand(memoryCommand);
program.addCommand(simulateCommand);
program.addCommand(devCommand);
program.addCommand(upgradeCommand);

program.parse(process.argv);
