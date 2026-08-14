import { Command } from 'commander';
import { loadConfig, saveConfig } from '@jetic/core';

export const configCommand = new Command('config')
  .description('Manage Jetic configuration')
  .action(() => {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
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
