import { Command } from 'commander';
import * as path from 'path';
import { loadConfig, jeticEvents } from '@jetic/core';
import { BehavioralModel, listWorkflowFiles, readWorkflowDefinitionFile } from '@jetic/model';
import { WorkflowSimulator, WorkflowDef } from '@jetic/simulator';
import { hasYamlModel, loadModelFromDir } from '@jetic/model';
import * as fs from 'fs';

function loadModel(config: ReturnType<typeof loadConfig>): BehavioralModel | null {
  if (hasYamlModel(config.modelDir)) return loadModelFromDir(config.modelDir);
  const modelPath = path.join(config.jeticDir, 'model.json');
  if (!fs.existsSync(modelPath)) return null;
  return JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
}

export const testCommand = new Command('test')
  .description('Run all saved workflows and report pass/fail (project.md §39)')
  .option('--env <name>', 'Target environment name from the model')
  .option('--ci', 'Machine-readable output, no color, exit 1 on any failure')
  .action(async (options: { env?: string; ci?: boolean }) => {
    const config = loadConfig();
    const model = loadModel(config);

    if (!model) {
      console.error('No model found. Run "jetic scan" first.');
      process.exitCode = 2;
      return;
    }

    const files = listWorkflowFiles(config.workflowsDir);
    if (files.length === 0) {
      console.log('No workflows found in .jetic/workflows/. Nothing to test.');
      return;
    }

    const targetEnv = model.environments?.find((e) => e.name === options.env) ?? model.environments?.[0] ?? {
      name: 'local',
      baseUrl: 'http://localhost:3000',
    };

    const results: Array<{ name: string; passed: boolean; durationMs: number }> = [];

    if (!options.ci) console.log(`\nJETIC TEST\n\nRunning ${files.length} workflow(s)...\n`);

    for (const file of files) {
      const workflow = readWorkflowDefinitionFile<WorkflowDef>(path.join(config.workflowsDir, file));
      jeticEvents.emit('workflow.started', { workflowId: workflow.name });

      const simulator = new WorkflowSimulator(model, targetEnv);
      const result = await simulator.simulateWorkflow(workflow);
      results.push({ name: workflow.name, passed: result.success, durationMs: result.stats.totalTimeMs });

      if (result.success) {
        jeticEvents.emit('workflow.completed', { workflowId: workflow.name, passed: true });
      } else {
        jeticEvents.emit('workflow.failed', { workflowId: workflow.name, reason: 'one or more steps failed' });
      }

      if (!options.ci) {
        console.log(`  ${result.success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${workflow.name}`);
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    if (options.ci) {
      console.log(JSON.stringify({ total: results.length, passed, failed, results }, null, 2));
    } else {
      console.log(`\n${passed} passed\n${failed} failed\n`);
    }

    if (failed > 0) process.exitCode = 1;
  });
