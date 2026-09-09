// ─── Trace persistence layer (.jetic/traces/*.json via API with IndexedDB fallback) ──


// ─── Condition Types ──────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'greater_than_or_equal'
  | 'less_than' | 'less_than_or_equal'
  | 'exists' | 'not_exists'
  | 'is_empty' | 'is_not_empty'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with';

export interface ConditionRule {
  left: string;
  operator: ConditionOperator;
  right?: string;
}

export interface ConditionGroup {
  all?: ConditionRule[];
  any?: ConditionRule[];
}

export interface StepCondition {
  rules: ConditionGroup;
  onFail: 'abort' | 'continue' | 'switch';
  switchToWorkflow?: string;
  returnOnComplete?: boolean;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceStepRecord {
  index: number;
  name: string;
  method: string;
  path: string;
  description?: string;
  // Result
  status: number;
  passed: boolean;
  durationMs: number;
  // Vars
  captured: Record<string, string>;   // varName → value
  injected: Record<string, string>;   // header → value
  // Bodies
  requestBody?: any;
  responseBody?: any;
  error: string | null;
  // Step definition extras (from workflow file)
  expectStatus?: number;
  captureSpec?: Record<string, string>; // jsonpath spec e.g. "body:$.token"
  injectSpec?: Record<string, string>;  // header → varName
  // Condition simulation extras
  conditionSpec?: StepCondition;
  conditionResult?: { passed: boolean; reason: string };
}

export interface TraceRecord {
  id: string;
  workflowName: string;
  workflowFile: string;
  startedAt: string;   // ISO
  finishedAt: string;  // ISO
  durationMs: number;
  phase: 'done' | 'aborted' | 'error';
  passed: number;
  failed: number;
  baseUrl?: string;
  source: 'local-sim' | 'api';
  steps: TraceStepRecord[];
}

// ─── CRUD (REST API → .jetic/traces/*.json) ──────────────────────────────────

export async function saveTrace(record: TraceRecord): Promise<string> {
  await fetch('/api/traces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  return record.id;
}

export async function listTraces(): Promise<TraceRecord[]> {
  try {
    const res = await fetch('/api/traces');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

export async function getTrace(id: string): Promise<TraceRecord | undefined> {
  try {
    const res = await fetch(`/api/traces/trace_${id}`);
    if (res.ok) return await res.json();
  } catch {}
  return undefined;
}

export async function deleteTrace(id: string): Promise<void> {
  await fetch(`/api/traces/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearAllTraces(): Promise<void> {
  await fetch('/api/traces', { method: 'DELETE' });
}
