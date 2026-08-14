import { Command } from 'commander';
import { loadConfig, saveConfig, ensureDirSync } from '@jetic/core';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export const initCommand = new Command('init')
  .description('Initialize Jetic in the current directory')
  .action(async () => {
    const config = loadConfig();
    ensureDirSync(config.jeticDir);
    
    console.log('\x1b[36mWelcome to Jetic Initialization\x1b[0m\n');
    
    const rl = readline.createInterface({ input, output });
    
    const providerInput = await rl.question('AI Provider [default: openrouter]: ');
    const modelInput = await rl.question('Model name [default: meta-llama/llama-3.1-8b-instruct]: ');
    const apiKeyInput = await rl.question('API Key: ');
    
    rl.close();

    const provider = providerInput.trim() || 'openrouter';
    const envVarName = `${provider.toUpperCase()}_API_KEY`;

    config.ai = {
      provider: provider,
      model: modelInput.trim() || 'meta-llama/llama-3.1-8b-instruct',
      apiKeyEnvVar: envVarName
    };
    saveConfig(config);

    if (apiKeyInput.trim()) {
      const fs = require('fs');
      const envPath = require('path').join(process.cwd(), '.env');
      const envContent = `\n${envVarName}=${apiKeyInput.trim()}\n`;
      fs.appendFileSync(envPath, envContent);
      console.log(`\n\x1b[32m✓\x1b[0m Saved API key to .env file as ${envVarName}`);
      console.log(`(Alternatively, you can run: set ${envVarName}=${apiKeyInput.trim()})\n`);
    }

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
    console.log('Available Commands:');
    console.log('  \x1b[36mjetic init\x1b[0m     Initialize Jetic in the current directory');
    console.log('  \x1b[36mjetic scan\x1b[0m     Scan the project for API routes and generate behavioral model');
    console.log('  \x1b[36mjetic inspect\x1b[0m  Inspect discovered endpoints and details');
    console.log('  \x1b[36mjetic config\x1b[0m   Manage Jetic AI provider and settings');
    console.log('');
  });
