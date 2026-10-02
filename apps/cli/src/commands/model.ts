import { Command } from 'commander';
import * as path from 'path';
import { loadConfig, readJsonSync } from '@jetic/core';
import { BehavioralModel, saveModelToDir, loadModelFromDir, hasYamlModel } from '@jetic/model';

export const modelCommand = new Command('model')
  .description('Inspect or export the Jetic behavioral model')
  .addCommand(
    new Command('export')
      .description('Export the current model.json into the split YAML layout (.jetic/model/)')
      .option('--yaml', 'Write the split YAML layout (api.yaml + paths/*.yaml + security/*.yaml)')
      .action((options: { yaml?: boolean }) => {
        if (!options.yaml) {
          console.error('Specify --yaml to export the split YAML model layout.');
          process.exitCode = 2;
          return;
        }

        const config = loadConfig();
        const jsonModelPath = path.join(config.jeticDir, 'model.json');
        const model = readJsonSync<BehavioralModel>(jsonModelPath);
        if (!model) {
          console.error(`No model found at ${jsonModelPath}. Run "jetic scan" first.`);
          process.exitCode = 2;
          return;
        }

        saveModelToDir(model, config.modelDir);
        console.log(`✓ Exported split YAML model to ${config.modelDir}`);
      })
  )
  .addCommand(
    new Command('list')
      .description('List endpoints from the model (YAML layout if present, else model.json)')
      .action(() => {
        const config = loadConfig();
        let model: BehavioralModel | null = null;

        if (hasYamlModel(config.modelDir)) {
          model = loadModelFromDir(config.modelDir);
        } else {
          model = readJsonSync<BehavioralModel>(path.join(config.jeticDir, 'model.json'));
        }

        if (!model) {
          console.error('No model found. Run "jetic scan" first.');
          process.exitCode = 2;
          return;
        }

        console.log(`${model.endpoints.length} endpoints`);
        for (const endpoint of model.endpoints) {
          console.log(`  ${endpoint.method.padEnd(6)} ${endpoint.path}`);
        }
      })
  );
