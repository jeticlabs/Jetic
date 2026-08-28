import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Code2,
  FileCode2,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Shield,
  Zap,
  X,
  Key,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  type: string;
  required?: boolean;
  format?: string;
}

export interface Endpoint {
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

// ─── Method colours ───────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: '#34d399', border: 'border-emerald-500/30' },
  POST: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: '#60a5fa', border: 'border-blue-500/30' },
  PUT: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: '#fbbf24', border: 'border-amber-500/30' },
  PATCH: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: '#fb923c', border: 'border-orange-500/30' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: '#f87171', border: 'border-red-500/30' },
  HEAD: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: '#a1a1aa', border: 'border-zinc-500/30' },
  OPTIONS: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: '#c084fc', border: 'border-purple-500/30' },
};
function mc(m: string) {
  return METHOD_COLORS[m.toUpperCase()] ?? METHOD_COLORS['GET'];
}

function MethodChip({ method }: { method: string }) {
  const s = mc(method);
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium tracking-widest border ${s.bg} ${s.text} ${s.border}`}>
      {method.toUpperCase()}
    </span>
  );
}

// ─── Minimal inline faker ─────────────────────────────────────────────────────

function fakeValue(fieldName: string, type: string, format?: string): string {
  const n = fieldName.toLowerCase();
  if (n.includes('email')) return 'user@example.com';
  if (n.includes('name')) return 'Jane Doe';
  if (n.includes('username')) return 'jane_doe';
  if (n.includes('password')) return 'P@ssw0rd123!';
  if (n.includes('phone')) return '+14155552671';
  if (n.includes('url')) return 'https://example.com';
  if (n.includes('id')) return Math.random().toString(36).slice(2, 10);
  if (n.includes('date') || format === 'date') return new Date().toISOString().split('T')[0];
  if (n.includes('time') || format === 'date-time') return new Date().toISOString();
  if (type === 'integer' || type === 'number') return String(Math.floor(Math.random() * 100) + 1);
  if (type === 'boolean') return 'true';
  if (type === 'array') return '[]';
  if (type === 'object') return '{}';
  return `fake_${n}`;
}

// ─── Section card + header primitives ────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5 bg-white/[0.01]">
      <Icon className="h-[15px] w-[15px] text-blue-400/70" strokeWidth={2} />
      <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{label}</span>
      {count !== undefined && (
        <span className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Source viewer ────────────────────────────────────────────────────────────

function SourcePanel({ endpoint }: { endpoint: Endpoint }) {
  const [source, setSource] = useState<string | null>(null);
  const [startLine, setStartLine] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!endpoint.source) return;
    setLoading(true); setErr(''); setSource(null);
    try {
      const r = await fetch(
        `/api/model/source?file=${encodeURIComponent(endpoint.source.file)}&line=${endpoint.source.line}`
      );
      if (!r.ok) {
        const ct = r.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const e = await r.json().catch(() => ({}));
          throw new Error((e as any).error ?? `HTTP ${r.status}`);
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const ct = r.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const data = await r.json();
        setSource(data.source ?? data.content ?? '');
        setStartLine(data.startLine ?? 1);
      } else {
        setSource(await r.text());
        setStartLine(1);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  if (!endpoint.source) return null;

  const shortPath = endpoint.source.file.split(/[/\\]/).slice(-3).join('/');
  const lines = source ? source.split('\n') : [];
  const highlightOffset = endpoint.source.line - startLine;

  return (
    <SectionCard>
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5 bg-white/[0.01]">
        <FileCode2 className="h-[15px] w-[15px] text-blue-400/70" strokeWidth={2} />
        <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">Source</span>
        <span className="ml-2 font-mono text-[11px] text-zinc-500 truncate">{shortPath}</span>
        <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          :{endpoint.source.line}
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {/* Body */}
      <div className="relative bg-[#0a0a0a]">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-4 text-[11px] text-zinc-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Loading source…
          </div>
        )}
        {err && (
          <div className="flex items-start gap-2 px-4 py-3 text-[11px] text-red-400/60">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={2} />
            <span>Source unavailable — {err}</span>
          </div>
        )}
        {source && !loading && (
          <div className="overflow-auto max-h-[340px]">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, i) => {
                  const lineNum = startLine + i;
                  const isHighlight = i === highlightOffset;
                  return (
                    <tr key={i} className={isHighlight ? 'bg-blue-500/[0.07]' : 'hover:bg-white/[0.012]'}>
                      <td className={`select-none w-12 px-3 py-0 text-right font-mono text-[10px] border-r border-white/[0.06] leading-5 ${isHighlight ? 'text-blue-400' : 'text-zinc-700'
                        }`}>
                        {lineNum}
                      </td>
                      <td className={`px-4 py-0 font-mono text-[11px] whitespace-pre leading-5 ${isHighlight ? 'text-zinc-100' : 'text-zinc-400'
                        }`}>
                        {line || ' '}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Related Files panel ──────────────────────────────────────────────────────

function RelatedFilesPanel({ endpoint }: { endpoint: Endpoint }) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setErr(''); setFiles([]);
    fetch(`/api/model/related?id=${encodeURIComponent(endpoint.id)}`)
      .then(r => {
        const ct = r.headers.get('content-type') ?? '';
        if (!r.ok || !ct.includes('application/json')) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setFiles(data?.files ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [endpoint.id]);

  const extColors: Record<string, string> = {
    ts: 'text-blue-400', tsx: 'text-cyan-400', js: 'text-amber-400',
    jsx: 'text-amber-300', json: 'text-emerald-400',
  };

  return (
    <SectionCard>
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5 bg-white/[0.01]">
        <FileText className="h-[15px] w-[15px] text-blue-400/70" strokeWidth={2} />
        <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">Related Files</span>
        {!loading && !err && (
          <span className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">
            {files.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="divide-y divide-white/[0.06]">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-zinc-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Resolving files…
          </div>
        )}
        {!loading && err && (
          <div className="flex items-start gap-2 px-4 py-3 text-[11px] text-red-400/60">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={2} />
            <span>Could not resolve — {err}</span>
          </div>
        )}
        {!loading && !err && files.length === 0 && (
          <p className="px-4 py-4 text-[12px] text-zinc-600 italic">No related files resolved</p>
        )}
        {files.map(f => {
          const parts = f.split(/[/\\]/);
          const name = parts.pop() ?? f;
          const dir = parts.slice(-2).join('/');
          const ext = name.split('.').pop() ?? '';
          const extColor = extColors[ext] ?? 'text-zinc-600';
          return (
            <div
              key={f}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
            >
              <Code2 className={`h-[15px] w-[15px] shrink-0 ${extColor}`} strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-zinc-200 truncate">{name}</p>
                {dir && <p className="text-[10px] text-zinc-600 truncate font-mono">{dir}</p>}
              </div>
              <span className={`shrink-0 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-mono ${extColor}`}>
                .{ext}
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Simulate Endpoint ────────────────────────────────────────────────────────

type SimMode = 'fake' | 'real';

interface SimResponse {
  status: number;
  body: any;
  durationMs: number;
  error?: string;
}

function SimulatePanel({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SimMode>('fake');
  const [bearerToken, setBearerToken] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimResponse | null>(null);
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const dropRef = useRef<HTMLDivElement>(null);

  const fields = endpoint.requestBody?.fields ?? {};
  const needsAuth = (endpoint.security?.length ?? 0) > 0;
  const isPost = ['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase());

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const buildFakeBody = () => {
    const body: Record<string, any> = {};
    for (const [name, def] of Object.entries(fields)) {
      body[name] = fakeValue(name, def.type, def.format);
    }
    return body;
  };

  const buildRealBody = () => {
    const body: Record<string, any> = {};
    for (const [name, def] of Object.entries(fields)) {
      const raw = formValues[name] ?? '';
      if (!raw) continue;
      if (def.type === 'integer' || def.type === 'number') body[name] = Number(raw);
      else if (def.type === 'boolean') body[name] = raw.toLowerCase() === 'true';
      else body[name] = raw;
    }
    return body;
  };

  const run = async () => {
    setRunning(true); setResult(null);
    const started = Date.now();
    try {
      const body = mode === 'fake' ? buildFakeBody() : buildRealBody();
      const headers: Record<string, string> = {};
      if (isPost || mode === 'fake') headers['Content-Type'] = 'application/json';
      if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
      const url = `${baseUrl}${endpoint.path}`;
      const res = await fetch(url, {
        method: endpoint.method.toUpperCase(),
        headers,
        body: isPost ? JSON.stringify(body) : undefined,
      });
      const durationMs = Date.now() - started;
      let respBody: any;
      try { respBody = await res.json(); }
      catch { respBody = await res.text().catch(() => '(no body)'); }
      setResult({ status: res.status, body: respBody, durationMs });
    } catch (e: any) {
      setResult({ status: 0, body: null, durationMs: Date.now() - started, error: e.message });
    } finally {
      setRunning(false);
    }
  };

  const statusOk = result && result.status >= 200 && result.status < 300;

  return (
    <SectionCard>
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5 bg-white/[0.01]">
        <Zap className="h-[15px] w-[15px] text-blue-400/70" strokeWidth={2} />
        <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">Simulate Endpoint</span>

        {/* Mode dropdown */}
        <div className="ml-auto" ref={dropRef}>
          <div className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/[0.07] hover:text-white transition-colors"
            >
              <Play className="h-[15px] w-[15px]" strokeWidth={2} />
              Simulate
              <ChevronDown className={`h-[15px] w-[15px] transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-white/10 bg-zinc-900 shadow-xl overflow-hidden">
                {(['fake', 'real'] as SimMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setOpen(false); setResult(null); }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-[12px] hover:bg-white/[0.05] transition-colors text-left ${mode === m ? 'text-blue-400' : 'text-zinc-400'
                      }`}
                  >
                    {m === 'fake'
                      ? <Zap className="h-[15px] w-[15px]" strokeWidth={2} />
                      : <Send className="h-[15px] w-[15px]" strokeWidth={2} />}
                    {m === 'fake' ? 'Fake Data' : 'Real Data'}
                    {mode === m && <Check className="h-[15px] w-[15px] ml-auto" strokeWidth={2} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">

        {/* Base URL */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 w-20 shrink-0">Base URL</span>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[12px] text-zinc-200 outline-none focus:border-blue-500/50 focus:bg-white/[0.05] placeholder-zinc-600 transition-colors"
            placeholder="http://localhost:3000"
          />
        </div>

        {/* Bearer token */}
        {(needsAuth || mode === 'real') && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 w-20 shrink-0 flex items-center gap-1">
              <Key className="h-3 w-3" strokeWidth={2} /> Token
            </span>
            <input
              type="password"
              value={bearerToken}
              onChange={e => setBearerToken(e.target.value)}
              className="flex-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] px-3 py-1.5 font-mono text-[12px] text-zinc-200 outline-none focus:border-amber-400/40 focus:bg-amber-500/[0.05] placeholder-zinc-600 transition-colors"
              placeholder="Bearer token (optional)"
            />
          </div>
        )}

        {/* Fake data preview */}
        {mode === 'fake' && Object.keys(fields).length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-blue-400/60" strokeWidth={2} /> Auto-generated body
            </p>
            <div className="space-y-1">
              {Object.entries(fields).map(([name, def]) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <span className="text-[11px] text-zinc-300 w-24 truncate shrink-0">{name}</span>
                  <span className="text-[11px] text-zinc-600 shrink-0">{def.type}</span>
                  <span className="ml-auto font-mono text-[11px] text-blue-300/70 truncate">
                    {fakeValue(name, def.type, def.format)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real data form */}
        {mode === 'real' && Object.keys(fields).length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
              <Send className="h-3 w-3 text-blue-400/60" strokeWidth={2} /> Request body
            </p>
            <div className="space-y-2">
              {Object.entries(fields).map(([name, def]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <span className="text-[12px] text-zinc-300">{name}</span>
                    {def.required && <span className="ml-1 text-[10px] text-rose-400/70">*</span>}
                  </div>
                  <input
                    value={formValues[name] ?? ''}
                    onChange={e => setFormValues(p => ({ ...p, [name]: e.target.value }))}
                    placeholder={`${def.type}${def.format ? ` (${def.format})` : ''}`}
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[12px] text-zinc-200 outline-none focus:border-blue-500/50 focus:bg-white/[0.05] placeholder-zinc-600 transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No body notice */}
        {mode === 'real' && Object.keys(fields).length === 0 && !isPost && (
          <p className="text-[12px] text-zinc-600 italic">
            No body required for {endpoint.method.toUpperCase()} requests.
          </p>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[12px] font-medium text-zinc-200 hover:bg-blue-500 hover:border-blue-400 hover:text-white disabled:opacity-50 transition-colors"
        >
          {running
            ? <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2} />
            : <Play className="h-[15px] w-[15px]" strokeWidth={2} />}
          {running ? 'Sending…' : `Run ${mode === 'fake' ? 'with Fake Data' : 'with Real Data'}`}
        </button>

        {/* Result */}
        {result && (
          <div className={`rounded-lg border overflow-hidden ${statusOk
              ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
              : 'border-red-500/20 bg-red-500/[0.04]'
            }`}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
              {statusOk
                ? <Check className="h-[15px] w-[15px] text-emerald-400" strokeWidth={2} />
                : <AlertCircle className="h-[15px] w-[15px] text-red-400" strokeWidth={2} />}
              <span className={`text-[12px] font-medium ${statusOk ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.status > 0 ? result.status : 'Error'}
              </span>
              <span className="text-[11px] text-zinc-600">{result.durationMs}ms</span>
              <button
                onClick={() => setResult(null)}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
            {result.error && (
              <p className="px-3 py-2.5 text-[12px] text-red-400">{result.error}</p>
            )}
            {!result.error && result.body != null && (
              <pre className="overflow-auto max-h-56 p-3 text-[11px] text-zinc-400 whitespace-pre-wrap break-all leading-5">
                {typeof result.body === 'string'
                  ? result.body
                  : JSON.stringify(result.body, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Main Inspect page ────────────────────────────────────────────────────────

interface InspectProps {
  endpoint: Endpoint | null;
  onBack: () => void;
}

export const Inspect = ({ endpoint, onBack }: InspectProps) => {

  // ── Empty state ──
  if (!endpoint) {
    return (
      <div className="flex min-h-full w-full flex-col items-center justify-center gap-5 text-center p-12">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-blue-400">
            <FileCode2 className="h-7 w-7" strokeWidth={2} />
          </div>
        </div>
        <div>
          <p className="text-[13.5px] font-medium text-zinc-200">No endpoint selected</p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Click <span className="text-blue-300 font-medium">INSPECT</span> on any endpoint in the Model view.
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-[12px] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2} /> Back to Model
        </button>
      </div>
    );
  }

  const fields = endpoint.requestBody?.fields ?? {};
  const responses = endpoint.responses ?? {};
  const hasBody = Object.keys(fields).length > 0;
  const hasResponses = Object.keys(responses).length > 0;
  const hasSecurity = (endpoint.security?.length ?? 0) > 0;
  const hasMiddleware = (endpoint.middleware?.length ?? 0) > 0;
  const shortSource = endpoint.source
    ? endpoint.source.file.split(/[/\\]/).slice(-3).join('/') + ':' + endpoint.source.line
    : null;

  return (
    <div className="flex min-h-full w-full flex-col">

      {/* ── Header ── */}
      <div className="flex items-center gap-4 border-b border-white/10 px-6 py-5">
        <button
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2} />
        </button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <MethodChip method={endpoint.method} />
          <div className="min-w-0">
            <h1 className="text-[13.5px] font-medium text-zinc-100 leading-none truncate">{endpoint.path}</h1>
            {endpoint.handlerName && (
              <p className="mt-0.5 text-[11px] text-zinc-500 truncate">{endpoint.handlerName}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasSecurity && (
            <span className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1 text-[11px] text-amber-400/80">
              <Shield className="h-[15px] w-[15px]" strokeWidth={2} />
              {endpoint.security![0].scheme}
            </span>
          )}
          {shortSource && (
            <span className="hidden sm:block font-mono text-[11px] text-zinc-600 truncate max-w-[200px]">
              {shortSource}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* ── Details grid ── */}
        <SectionCard>
          <SectionHeader icon={FileText} label="Details" />
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Method</p>
              <MethodChip method={endpoint.method} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Path</p>
              <code className="font-mono text-[12px] text-zinc-300">{endpoint.path}</code>
            </div>
            {endpoint.handlerName && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Handler</p>
                <code className="font-mono text-[12px] text-zinc-400">{endpoint.handlerName}</code>
              </div>
            )}
            {endpoint.source && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Source</p>
                <code className="font-mono text-[11px] text-zinc-500">{shortSource}</code>
              </div>
            )}
            {endpoint.requestBody?.contentType && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Content-Type</p>
                <code className="font-mono text-[11px] text-zinc-500">{endpoint.requestBody.contentType}</code>
              </div>
            )}
            {hasMiddleware && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Middleware</p>
                <div className="flex flex-wrap gap-1.5">
                  {endpoint.middleware!.map((m, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-zinc-400"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Request Body ── */}
        {hasBody && (
          <SectionCard>
            <SectionHeader icon={Send} label="Request Body" count={Object.keys(fields).length} />
            <div className="p-4 space-y-1.5">
              {/* Column headers */}
              <div className="flex items-center gap-4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                <span className="w-28">Field</span>
                <span className="w-16">Type</span>
                <span>Format</span>
                <span className="ml-auto">Required</span>
              </div>
              {Object.entries(fields).map(([name, def]) => (
                <div
                  key={name}
                  className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04] transition-colors"
                >
                  <span className="w-28 shrink-0 font-mono text-[12px] text-zinc-200 truncate">{name}</span>
                  <span className="w-16 shrink-0 text-[11px] text-blue-400/80">{def.type}</span>
                  <span className="flex-1 text-[11px] text-zinc-600">{def.format ?? '—'}</span>
                  {def.required
                    ? <span className="ml-auto shrink-0 rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400">required</span>
                    : <span className="ml-auto shrink-0 text-[10px] text-zinc-700">optional</span>}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Responses ── */}
        {hasResponses && (
          <SectionCard>
            <SectionHeader icon={Check} label="Responses" count={Object.keys(responses).length} />
            <div className="p-4 space-y-1.5">
              {Object.entries(responses).map(([status, def]) => {
                const ok = status.startsWith('2');
                return (
                  <div
                    key={status}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${ok
                        ? 'border-emerald-500/15 bg-emerald-500/[0.04]'
                        : 'border-red-500/15 bg-red-500/[0.04]'
                      }`}
                  >
                    <span className={`shrink-0 w-10 font-mono text-[12px] font-medium ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {status}
                    </span>
                    {def.schema && (
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(def.schema).map(k => (
                          <span
                            key={k}
                            className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ── Source viewer ── */}
        <SourcePanel endpoint={endpoint} />

        {/* ── Related Files ── */}
        <RelatedFilesPanel endpoint={endpoint} />

        {/* ── Simulate ── */}
        <SimulatePanel endpoint={endpoint} />

      </div>
    </div>
  );
};