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
function mc(m: string) { return METHOD_COLORS[m.toUpperCase()] ?? METHOD_COLORS['GET']; }

function MethodChip({ method }: { method: string }) {
  const s = mc(method);
  return (
    <span className={`inline-flex items-center  px-2 py-0.5 text-[11px] font-medium tracking-widest ${s.bg} ${s.text} ${s.border} border`}>
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
      const r = await fetch(`/api/model/source?file=${encodeURIComponent(endpoint.source.file)}&line=${endpoint.source.line}`);
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
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  if (!endpoint.source) return null;

  const shortPath = endpoint.source.file.split(/[/\\]/).slice(-3).join('/');

  const lines = source ? source.split('\n') : [];
  const highlightOffset = endpoint.source.line - startLine;

  return (
    <div className=" border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.015]">
        <FileCode2 className="h-3.5 w-3.5 text-violet-400/60" />
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Source</span>
        <span className="ml-2 font-mono text-[10px] text-zinc-500">{shortPath}</span>
        <span className=" bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 font-mono text-[9px] text-violet-400">:{endpoint.source.line}</span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex h-5 w-5 items-center justify-center  text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="relative">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-4 text-[10px] text-zinc-600">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading source…
          </div>
        )}
        {err && (
          <div className="flex items-start gap-2 px-4 py-3 text-[10px] text-red-400/60">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
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
                    <tr key={i} className={isHighlight ? 'bg-violet-500/[0.07]' : 'hover:bg-white/[0.012]'}>
                      <td className={`select-none w-12 px-3 py-0 text-right font-mono text-[10px] border-r border-white/[0.04] leading-5 ${isHighlight ? 'text-violet-400' : 'text-zinc-700'
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
    </div>
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
      .then(data => { setFiles(data?.files ?? []); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [endpoint.id]);

  return (
    <div className=" border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.015]">
        <FileText className="h-3.5 w-3.5 text-blue-400/60" />
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Related Files</span>
        {!loading && !err && (
          <span className="ml-auto -full bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-600">{files.length}</span>
        )}
      </div>
      <div className="divide-y divide-white/[0.03]">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-3 text-[10px] text-zinc-600">
            <Loader2 className="h-3 w-3 animate-spin" /> Resolving files…
          </div>
        )}
        {!loading && err && (
          <div className="flex items-start gap-2 px-4 py-3 text-[10px] text-red-400/60">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>Could not resolve — {err}</span>
          </div>
        )}
        {!loading && !err && files.length === 0 && (
          <p className="px-4 py-3 text-[10px] text-zinc-700 italic">No related files resolved</p>
        )}
        {files.map(f => {
          const parts = f.split(/[/\\]/);
          const name = parts.pop() ?? f;
          const dir = parts.slice(-2).join('/');
          const ext = name.split('.').pop() ?? '';
          const extColors: Record<string, string> = {
            ts: 'text-blue-400', tsx: 'text-cyan-400', js: 'text-amber-400',
            jsx: 'text-amber-300', json: 'text-emerald-400',
          };
          const extColor = extColors[ext] ?? 'text-zinc-600';
          return (
            <div key={f} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.015] transition-colors group">
              <Code2 className={`h-3.5 w-3.5 shrink-0 ${extColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-zinc-300 truncate">{name}</p>
                {dir && <p className="text-[9px] text-zinc-600 truncate font-mono">{dir}</p>}
              </div>
              <span className={`shrink-0  px-1.5 py-0.5 text-[9px] font-mono ${extColor} bg-white/[0.03]`}>.{ext}</span>
            </div>
          );
        })}
      </div>
    </div>
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

  // Click-outside to close dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Build fake body
  const buildFakeBody = () => {
    const body: Record<string, any> = {};
    for (const [name, def] of Object.entries(fields)) {
      body[name] = fakeValue(name, def.type, def.format);
    }
    return body;
  };

  // Build real body from form
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
      try { respBody = await res.json(); } catch { respBody = await res.text().catch(() => '(no body)'); }
      setResult({ status: res.status, body: respBody, durationMs });
    } catch (e: any) {
      setResult({ status: 0, body: null, durationMs: Date.now() - started, error: e.message });
    } finally { setRunning(false); }
  };

  const statusOk = result && result.status >= 200 && result.status < 300;

  return (
    <div className=" border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
      {/* Header / trigger */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04] bg-white/[0.015]">
        <Zap className="h-3.5 w-3.5 text-amber-400/60" />
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Simulate Endpoint</span>
        <div className="ml-auto" ref={dropRef}>
          <div className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1.5  border border-amber-500/30 bg-amber-500/[0.07] px-3 py-1.5 text-[10px] text-amber-300 hover:bg-amber-500/15 hover:border-amber-400/50 transition-colors"
            >
              <Play className="h-3 w-3" />
              Simulate
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 z-50 w-40  border border-white/[0.08] bg-[#111] shadow-xl overflow-hidden">
                {(['fake', 'real'] as SimMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setOpen(false); setResult(null); }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-[11px] hover:bg-white/[0.04] transition-colors text-left ${mode === m ? 'text-amber-300' : 'text-zinc-400'}`}
                  >
                    {m === 'fake' ? <Zap className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                    {m === 'fake' ? 'Fake Data' : 'Real Data'}
                    {mode === m && <Check className="h-3 w-3 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Config body */}
      <div className="p-4 space-y-4">

        {/* Base URL */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-20 shrink-0">Base URL</span>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="flex-1  border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none focus:border-violet-500/40 transition-colors"
            placeholder="http://localhost:3000"
          />
        </div>

        {/* Bearer token */}
        {(needsAuth || mode === 'real') && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-20 shrink-0 flex items-center gap-1">
              <Key className="h-3 w-3" /> Token
            </span>
            <input
              type="password"
              value={bearerToken}
              onChange={e => setBearerToken(e.target.value)}
              className="flex-1  border border-amber-500/20 bg-amber-500/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none focus:border-amber-400/40 transition-colors"
              placeholder="Bearer token (optional)"
            />
          </div>
        )}

        {/* Fake data preview */}
        {mode === 'fake' && Object.keys(fields).length > 0 && (
          <div>
            <p className="mb-2 text-[10px] text-zinc-600 uppercase tracking-wider flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-400/60" /> Auto-generated body
            </p>
            <div className="space-y-1">
              {Object.entries(fields).map(([name, def]) => (
                <div key={name} className="flex items-center gap-2  bg-white/[0.02] border border-white/[0.04] px-3 py-1.5">
                  <span className="text-[10px] text-zinc-400 w-24 truncate shrink-0">{name}</span>
                  <span className="text-[10px] text-zinc-700 shrink-0">{def.type}</span>
                  <span className="ml-auto font-mono text-[10px] text-amber-300/70 truncate">{fakeValue(name, def.type, def.format)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real data form */}
        {mode === 'real' && Object.keys(fields).length > 0 && (
          <div>
            <p className="mb-2 text-[10px] text-zinc-600 uppercase tracking-wider flex items-center gap-1">
              <Send className="h-3 w-3 text-blue-400/60" /> Request body
            </p>
            <div className="space-y-2">
              {Object.entries(fields).map(([name, def]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <span className="text-[10px] text-zinc-400">{name}</span>
                    {def.required && <span className="ml-1 text-[9px] text-rose-400/70">*</span>}
                  </div>
                  <input
                    value={formValues[name] ?? ''}
                    onChange={e => setFormValues(p => ({ ...p, [name]: e.target.value }))}
                    placeholder={`${def.type}${def.format ? ` (${def.format})` : ''}`}
                    className="flex-1  border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none focus:border-blue-500/40 placeholder-zinc-700 transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No body for GET/HEAD */}
        {mode === 'real' && Object.keys(fields).length === 0 && !isPost && (
          <p className="text-[10px] text-zinc-700 italic">No body required for {endpoint.method.toUpperCase()} requests.</p>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="flex w-full items-center justify-center gap-2  border border-amber-500/30 bg-amber-500/[0.07] py-2 text-[11px] font-medium text-amber-300 hover:bg-amber-500/15 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? 'Sending…' : `Run ${mode === 'fake' ? 'with Fake Data' : 'with Real Data'}`}
        </button>

        {/* Result */}
        {result && (
          <div className={` border overflow-hidden ${statusOk ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-red-500/20 bg-red-500/[0.04]'}`}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
              {statusOk
                ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                : <AlertCircle className="h-3.5 w-3.5 text-red-400" />
              }
              <span className={`text-[11px] font-medium ${statusOk ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.status > 0 ? result.status : 'Error'}
              </span>
              <span className="text-[10px] text-zinc-600">{result.durationMs}ms</span>
              <button onClick={() => setResult(null)} className="ml-auto text-zinc-700 hover:text-zinc-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {result.error && (
              <p className="px-3 py-2 text-[11px] text-red-400">{result.error}</p>
            )}
            {!result.error && result.body != null && (
              <pre className="overflow-auto max-h-56 p-3 text-[10px] text-zinc-400 whitespace-pre-wrap break-all leading-5">
                {typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={` border  border-white/[0.06] bg-black/30 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.015]">
      {icon}
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      {count !== undefined && (
        <span className="ml-auto -full bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-600">{count}</span>
      )}
    </div>
  );
}

// ─── Main Inspect page ────────────────────────────────────────────────────────

interface InspectProps {
  endpoint: Endpoint | null;
  onBack: () => void;
}

export const Inspect = ({ endpoint, onBack }: InspectProps) => {
  if (!endpoint) {
    return (
      <div className="flex min-h-full w-full flex-col items-center justify-center gap-5 text-center p-12">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 -full bg-violet-500/10 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center -full border border-white/[0.06] bg-white/[0.02] text-violet-400">
            <FileCode2 className="h-7 w-7" />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-300">No endpoint selected</p>
          <p className="mt-1 text-[11px] text-zinc-600">
            Click <span className="text-violet-300">INSPECT</span> on any endpoint in the Model view.
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5  border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Model
        </button>
      </div>
    );
  }

  // const s = mc(endpoint.method);
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
      <div className="flex items-center gap-4 border-b border-white/[0.06] px-6 py-5">
        <button
          onClick={onBack}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded  border border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-all"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>

        {/* Method accent bar */}
        <div className="relative flex items-center gap-3 flex-1 min-w-0">

          <MethodChip method={endpoint.method} />
          <div className="min-w-0">
            <h1 className=" text-sm text-zinc-100 leading-none truncate">{endpoint.path}</h1>
            {endpoint.handlerName && (
              <p className="mt-0.5 text-[10px] text-zinc-600 truncate">{endpoint.handlerName}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasSecurity && (
            <span className="flex items-center gap-1  border border-amber-500/20 bg-amber-500/[0.06] px-2 py-1 text-[10px] text-amber-400/80">
              <Shield className="h-3 w-3" />
              {endpoint.security![0].scheme}
            </span>
          )}
          {shortSource && (
            <span className="hidden sm:block font-mono text-[10px] text-zinc-700 truncate max-w-[200px]">
              📄 {shortSource}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* ── Details grid ── */}
        <SectionCard>
          <SectionHeader icon={<FileText className="h-3.5 w-3.5 text-zinc-500" />} label="Details" />
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Method</p>
              <MethodChip method={endpoint.method} />
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Path</p>
              <code className="font-mono text-[11px] text-zinc-300">{endpoint.path}</code>
            </div>
            {endpoint.handlerName && (
              <div>
                <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Handler</p>
                <code className="font-mono text-[11px] text-zinc-400">{endpoint.handlerName}</code>
              </div>
            )}
            {endpoint.source && (
              <div>
                <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Source</p>
                <code className="font-mono text-[10px] text-zinc-500">{shortSource}</code>
              </div>
            )}
            {endpoint.requestBody?.contentType && (
              <div>
                <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Content-Type</p>
                <code className="font-mono text-[10px] text-zinc-500">{endpoint.requestBody.contentType}</code>
              </div>
            )}
            {hasMiddleware && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider">Middleware</p>
                <div className="flex flex-wrap gap-1">
                  {endpoint.middleware!.map((m, i) => (
                    <span key={i} className="-full bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-500">{m.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Request Body ── */}
        {hasBody && (
          <SectionCard>
            <SectionHeader icon={<Send className="h-3.5 w-3.5 text-blue-400/60" />} label="Request Body" count={Object.keys(fields).length} />
            <div className="p-4 space-y-1.5">
              <div className="mb-2 flex items-center gap-4 px-3 py-1.5 text-[9px] uppercase tracking-wider text-zinc-700">
                <span className="w-28">Field</span>
                <span className="w-16">Type</span>
                <span>Format</span>
                <span className="ml-auto">Required</span>
              </div>
              {Object.entries(fields).map(([name, def]) => (
                <div key={name} className="flex items-center gap-4  bg-white/[0.02] border border-white/[0.04] px-3 py-2 hover:bg-white/[0.03] transition-colors">
                  <span className="w-28 shrink-0 font-mono text-[11px] text-zinc-300 truncate">{name}</span>
                  <span className="w-16 shrink-0 text-[10px] text-blue-400/80">{def.type}</span>
                  <span className="flex-1 text-[10px] text-zinc-600">{def.format ?? '—'}</span>
                  {def.required
                    ? <span className="ml-auto shrink-0  bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[9px] text-rose-400">required</span>
                    : <span className="ml-auto shrink-0 text-[9px] text-zinc-700">optional</span>
                  }
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Responses ── */}
        {hasResponses && (
          <SectionCard>
            <SectionHeader icon={<Check className="h-3.5 w-3.5 text-emerald-400/60" />} label="Responses" count={Object.keys(responses).length} />
            <div className="p-4 space-y-1.5">
              {Object.entries(responses).map(([status, def]) => {
                const ok = status.startsWith('2');
                return (
                  <div key={status} className={`flex items-start gap-3  border px-3 py-2 ${ok ? 'border-emerald-500/10 bg-emerald-500/[0.03]' : 'border-red-500/10 bg-red-500/[0.03]'}`}>
                    <span className={`shrink-0 w-10 font-mono text-[11px] font-medium ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{status}</span>
                    {def.schema && (
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(def.schema).map(k => (
                          <span key={k} className=" bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">{k}</span>
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