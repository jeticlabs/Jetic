import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileCode2,
  GitBranch,
  List,
  Loader2,
  Plus,
  PlusCircle,
  RefreshCw,
  ScanLine,
  Shield,
  Trash2,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  type: string;
  required?: boolean;
  format?: string;
  description?: string;
  example?: any;
}

interface EndpointParameter {
  name: string;
  in?: 'query' | 'path' | 'header' | 'cookie' | 'body';
  type: string;
  format?: string;
  required?: boolean;
  description?: string;
  example?: any;
}

interface Endpoint {
  id: string;
  method: string;
  path: string;
  name?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  handlerName?: string;
  source?: { file: string; line: number };
  parameters?: EndpointParameter[];
  requestBody?: { contentType?: string; required?: boolean; fields?: Record<string, FieldDef>; content?: Record<string, { schema?: any; example?: any }> };
  responses?: Record<string, { description?: string; contentType?: string; schema?: Record<string, string>; content?: Record<string, { schema?: any; example?: any }> }>;
  middleware?: { name: string }[];
  security?: { scheme: string; required?: boolean }[];
}

interface Model {
  version: string;
  generatedAt: string;
  project: { name: string; language?: string; framework?: string };
  environments?: { name: string; baseUrl: string }[];
  endpoints: Endpoint[];
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

function ms(m: string) {
  return METHOD_COLORS[m.toUpperCase()] ?? { bg: 'bg-[var(--bg-overlay-md)]', text: 'text-[var(--text-muted)]', dot: '#a1a1aa' };
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

async function createEndpoint(ep: Record<string, unknown>): Promise<{ endpoint: Endpoint; model: Model }> {
  const r = await fetch('/api/model/endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ep),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as any).error ?? `Create failed (${r.status})`);
  }
  return r.json();
}

// ─── MethodChip ───────────────────────────────────────────────────────────────

function MethodChip({ method }: { method: string }) {
  const s = ms(method);
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] tracking-widest ${s.bg} ${s.text}`}>
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
        className={`rounded border border-blue-500/40 bg-[var(--bg-overlay-md)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none w-56 ${mono ? 'font-mono' : ''}`}
      />
      <button type="button" onClick={commit} disabled={saving} className="text-emerald-400 hover:text-emerald-300 hover:cursor-pointer">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button type="button" onClick={() => { setDraft(value); setEditing(false); }} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:cursor-pointer"><X className="h-3 w-3" /></button>
    </span>
  );

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group/ie inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--bg-overlay-md)] transition-colors hover:cursor-pointer ${mono ? 'font-mono' : ''}`}
    >
      <span className="text-xs text-[var(--text-secondary)]">{value}</span>
      <Edit3 className="h-2.5 w-2.5 text-[var(--text-faint)] opacity-0 group-hover/ie:opacity-100 transition-opacity" />
    </button>
  );
}

// ─── EndpointRow ──────────────────────────────────────────────────────────────

function EndpointRow({ ep, onUpdate, onInspect, onViewTraces, onEdit }: { ep: Endpoint; onUpdate: (id: string, p: Partial<Endpoint>) => void; onInspect: (ep: Endpoint) => void; onViewTraces?: (path: string) => void; onEdit: (ep: Endpoint) => void }) {
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
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="group flex w-full items-center gap-3 px-7 py-2.5 hover:bg-[var(--bg-overlay-md)] transition-colors text-left hover:cursor-pointer"
      >
        <span className="shrink-0 text-[var(--text-faint)]">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span>
        <MethodChip method={ep.method} />
        <span className="font-mono text-xs text-[var(--text-secondary)] flex-1 truncate">{ep.path}</span>
        {ep.security && ep.security.length > 0 && <Shield className="h-3 w-3 text-amber-500/60 shrink-0" />}
        {ep.deprecated && <span className="rounded text-[9px] font-medium text-amber-500/60 border border-amber-500/20 px-1 py-0.5">deprecated</span>}
        <span
          onClick={e => { e.stopPropagation(); onEdit(ep); }}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] border border-[var(--border)] text-[var(--text-faint)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] hover:cursor-pointer transition-colors"
        >
          <Edit3 className="h-2.5 w-2.5" /> EDIT
        </span>
        <span
          onClick={e => { e.stopPropagation(); onInspect(ep); }}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400/60 hover:cursor-pointer transition-colors"
        >
          INSPECT
        </span>
        {onViewTraces && (
          <span
            onClick={e => { e.stopPropagation(); onViewTraces(ep.path); }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:cursor-pointer transition-colors"
          >
            <Activity className="h-2.5 w-2.5" /> Traces
          </span>
        )}
        <span className="hidden sm:block text-[10px] text-[var(--text-faint)] truncate max-w-[180px]">{ep.handlerName}</span>
      </button>

      {open && (
        <div className="px-10 pb-4 pt-1 space-y-3 bg-[var(--bg-overlay)]">
          {saveErr && <p className="text-xs text-red-400 rounded border border-red-500/20 bg-red-500/10 px-2 py-1">{saveErr}</p>}

          {/* Editable fields */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <p className="text-[10px] text-[var(--text-faint)] mb-1 uppercase tracking-wider">Method</p>
              <select
                value={ep.method}
                onChange={e => save(ep.id, { method: e.target.value })}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-2 py-1 text-xs text-[var(--text-secondary)] outline-none hover:cursor-pointer"
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-faint)] mb-1 uppercase tracking-wider">Path</p>
              <InlineEdit value={ep.path} onSave={v => save(ep.id, { path: v })} />
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-faint)] mb-1 uppercase tracking-wider">Handler</p>
              <InlineEdit value={ep.handlerName ?? '—'} onSave={v => save(ep.id, { handlerName: v })} mono={false} />
            </div>
          </div>

          {ep.source && (
            <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
              <FileCode2 className="h-3 w-3 shrink-0" strokeWidth={2} />
              {ep.source.file.split(/[/\\]/).slice(-2).join('/')}:{ep.source.line}
            </p>
          )}

          {/* Request body */}
          {Object.keys(fields).length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--text-faint)] mb-1.5 uppercase tracking-wider">Request Body</p>
              <div className="space-y-1">
                {Object.entries(fields).map(([name, def]) => (
                  <div key={name} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-3 py-1.5">
                    <span className="font-mono text-[11px] text-[var(--text-secondary)]">{name}</span>
                    <span className="text-[10px] text-[var(--text-faint)]">{def.type}</span>
                    {def.required && <span className="text-[10px] text-rose-400">required</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Responses */}
          {Object.keys(responses).length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--text-faint)] mb-1.5 uppercase tracking-wider">Responses</p>
              <div className="space-y-1">
                {Object.entries(responses).map(([status, def]) => (
                  <div key={status} className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-3 py-1.5">
                    <span className={`font-mono text-[11px] ${status.startsWith('2') ? 'text-emerald-400' : 'text-red-400'}`}>{status}</span>
                    {def.schema && <span className="text-[10px] text-[var(--text-muted)]">{Object.keys(def.schema).join(', ')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Middleware */}
          {ep.middleware && ep.middleware.length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--text-faint)] mb-1.5 uppercase tracking-wider">Middleware</p>
              <div className="flex flex-wrap gap-1.5">
                {ep.middleware.map((m, i) => (
                  <span key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{m.name}</span>
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

function GroupSection({ prefix, endpoints, onUpdate, onInspect, onViewTraces, onEdit }: { prefix: string; endpoints: Endpoint[]; onUpdate: (id: string, p: Partial<Endpoint>) => void; onInspect: (ep: Endpoint) => void; onViewTraces?: (path: string) => void; onEdit: (ep: Endpoint) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center gap-3 px-4 py-2 hover:bg-[var(--bg-overlay-md)] transition-colors bg-[var(--bg-overlay)] hover:cursor-pointer"
      >
        <span className="text-blue-400">{collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
        <span className="font-mono text-xs font-medium text-blue-400">{prefix}</span>
        <span className="ml-auto rounded-full border border-[var(--border)] bg-[var(--bg-overlay-md)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{endpoints.length}</span>
      </button>
      <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-280px)]">
        {!collapsed && endpoints.map(ep => <EndpointRow key={ep.id} ep={ep} onUpdate={onUpdate} onInspect={onInspect} onViewTraces={onViewTraces} onEdit={onEdit} />)}
      </div>
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
          ctx.strokeStyle = 'rgba(96,165,250,0.14)';
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
          className="absolute text-[9px] font-medium text-blue-400/70 uppercase tracking-widest text-center"
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
            className="absolute rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] shadow-md flex items-center gap-2 px-3 overflow-hidden hover:border-blue-500/30 transition-colors"
            style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: s.dot }} />
            <span className={`shrink-0 text-[9px] font-medium ${s.text}`}>{ep.method}</span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] text-[var(--text-secondary)] truncate">{ep.path}</p>
              <p className="text-[9px] text-[var(--text-faint)] truncate">{ep.handlerName}</p>
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
        <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-overlay)] text-blue-400">
          <ScanLine className="h-7 w-7" strokeWidth={2} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">No model found</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Scan your project to generate <code className="text-[var(--text-secondary)]">.jetic/model.json</code>
        </p>
      </div>
      {error && <p className="text-xs text-red-400 max-w-xs">{error}</p>}
      <button
        type="button"
        onClick={onScan}
        disabled={scanning}
        className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors hover:cursor-pointer"
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <ScanLine className="h-4 w-4" strokeWidth={2} />}
        {scanning ? 'Scanning project…' : 'Scan Project'}
      </button>
    </div>
  );
}

// ─── Add Endpoint Dialog ──────────────────────────────────────────────────────

interface EndpointParam {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  type: string;
  required: boolean;
  description: string;
  example: string;
}

interface EndpointResponse {
  status: string;
  description: string;
  contentType: string;
  schema: string;
  example: string;
}

const CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'application/xml',
  'application/octet-stream',
];

const PARAM_TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];

function AddEndpointDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (ep: Endpoint, model: Model) => void }) {
  const [tab, setTab] = useState<'basic' | 'request' | 'responses'>('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Basic
  const [method, setMethod] = useState('GET');
  const [epPath, setEpPath] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  // ── Request
  const [params, setParams] = useState<EndpointParam[]>([]);
  const [bodyContentType, setBodyContentType] = useState('application/json');
  const [bodySchema, setBodySchema] = useState('');
  const [bodyExample, setBodyExample] = useState('');
  const [bodyRequired, setBodyRequired] = useState(false);

  // ── Responses
  const [responses, setResponses] = useState<EndpointResponse[]>([]);

  // Validation
  const [touched, setTouched] = useState(false);
  const pathInvalid = touched && !epPath.trim();

  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTab('basic');
      setMethod('GET');
      setEpPath('');
      setName('');
      setDescription('');
      setTags('');
      setParams([]);
      setBodyContentType('application/json');
      setBodySchema('');
      setBodyExample('');
      setBodyRequired(false);
      setResponses([]);
      setTouched(false);
      setError('');
      setSaving(false);
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const addParam = () => setParams(p => [...p, { name: '', in: 'query', type: 'string', required: false, description: '', example: '' }]);
  const updateParam = (i: number, patch: Partial<EndpointParam>) => setParams(p => p.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeParam = (i: number) => setParams(p => p.filter((_, idx) => idx !== i));

  const addResponse = () => setResponses(r => [...r, { status: '200', description: '', contentType: 'application/json', schema: '', example: '' }]);
  const updateResponse = (i: number, patch: Partial<EndpointResponse>) => setResponses(r => r.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeResponse = (i: number) => setResponses(r => r.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    setTouched(true);
    if (!epPath.trim()) { setTab('basic'); return; }

    setSaving(true);
    setError('');
    try {
      // Build the endpoint object (OpenAPI-inspired)
      const ep: Record<string, unknown> = {
        method: method.toUpperCase(),
        path: epPath.startsWith('/') ? epPath : '/' + epPath,
      };
      if (name.trim()) ep.name = name.trim();
      if (description.trim()) ep.description = description.trim();
      if (tags.trim()) ep.tags = tags.split(',').map(t => t.trim()).filter(Boolean);

      // Parameters
      const validParams = params.filter(p => p.name.trim());
      if (validParams.length > 0) {
        ep.parameters = validParams.map(p => {
          const param: Record<string, unknown> = {
            name: p.name,
            in: p.in,
            schema: { type: p.type },
            required: p.required,
          };
          if (p.description.trim()) param.description = p.description;
          if (p.example.trim()) param.example = p.example;
          return param;
        });
      }

      // Request body
      if (bodySchema.trim() || bodyExample.trim()) {
        const content: Record<string, unknown> = {};
        const mediaObj: Record<string, unknown> = {};
        if (bodySchema.trim()) {
          try { mediaObj.schema = JSON.parse(bodySchema); } catch { mediaObj.schema = bodySchema; }
        }
        if (bodyExample.trim()) {
          try { mediaObj.example = JSON.parse(bodyExample); } catch { mediaObj.example = bodyExample; }
        }
        content[bodyContentType] = mediaObj;
        ep.requestBody = { required: bodyRequired, content };
      }

      // Responses
      const validResponses = responses.filter(r => r.status.trim());
      if (validResponses.length > 0) {
        const resObj: Record<string, unknown> = {};
        for (const r of validResponses) {
          const entry: Record<string, unknown> = {};
          if (r.description.trim()) entry.description = r.description;
          if (r.schema.trim() || r.example.trim()) {
            const mediaObj: Record<string, unknown> = {};
            if (r.schema.trim()) {
              try { mediaObj.schema = JSON.parse(r.schema); } catch { mediaObj.schema = r.schema; }
            }
            if (r.example.trim()) {
              try { mediaObj.example = JSON.parse(r.example); } catch { mediaObj.example = r.example; }
            }
            entry.content = { [r.contentType]: mediaObj };
          }
          resObj[r.status] = entry;
        }
        ep.responses = resObj;
      }

      const result = await createEndpoint(ep);
      onCreated(result.endpoint, result.model);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'basic', label: 'Basic' },
    { key: 'request', label: 'Request' },
    { key: 'responses', label: 'Responses' },
  ];

  const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-3 py-2 text-xs text-[var(--text-secondary)] placeholder-[var(--text-faint)] outline-none focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)] transition-all';
  const labelCls = 'block text-[10px] text-[var(--text-faint)] mb-1.5 uppercase tracking-wider font-medium';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-[var(--border-md)] shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
              <PlusCircle className="h-4 w-4 text-blue-400" />
            </div>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Add Endpoint</h2>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-200 hover:cursor-pointer ${
                tab === t.key
                  ? 'bg-blue-500/15 text-blue-400 shadow-sm'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-overlay)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="mx-6 mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ════ BASIC TAB ════ */}
          {tab === 'basic' && (
            <>
              <div className="grid grid-cols-[140px_1fr] gap-4">
                <div>
                  <label className={labelCls}>Method *</label>
                  <select
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                    className={`${inputCls} hover:cursor-pointer`}
                  >
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Path *</label>
                  <input
                    value={epPath}
                    onChange={e => setEpPath(e.target.value)}
                    placeholder="/api/users"
                    className={`${inputCls} font-mono ${pathInvalid ? 'border-red-500/60 focus:border-red-500/80' : ''}`}
                  />
                  {pathInvalid && <p className="text-[10px] text-red-400 mt-1">Path is required</p>}
                </div>
              </div>
              <div>
                <label className={labelCls}>Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Create User"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Creates a new user account"
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div>
                <label className={labelCls}>Tags</label>
                <input
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="users, auth, public"
                  className={inputCls}
                />
                <p className="text-[10px] text-[var(--text-faint)] mt-1">Comma-separated</p>
              </div>
            </>
          )}

          {/* ════ REQUEST TAB ════ */}
          {tab === 'request' && (
            <>
              {/* Parameters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className={labelCls + ' mb-0'}>Parameters</p>
                  <button type="button" onClick={addParam} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/10 transition-colors hover:cursor-pointer">
                    <Plus className="h-3 w-3" /> Add Parameter
                  </button>
                </div>
                {params.length === 0 && (
                  <p className="text-[10px] text-[var(--text-faint)] italic">No parameters added yet</p>
                )}
                <div className="space-y-2">
                  {params.map((p, i) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <input value={p.name} onChange={e => updateParam(i, { name: e.target.value })} placeholder="Parameter name" className={`${inputCls} font-mono`} />
                        </div>
                        <select value={p.in} onChange={e => updateParam(i, { in: e.target.value as EndpointParam['in'] })} className={`${inputCls} w-28 hover:cursor-pointer`}>
                          {['query', 'path', 'header', 'cookie'].map(loc => <option key={loc}>{loc}</option>)}
                        </select>
                        <select value={p.type} onChange={e => updateParam(i, { type: e.target.value })} className={`${inputCls} w-28 hover:cursor-pointer`}>
                          {PARAM_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <button type="button" onClick={() => removeParam(i)} className="mt-1.5 text-[var(--text-faint)] hover:text-red-400 transition-colors hover:cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:cursor-pointer select-none">
                          <input type="checkbox" checked={p.required} onChange={e => updateParam(i, { required: e.target.checked })} className="accent-blue-500" />
                          Required
                        </label>
                        <input value={p.description} onChange={e => updateParam(i, { description: e.target.value })} placeholder="Description" className={`${inputCls} flex-1 text-[10px]`} />
                        <input value={p.example} onChange={e => updateParam(i, { example: e.target.value })} placeholder="Example" className={`${inputCls} w-32 text-[10px] font-mono`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Separator */}
              <div className="border-t border-[var(--border)]" />

              {/* Request Body */}
              <div>
                <p className={labelCls}>Request Body</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className={labelCls}>Content Type</label>
                      <select value={bodyContentType} onChange={e => setBodyContentType(e.target.value)} className={`${inputCls} hover:cursor-pointer`}>
                        {CONTENT_TYPES.map(ct => <option key={ct}>{ct}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mt-5 hover:cursor-pointer select-none">
                      <input type="checkbox" checked={bodyRequired} onChange={e => setBodyRequired(e.target.checked)} className="accent-blue-500" />
                      Required
                    </label>
                  </div>
                  <div>
                    <label className={labelCls}>Schema (JSON)</label>
                    <textarea
                      value={bodySchema}
                      onChange={e => setBodySchema(e.target.value)}
                      placeholder={'{\n  "type": "object",\n  "properties": {\n    "email": { "type": "string", "format": "email" },\n    "password": { "type": "string" }\n  },\n  "required": ["email", "password"]\n}'}
                      rows={5}
                      className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Example</label>
                    <textarea
                      value={bodyExample}
                      onChange={e => setBodyExample(e.target.value)}
                      placeholder={'{\n  "email": "test@example.com",\n  "password": "password123"\n}'}
                      rows={3}
                      className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ════ RESPONSES TAB ════ */}
          {tab === 'responses' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className={labelCls + ' mb-0'}>Responses</p>
                <button type="button" onClick={addResponse} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/10 transition-colors hover:cursor-pointer">
                  <Plus className="h-3 w-3" /> Add Response
                </button>
              </div>
              {responses.length === 0 && (
                <p className="text-[10px] text-[var(--text-faint)] italic">No responses defined yet. Click "Add Response" above.</p>
              )}
              <div className="space-y-3">
                {responses.map((r, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="w-24">
                        <label className={labelCls}>Status</label>
                        <input value={r.status} onChange={e => updateResponse(i, { status: e.target.value })} placeholder="200" className={`${inputCls} font-mono`} />
                      </div>
                      <div className="flex-1">
                        <label className={labelCls}>Description</label>
                        <input value={r.description} onChange={e => updateResponse(i, { description: e.target.value })} placeholder="Success" className={inputCls} />
                      </div>
                      <div className="w-48">
                        <label className={labelCls}>Content Type</label>
                        <select value={r.contentType} onChange={e => updateResponse(i, { contentType: e.target.value })} className={`${inputCls} hover:cursor-pointer`}>
                          {CONTENT_TYPES.map(ct => <option key={ct}>{ct}</option>)}
                        </select>
                      </div>
                      <button type="button" onClick={() => removeResponse(i)} className="mt-5 text-[var(--text-faint)] hover:text-red-400 transition-colors hover:cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      <label className={labelCls}>Body Schema (JSON)</label>
                      <textarea
                        value={r.schema}
                        onChange={e => updateResponse(i, { schema: e.target.value })}
                        placeholder={'{\n  "type": "object",\n  "properties": { ... }\n}'}
                        rows={3}
                        className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Example</label>
                      <textarea
                        value={r.example}
                        onChange={e => updateResponse(i, { example: e.target.value })}
                        placeholder={'{\n  "id": "abc123",\n  "email": "test@example.com"\n}'}
                        rows={2}
                        className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <p className="text-[10px] text-[var(--text-faint)]">
            Only <span className="text-[var(--text-muted)]">Method</span> and <span className="text-[var(--text-muted)]">Path</span> are required
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors hover:cursor-pointer"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {saving ? 'Adding…' : 'Add Endpoint'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Endpoint Dialog ─────────────────────────────────────────────────────

/**
 * Wraps AddEndpointDialog in "edit" mode: pre-populates all fields from an
 * existing endpoint and PUTs the full updated object on save.
 */
function EditEndpointDialog({ endpoint, onClose, onSaved }: {
  endpoint: Endpoint;
  onClose: () => void;
  onSaved: (updated: Endpoint) => void;
}) {
  const [tab, setTab] = useState<'basic' | 'request' | 'responses'>('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Basic ──
  const [method, setMethod] = useState(endpoint.method);
  const [epPath, setEpPath] = useState(endpoint.path);
  const [name, setName] = useState(endpoint.name ?? '');
  const [description, setDescription] = useState(endpoint.description ?? '');
  const [tags, setTags] = useState((endpoint.tags ?? []).join(', '));
  const [deprecated, setDeprecated] = useState(endpoint.deprecated ?? false);

  // ── Request ──
  const [params, setParams] = useState<EndpointParam[]>(() =>
    (endpoint.parameters ?? [])
      .filter(p => p.in !== 'body')
      .map(p => ({
        name: p.name,
        in: (p.in ?? 'query') as EndpointParam['in'],
        type: p.type,
        required: p.required ?? false,
        description: p.description ?? '',
        example: p.example ? String(p.example) : '',
      }))
  );
  const [bodyContentType, setBodyContentType] = useState(
    endpoint.requestBody?.contentType ?? 'application/json'
  );
  const [bodyRequired, setBodyRequired] = useState(endpoint.requestBody?.required ?? false);
  const [bodySchema, setBodySchema] = useState(() => {
    const fields = endpoint.requestBody?.fields;
    if (!fields || Object.keys(fields).length === 0) return '';
    // Convert fields map to a simple JSON schema representation
    const props: Record<string, any> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      props[k] = { type: v.type, ...(v.format ? { format: v.format } : {}), ...(v.description ? { description: v.description } : {}) };
      if (v.required) required.push(k);
    }
    return JSON.stringify({ type: 'object', properties: props, ...(required.length > 0 ? { required } : {}) }, null, 2);
  });
  const [bodyExample, setBodyExample] = useState('');

  // ── Responses ──
  const [responses, setResponses] = useState<EndpointResponse[]>(() =>
    Object.entries(endpoint.responses ?? {}).map(([status, def]) => ({
      status,
      description: def.description ?? '',
      contentType: def.contentType ?? 'application/json',
      schema: def.schema ? JSON.stringify(def.schema, null, 2) : '',
      example: '',
    }))
  );

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const addParam = () => setParams(p => [...p, { name: '', in: 'query', type: 'string', required: false, description: '', example: '' }]);
  const updateParam = (i: number, patch: Partial<EndpointParam>) => setParams(p => p.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeParam = (i: number) => setParams(p => p.filter((_, idx) => idx !== i));
  const addResponse = () => setResponses(r => [...r, { status: '200', description: '', contentType: 'application/json', schema: '', example: '' }]);
  const updateResponse = (i: number, patch: Partial<EndpointResponse>) => setResponses(r => r.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeResponse = (i: number) => setResponses(r => r.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!epPath.trim()) { setTab('basic'); return; }
    setSaving(true);
    setError('');
    try {
      const updated: Record<string, unknown> = {
        id: endpoint.id,
        method: method.toUpperCase(),
        path: epPath.startsWith('/') ? epPath : '/' + epPath,
      };
      if (name.trim()) updated.name = name.trim();
      if (description.trim()) updated.description = description.trim();
      if (tags.trim()) updated.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (deprecated) updated.deprecated = true;
      if (endpoint.handlerName) updated.handlerName = endpoint.handlerName;
      if (endpoint.source) updated.source = endpoint.source;
      if (endpoint.middleware) updated.middleware = endpoint.middleware;
      if (endpoint.security) updated.security = endpoint.security;

      const validParams = params.filter(p => p.name.trim());
      if (validParams.length > 0) {
        updated.parameters = validParams.map(p => ({ name: p.name, in: p.in, schema: { type: p.type }, required: p.required, ...(p.description ? { description: p.description } : {}), ...(p.example ? { example: p.example } : {}) }));
      }

      if (bodySchema.trim()) {
        const mediaObj: Record<string, unknown> = {};
        try { mediaObj.schema = JSON.parse(bodySchema); } catch { mediaObj.schema = bodySchema; }
        if (bodyExample.trim()) { try { mediaObj.example = JSON.parse(bodyExample); } catch { mediaObj.example = bodyExample; } }
        updated.requestBody = { required: bodyRequired, content: { [bodyContentType]: mediaObj } };
      }

      const validResponses = responses.filter(r => r.status.trim());
      if (validResponses.length > 0) {
        const resObj: Record<string, unknown> = {};
        for (const r of validResponses) {
          const entry: Record<string, unknown> = {};
          if (r.description.trim()) entry.description = r.description;
          if (r.schema.trim()) { try { entry.schema = JSON.parse(r.schema); } catch { entry.schema = r.schema; } }
          resObj[r.status] = entry;
        }
        updated.responses = resObj;
      }

      const res = await fetch(`/api/model/endpoint/${endpoint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? `Save failed (${res.status})`); }
      onSaved({ ...endpoint, ...updated } as Endpoint);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'basic', label: 'Basic' },
    { key: 'request', label: 'Request' },
    { key: 'responses', label: 'Responses' },
  ];

  const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-3 py-2 text-xs text-[var(--text-secondary)] placeholder-[var(--text-faint)] outline-none focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)] transition-all';
  const labelCls = 'block text-[10px] text-[var(--text-faint)] mb-1.5 uppercase tracking-wider font-medium';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-[var(--border-md)] shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
              <Edit3 className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-[var(--text-primary)]">Edit Endpoint</h2>
              <p className="text-[10px] text-[var(--text-faint)] font-mono">{endpoint.method} {endpoint.path}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-200 hover:cursor-pointer ${
                tab === t.key
                  ? 'bg-amber-500/15 text-amber-400 shadow-sm'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-overlay)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {tab === 'basic' && (
            <>
              <div className="grid grid-cols-[140px_1fr] gap-4">
                <div>
                  <label className={labelCls}>Method *</label>
                  <select value={method} onChange={e => setMethod(e.target.value)} className={`${inputCls} hover:cursor-pointer`}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Path *</label>
                  <input value={epPath} onChange={e => setEpPath(e.target.value)} placeholder="/api/users" className={`${inputCls} font-mono`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Create User" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className={labelCls}>Tags</label>
                <input value={tags} onChange={e => setTags(e.target.value)} placeholder="users, auth, public" className={inputCls} />
                <p className="text-[10px] text-[var(--text-faint)] mt-1">Comma-separated</p>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] hover:cursor-pointer select-none">
                <input type="checkbox" checked={deprecated} onChange={e => setDeprecated(e.target.checked)} className="accent-amber-500" />
                Mark as deprecated
              </label>
            </>
          )}

          {tab === 'request' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className={labelCls + ' mb-0'}>Parameters</p>
                  <button type="button" onClick={addParam} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-500/10 transition-colors hover:cursor-pointer">
                    <Plus className="h-3 w-3" /> Add Parameter
                  </button>
                </div>
                {params.length === 0 && <p className="text-[10px] text-[var(--text-faint)] italic">No parameters</p>}
                <div className="space-y-2">
                  {params.map((p, i) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <input value={p.name} onChange={e => updateParam(i, { name: e.target.value })} placeholder="name" className={`${inputCls} font-mono`} />
                        </div>
                        <select value={p.in} onChange={e => updateParam(i, { in: e.target.value as EndpointParam['in'] })} className={`${inputCls} w-28 hover:cursor-pointer`}>
                          {['query', 'path', 'header', 'cookie'].map(loc => <option key={loc}>{loc}</option>)}
                        </select>
                        <select value={p.type} onChange={e => updateParam(i, { type: e.target.value })} className={`${inputCls} w-28 hover:cursor-pointer`}>
                          {PARAM_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <button type="button" onClick={() => removeParam(i)} className="mt-1.5 text-[var(--text-faint)] hover:text-red-400 transition-colors hover:cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:cursor-pointer select-none">
                          <input type="checkbox" checked={p.required} onChange={e => updateParam(i, { required: e.target.checked })} className="accent-amber-500" /> Required
                        </label>
                        <input value={p.description} onChange={e => updateParam(i, { description: e.target.value })} placeholder="Description" className={`${inputCls} flex-1 text-[10px]`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-[var(--border)]" />
              <div>
                <p className={labelCls}>Request Body</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className={labelCls}>Content Type</label>
                      <select value={bodyContentType} onChange={e => setBodyContentType(e.target.value)} className={`${inputCls} hover:cursor-pointer`}>
                        {CONTENT_TYPES.map(ct => <option key={ct}>{ct}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mt-5 hover:cursor-pointer select-none">
                      <input type="checkbox" checked={bodyRequired} onChange={e => setBodyRequired(e.target.checked)} className="accent-amber-500" /> Required
                    </label>
                  </div>
                  <div>
                    <label className={labelCls}>Schema (JSON)</label>
                    <textarea value={bodySchema} onChange={e => setBodySchema(e.target.value)} rows={5} className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`} />
                  </div>
                  <div>
                    <label className={labelCls}>Example</label>
                    <textarea value={bodyExample} onChange={e => setBodyExample(e.target.value)} rows={3} className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`} />
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'responses' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className={labelCls + ' mb-0'}>Responses</p>
                <button type="button" onClick={addResponse} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-500/10 transition-colors hover:cursor-pointer">
                  <Plus className="h-3 w-3" /> Add Response
                </button>
              </div>
              {responses.length === 0 && <p className="text-[10px] text-[var(--text-faint)] italic">No responses defined.</p>}
              <div className="space-y-3">
                {responses.map((r, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="w-24">
                        <label className={labelCls}>Status</label>
                        <input value={r.status} onChange={e => updateResponse(i, { status: e.target.value })} placeholder="200" className={`${inputCls} font-mono`} />
                      </div>
                      <div className="flex-1">
                        <label className={labelCls}>Description</label>
                        <input value={r.description} onChange={e => updateResponse(i, { description: e.target.value })} placeholder="Success" className={inputCls} />
                      </div>
                      <div className="w-48">
                        <label className={labelCls}>Content Type</label>
                        <select value={r.contentType} onChange={e => updateResponse(i, { contentType: e.target.value })} className={`${inputCls} hover:cursor-pointer`}>
                          {CONTENT_TYPES.map(ct => <option key={ct}>{ct}</option>)}
                        </select>
                      </div>
                      <button type="button" onClick={() => removeResponse(i)} className="mt-5 text-[var(--text-faint)] hover:text-red-400 transition-colors hover:cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      <label className={labelCls}>Body Schema (JSON)</label>
                      <textarea value={r.schema} onChange={e => updateResponse(i, { schema: e.target.value })} rows={3} className={`${inputCls} resize-none font-mono text-[11px] leading-relaxed`} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <p className="text-[10px] text-[var(--text-faint)]">ID: <span className="font-mono">{endpoint.id}</span></p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-400 disabled:opacity-50 transition-colors hover:cursor-pointer">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────


export function Model({ onInspect, onViewTraces }: { onInspect?: (ep: Endpoint) => void; onViewTraces?: (filter: { endpointPath?: string }) => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState('');
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [filter, setFilter] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editEndpoint, setEditEndpoint] = useState<Endpoint | null>(null);

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

  const handleEndpointCreated = (_ep: Endpoint, newModel: Model) => {
    setModel(newModel);
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
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[15px] font-medium text-[var(--text-primary)] leading-none">
              {model?.project?.name ?? 'Model'}
            </h1>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {loading ? 'Loading…'
                : model ? `v${model.version} · ${model.endpoints.length} endpoints · ${model.project.framework ?? model.project.language ?? ''}`
                  : 'No model generated yet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle — segmented control, matches Sidebar's Dark/Light switch */}
          {model && (
            <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-overlay)] p-1">
              {(['list', 'graph'] as const).map(v => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-200 hover:cursor-pointer ${view === v
                      ? 'bg-blue-500/15 text-blue-400 shadow-sm'
                      : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'
                    }`}
                >
                  {v === 'list' ? <List className="h-3.5 w-3.5" strokeWidth={2} /> : <GitBranch className="h-3.5 w-3.5" strokeWidth={2} />}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] disabled:opacity-40 transition-all hover:cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors hover:cursor-pointer"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : <ScanLine className="h-3.5 w-3.5" strokeWidth={2} />}
            {scanning ? 'Scanning…' : 'Re-scan'}
          </button>

          <button
            type="button"
            onClick={() => setAddDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-400 transition-colors hover:cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add Endpoint
          </button>
        </div>
      </div>

      {/* Scan error banner */}
      {scanError && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/[0.06] px-6 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {scanError}
          <button type="button" onClick={() => setScanError('')} className="ml-auto hover:cursor-pointer"><X className="h-3.5 w-3.5" strokeWidth={2} /></button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col">

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2 p-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)]" style={{ opacity: 1 - i * 0.18 }} />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 m-6 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-10 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" strokeWidth={2} />
            <p className="text-sm text-red-300">{error}</p>
            <button type="button" onClick={() => load()} className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors hover:cursor-pointer">Retry</button>
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
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-3">
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by path, method or handler…"
                className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] py-1.5 px-3 text-xs text-[var(--text-secondary)] placeholder-[var(--text-faint)] outline-none focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)] transition-all"
              />
              {filter && <button type="button" onClick={() => setFilter('')} className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] hover:cursor-pointer"><X className="h-3.5 w-3.5" strokeWidth={2} /></button>}
              <span className="ml-auto text-[10px] text-[var(--text-faint)]">{filtered.length} endpoint{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Grouped rows */}
            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-170px)] divide-y divide-[var(--border)]">
              {Array.from(grouped.entries()).map(([prefix, eps]) => (
                <GroupSection key={prefix} prefix={prefix} endpoints={eps} onUpdate={handleUpdate} onInspect={ep => onInspect?.(ep)} onViewTraces={onViewTraces ? (path) => onViewTraces({ endpointPath: path }) : undefined} onEdit={ep => setEditEndpoint(ep)} />
              ))}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No endpoints match "{filter}"</p>
                  <button type="button" onClick={() => setFilter('')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors hover:cursor-pointer">Clear filter</button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-1.5 border-t border-[var(--border)] px-6 py-2.5 text-[10px] text-[var(--text-faint)]">
              Generated {new Date(model.generatedAt).toLocaleString()}
              <span className="ml-auto">
                <button type="button" onClick={() => load(true)} className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer">Refresh</button>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Add Endpoint Dialog */}
      <AddEndpointDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onCreated={handleEndpointCreated}
      />

      {/* Edit Endpoint Dialog */}
      {editEndpoint && (
        <EditEndpointDialog
          endpoint={editEndpoint}
          onClose={() => setEditEndpoint(null)}
          onSaved={(updated) => {
            setModel(prev => prev ? { ...prev, endpoints: prev.endpoints.map(ep => ep.id === updated.id ? updated : ep) } : prev);
            setEditEndpoint(null);
          }}
        />
      )}
    </div>
  );
}