import { z } from 'zod';
import * as path from 'path';
import { loadConfig, ensureDirSync, writeJsonSync } from '@jetic/core';
import { AgentRegistry } from '@jetic/agent-sdk';
import { modelWatcherAgent, workflowImpactAgent } from '@jetic/agents';
import { resolveProjectInput } from '../types';

function buildRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(modelWatcherAgent);
  registry.register(workflowImpactAgent);
  return registry;
}

export const listAgentsSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
});

export function handleListAgents(args: z.infer<typeof listAgentsSchema>) {
  return {
    agents: buildRegistry()
      .list()
      .map((a) => ({ id: a.id, description: a.description })),
  };
}

export const runAgentSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  agent: z.string().describe('Agent id, e.g. "model-watcher" or "workflow-impact"'),
});

/**
 * Runs a deterministic agent synchronously (no LLM involved) and returns the
 * completed result directly — matches project.md §32's `jetic_run_agent` /
 * `jetic_get_agent_run` shape but collapses both calls into one, since
 * every agent in this pass finishes well within a single tool-call budget.
 */
export async function handleRunAgent(args: z.infer<typeof runAgentSchema>) {
  const registry = buildRegistry();
  const agent = registry.get(args.agent);
  if (!agent) {
    throw new Error(`Unknown agent "${args.agent}". Registered: ${registry.list().map((a) => a.id).join(', ')}`);
  }

  const projectRoot = path.resolve(resolveProjectInput(args.projectPath));
  const config = loadConfig(projectRoot);
  const result = await agent.run({ config });

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(config.jeticDir, 'runs', runId, 'agent-report.json');
  ensureDirSync(path.dirname(reportPath));
  writeJsonSync(reportPath, { agentId: agent.id, runId, ...result });

  return { status: 'completed', runId, agentId: agent.id, reportPath, ...result };
}
