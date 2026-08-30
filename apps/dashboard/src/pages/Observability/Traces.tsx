import { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
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

  Clock,
  Code2,
  Database,
  ExternalLink,

  Layers2,
  RefreshCw,
  Search,
  Trash2,
  X,

  Diamond,
} from 'lucide-react';
import { listTraces, deleteTrace, clearAllTraces, type TraceRecord } from '../../lib/traceStore';
import type { PageId } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TracesProps {
  initialFilter?: { workflowName?: string; endpointPath?: string; traceId?: string };
  onNavigate?: (page: PageId) => void;
}

// ─── Method colours ───────────────────────────────────────────────────────────

const MC: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  GET: { bg: '#052e16', text: '#4ade80', border: '#166534', dot: '#34d399' },
  POST: { bg: '#172554', text: '#60a5fa', border: '#1e40af', dot: '#60a5fa' },
  PUT: { bg: '#422006', text: '#fbbf24', border: '#92400e', dot: '#fbbf24' },
  PATCH: { bg: '#431407', text: '#fb923c', border: '#9a3412', dot: '#fb923c' },
  DELETE: { bg: '#3f0000', text: '#f87171', border: '#991b1b', dot: '#f87171' },
  HEAD: { bg: '#18181b', text: '#a1a1aa', border: '#3f3f46', dot: '#a1a1aa' },
  OPTIONS: { bg: '#2e1065', text: '#c084fc', border: '#6b21a8', dot: '#c084fc' },
};
function mc(m: string) { return MC[m.toUpperCase()] ?? MC['GET']; }

// ─── ReactFlow Node types ─────────────────────────────────────────────────────

/** HTTP Step node */
function StepNode({ data }: { data: any }) {
  const s = mc(data.method);
  const statusColor = data.passed ? '#34d399' : '#f87171';
  const borderColor = data.selected ? '#60a5fa'
    : data.passed === true ? '#166534'
      : data.passed === false ? '#991b1b'
        : '#3f3f46';

  return (
    <div
      onClick={data.onSelect}
      style={{
        width: 260,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 10,
        background: 'var(--bg-surface, #111)',
        cursor: 'pointer',
        boxShadow: data.selected ? '0 0 0 2px rgba(96,165,250,0.4)' : '0 2px 12px rgba(0,0,0,0.4)',
        transition: 'box-shadow 0.15s ease',
        overflow: 'hidden',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />

      {/* Top bar: method + path */}
      <div style={{ background: s.bg, borderBottom: `1px solid ${s.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          color: s.text, background: `${s.dot}15`, border: `1px solid ${s.dot}40`,
          borderRadius: 4, padding: '2px 6px',
        }}>
          {data.method}
        </span>
        <span style={{ fontSize: 11, color: '#e4e4e7', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.path}
        </span>
        {data.status > 0 && (
          <span style={{ fontSize: 10, color: statusColor, fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>
            {data.status}
          </span>
        )}
      </div>

      {/* Body: step name + timing + status */}
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {data.name && (
          <span style={{ fontSize: 10, color: '#71717a', fontStyle: 'italic' }}>{data.name}</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Pass/fail badge */}
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
            color: data.passed ? '#4ade80' : '#f87171',
            background: data.passed ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${data.passed ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
            borderRadius: 4, padding: '2px 6px',
          }}>
            {data.passed ? '✓ PASSED' : '✗ FAILED'}
          </span>
          {/* Duration */}
          {data.durationMs > 0 && (
            <span style={{ fontSize: 10, color: '#52525b' }}>{data.durationMs}ms</span>
          )}
        </div>

        {/* Inject pills (vars used as input) */}
        {data.injectSpec && Object.keys(data.injectSpec).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {Object.entries(data.injectSpec).map(([header, varName]: any) => (
              <span key={header} style={{
                fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.08)',
                border: '1px solid rgba(167,139,250,0.2)', borderRadius: 4, padding: '1px 5px',
              }}>
                📥 {header} ← {'{{'}{varName}{'}}'}
              </span>
            ))}
          </div>
        )}

        {/* Error */}
        {data.error && (
          <span style={{ fontSize: 9, color: '#f87171', marginTop: 2 }}>⚠ {data.error}</span>
        )}

        {/* Click hint */}
        <span style={{ fontSize: 9, color: '#3f3f46', marginTop: 2 }}>Click for details</span>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
}

/** Memory/capture node — shows variables captured by a step */
function MemoryNode({ data }: { data: any }) {
  const entries = Object.entries(data.captured ?? {});
  return (
    <div style={{
      width: 200,
      border: '1.5px solid rgba(167,139,250,0.35)',
      borderRadius: 10,
      background: 'rgba(139,92,246,0.07)',
      padding: '8px 12px',
      backdropFilter: 'blur(4px)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Database style={{ width: 12, height: 12, color: '#a78bfa' }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: '#a78bfa', letterSpacing: '0.06em' }}>MEMORY</span>
      </div>
      {entries.length === 0 && (
        <span style={{ fontSize: 9, color: '#52525b' }}>No variables captured</span>
      )}
      {entries.map(([key, val]: any) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: '#c4b5fd', fontFamily: 'monospace' }}>{key}</span>
          <ArrowRight style={{ width: 10, height: 10, color: '#52525b', flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: '#a1a1aa', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {String(val).length > 20 ? String(val).slice(0, 20) + '…' : val}
          </span>
        </div>
      ))}
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
}

/** Start/End sentinel nodes */
function StartNode({ data }: { data: any }) {
  return (
    <div style={{
      width: 120, border: '1.5px solid rgba(96,165,250,0.4)', borderRadius: 20,
      background: 'rgba(96,165,250,0.08)', padding: '7px 14px', textAlign: 'center',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', letterSpacing: '0.05em' }}>
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
}

function EndNode({ data }: { data: any }) {
  const color = data.phase === 'done' && data.failed === 0 ? '#4ade80'
    : data.phase === 'aborted' ? '#f87171' : '#fbbf24';
  return (
    <div style={{
      width: 140, border: `1.5px solid ${color}40`, borderRadius: 20,
      background: `${color}0d`, padding: '7px 14px', textAlign: 'center',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
      <span style={{ fontSize: 11, fontWeight: 600, color, letterSpacing: '0.05em' }}>
        {data.phase === 'done' && data.failed === 0 ? '✓ PASSED' : data.phase === 'aborted' ? '✗ ABORTED' : `${data.passed}/${data.passed + data.failed} PASSED`}
      </span>
    </div>
  );
}

const nodeTypes = { step: StepNode, memory: MemoryNode, start: StartNode, end: EndNode };

// ─── Build ReactFlow graph from trace ─────────────────────────────────────────

const STEP_W = 260;
const STEP_H = 130;
const MEM_W = 200;
const MEM_H = 90;
//const X_STEP = 310;
const Y_GAP = 50;

function buildGraph(trace: TraceRecord, selectedStep: number | null, onSelectStep: (i: number) => void) {
  const nodes: any[] = [];
  const edges: any[] = [];
  let y = 0;

  // Start sentinel
  nodes.push({
    id: 'start',
    type: 'start',
    position: { x: (STEP_W - 120) / 2, y },
    data: { label: `▶ START · ${new Date(trace.startedAt).toLocaleTimeString()}` },
    draggable: false,
  });
  y += 50 + Y_GAP;

  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i];
    const hasCapture = step.captureSpec && Object.keys(step.captureSpec).length > 0;
    const hasCaptured = step.captured && Object.keys(step.captured).length > 0;
    const edgeColor = step.passed ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)';

    // Step node
    nodes.push({
      id: `step-${i}`,
      type: 'step',
      position: { x: 0, y },
      data: {
        index: i,
        name: step.name,
        method: step.method,
        path: step.path,
        status: step.status,
        passed: step.passed,
        durationMs: step.durationMs,
        error: step.error,
        injectSpec: step.injectSpec,
        captureSpec: step.captureSpec,
        selected: selectedStep === i,
        onSelect: () => onSelectStep(i),
      },
      draggable: false,
    });

    // Edge from previous
    const prevId = i === 0 ? 'start' : (hasPrevCapture(trace, i - 1) ? `mem-${i - 1}` : `step-${i - 1}`);
    edges.push({
      id: `e-${i}`,
      source: prevId,
      target: `step-${i}`,
      style: { stroke: edgeColor, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
      animated: false,
      label: i > 0 && trace.steps[i - 1].injectSpec
        ? Object.keys(trace.steps[i - 1].injectSpec ?? {}).map(k => `{{${k}}}`).join(', ')
        : undefined,
      labelStyle: { fill: 'rgba(167,139,250,0.7)', fontSize: 9 },
      labelBgStyle: { fill: 'transparent' },
    });

    y += STEP_H + Y_GAP;

    // Memory node after step (if captures)
    if (hasCapture || hasCaptured) {
      nodes.push({
        id: `mem-${i}`,
        type: 'memory',
        position: { x: (STEP_W - MEM_W) / 2, y },
        data: {
          captured: hasCaptured ? step.captured : Object.fromEntries(
            Object.keys(step.captureSpec ?? {}).map(k => [k.split(':').pop() ?? k, '…'])
          ),
        },
        draggable: false,
      });
      edges.push({
        id: `e-mem-${i}`,
        source: `step-${i}`,
        target: `mem-${i}`,
        style: { stroke: 'rgba(167,139,250,0.3)', strokeWidth: 1, strokeDasharray: '4 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(167,139,250,0.4)' },
        label: 'capture',
        labelStyle: { fill: 'rgba(167,139,250,0.5)', fontSize: 9 },
        labelBgStyle: { fill: 'transparent' },
      });
      y += MEM_H + Y_GAP;
    }
  }

  // End sentinel
  nodes.push({
    id: 'end',
    type: 'end',
    position: { x: (STEP_W - 140) / 2, y },
    data: { phase: trace.phase, passed: trace.passed, failed: trace.failed },
    draggable: false,
  });
  const lastId = trace.steps.length > 0
    ? (hasPrevCapture(trace, trace.steps.length - 1) ? `mem-${trace.steps.length - 1}` : `step-${trace.steps.length - 1}`)
    : 'start';
  edges.push({
    id: 'e-end',
    source: lastId,
    target: 'end',
    style: { stroke: trace.phase === 'done' && trace.failed === 0 ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.3)', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(74,222,128,0.4)' },
  });

  return { nodes, edges };
}

function hasPrevCapture(trace: TraceRecord, i: number) {
  const s = trace.steps[i];
  if (!s) return false;
  return (s.captureSpec && Object.keys(s.captureSpec).length > 0) || (s.captured && Object.keys(s.captured).length > 0);
}

// ─── ReactFlow graph wrapper ──────────────────────────────────────────────────

function TraceGraph({ trace, selectedStep, onSelectStep }: {
  trace: TraceRecord;
  selectedStep: number | null;
  onSelectStep: (i: number) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(trace, selectedStep, onSelectStep);
    setNodes(n);
    setEdges(e);
  }, [trace, selectedStep]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={2}
      style={{ background: 'transparent' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.04)" />
      <Controls style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }} showInteractive={false} />
      <MiniMap
        nodeColor={n => {
          if (n.type === 'memory') return 'rgba(167,139,250,0.5)';
          if (n.type === 'start' || n.type === 'end') return 'rgba(96,165,250,0.5)';
          return (n.data?.passed ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)');
        }}
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
        maskColor="rgba(0,0,0,0.4)"
      />
    </ReactFlow>
  );
}

// ─── Step detail drawer ───────────────────────────────────────────────────────

function StepDetailDrawer({ step, onClose }: { step: TraceRecord['steps'][number]; onClose: () => void }) {
  const s = mc(step.method);
  const [tab, setTab] = useState<'overview' | 'request' | 'response' | 'vars'>('overview');

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 360,
        borderLeft: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)',
        flexShrink: 0,
      }}
    >
      {/* Drawer header */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'var(--bg-elevated)',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          color: s.text, background: s.bg, border: `1px solid ${s.border}`,
          borderRadius: 4, padding: '2px 8px',
        }}>
          {step.method}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {step.path}
        </span>
        <button onClick={onClose} style={{ color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: step.passed ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)',
      }}>
        {step.passed
          ? <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          : <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
        <span style={{ fontSize: 11, fontWeight: 600, color: step.passed ? '#4ade80' : '#f87171' }}>
          HTTP {step.status > 0 ? step.status : 'ERROR'} · {step.durationMs}ms
        </span>
        {step.expectStatus && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            expected {step.expectStatus}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['overview', 'request', 'response', 'vars'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '8px 4px', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'capitalize',
              color: tab === t ? '#60a5fa' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid #60a5fa' : '2px solid transparent',
              background: 'transparent', cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="Step">
              <KV k="Index" v={`#${step.index + 1}`} />
              <KV k="Name" v={step.name || '—'} />
              <KV k="Method" v={step.method} />
              <KV k="Path" v={step.path} mono />
              {step.description && <KV k="Description" v={step.description} />}
            </Section>
            <Section title="Timing">
              <KV k="Duration" v={`${step.durationMs}ms`} accent="#60a5fa" />
              {step.expectStatus && <KV k="Expected status" v={String(step.expectStatus)} />}
              <KV k="Actual status" v={step.status > 0 ? String(step.status) : 'No response'} accent={step.passed ? '#4ade80' : '#f87171'} />
            </Section>
            {step.error && (
              <Section title="Error">
                <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '8px 10px' }}>
                  <span style={{ fontSize: 11, color: '#f87171', fontFamily: 'monospace' }}>{step.error}</span>
                </div>
              </Section>
            )}
          </div>
        )}

        {tab === 'request' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.keys(step.injected ?? {}).length > 0 && (
              <Section title="Headers (injected)">
                {Object.entries(step.injected ?? {}).map(([k, v]) => (
                  <KV key={k} k={k} v={String(v)} mono />
                ))}
              </Section>
            )}
            {step.injectSpec && Object.keys(step.injectSpec).length > 0 && (
              <Section title="Variable injection spec">
                {Object.entries(step.injectSpec).map(([header, varName]) => (
                  <KV key={header} k={header} v={`← {{${varName}}}`} mono accent="#a78bfa" />
                ))}
              </Section>
            )}
            {step.requestBody ? (
              <Section title="Request body">
                <pre style={{
                  fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: 10, overflowX: 'auto', whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all', margin: 0,
                }}>
                  {JSON.stringify(step.requestBody, null, 2)}
                </pre>
              </Section>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No request body</span>
            )}
          </div>
        )}

        {tab === 'response' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {step.responseBody !== undefined ? (
              <Section title={`Response body · HTTP ${step.status}`}>
                <pre style={{
                  fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: 10, overflowX: 'auto', whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all', margin: 0,
                }}>
                  {typeof step.responseBody === 'string'
                    ? step.responseBody
                    : JSON.stringify(step.responseBody, null, 2)}
                </pre>
              </Section>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No response body recorded</span>
            )}
          </div>
        )}

        {tab === 'vars' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {step.captureSpec && Object.keys(step.captureSpec).length > 0 && (
              <Section title="Capture spec (JSONPath)">
                {Object.entries(step.captureSpec).map(([varName, path]) => (
                  <KV key={varName} k={varName} v={path} mono accent="#a78bfa" />
                ))}
              </Section>
            )}
            {step.captured && Object.keys(step.captured).length > 0 ? (
              <Section title="Captured values">
                {Object.entries(step.captured).map(([k, v]) => (
                  <KV key={k} k={k} v={String(v)} mono accent="#4ade80" />
                ))}
              </Section>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No variables captured in this step</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  );
}

function KV({ k, v, mono = false, accent }: { k: string; v: string; mono?: boolean; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 100, flexShrink: 0 }}>{k}</span>
      <span style={{
        fontSize: 10, color: accent ?? 'var(--text-secondary)',
        fontFamily: mono ? 'monospace' : undefined,
        wordBreak: 'break-all',
      }}>
        {v}
      </span>
    </div>
  );
}

// ─── Trace viewer (right panel) ───────────────────────────────────────────────

function TraceViewer({ trace }: { trace: TraceRecord; onNavigate?: (p: PageId) => void }) {
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const totalMs = trace.steps.reduce((a, s) => a + s.durationMs, 0) || 1;

  const handleSelectStep = useCallback((i: number) => {
    setSelectedStep(prev => prev === i ? null : i);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {trace.workflowName}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock className="h-3 w-3 inline" />
            {new Date(trace.startedAt).toLocaleString()}
            {trace.baseUrl && <> · <code style={{ color: 'var(--text-faint)' }}>{trace.baseUrl}</code></>}
            · <span style={{ color: 'var(--text-faint)' }}>{trace.source === 'local-sim' ? 'Simulated locally' : 'Real API run'}</span>
          </p>
        </div>

        {/* Overall result badge */}
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
          color: trace.phase === 'done' && trace.failed === 0 ? '#4ade80' : trace.phase === 'aborted' ? '#f87171' : '#fbbf24',
          background: trace.phase === 'done' && trace.failed === 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${trace.phase === 'done' && trace.failed === 0 ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
        }}>
          {trace.phase === 'done' && trace.failed === 0 ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {trace.passed}/{trace.passed + trace.failed} passed · {trace.durationMs}ms
        </span>
      </div>

      {/* ── Timeline bar ── */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase' }}>
          Timeline · {trace.steps.length} steps · {trace.durationMs}ms total
        </p>
        <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
          {trace.steps.map((s, i) => (
            <div
              key={i}
              onClick={() => handleSelectStep(i)}
              title={`${s.method} ${s.path} — ${s.durationMs}ms`}
              style={{
                flex: s.durationMs / totalMs,
                minWidth: 4,
                background: s.passed ? '#22c55e' : '#ef4444',
                cursor: 'pointer',
                opacity: selectedStep === i ? 1 : 0.7,
                borderRadius: 2,
                transition: 'opacity 0.15s',
              }}
            />
          ))}
        </div>
        {/* Step labels */}
        <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
          {trace.steps.map((s, i) => (
            <div
              key={i}
              style={{ flex: s.durationMs / totalMs, minWidth: 4, fontSize: 8, color: 'var(--text-faint)', overflow: 'hidden', cursor: 'pointer' }}
              onClick={() => handleSelectStep(i)}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* ── Graph + drawer ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ReactFlow canvas */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <TraceGraph trace={trace} selectedStep={selectedStep} onSelectStep={handleSelectStep} />
        </div>

        {/* Step detail drawer */}
        {selectedStep !== null && trace.steps[selectedStep] && (
          <StepDetailDrawer
            step={trace.steps[selectedStep]}
            onClose={() => setSelectedStep(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Trace list item ──────────────────────────────────────────────────────────

function TraceListItem({ trace, selected, onClick, onDelete }: {
  trace: TraceRecord;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const color = trace.phase === 'done' && trace.failed === 0 ? '#4ade80'
    : trace.phase === 'aborted' ? '#f87171' : '#fbbf24';

  const relTime = () => {
    const diff = Date.now() - new Date(trace.startedAt).getTime();
    if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
    return `${Math.round(diff / 3_600_000)}h ago`;
  };

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        backgroundColor: selected ? 'rgba(96,165,250,0.06)' : 'transparent',
        borderLeft: selected ? '3px solid #60a5fa' : '3px solid transparent',
        transition: 'background 0.1s',
        position: 'relative',
      }}
      className="group"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Status dot */}
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 11, fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {trace.workflowName}
          </p>
          <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock className="h-2.5 w-2.5 inline shrink-0" />
            {relTime()} · {trace.steps.length} steps · {trace.durationMs}ms
          </p>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {trace.passed > 0 && (
              <span style={{ fontSize: 9, color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 4, padding: '1px 5px' }}>
                {trace.passed} ✓
              </span>
            )}
            {trace.failed > 0 && (
              <span style={{ fontSize: 9, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 4, padding: '1px 5px' }}>
                {trace.failed} ✗
              </span>
            )}
            <span style={{ fontSize: 9, color: 'var(--text-faint)', background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>
              {trace.source === 'local-sim' ? 'sim' : 'api'}
            </span>
          </div>
        </div>
        {/* Delete */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            opacity: 0, transition: 'opacity 0.1s', color: 'var(--text-faint)',
            display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4,
          }}
          className="group-hover:opacity-100"
          title="Delete trace"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(96,165,250,0.1)', filter: 'blur(8px)' }} />
        <div style={{
          position: 'relative', width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: '#60a5fa',
        }}>
          <Activity className="h-6 w-6" />
        </div>
      </div>
      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>No traces yet</p>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 200 }}>
        Run a simulation from the Simulations page to generate a trace.
      </p>
    </div>
  );
}

function EmptyViewer() {
  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 32 }}>
      <div style={{ position: 'relative', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(167,139,250,0.1)', filter: 'blur(12px)' }} />
        <div style={{
          position: 'relative', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: '#a78bfa',
        }}>
          <Code2 className="h-8 w-8" />
        </div>
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Select a trace</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Pick a run from the list to visualize its execution graph
        </p>
      </div>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px',
        backgroundColor: 'var(--bg-overlay)', maxWidth: 340, textAlign: 'left',
      }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          What you'll see
        </p>
        {[
          ['HTTP step nodes', 'Every request in the workflow shown as a graph node with method, path, status, and timing'],
          ['Memory nodes', 'Variables captured from responses (tokens, IDs, etc.) shown in between steps'],
          ['Execution flow', 'Arrows colored green/red showing the success/failure path through your workflow'],
          ['Step detail drawer', 'Click any node to see full request/response bodies, headers, and capture specs'],
        ].map(([title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#60a5fa', flexShrink: 0, marginTop: 1 }}>→</span>
            <div>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>{title}</span>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Traces({ initialFilter, onNavigate }: TracesProps) {
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TraceRecord | null>(null);
  const didAutoSelect = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listTraces();
      setTraces(all);

      // Auto-select: if a specific traceId was passed, find and select it
      if (!didAutoSelect.current && initialFilter?.traceId) {
        const found = all.find(t => t.id === initialFilter.traceId);
        if (found) { setSelected(found); didAutoSelect.current = true; }
      } else if (!didAutoSelect.current && initialFilter?.workflowName && all.length > 0) {
        // Select the newest trace for that workflow
        const found = all.find(t => t.workflowName === initialFilter.workflowName);
        if (found) { setSelected(found); didAutoSelect.current = true; }
      }
    } finally {
      setLoading(false);
    }
  }, [initialFilter?.traceId, initialFilter?.workflowName]);

  useEffect(() => { load(); }, [load]);

  // Re-trigger when navigating here with a new traceId
  useEffect(() => {
    if (initialFilter?.traceId && traces.length > 0) {
      const found = traces.find(t => t.id === initialFilter.traceId);
      if (found) setSelected(found);
    }
  }, [initialFilter?.traceId, traces]);

  const handleDelete = async (id: string) => {
    await deleteTrace(id);
    if (selected?.id === id) setSelected(null);
    setTraces(prev => prev.filter(t => t.id !== id));
  };

  const handleClearAll = async () => {
    if (!confirm('Delete all traces? This cannot be undone.')) return;
    await clearAllTraces();
    setTraces([]);
    setSelected(null);
  };

  // Filter list
  const filtered = traces.filter(t =>
    !search.trim() ||
    t.workflowName.toLowerCase().includes(search.toLowerCase()) ||
    t.steps.some(s => s.path.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', height: '100%' }} className='w-full'>

      {/* ── Left panel: trace list ── */}
      <div style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)',
      }}>
        {/* List header */}
        <div style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-elevated)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>Traces</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                {loading ? 'Loading…' : `${traces.length} run${traces.length !== 1 ? 's' : ''} stored`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={load}
                title="Refresh"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-overlay)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {traces.length > 0 && (
                <button
                  onClick={handleClearAll}
                  title="Clear all"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', cursor: 'pointer' }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--text-faint)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search traces…"
              style={{
                width: '100%', paddingLeft: 28, paddingRight: search ? 28 : 10, paddingTop: 6, paddingBottom: 6,
                fontSize: 11, border: '1px solid var(--border)', borderRadius: 8,
                backgroundColor: 'var(--bg-overlay)', color: 'var(--text-secondary)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: 64, borderRadius: 8, border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-overlay)', opacity: 1 - i * 0.25,
                  animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                }} />
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && <EmptyList />}
          {!loading && filtered.map(trace => (
            <TraceListItem
              key={trace.id}
              trace={trace}
              selected={selected?.id === trace.id}
              onClick={() => setSelected(trace)}
              onDelete={() => handleDelete(trace.id)}
            />
          ))}
        </div>

        {/* List footer links */}
        {onNavigate && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <button
              onClick={() => onNavigate('simulations')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Diamond className="h-3 w-3" /> Simulations <ExternalLink className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={() => onNavigate('model')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Layers2 className="h-3 w-3" /> Model <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Right panel: viewer ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)' }}>
        {selected ? (
          <TraceViewer trace={selected} onNavigate={onNavigate} />
        ) : (
          <EmptyViewer />
        )}
      </div>
    </div>
  );
}
