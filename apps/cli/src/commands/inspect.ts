import { Command } from 'commander';
import { loadConfig, readJsonSync } from '@jetic/core';
import { BehavioralModel } from '@jetic/model';
import * as path from 'path';

export const inspectCommand = new Command('inspect')
  .description('Inspect the discovered API model')
  .action(() => {
    const config = loadConfig();
    const modelPath = path.join(config.jeticDir, 'model.json');
    const model = readJsonSync<BehavioralModel>(modelPath);

    if (!model) {
      console.error('No behavioral model found. Run `jetic scan` first.');
      return;
    }

    console.log(`Model Version: ${model.version}`);
    console.log(`Endpoints (${model.endpoints.length}):\n`);
    
    for (const ep of model.endpoints) {
      console.log(`${ep.method} ${ep.path}`);
    }
  });

inspectCommand
  .command('endpoint <method> <path>')
  .description('Inspect a specific endpoint')
  .action((method, urlPath) => {
    const config = loadConfig();
    const modelPath = path.join(config.jeticDir, 'model.json');
    const model = readJsonSync<BehavioralModel>(modelPath);

    if (!model) return;

    const ep = model.endpoints.find(
      e => e.method.toLowerCase() === method.toLowerCase() && e.path === urlPath
    );

    if (!ep) {
      console.error('Endpoint not found');
      return;
    }

    console.log(`${ep.method} ${ep.path}\n`);
    console.log(`Source:\n  ${ep.source.file}:${ep.source.line}`);
  });
