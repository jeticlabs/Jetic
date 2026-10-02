import { Command } from 'commander';
import * as path from 'path';
import { loadConfig, ensureDirSync, writeJsonSync } from '@jetic/core';
import { AgentRegistry } from '@jetic/agent-sdk';
import { modelWatcherAgent, workflowImpactAgent } from '@jetic/agents';

function buildRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(modelWatcherAgent);
  registry.register(workflowImpactAgent);
  return registry;
}

export const agentCommand = new Command('agent')
  .description('Run deterministic Jetic agents')
  .addCommand(
    new Command('list')
      .description('List available agents')
      .action(() => {
        console.log('\nJETIC AGENTS\n');
        for (const agent of buildRegistry().list()) {
          console.log(`  ${agent.id.padEnd(18)} ${agent.description}`);
        }
        console.log('');
      })
  )
  .addCommand(
    new Command('run')
      .argument('<id>', 'Agent id, e.g. model-watcher')
      .description('Run one agent and write its report to .jetic/runs/<runId>/agent-report.json')
      .action(async (id: string) => {
        const config = loadConfig();
        const registry = buildRegistry();
        const agent = registry.get(id);

        if (!agent) {
          console.error(`Unknown agent "${id}". Registered: ${registry.list().map((a) => a.id).join(', ')}`);
          process.exitCode = 2;
          return;
        }

        const result = await agent.run({ config });
        const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const reportPath = path.join(config.jeticDir, 'runs', runId, 'agent-report.json');
        ensureDirSync(path.dirname(reportPath));
        writeJsonSync(reportPath, { agentId: agent.id, runId, ...result });

        console.log(`\n${agent.id}: ${result.summary}`);
        for (const finding of result.findings) {
          console.log(`  - ${JSON.stringify(finding)}`);
        }
        console.log(`\nReport: ${reportPath}\n`);
      })
  );
