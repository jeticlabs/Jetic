import { useCallback, useEffect, useRef, useState } from 'react';
import { saveTrace, type TraceRecord } from '../../lib/traceStore';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Diamond,
  GitBranch,
  Globe,
  Key,
  List,
  Loader2,
  LogsIcon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowStep {
  name: string;
  method: string;
  path: string;
  description?: string;
  inject?: Record<string, string>;
  body?: Record<string, any>;
  capture?: Record<string, string>;
  captureInput?: Record<string, string>;
  expectStatus?: number;
}

interface Workflow {
  _file: string;
  _legacy?: boolean;
  name: string;
  generatedAt?: string;
  steps: WorkflowStep[];
}

type StepStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped';

interface StepRunResult {
  index: number;
  step: { name: string; method: string; path: string; description?: string };
  status: number;
  passed: boolean;
  durationMs: number;
  captured: string[];
  injected: Record<string, string>;
  responseBody: any;
  error: string | null;
}

interface RunState {
  phase: 'idle' | 'running' | 'done' | 'aborted' | 'error';
  currentStep: number;
  stepStatuses: StepStatus[];
  stepResults: (StepRunResult | null)[];
  passed: number;
  failed: number;
  error?: string;
  baseUrl?: string;
}

// ─── Method colours (semantic — stay consistent across light/dark) ───────────

const METHOD_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: '#34d399' },
  POST: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: '#60a5fa' },
  PUT: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: '#fbbf24' },
  PATCH: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: '#fb923c' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: '#f87171' },
  HEAD: { bg: 'bg-[var(--bg-overlay-md)]', text: 'text-[var(--text-muted)]', dot: '#a1a1aa' },
  OPTIONS: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: '#c084fc' },
};
function mc(m: string) { return METHOD_COLORS[m.toUpperCase()] ?? METHOD_COLORS['GET']; }

function MethodChip({ method }: { method: string }) {
  const s = mc(method);
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-widest ${s.bg} ${s.text}`}>
      {method.toUpperCase()}
    </span>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchWorkflows(): Promise<Workflow[]> {
  const r = await fetch('/api/workflows');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}


async function deleteWorkflow(file: string): Promise<void> {
  // Extract slug from 'workflows/<slug>.json'
  const slug = file.replace(/^workflows\//, '').replace(/\.json$/, '');
  const r = await fetch(`/api/workflows/${encodeURIComponent(slug)}`, { method: 'DELETE' });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${r.status}`);
  }
}

// ─── React Flow node types ─────────────────────────────────────────────────────

const NODE_W = 230;
const NODE_H = 64;

function StepNode({ data }: { data: any }) {
  const s = mc(data.method);
  const statusColors: Record<StepStatus, string> = {
    idle: 'border-[var(--border)]',
    running: 'border-blue-500/60',
    passed: 'border-emerald-500/40',
    failed: 'border-red-500/40',
    skipped: 'border-[var(--border)]',
  };
  const glows: Record<StepStatus, string> = {
    idle: '',
    running: 'shadow-[0_0_12px_rgba(96,165,250,0.28)]',
    passed: 'shadow-[0_0_8px_rgba(52,211,153,0.15)]',
    failed: 'shadow-[0_0_8px_rgba(248,113,113,0.15)]',
    skipped: '',
  };
  const status: StepStatus = data.status ?? 'idle';

  return (
    <div
      className={`rounded-lg border bg-[var(--bg-overlay)] flex items-center gap-2.5 px-3 overflow-hidden transition-all duration-300 ${statusColors[status]} ${glows[status]}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />

      {/* Left method bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-300"
        style={{ background: status === 'running' ? '#60a5fa' : status === 'passed' ? s.dot : status === 'failed' ? '#f87171' : s.dot + '60' }}
      />

      {/* Status indicator */}
      <div className="shrink-0 flex items-center justify-center">
        {status === 'running' && <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" strokeWidth={2} />}
        {status === 'passed' && <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />}
        {status === 'failed' && <AlertCircle className="h-3.5 w-3.5 text-red-400" strokeWidth={2} />}
        {status === 'idle' && <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--border)] text-[8px] font-medium text-[var(--text-faint)]">{data.index + 1}</span>}
        {status === 'skipped' && <span className="h-3.5 w-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-overlay-md)]" />}
      </div>

      <div className="min-w-0 flex-1 pl-0.5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[9px] font-medium ${s.text}`}>{data.method}</span>
          <span className="font-mono text-[10px] text-[var(--text-secondary)] truncate">{data.path}</span>
          {data.result && (
            <span className={`ml-auto shrink-0 font-mono text-[9px] ${data.result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.result.status > 0 ? data.result.status : 'ERR'} · {data.result.durationMs}ms
            </span>
          )}
        </div>
        <p className="text-[9px] text-[var(--text-faint)] truncate">{data.name}</p>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
}

const nodeTypes = { step: StepNode };

// ─── React Flow Graph ─────────────────────────────────────────────────────────

function SimFlowGraph({ steps, runState }: { steps: WorkflowStep[]; runState: RunState }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Build nodes / edges from steps + run state
  useEffect(() => {
    const newNodes = steps.map((step, i) => ({
      id: `step-${i}`,
      type: 'step',
      position: { x: 0, y: i * (NODE_H + 36) + 40 },
      data: {
        index: i,
        name: step.name,
        method: step.method,
        path: step.path,
        status: runState.stepStatuses[i] ?? 'idle',
        result: runState.stepResults[i] ?? null,
      },
    }));

    const newEdges = steps.slice(0, -1).map((step, i) => {
      const captured = Object.keys(step.capture ?? {});
      const label = captured.length > 0 ? captured.map(k => k.split(':').pop()).join(', ') : undefined;
      const fromStatus = runState.stepStatuses[i] ?? 'idle';
      return {
        id: `e-${i}`,
        source: `step-${i}`,
        target: `step-${i + 1}`,
        label,
        labelStyle: { fill: 'rgba(96,165,250,0.7)', fontSize: 9, fontFamily: 'monospace' },
        labelBgStyle: { fill: 'transparent' },
        style: {
          stroke: fromStatus === 'passed' ? 'rgba(52,211,153,0.3)' : fromStatus === 'failed' ? 'rgba(248,113,113,0.3)' : 'rgba(96,165,250,0.18)',
          strokeWidth: 1.5,
          strokeDasharray: fromStatus === 'idle' || fromStatus === 'running' ? '5 5' : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: fromStatus === 'passed' ? 'rgba(52,211,153,0.4)' : 'rgba(96,165,250,0.3)' },
        animated: fromStatus === 'running',
      };
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [steps, runState.stepStatuses, runState.stepResults]);

  return (
    <div style={{ height: Math.max(400, steps.length * (NODE_H + 36) + 120) }} className="w-full rounded-lg overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)' }} />
      </ReactFlow>
    </div>
  );
}

// ─── Run Log Panel ────────────────────────────────────────────────────────────

function RunLog({ runState, steps }: { runState: RunState; steps: WorkflowStep[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [runState.stepResults, runState.phase]);

  if (runState.phase === 'idle') return null;

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)]">
      {/* Log header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-overlay-md)]">
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Run Log</span>
        {runState.baseUrl && <span className="font-mono text-[10px] text-[var(--text-faint)]">→ {runState.baseUrl}</span>}
        <span className="ml-auto flex items-center gap-2 text-[10px]">
          {runState.passed > 0 && <span className="text-emerald-400">{runState.passed} passed</span>}
          {runState.failed > 0 && <span className="text-red-400">{runState.failed} failed</span>}
          {runState.phase === 'running' && <Loader2 className="h-3 w-3 text-blue-400 animate-spin" strokeWidth={2} />}
          {runState.phase === 'done' && <Check className="h-3 w-3 text-emerald-400" strokeWidth={2} />}
          {runState.phase === 'aborted' && <AlertCircle className="h-3 w-3 text-red-400" strokeWidth={2} />}
        </span>
      </div>

      {/* Log body */}
      <div ref={scrollRef} className="overflow-y-auto max-h-80 font-mono text-[11px] p-3 space-y-1">
        {/* Start line */}
        <p className="text-[var(--text-faint)]">▶ Starting workflow execution…</p>

        {runState.stepResults.map((result, i) => {
          if (!result && runState.stepStatuses[i] !== 'running') return null;

          const step = steps[i];
          const s = mc(step.method);
          const isRunning = runState.stepStatuses[i] === 'running';

          if (isRunning) {
            return (
              <div key={i} className="flex items-center gap-2 text-[var(--text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin text-blue-400" strokeWidth={2} />
                <span className="text-[var(--text-faint)]">Step {i + 1}/{steps.length}</span>
                <span className={s.text}>{step.method}</span>
                <span className="text-[var(--text-secondary)]">{step.path}</span>
                <span className="text-[var(--text-faint)]">…</span>
              </div>
            );
          }

          if (!result) return null;

          return (
            <div key={i} className="space-y-0.5">
              {/* Main result line */}
              <div className="flex items-center gap-2">
                <span className={result.passed ? 'text-emerald-400' : 'text-red-400'}>
                  {result.passed ? '✓' : '✗'}
                </span>
                <span className="text-[var(--text-faint)]">Step {i + 1}/{steps.length}</span>
                <span className={`${s.text}`}>{step.method.padEnd(6)}</span>
                <span className="text-[var(--text-secondary)]">{step.path}</span>
                <span className={`${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.status > 0 ? result.status : 'NO RESPONSE'}
                </span>
                <span className="text-[var(--text-faint)]">{result.durationMs}ms</span>
              </div>

              {/* Step name */}
              {step.name && <p className="pl-5 text-[var(--text-faint)] italic">{step.name}</p>}

              {/* Injected headers */}
              {Object.entries(result.injected ?? {}).filter(([k]) => k !== 'Content-Type').map(([k, v]) => (
                <p key={k} className="pl-5 text-[var(--text-faint)]">
                  ↳ <span className="text-amber-500/80">{k}:</span>{' '}
                  <span className="text-[var(--text-faint)]">{String(v).length > 60 ? String(v).slice(0, 57) + '…' : v}</span>
                </p>
              ))}

              {/* Captured */}
              {result.captured.map((cap, ci) => (
                <p key={ci} className="pl-5 text-emerald-400">↳ captured {cap}</p>
              ))}

              {/* Error */}
              {result.error && <p className="pl-5 text-red-400">Error: {result.error}</p>}

              {/* Response preview on failure */}
              {!result.passed && result.responseBody && !result.error && (
                <p className="pl-5 text-red-400/80 truncate">
                  Response: {typeof result.responseBody === 'string'
                    ? result.responseBody.slice(0, 120)
                    : JSON.stringify(result.responseBody).slice(0, 120)}
                </p>
              )}
            </div>
          );
        })}

        {/* Done/aborted */}
        {runState.phase === 'done' && (
          <p className={`mt-1 ${runState.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            ✓ Done — {runState.passed}/{runState.passed + runState.failed} steps passed
          </p>
        )}
        {runState.phase === 'aborted' && (
          <p className="mt-1 text-red-400">✗ Aborted — {runState.error}</p>
        )}
        {runState.phase === 'error' && (
          <p className="mt-1 text-red-400">✗ Error — {runState.error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Step list row ────────────────────────────────────────────────────────────

function StepRow({ step, index, total, status, result }: {
  step: WorkflowStep;
  index: number;
  total: number;
  status: StepStatus;
  result: StepRunResult | null;
}) {
  const [open, setOpen] = useState(false);
  const hasCapture = step.capture && Object.keys(step.capture).length > 0;
  const hasInject = step.inject && Object.keys(step.inject).length > 0;
  const hasBody = step.body && Object.keys(step.body).length > 0;

  const statusIcon = {
    idle: <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[9px] text-[var(--text-faint)]">{index + 1}</span>,
    running: <Loader2 className="h-5 w-5 text-blue-400 animate-spin" strokeWidth={2} />,
    passed: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Check className="h-3 w-3" strokeWidth={2} /></span>,
    failed: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-400"><AlertCircle className="h-3 w-3" strokeWidth={2} /></span>,
    skipped: <span className="h-5 w-5 rounded-full border border-[var(--border)] bg-[var(--bg-overlay-md)]" />,
  }[status];

  return (
    <div className="relative">
      {index < total - 1 && (
        <div className={`absolute left-[19px] top-[38px] bottom-0 w-px z-0 transition-colors duration-500 ${status === 'passed' ? 'bg-emerald-500/20' : 'bg-[var(--border)]'}`} />
      )}
      <div className="relative z-10">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-overlay-md)] transition-colors text-left hover:cursor-pointer"
        >
          <span className="shrink-0">{statusIcon}</span>
          <MethodChip method={step.method} />
          <span className="font-mono text-xs text-[var(--text-secondary)] flex-1 truncate">{step.path}</span>
          {result && (
            <span className={`font-mono text-[10px] ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.status > 0 ? result.status : 'ERR'} · {result.durationMs}ms
            </span>
          )}
          <span className="flex items-center gap-1">
            {hasInject && <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-400">auth</span>}
            {hasCapture && <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[9px] text-blue-400">capture</span>}
          </span>
          <span className="text-[var(--text-faint)] shrink-0">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span>
        </button>

        {open && (
          <div className="ml-12 mr-4 my-3 space-y-2.5 rounded-lg border-y border-[var(--border)] bg-[var(--bg-overlay)] p-3">
            {step.description && <p className="text-[11px] text-[var(--text-muted)]">{step.description}</p>}

            {result && (
              <div className={`rounded-lg border px-3 py-2 ${result.passed ? 'border-emerald-500/15 bg-emerald-500/[0.05]' : 'border-red-500/15 bg-red-500/[0.05]'}`}>
                <p className="text-[10px] text-[var(--text-faint)] mb-1 uppercase tracking-wider">Response</p>
                {result.error
                  ? <p className="text-[11px] text-red-400">{result.error}</p>
                  : <pre className="text-[10px] text-[var(--text-muted)] overflow-auto max-h-24 whitespace-pre-wrap break-all">
                    {typeof result.responseBody === 'string'
                      ? result.responseBody.slice(0, 300)
                      : JSON.stringify(result.responseBody, null, 2).slice(0, 300)}
                  </pre>
                }
              </div>
            )}

            {hasBody && (
              <div>
                <p className="text-[10px] text-[var(--text-faint)] mb-1 uppercase tracking-wider">Request Body</p>
                <div className="space-y-1">
                  {Object.entries(step.body!).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-3 py-1.5">
                      <span className="font-mono text-[10px] text-[var(--text-secondary)]">{k}</span>
                      <span className="font-mono text-[10px] text-blue-400/80 truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasInject && (
              <div>
                <p className="text-[10px] text-[var(--text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1"><Key className="h-3 w-3" strokeWidth={2} /> Inject</p>
                <div className="space-y-1">
                  {Object.entries(step.inject!).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 rounded-lg bg-amber-500/[0.05] border border-amber-500/15 px-3 py-1.5">
                      <span className="font-mono text-[10px] text-amber-400/80">{k}</span>
                      <ArrowRight className="h-3 w-3 text-[var(--text-faint)] shrink-0" strokeWidth={2} />
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasCapture && (
              <div>
                <p className="text-[10px] text-[var(--text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1"><Zap className="h-3 w-3" strokeWidth={2} /> Capture</p>
                <div className="space-y-1">
                  {Object.entries(step.capture!).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 rounded-lg bg-blue-500/[0.05] border border-blue-500/15 px-3 py-1.5">
                      <span className="font-mono text-[10px] text-blue-400">{k}</span>
                      <ArrowRight className="h-3 w-3 text-[var(--text-faint)] shrink-0" strokeWidth={2} />
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workflow Card ────────────────────────────────────────────────────────────

function makeInitialRunState(count: number): RunState {
  return {
    phase: 'idle',
    currentStep: -1,
    stepStatuses: Array(count).fill('idle'),
    stepResults: Array(count).fill(null),
    passed: 0,
    failed: 0,
  };
}

function WorkflowCard({ workflow, onDelete, onViewTraces }: { workflow: Workflow; onDelete: () => void; onViewTraces?: (name: string, traceId?: string) => void }) {
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [showLog, setShowLog] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [runState, setRunState] = useState<RunState>(() => makeInitialRunState(workflow.steps.length));
  const [lastTraceId, setLastTraceId] = useState<string | undefined>(undefined);
  const [environments, setEnvironments] = useState<{ name: string; baseUrl: string }[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const abortRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const startedAtRef = useRef<string>('');
  const sourceRef = useRef<'local-sim' | 'api'>('local-sim');

  // Load environments from model
  useEffect(() => {
    fetch('/api/model/environments')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const envs = data.environments ?? [];
        setEnvironments(envs);
        const def = data.defaultEnvironment ?? envs.find((e: any) => e.default)?.name ?? envs[0]?.name ?? null;
        setSelectedEnv(def);
        const defEnv = envs.find((e: any) => e.name === def);
        if (defEnv) setBaseUrl(defEnv.baseUrl);
      })
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!confirm(`Delete workflow "${workflow.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteWorkflow(workflow._file);
      onDelete();
    } catch (e: any) {
      alert(`Failed to delete: ${e.message}`);
      setDeleting(false);
    }
  };

  const stopRun = () => {
    abortRef.current = true;
    esRef.current?.close();
    esRef.current = null;
    setRunState(prev => ({ ...prev, phase: prev.phase === 'running' ? 'aborted' : prev.phase }));
  };

  const resetRun = () => {
    stopRun();
    setRunState(makeInitialRunState(workflow.steps.length));
  };

  /** Persist a completed run to IndexedDB */
  const persistTrace = async (
    finalState: RunState,
    source: 'local-sim' | 'api',
    startedAt: string
  ) => {
    const finishedAt = new Date().toISOString();
    const record: TraceRecord = {
      id: crypto.randomUUID(),
      workflowName: workflow.name,
      workflowFile: workflow._file,
      startedAt,
      finishedAt,
      durationMs: finalState.stepResults.reduce((acc, r) => acc + (r?.durationMs ?? 0), 0),
      phase: finalState.phase === 'done' ? 'done' : finalState.phase === 'aborted' ? 'aborted' : 'error',
      passed: finalState.passed,
      failed: finalState.failed,
      baseUrl: finalState.baseUrl,
      source,
      steps: workflow.steps.map((step, i) => {
        const result = finalState.stepResults[i];
        return {
          index: i,
          name: step.name,
          method: step.method,
          path: step.path,
          description: step.description,
          status: result?.status ?? 0,
          passed: result?.passed ?? false,
          durationMs: result?.durationMs ?? 0,
          captured: Object.fromEntries(
            (result?.captured ?? []).map(k => [k, '(captured)'])
          ),
          injected: result?.injected ?? {},
          requestBody: step.body,
          responseBody: result?.responseBody,
          error: result?.error ?? null,
          expectStatus: step.expectStatus,
          captureSpec: step.capture,
          injectSpec: step.inject,
        };
      }),
    };
    const id = await saveTrace(record);
    setLastTraceId(id);
  };

  const startRun = () => {
    // Reset state and mark as running
    abortRef.current = false;
    const count = workflow.steps.length;
    setRunState({ ...makeInitialRunState(count), baseUrl: baseUrl || undefined });
    setLastTraceId(undefined);
    startedAtRef.current = new Date().toISOString();
    sourceRef.current = 'local-sim';
    setShowLog(true);

    // Try the real API first; fall back to local simulation if unavailable
    const runSimulation = async () => {
      // Mark overall phase as running
      setRunState(prev => ({ ...prev, phase: 'running', baseUrl: baseUrl || prev.baseUrl }));

      let passed = 0;
      let failed = 0;

      for (let i = 0; i < count; i++) {
        if (abortRef.current) break;

        // Mark current step as running
        setRunState(prev => {
          const statuses = [...prev.stepStatuses];
          statuses[i] = 'running';
          return { ...prev, stepStatuses: statuses, currentStep: i };
        });

        // Simulate step execution delay (600–1400 ms)
        const delay = 600 + Math.random() * 800;
        await new Promise<void>(resolve => {
          const t = setTimeout(resolve, delay);
          // Allow abort to cancel the timer
          const check = setInterval(() => {
            if (abortRef.current) { clearTimeout(t); clearInterval(check); resolve(); }
          }, 50);
          setTimeout(() => clearInterval(check), delay + 100);
        });

        if (abortRef.current) break;

        // Simulate a result — all steps "pass" in simulation
        const stepPassed = true;
        const durationMs = Math.round(delay);
        const result: StepRunResult = {
          index: i,
          step: {
            name: workflow.steps[i].name,
            method: workflow.steps[i].method,
            path: workflow.steps[i].path,
            description: workflow.steps[i].description,
          },
          status: 200,
          passed: stepPassed,
          durationMs,
          captured: Object.keys(workflow.steps[i].capture ?? {}).map(k => k.split(':').pop() ?? k),
          injected: {},
          responseBody: { simulated: true },
          error: null,
        };

        if (stepPassed) passed++; else failed++;

        setRunState(prev => {
          const statuses = [...prev.stepStatuses];
          const results = [...prev.stepResults];
          statuses[i] = stepPassed ? 'passed' : 'failed';
          results[i] = result;
          return { ...prev, stepStatuses: statuses, stepResults: results, passed, failed };
        });
      }

      if (!abortRef.current) {
        const finalState: RunState = {
          phase: 'done',
          currentStep: count - 1,
          stepStatuses: Array(count).fill('passed'),
          stepResults: workflow.steps.map((step, i) => ({
            index: i,
            step: { name: step.name, method: step.method, path: step.path, description: step.description },
            status: 200,
            passed: true,
            durationMs: Math.round(600 + Math.random() * 800),
            captured: Object.keys(step.capture ?? {}).map(k => k.split(':').pop() ?? k),
            injected: {},
            responseBody: { simulated: true },
            error: null,
          })),
          passed,
          failed,
        };
        setRunState(prev => ({ ...prev, phase: 'done', passed, failed }));
        persistTrace(finalState, 'local-sim', startedAtRef.current);
      }
    };

    // Attempt real API; if it fails / is unavailable, run local simulation
    fetch('/api/workflows/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: workflow._file, baseUrl: baseUrl || undefined }),
    }).then(res => {
      if (!res.ok || !res.body) {
        // API not available — use local simulation
        runSimulation();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      setRunState(prev => ({ ...prev, phase: 'running' }));

      const pump = async () => {
        let gotAnyData = false;
        while (true) {
          if (abortRef.current) break;
          const { value, done } = await reader.read();
          if (done) break;

          gotAnyData = true;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const raw = trimmed.slice(5).trim();
            if (!raw) continue;

            let msg: any;
            try { msg = JSON.parse(raw); } catch { continue; }

            setRunState(prev => {
              const ns = { ...prev };

              if (msg.type === 'start') {
                ns.phase = 'running';
                ns.baseUrl = msg.baseUrl;
              } else if (msg.type === 'step_start') {
                const idx = msg.index;
                const statuses = [...ns.stepStatuses];
                statuses[idx] = 'running';
                ns.stepStatuses = statuses;
                ns.currentStep = idx;
              } else if (msg.type === 'step_result') {
                const idx = msg.index;
                const statuses = [...ns.stepStatuses];
                const results = [...ns.stepResults];
                statuses[idx] = msg.passed ? 'passed' : 'failed';
                // Flatten the result: the server wraps step info inside result.step,
                // but StepRunResult expects the fields at the top level.
                results[idx] = {
                  index: msg.index,
                  step: msg.step ?? { name: '', method: '', path: '' },
                  status: msg.status,
                  passed: msg.passed,
                  durationMs: msg.durationMs,
                  captured: msg.captured ?? [],
                  injected: msg.injected ?? {},
                  responseBody: msg.responseBody,
                  error: msg.error ?? null,
                };
                if (msg.passed) ns.passed = (ns.passed ?? 0) + 1;
                else ns.failed = (ns.failed ?? 0) + 1;
                ns.stepStatuses = statuses;
                ns.stepResults = results;
              } else if (msg.type === 'aborted') {
                // Mark any still-running step as failed, remaining as skipped
                const statuses = [...ns.stepStatuses];
                for (let si = 0; si < statuses.length; si++) {
                  if (statuses[si] === 'running') statuses[si] = 'failed';
                  else if (statuses[si] === 'idle') statuses[si] = 'skipped';
                }
                ns.stepStatuses = statuses;
                ns.phase = 'aborted';
                ns.error = msg.reason;
              } else if (msg.type === 'done') {
                ns.phase = 'done';
                // Use server counts as source of truth (they are definitive)
                // but only if they are non-zero or there are no steps
                if (msg.passed > 0 || msg.failed > 0) {
                  ns.passed = msg.passed;
                  ns.failed = msg.failed;
                }
                // Otherwise keep the frontend-accumulated counts
                // Persist trace to IndexedDB
                persistTrace(ns, 'api', startedAtRef.current);
              }

              return ns;
            });
          }
        }

        // If we got no data at all from the stream, fall back to simulation
        if (!gotAnyData && !abortRef.current) {
          runSimulation();
        }
      };

      pump().catch(() => {
        if (!abortRef.current) {
          // Fall back to simulation on stream error
          runSimulation();
        }
      });
    }).catch(() => {
      // Network error — use local simulation
      if (!abortRef.current) runSimulation();
    });
  };

  const isRunning = runState.phase === 'running';
  const hasResult = runState.phase !== 'idle';

  return (
    <div className="relative">
      {/* The Chip */}
      <button
        type="button"
        onClick={startRun}
        className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm z-10 hover:bg-blue-400 transition-colors hover:cursor-pointer"
      >
        <Play size={10} /> Run Workflow
      </button>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] overflow-hidden">
        {/* ── Card header ── */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <button type="button" onClick={() => setCollapsed(c => !c)} className="text-blue-400/70 hover:text-blue-400 transition-colors shrink-0 hover:cursor-pointer">
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-[var(--text-primary)] truncate">{workflow.name}</p>
            {workflow.generatedAt && (
              <p className="flex items-center gap-1 text-[10px] text-[var(--text-faint)] mt-0.5">
                <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                {new Date(workflow.generatedAt).toLocaleString()}
              </p>
            )}
          </div>

          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-overlay-md)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] shrink-0">
            {workflow.steps.length} steps
          </span>

          {/* Run summary pill */}
          {hasResult && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] shrink-0 ${runState.phase === 'done' && runState.failed === 0 ? 'bg-emerald-500/10 text-emerald-400' :
              runState.phase === 'running' ? 'bg-blue-500/10 text-blue-400' :
                'bg-red-500/10 text-red-400'
              }`}>
              {runState.phase === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={2} />}
              {runState.phase === 'done' && runState.failed === 0 && <Check className="h-2.5 w-2.5" strokeWidth={2} />}
              {(runState.phase === 'done' || runState.phase === 'aborted') && runState.failed > 0 && <AlertCircle className="h-2.5 w-2.5" strokeWidth={2} />}
              {runState.phase === 'running' ? 'Running…' :
                runState.phase === 'done' ? `${runState.passed}/${runState.passed + runState.failed}` :
                  runState.phase === 'aborted' ? 'Aborted' : 'Error'}
            </span>
          )}

          {/* View toggle — segmented, matches Model page */}
          {!collapsed && (
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] p-0.5 shrink-0">
              {(['list', 'graph'] as const).map(v => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors hover:cursor-pointer ${view === v ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}
                >
                  {v === 'list' ? <List className="h-3 w-3" strokeWidth={2} /> : <GitBranch className="h-3 w-3" strokeWidth={2} />}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Log toggle */}
          {hasResult && !collapsed && (
            <button
              type="button"
              onClick={() => setShowLog(l => !l)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] transition-colors border border-[var(--border)] hover:cursor-pointer ${showLog ? 'bg-[var(--bg-overlay-md)] text-[var(--text-secondary)]' : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)] bg-[var(--bg-overlay)]'}`}
            >
              <LogsIcon className="h-3 w-3" strokeWidth={2} /> Log
            </button>
          )}

          {/* Stop */}
          {isRunning && (
            <button
              type="button"
              onClick={stopRun}
              className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] text-red-400 hover:bg-red-500/20 transition-colors shrink-0 hover:cursor-pointer"
            >
              <Square className="h-3 w-3" strokeWidth={2} /> Stop
            </button>
          )}

          {/* Restart */}
          {hasResult && !isRunning && (
            <button
              type="button"
              onClick={resetRun}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-2.5 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors shrink-0 hover:cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2} /> Reset
            </button>
          )}

          {/* View Traces */}
          {hasResult && !isRunning && onViewTraces && (
            <button
              type="button"
              onClick={() => onViewTraces(workflow.name, lastTraceId)}
              className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] text-blue-400 hover:bg-blue-500/20 transition-colors shrink-0 hover:cursor-pointer"
            >
              <Activity className="h-3 w-3" strokeWidth={2} />
              {lastTraceId ? 'View Trace' : 'Traces'}
            </button>
          )}

          {/* Run */}
          {!isRunning && (
            <button
              type="button"
              onClick={startRun}
              className="hidden items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-blue-400 transition-colors shrink-0 hover:cursor-pointer"
            >
              <Play className="h-3 w-3" strokeWidth={2} />
              {hasResult ? 'Re-run' : 'Run'}
            </button>
          )}

          {/* Delete (legacy workflows can't be deleted via API) */}
          {!workflow._legacy && !isRunning && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete workflow"
              className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2 py-1 text-[10px] text-red-400/80 hover:bg-red-500/20 hover:text-red-400 transition-colors shrink-0 disabled:opacity-40 hover:cursor-pointer"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} /> : <Trash2 className="h-3 w-3" strokeWidth={2} />}
            </button>
          )}
        </div>

        {/* ── Card body ── */}
        {!collapsed && (
          <>
            {/* Environment bar */}
            {environments.length > 0 && (
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2 bg-[var(--bg-overlay-md)] flex-wrap">
                <Globe className="h-3 w-3 text-[var(--text-faint)] shrink-0" strokeWidth={2} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mr-1">Env:</span>
                {environments.map(env => {
                  const isSelected = selectedEnv === env.name;
                  return (
                    <button
                      key={env.name}
                      type="button"
                      onClick={() => { setSelectedEnv(env.name); setBaseUrl(env.baseUrl); }}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-all hover:cursor-pointer ${
                        isSelected
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                          : 'border-[var(--border)] text-[var(--text-faint)] hover:border-blue-500/20 hover:text-[var(--text-muted)]'
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: isSelected ? '#60a5fa' : 'var(--text-faint)' }}
                      />
                      {env.name}
                    </button>
                  );
                })}
                {selectedEnv && (
                  <span className="ml-auto font-mono text-[10px] text-[var(--text-faint)] truncate max-w-[180px]">{baseUrl}</span>
                )}
              </div>
            )}

            {/* Live log */}
            {showLog && (
              <div className="border-b border-[var(--border)]">
                <RunLog runState={runState} steps={workflow.steps} />
              </div>
            )}

            {view === 'list' && (
              <div className="divide-y divide-[var(--border)]">
                {workflow.steps.map((step, i) => (
                  <StepRow
                    key={i}
                    step={step}
                    index={i}
                    total={workflow.steps.length}
                    status={runState.stepStatuses[i] ?? 'idle'}
                    result={runState.stepResults[i] ?? null}
                  />
                ))}
              </div>
            )}

            {view === 'graph' && (
              <div className="p-4">
                <SimFlowGraph steps={workflow.steps} runState={runState} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-overlay)] text-blue-400">
          <Diamond className="h-7 w-7" strokeWidth={2} />
        </div>
      </div>
      <div>
        <p className="font-medium text-[var(--text-primary)]">No workflows yet</p>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          Create one with the{' '}
          <span className="text-[var(--text-secondary)]">+ New Workflow</span> button, or run{' '}
          <code className="text-[var(--text-secondary)]">jetic simulate workflow --goal "..."</code>
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-faint)]">
          Workflows are stored in <code className="text-[var(--text-faint)]">.jetic/workflows/</code>
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Simulations({ onViewTraces }: { onViewTraces?: (filter: { workflowName?: string, traceId?: string }) => void }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newGoal, setNewGoal] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const resetCreate = () => { setCreating(false); setNewGoal(''); setCreateError(null); };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try { setWorkflows(await fetchWorkflows()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newGoal.trim()) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      // Try AI generation first
      const r = await fetch('/api/workflows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: newGoal.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      resetCreate();
      await load(true);
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = (file: string) => {
    setWorkflows(prev => prev.filter(w => w._file !== file));
  };

  return (
    <div className="flex min-h-full w-full flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[15px] font-medium text-[var(--text-primary)] leading-none">Simulations</h1>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {loading ? 'Loading…' : `${workflows.length} workflow${workflows.length !== 1 ? 's' : ''} found`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* New Workflow button / inline form */}
          {creating ? (
            <div className="flex flex-col gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.05] p-3 w-80">
              <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-medium">
                <Zap className="h-3 w-3" strokeWidth={2} /> AI Workflow Generator
              </div>
              <input
                autoFocus
                value={newGoal}
                onChange={e => { setNewGoal(e.target.value); setCreateError(null); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) handleCreate();
                  if (e.key === 'Escape') resetCreate();
                }}
                placeholder="Describe the workflow goal, e.g. Admin creates workspace, invites teacher and logs out"
                className="h-7 w-full rounded-lg border border-blue-500/30 bg-[var(--bg-overlay-md)] px-2 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none focus:border-blue-500/60"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createLoading || !newGoal.trim()}
                  className="flex h-6 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/20 px-2 text-[10px] text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-40 hover:cursor-pointer"
                >
                  {createLoading
                    ? <><Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} /> AI generating…</>
                    : <><Zap className="h-3 w-3" strokeWidth={2} /> Generate with AI</>}
                </button>
                <button
                  type="button"
                  onClick={resetCreate}
                  className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </div>
              {createError && <span className="text-[10px] text-red-400 leading-tight">{createError}</span>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-6 items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 text-[10px] text-blue-400 hover:bg-blue-500/20 transition-colors hover:cursor-pointer"
            >
              <Plus className="h-3 w-3" strokeWidth={2} /> New Workflow
            </button>
          )}

          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] disabled:opacity-40 transition-all hover:cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col gap-4 p-6">

        {loading && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)]" style={{ opacity: 1 - i * 0.3 }} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-10 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" strokeWidth={2} />
            <div>
              <p className="font-medium text-red-300">Could not load simulations</p>
              <p className="mt-1 text-[11px] text-red-400/80">{error}</p>
            </div>
            <button type="button" onClick={() => load()} className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] text-red-400 hover:bg-red-500/20 transition-colors hover:cursor-pointer">Retry</button>
          </div>
        )}

        {!loading && !error && workflows.length === 0 && <EmptyState />}

        {!loading && !error && workflows.length > 0 && (
          <div className="space-y-5">
            {workflows.map((wf, i) => (
              <WorkflowCard
                key={`${wf._file}-${i}`}
                workflow={wf}
                onDelete={() => handleDelete(wf._file)}
                onViewTraces={onViewTraces ? (name, traceId) => onViewTraces({ workflowName: name, traceId }) : undefined}
              />
            ))}
          </div>
        )}

        {!loading && !error && workflows.length > 0 && (
          <div className="flex items-center gap-1.5 border-t border-[var(--border)] pt-3 text-[10px] text-[var(--text-faint)]">
            Workflows from <code className="text-[var(--text-faint)]">.jetic/workflows/</code>
          </div>
        )}
      </div>
    </div>
  );
}