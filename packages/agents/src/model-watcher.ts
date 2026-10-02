import * as path from 'path';
import { readJsonSync, writeJsonSync } from '@jetic/core';
import { BehavioralModel } from '@jetic/model';
import { defineAgent, AgentContext, AgentResult } from '@jetic/agent-sdk';

interface ModelSnapshot {
  endpointIds: string[];
}

/** Diffs the current model.json against the last snapshot taken by this agent; deterministic, no LLM. */
export const modelWatcherAgent = defineAgent({
  id: 'model-watcher',
  description: 'Detects endpoints added/removed since the last recorded model snapshot.',

  async run(ctx: AgentContext): Promise<AgentResult> {
    const modelPath = path.join(ctx.config.jeticDir, 'model.json');
    const snapshotPath = path.join(ctx.config.jeticDir, 'cache', 'model-watcher-snapshot.json');

    const model = readJsonSync<BehavioralModel>(modelPath);
    if (!model) {
      return { summary: `No model found at ${modelPath}. Run "jetic scan" first.`, findings: [] };
    }

    const previous = readJsonSync<ModelSnapshot>(snapshotPath);
    const currentIds = model.endpoints.map((e) => e.id);
    const previousIds = new Set(previous?.endpointIds ?? []);
    const currentIdSet = new Set(currentIds);

    const added = currentIds.filter((id) => !previousIds.has(id));
    const removed = [...previousIds].filter((id) => !currentIdSet.has(id));

    writeJsonSync(snapshotPath, { endpointIds: currentIds } satisfies ModelSnapshot);

    const findings = [
      ...added.map((id) => ({ kind: 'endpoint_added', endpointId: id })),
      ...removed.map((id) => ({ kind: 'endpoint_removed', endpointId: id })),
    ];

    const summary = previous
      ? `${added.length} endpoint(s) added, ${removed.length} removed since last snapshot.`
      : `Initial snapshot recorded (${currentIds.length} endpoints).`;

    return { summary, findings };
  },
});
