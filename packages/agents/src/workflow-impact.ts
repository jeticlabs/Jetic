import * as fs from 'fs';
import * as path from 'path';
import { readJsonSync } from '@jetic/core';
import { BehavioralModel } from '@jetic/model';
import { defineAgent, AgentContext, AgentResult } from '@jetic/agent-sdk';

interface ChangesFile {
  changes?: Array<{ filePath: string }>;
}

interface WorkflowStepLike {
  method?: string;
  path?: string;
}

interface WorkflowFileLike {
  name?: string;
  steps?: WorkflowStepLike[];
}

/** Maps changed source files -> affected endpoints -> affected workflows; no execution, static only. */
export const workflowImpactAgent = defineAgent({
  id: 'workflow-impact',
  description: 'Lists workflows affected by recently changed source files.',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const modelPath = path.join(ctx.config.jeticDir, 'model.json');
    const changesPath = path.join(ctx.config.jeticDir, 'changes.json');
    const workflowsDir = ctx.config.workflowsDir;

    const model = readJsonSync<BehavioralModel>(modelPath);
    if (!model) {
      return { summary: `No model found at ${modelPath}. Run "jetic scan" first.`, findings: [] };
    }

    const changes = readJsonSync<ChangesFile>(changesPath);
    const changedFiles = new Set((changes?.changes ?? []).map((c) => c.filePath));
    if (changedFiles.size === 0) {
      return { summary: 'No tracked file changes; run "jetic dev" to start tracking, or nothing has changed yet.', findings: [] };
    }

    const affectedEndpoints = model.endpoints.filter((e) => changedFiles.has(e.source.file));
    const affectedKeys = new Set(affectedEndpoints.map((e) => `${e.method} ${e.path}`));

    const affectedWorkflows: Array<{ workflow: string; file: string }> = [];
    if (fs.existsSync(workflowsDir)) {
      for (const file of fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))) {
        const wfPath = path.join(workflowsDir, file);
        const wf = readJsonSync<WorkflowFileLike>(wfPath);
        if (!wf?.steps) continue;
        const touches = wf.steps.some((s) => s.method && s.path && affectedKeys.has(`${s.method.toUpperCase()} ${s.path}`));
        if (touches) affectedWorkflows.push({ workflow: wf.name || file, file: wfPath });
      }
    }

    const findings = affectedWorkflows.map((w) => ({ kind: 'workflow_affected', ...w }));
    return {
      summary: `${affectedEndpoints.length} endpoint(s) changed, affecting ${affectedWorkflows.length} workflow(s).`,
      findings,
    };
  },
});
