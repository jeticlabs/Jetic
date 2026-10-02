import { JeticConfig } from '@jetic/core';

/** Read-only context an agent runs with — deterministic agents only in this pass (no LLM). */
export interface AgentContext {
  config: JeticConfig;
}

export interface AgentResult {
  summary: string;
  findings: Array<Record<string, unknown>>;
}

export interface JeticAgent {
  id: string;
  description: string;
  run(ctx: AgentContext): Promise<AgentResult>;
}

export function defineAgent(agent: JeticAgent): JeticAgent {
  return agent;
}

export class AgentRegistry {
  private agents = new Map<string, JeticAgent>();

  register(agent: JeticAgent): void {
    this.agents.set(agent.id, agent);
  }

  list(): JeticAgent[] {
    return [...this.agents.values()];
  }

  get(id: string): JeticAgent | undefined {
    return this.agents.get(id);
  }
}
