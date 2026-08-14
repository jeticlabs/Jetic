import { Command } from 'commander';
import { loadConfig, writeJsonSync, ensureDirSync } from '@jetic/core';
import { ExpressScanner } from '@jetic/scanner';
import * as path from 'path';

export const scanCommand = new Command('scan')
  .description('Scan the project for API routes')
  .action(async () => {
    console.log('Jetic API Intelligence\nScanning project...\n');
    
    const config = loadConfig();
    ensureDirSync(config.jeticDir);

    const scanner = new ExpressScanner(config);
    const model = await scanner.scan();

    const modelPath = path.join(config.jeticDir, 'model.json');
    writeJsonSync(modelPath, model);

    console.log(`✓ Discovered ${model.endpoints.length} endpoints`);
    console.log(`Behavioral model generated at ${modelPath}`);
  });
