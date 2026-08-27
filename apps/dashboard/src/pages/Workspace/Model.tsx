import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  GitBranch,
  List,
  Loader2,
  RefreshCw,
  ScanLine,
  Shield,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  type: string;
  required?: boolean;
  format?: string;
}

interface Endpoint {
  id: string;
  method: string;
  path: string;
  handlerName?: string;
  source?: { file: string; line: number };
  requestBody?: { contentType?: string; fields?: Record<string, FieldDef> };
  responses?: Record<string, { schema?: Record<string, string> }>;
  middleware?: { name: string }[];
  security?: { scheme: string }[];
}

interface Model {
  version: string;
  generatedAt: string;
  project: { name: string; language?: string; framework?: string };
  environments?: { name: string; baseUrl: string }[];
  endpoints: Endpoint[];
}

// ─── Method colours ───────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: '#34d399' },
  POST: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: '#60a5fa' },
  PUT: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: '#fbbf24' },
  PATCH: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: '#fb923c' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: '#f87171' },
  HEAD: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: '#a1a1aa' },
  OPTIONS: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: '#c084fc' },
};

function ms(m: string) {
  return METHOD_COLORS[m.toUpperCase()] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: '#a1a1aa' };
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchModel(): Promise<Model | null> {
  const r = await fetch('/api/model');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function triggerScan(): Promise<Model> {
  const r = await fetch('/api/model/scan', { method: 'POST' });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error ?? `Scan failed (${r.status})`); }
  return (await r.json()).model;
}

async function patchEndpoint(id: string, patch: Partial<Endpoint>): Promise<void> {
  const r = await fetch(`/api/model/endpoint/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Save failed (${r.status})`);
}

// ─── MethodChip ───────────────────────────────────────────────────────────────

function MethodChip({ method }: { method: string }) {
  const s = ms(method);
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px]  tracking-widest ${s.bg} ${s.text}`}>
      {method.toUpperCase()}
    </span>
  );
}

// ─── InlineEdit ───────────────────────────────────────────────────────────────

function InlineEdit({ value, onSave, mono = true }: { value: string; onSave: (v: string) => Promise<void>; mono?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); setEditing(false); }
  };

  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={ref} value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={`rounded border border-violet-500/40 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-200 outline-none w-56 ${mono ? '' : ''}`}
      />
      <button onClick={commit} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button onClick={() => { setDraft(value); setEditing(false); }} className="text-zinc-600 hover:text-zinc-400"><X className="h-3 w-3" /></button>
    </span>
  );

  return (
    <button onClick={() => setEditing(true)} className={`group/ie inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/[0.04] transition-colors ${mono ? '' : ''}`}>
      <span className="text-xs text-zinc-300">{value}</span>
      <Edit3 className="h-2.5 w-2.5 text-zinc-700 opacity-0 group-hover/ie:opacity-100 transition-opacity" />
    </button>
  );
}

// ─── EndpointRow ──────────────────────────────────────────────────────────────

function EndpointRow({ ep, onUpdate, onInspect }: { ep: Endpoint; onUpdate: (id: string, p: Partial<Endpoint>) => void; onInspect: (ep: Endpoint) => void }) {
  const [open, setOpen] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const save = async (id: string, patch: Partial<Endpoint>) => {
    setSaveErr('');
    try { await patchEndpoint(id, patch); onUpdate(id, patch); }
    catch (e: any) { setSaveErr(e.message); }
  };

  const fields = ep.requestBody?.fields ?? {};
  const responses = ep.responses ?? {};

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="group flex w-full items-center gap-3 px-7 py-2.5 hover:bg-white/[0.025] transition-colors text-left"
      >
        <span className="shrink-0 text-zinc-600">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span>
        <MethodChip method={ep.method} />
        <span className=" text-xs text-zinc-300 flex-1 truncate">{ep.path}</span>
        {ep.security && ep.security.length > 0 && <Shield className="h-3 w-3 text-amber-500/50 shrink-0" />}
        <span
          onClick={e => { e.stopPropagation(); onInspect(ep); }}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:border-violet-400/60 hover:cursor-pointer transition-colors"
        >
          INSPECT
        </span>
        <span className="hidden sm:block text-[10px] text-zinc-600 truncate max-w-[180px]">{ep.handlerName}</span>
      </button>

      {open && (
        <div className="px-10 pb-4 pt-1 space-y-3 bg-white/[0.01]">
          {saveErr && <p className="text-xs text-red-400 rounded border border-red-500/20 bg-red-500/10 px-2 py-1">{saveErr}</p>}

          {/* Editable fields */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <p className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">Method</p>
              <select
                value={ep.method}
                onChange={e => save(ep.id, { method: e.target.value })}
                className="rounded-full border border-white/[0.08] bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none"
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">Path</p>
              <InlineEdit value={ep.path} onSave={v => save(ep.id, { path: v })} />
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">Handler</p>
              <InlineEdit value={ep.handlerName ?? '—'} onSave={v => save(ep.id, { handlerName: v })} mono={false} />
            </div>
          </div>

          {ep.source && (
            <p className="text-[10px] text-zinc-600">
              📄 {ep.source.file.split(/[/\\]/).slice(-2).join('/')}:{ep.source.line}
            </p>
          )}

          {/* Request body */}
          {Object.keys(fields).length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Request Body</p>
              <div className="space-y-1">
                {Object.entries(fields).map(([name, def]) => (
                  <div key={name} className="flex items-center gap-2 rounded-full bg-white/[0.02] px-3 py-1.5">
                    <span className=" text-[11px] text-zinc-300">{name}</span>
                    <span className="text-[10px] text-zinc-600">{def.type}</span>
                    {def.required && <span className="text-[10px] text-rose-400/80">required</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Responses */}
          {Object.keys(responses).length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Responses</p>
              <div className="space-y-1">
                {Object.entries(responses).map(([status, def]) => (
                  <div key={status} className="flex items-start gap-2 rounded-full bg-white/[0.02] px-3 py-1.5">
                    <span className={` text-[11px]  ${status.startsWith('2') ? 'text-emerald-400' : 'text-red-400'}`}>{status}</span>
                    {def.schema && <span className="text-[10px] text-zinc-500">{Object.keys(def.schema).join(', ')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Middleware */}
          {ep.middleware && ep.middleware.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Middleware</p>
              <div className="flex flex-wrap gap-1">
                {ep.middleware.map((m, i) => (
                  <span key={i} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">{m.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GroupSection ─────────────────────────────────────────────────────────────

function GroupSection({ prefix, endpoints, onUpdate, onInspect }: { prefix: string; endpoints: Endpoint[]; onUpdate: (id: string, p: Partial<Endpoint>) => void; onInspect: (ep: Endpoint) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors bg-white/[0.01]"
      >
        <span className="text-violet-400/70">{collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
        <span className=" text-xs  text-violet-300">{prefix}</span>
        <span className="ml-auto rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-zinc-500">{endpoints.length}</span>
      </button>
      {!collapsed && endpoints.map(ep => <EndpointRow key={ep.id} ep={ep} onUpdate={onUpdate} onInspect={onInspect} />)}
    </div>
  );
}

// ─── GraphView ────────────────────────────────────────────────────────────────

const NODE_W = 210;
const NODE_H = 52;
const COL_GAP = 100;
const ROW_GAP = 14;
const PAD = 36;

function GraphView({ endpoints }: { endpoints: Endpoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Group by first path segment
  const groups = new Map<string, Endpoint[]>();
  for (const ep of endpoints) {
    const seg = '/' + (ep.path.split('/')[1] ?? '');
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg)!.push(ep);
  }
  const cols = Array.from(groups.entries());
  const maxRows = Math.max(1, ...cols.map(([, e]) => e.length));
  const totalW = cols.length * NODE_W + (cols.length - 1) * COL_GAP + PAD * 2;
  const totalH = maxRows * NODE_H + (maxRows - 1) * ROW_GAP + PAD * 2 + 24;

  // Build positions
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach(([, eps], ci) => {
    const colX = PAD + ci * (NODE_W + COL_GAP);
    eps.forEach((ep, ri) => {
      pos.set(ep.id, { x: colX, y: PAD + 24 + ri * (NODE_H + ROW_GAP) });
    });
  });

  // Draw bezier connections
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    cols.forEach(([, eps], ci) => {
      if (ci >= cols.length - 1) return;
      const nextEps = cols[ci + 1][1];
      eps.forEach(ep => {
        const from = pos.get(ep.id)!;
        nextEps.forEach(next => {
          const to = pos.get(next.id)!;
          const fx = from.x + NODE_W, fy = from.y + NODE_H / 2;
          const tx = to.x, ty = to.y + NODE_H / 2;
          const cp = (fx + tx) / 2;
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(139,92,246,0.10)';
          ctx.lineWidth = 1;
          ctx.moveTo(fx, fy);
          ctx.bezierCurveTo(cp, fy, cp, ty, tx, ty);
          ctx.stroke();
        });
      });
    });
  });

  return (
    <div className="relative overflow-auto" style={{ minWidth: totalW, minHeight: totalH }}>
      <canvas ref={canvasRef} width={totalW} height={totalH} className="absolute inset-0 pointer-events-none" />

      {/* Column headers */}
      {cols.map(([prefix], ci) => (
        <div
          key={prefix}
          className="absolute text-[9px]  text-violet-400/50 uppercase tracking-widest text-center"
          style={{ left: PAD + ci * (NODE_W + COL_GAP), top: PAD, width: NODE_W }}
        >
          {prefix}
        </div>
      ))}

      {/* Nodes */}
      {endpoints.map(ep => {
        const p = pos.get(ep.id);
        if (!p) return null;
        const s = ms(ep.method);
        return (
          <div
            key={ep.id}
            className="absolute rounded border border-white/[0.07] bg-[#111] shadow-md flex items-center gap-2 px-3 overflow-hidden hover:border-white/[0.15] transition-colors"
            style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: s.dot }} />
            <span className={`shrink-0 text-[9px]  ${s.text}`}>{ep.method}</span>
            <div className="min-w-0">
              <p className=" text-[10px] text-zinc-300 truncate">{ep.path}</p>
              <p className="text-[9px] text-zinc-600 truncate">{ep.handlerName}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ScanCTA ──────────────────────────────────────────────────────────────────

function ScanCTA({ onScan, scanning, error }: { onScan: () => void; scanning: boolean; error: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-violet-400">
          <ScanLine className="h-7 w-7" />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-300">No model found</p>
        <p className="mt-1 text-xs text-zinc-600">
          Scan your project to generate <code className="text-zinc-500">.jetic/model.json</code>
        </p>
      </div>
      {error && <p className="text-xs text-red-400 max-w-xs">{error}</p>}
      <button
        onClick={onScan}
        disabled={scanning}
        className="flex items-center gap-2 rounded bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
        {scanning ? 'Scanning project…' : 'Scan Project'}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Model({ onInspect }: { onInspect?: (ep: Endpoint) => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState('');
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [filter, setFilter] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try { setModel(await fetchModel()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleScan = async () => {
    setScanning(true); setScanError('');
    try { setModel(await triggerScan()); }
    catch (e: any) { setScanError(e.message); }
    finally { setScanning(false); }
  };

  const handleUpdate = (id: string, patch: Partial<Endpoint>) => {
    setModel(prev => prev ? { ...prev, endpoints: prev.endpoints.map(ep => ep.id === id ? { ...ep, ...patch } : ep) } : prev);
  };

  const filtered = (model?.endpoints ?? []).filter(ep =>
    !filter ||
    ep.path.toLowerCase().includes(filter.toLowerCase()) ||
    ep.method.toLowerCase().includes(filter.toLowerCase()) ||
    (ep.handlerName ?? '').toLowerCase().includes(filter.toLowerCase())
  );

  // Group by path prefix
  const grouped = new Map<string, Endpoint[]>();
  for (const ep of filtered) {
    const key = '/' + (ep.path.split('/')[1] ?? '');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ep);
  }

  return (
    <div className="flex min-h-full w-full flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
        <div className="flex items-center gap-3">

          <div>
            <h1 className="text-[15px]  text-white leading-none">
              {model?.project?.name ?? 'Model'}
            </h1>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {loading ? 'Loading…'
                : model ? `v${model.version} · ${model.endpoints.length} endpoints · ${model.project.framework ?? model.project.language ?? ''}`
                  : 'No model generated yet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          {model && (
            <div className="flex overflow-hidden rounded border border-white/[0.06]">
              {(['list', 'graph'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${view === v ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-300 bg-white/[0.02]'}`}
                >
                  {v === 'list' ? <List className="h-3.5 w-3.5" /> : <GitBranch className="h-3.5 w-3.5" />}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 disabled:opacity-40 transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
            {scanning ? 'Scanning…' : 'Re-scan'}
          </button>
        </div>
      </div>

      {/* Scan error banner */}
      {scanError && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/[0.05] px-6 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {scanError}
          <button onClick={() => setScanError('')} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col">

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2 p-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 animate-pulse rounded border border-white/[0.04] bg-white/[0.02]" style={{ opacity: 1 - i * 0.18 }} />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 m-6 rounded border border-red-500/20 bg-red-500/[0.05] p-10 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
            <button onClick={() => load()} className="rounded border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors">Retry</button>
          </div>
        )}

        {/* No model yet */}
        {!loading && !error && !model && (
          <ScanCTA onScan={handleScan} scanning={scanning} error={scanError} />
        )}

        {/* Graph view */}
        {!loading && !error && model && view === 'graph' && (
          <div className="flex-1 overflow-auto p-6">
            <GraphView endpoints={filtered} />
          </div>
        )}

        {/* List view */}
        {!loading && !error && model && view === 'list' && (
          <div className="flex flex-1 flex-col">
            {/* Filter bar */}
            <div className="flex items-center gap-3 border-b border-white/[0.04] px-6 py-3">
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by path, method or handler…"
                className="w-full max-w-sm rounded border border-white/[0.06] bg-white/[0.02] py-1.5 px-3 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-violet-500/40 transition-all"
              />
              {filter && <button onClick={() => setFilter('')} className="text-zinc-600 hover:text-zinc-400"><X className="h-3.5 w-3.5" /></button>}
              <span className="ml-auto text-[10px] text-zinc-600">{filtered.length} endpoint{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Grouped rows */}
            <div className="flex-1 overflow-auto divide-y divide-white/[0.04]">
              {Array.from(grouped.entries()).map(([prefix, eps]) => (
                <GroupSection key={prefix} prefix={prefix} endpoints={eps} onUpdate={handleUpdate} onInspect={ep => onInspect?.(ep)} />
              ))}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <p className="text-sm text-zinc-500">No endpoints match "{filter}"</p>
                  <button onClick={() => setFilter('')} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Clear filter</button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-1.5 border-t border-white/[0.04] px-6 py-2.5 text-[10px] text-zinc-700">
              Generated {new Date(model.generatedAt).toLocaleString()}
              <span className="ml-auto">
                <button onClick={() => load(true)} className="text-zinc-600 hover:text-zinc-400 transition-colors">Refresh</button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
