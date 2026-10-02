import { Command } from 'commander';
import { loadConfig, writeJsonSync, ensureDirSync, readJsonSync, appendActivityEvent, jeticEvents } from '@jetic/core';
import { ExpressScanner } from '@jetic/scanner';
import { BehavioralModel } from '@jetic/model';
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
    const previousModel = readJsonSync<BehavioralModel>(modelPath);
    recordModelDiffActivity(config.jeticDir, previousModel, model);

    writeJsonSync(modelPath, model);
    jeticEvents.emit('project.scanned', { endpointCount: model.endpoints.length });

    console.log(`✓ Discovered ${model.endpoints.length} endpoints`);
    console.log(`Behavioral model generated at ${modelPath}`);
  });

/** Writes `endpoint_added`/`endpoint_removed` events to `.jetic/activity/` (project.md §37). */
function recordModelDiffActivity(
  jeticDir: string,
  previousModel: BehavioralModel | null,
  nextModel: BehavioralModel
): void {
  if (!previousModel) return;

  const previousIds = new Set(previousModel.endpoints.map((e) => e.id));
  const nextIds = new Set(nextModel.endpoints.map((e) => e.id));

  const added = [...nextIds].filter((id) => !previousIds.has(id));
  const removed = [...previousIds].filter((id) => !nextIds.has(id));

  for (const id of added) appendActivityEvent(jeticDir, { kind: 'endpoint_added', endpointId: id });
  for (const id of removed) appendActivityEvent(jeticDir, { kind: 'endpoint_removed', endpointId: id });
  if (added.length > 0 || removed.length > 0) jeticEvents.emit('model.updated', { added, removed });
}
