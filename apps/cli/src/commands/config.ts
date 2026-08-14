import { Command } from 'commander';
import { loadConfig, saveConfig } from '@jetic/core';

export const configCommand = new Command('config')
  .description('Manage Jetic configuration')
  .action(() => {
    const config = loadConfig();
    
    console.log('\n\x1b[1mJetic Configuration\x1b[0m\n');
    const tableData = [
      { Key: 'Project Root', Value: config.projectRoot },
      { Key: 'Jetic Directory', Value: config.jeticDir },
      { Key: 'AI Provider', Value: config.ai?.provider || 'Not set' },
      { Key: 'AI Model', Value: config.ai?.model || 'Not set' },
      { Key: 'API Key Env Var', Value: config.ai?.apiKeyEnvVar || 'Not set' }
    ];
    
    console.table(tableData, ['Key', 'Value']);
  });

configCommand
  .command('ai')
  .description('Configure the AI provider and model')
  .requiredOption('-p, --provider <provider>', 'AI Provider (e.g. openai)')
  .requiredOption('-m, --model <model>', 'Model name (e.g. gpt-4o)')
  .requiredOption('-k, --key-env <envvar>', 'Environment variable containing the API key (e.g. OPENAI_API_KEY)')
  .action((options) => {
    const config = loadConfig();
    config.ai = {
      provider: options.provider,
      model: options.model,
      apiKeyEnvVar: options.keyEnv
    };
    saveConfig(config);
    console.log('AI configuration saved successfully.');
  });
