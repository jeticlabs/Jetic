import { Command } from 'commander';
import { loadConfig, ensureDirSync } from '@jetic/core';

export const initCommand = new Command('init')
  .description('Initialize Jetic in the current directory')
  .action(() => {
    const config = loadConfig();
    ensureDirSync(config.jeticDir);
    console.log(`Initialized Jetic in ${config.jeticDir}`);
  });
