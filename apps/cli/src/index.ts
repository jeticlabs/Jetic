#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { scanCommand } from './commands/scan';
import { inspectCommand } from './commands/inspect';
import { configCommand } from './commands/config';
import { modelCommand } from './commands/model';
import { adapterCommand } from './commands/adapter';
import { agentCommand } from './commands/agent';
import { doctorCommand } from './commands/doctor';
import { activityCommand } from './commands/activity';
import { toolCommand } from './commands/tool';
import { testCommand } from './commands/test-command';
import { authzCommand } from './commands/authz';
import { memoryCommand } from './commands/memory';
import { simulateCommand } from './commands/simulate';
import { devCommand } from './commands/dev';
import { upgradeCommand } from './commands/upgrade';
import { mcpCommand } from './commands/mcp';

const program = new Command();

program
  .name('jetic')
  .description('AI-Native API Behavior Testing')
  .version('0.2.5');

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(inspectCommand);
program.addCommand(configCommand);
program.addCommand(modelCommand);
program.addCommand(adapterCommand);
program.addCommand(agentCommand);
program.addCommand(doctorCommand);
program.addCommand(activityCommand);
program.addCommand(toolCommand);
program.addCommand(testCommand);
program.addCommand(authzCommand);
program.addCommand(memoryCommand);
program.addCommand(simulateCommand);
program.addCommand(devCommand);
program.addCommand(upgradeCommand);
program.addCommand(mcpCommand);

program.parse(process.argv);
