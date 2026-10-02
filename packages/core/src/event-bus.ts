type Listener<T> = (payload: T) => void;

/** Event names from project.md §54 that Jetic emits internally (model/workflow/agent lifecycle). */
export interface JeticEventMap {
  'project.scanned': { endpointCount: number };
  'model.updated': { added: string[]; removed: string[] };
  'endpoint.added': { endpointId: string };
  'endpoint.removed': { endpointId: string };
  'workflow.started': { workflowId: string };
  'workflow.completed': { workflowId: string; passed: boolean };
  'workflow.failed': { workflowId: string; reason: string };
  'agent.started': { agentId: string };
  'agent.completed': { agentId: string; summary: string };
}

export type JeticEventName = keyof JeticEventMap;

/** Minimal in-process typed event bus — no persistence, no cross-process delivery. */
export class EventBus {
  private listeners = new Map<JeticEventName, Set<Listener<any>>>();

  on<K extends JeticEventName>(event: K, listener: Listener<JeticEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit<K extends JeticEventName>(event: K, payload: JeticEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(payload);
      } catch {
        // Listeners must not crash the emitter — matches the tracer's fail-open rule.
      }
    }
  }
}

/** Process-wide singleton shared by CLI commands and `jetic dev`. */
export const jeticEvents = new EventBus();
