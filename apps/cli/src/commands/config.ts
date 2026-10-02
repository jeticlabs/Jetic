import { Command } from 'commander';
import { loadConfig } from '@jetic/core';

export const configCommand = new Command('config')
  .description('Manage Jetic configuration')
  .action(() => {
    const config = loadConfig();

    console.log('\n\x1b[1mJetic Configuration\x1b[0m\n');
    const tableData = [
      { Key: 'Project Root', Value: config.projectRoot },
      { Key: 'Jetic Directory', Value: config.jeticDir },
      { Key: 'jetic.config.json', Value: config.projectConfig ? 'found' : 'not found (using defaults)' },
      { Key: 'Project Name', Value: config.projectConfig?.project.name ?? '(none)' },
      { Key: 'Scanner Adapter', Value: config.scannerAdapter },
      { Key: 'Model Directory', Value: config.modelDir },
      { Key: 'Workflows Directory', Value: config.workflowsDir },
      { Key: 'Agents Directory', Value: config.agentsDir },
      { Key: 'Environments Directory', Value: config.environmentsDir },
    ];

    console.table(tableData, ['Key', 'Value']);
  });
