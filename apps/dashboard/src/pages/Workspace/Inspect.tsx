import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Code2,
  FileCode2,
  FileText,
  Globe,
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

// ─── Method colours (semantic — stay consistent across light/dark) ───────────

const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  POST: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  PUT: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  PATCH: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  HEAD: { bg: 'bg-[var(--bg-overlay-md)]', text: 'text-[var(--text-muted)]', border: 'border-[var(--border)]' },
  OPTIONS: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
};
function mc(m: string) {
  return METHOD_COLORS[m.toUpperCase()] ?? METHOD_COLORS['GET'];
}

function MethodChip({ method, size = 'md' }: { method: string; size?: 'md' | 'sm' }) {
  const s = mc(method);
  return (
    <span
      className={`inline-flex items-center rounded font-medium tracking-widest border ${s.bg} ${s.text} ${s.border} ${size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
        }`}
    >
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

// ─── Section card + header primitives (themed) ───────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  action,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-2.5 bg-[var(--bg-overlay-md)]">
      <Icon className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
      <span className="text-[11px] font-semibold tracking-wider text-[var(--text-faint)] uppercase">{label}</span>
      {count !== undefined && (
        <span className="rounded-full border border-[var(--border)] bg-[var(--bg-overlay)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
          {count}
        </span>
      )}
      {action && <div className="ml-auto">{action}</div>}
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
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-2.5 bg-[var(--bg-overlay-md)]">
        <FileCode2 className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
        <span className="text-[11px] font-semibold tracking-wider text-[var(--text-faint)] uppercase">Source</span>
        <span className="ml-2 font-mono text-[11px] text-[var(--text-muted)] truncate">{shortPath}</span>
        <span className="rounded border border-[var(--border)] bg-[var(--bg-overlay)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
          :{endpoint.source.line}
        </span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {/* Body */}
      <div className="relative bg-[var(--sidebar-bg)]">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-4 text-[11px] text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Loading source…
          </div>
        )}
        {err && (
          <div className="flex items-start gap-2 px-4 py-3 text-[11px] text-red-400">
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
                    <tr key={i} className={isHighlight ? 'bg-blue-500/[0.08]' : 'hover:bg-[var(--bg-overlay-md)]'}>
                      <td
                        className={`select-none w-12 px-3 py-0 text-right font-mono text-[10px] border-r border-[var(--border)] leading-5 ${isHighlight ? 'text-blue-400' : 'text-[var(--text-faint)]'
                          }`}
                      >
                        {lineNum}
                      </td>
                      <td
                        className={`px-4 py-0 font-mono text-[11px] whitespace-pre leading-5 ${isHighlight ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                          }`}
                      >
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
      <SectionHeader
        icon={FileText}
        label="Related Files"
        count={!loading && !err ? files.length : undefined}
      />

      {/* Body */}
      <div className="divide-y divide-[var(--border)]">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Resolving files…
          </div>
        )}
        {!loading && err && (
          <div className="flex items-start gap-2 px-4 py-3 text-[11px] text-red-400">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={2} />
            <span>Could not resolve — {err}</span>
          </div>
        )}
        {!loading && !err && files.length === 0 && (
          <p className="px-4 py-4 text-[12px] text-[var(--text-faint)] italic">No related files resolved</p>
        )}
        {files.map(f => {
          const parts = f.split(/[/\\]/);
          const name = parts.pop() ?? f;
          const dir = parts.slice(-2).join('/');
          const ext = name.split('.').pop() ?? '';
          const extColor = extColors[ext] ?? 'text-[var(--text-faint)]';
          return (
            <div
              key={f}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-overlay-md)] transition-colors"
            >
              <Code2 className={`h-[15px] w-[15px] shrink-0 ${extColor}`} strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-[var(--text-secondary)] truncate">{name}</p>
                {dir && <p className="text-[10px] text-[var(--text-faint)] truncate font-mono">{dir}</p>}
              </div>
              <span className={`shrink-0 rounded border border-[var(--border)] bg-[var(--bg-overlay-md)] px-1.5 py-0.5 text-[10px] font-mono ${extColor}`}>
                .{ext}
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Simulate panel (lives in the right-hand rail) ────────────────────────────

type SimMode = 'fake' | 'real';

interface SimResponse {
  status: number;
  body: any;
  durationMs: number;
  error?: string;
}

interface Environment { name: string; baseUrl: string; }

function SimulatePanel({ endpoint }: { endpoint: Endpoint }) {
  const [mode, setMode] = useState<SimMode>('fake');
  const [bearerToken, setBearerToken] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimResponse | null>(null);
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [defaultEnv, setDefaultEnv] = useState<string | null>(null);
  const [envsLoaded, setEnvsLoaded] = useState(false);

  // Load environments once on mount
  useEffect(() => {
    fetch('/api/model/environments')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEnvironments(data.environments ?? []);
        const def = data.defaultEnvironment ?? data.environments?.find((e: any) => e.default)?.name ?? data.environments?.[0]?.name ?? null;
        setDefaultEnv(def);
        const defEnv = (data.environments ?? []).find((e: any) => e.name === def);
        if (defEnv) setBaseUrl(defEnv.baseUrl);
      })
      .catch(() => { })
      .finally(() => setEnvsLoaded(true));
  }, []);

  const fields = endpoint.requestBody?.fields ?? {};
  const needsAuth = (endpoint.security?.length ?? 0) > 0;
  const isPost = ['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase());

  // Reset transient run state whenever the selected endpoint changes.
  useEffect(() => {
    setResult(null);
    setFormValues({});
  }, [endpoint.id]);

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
    <div className="flex flex-col gap-4">

      {/* Endpoint being simulated */}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-3 py-2">
        <MethodChip method={endpoint.method} size="sm" />
        <code className="font-mono text-[12px] text-[var(--text-secondary)] truncate">{endpoint.path}</code>
      </div>
      <p className='hidden'>{envsLoaded}</p>
      {/* Mode switch — mirrors the sidebar's Dark/Light segmented control */}
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-overlay)] p-1">
        <button
          type="button"
          onClick={() => setMode('fake')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all duration-200 hover:cursor-pointer ${mode === 'fake'
            ? 'bg-blue-500/15 text-blue-400 shadow-sm'
            : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'
            }`}
        >
          <Zap className="h-3 w-3 shrink-0" strokeWidth={2} />
          Fake Data
        </button>
        <button
          type="button"
          onClick={() => setMode('real')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all duration-200 hover:cursor-pointer ${mode === 'real'
            ? 'bg-blue-500/15 text-blue-400 shadow-sm'
            : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'
            }`}
        >
          <Send className="h-3 w-3 shrink-0" strokeWidth={2} />
          Real Data
        </button>
      </div>

      {/* Base URL / Environment picker */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Base URL</span>
        {environments.length > 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] overflow-hidden">
            {environments.map(env => {
              const isSelected = defaultEnv === env.name;
              return (
                <button
                  key={env.name}
                  type="button"
                  onClick={() => { setDefaultEnv(env.name); setBaseUrl(env.baseUrl); }}
                  className={`group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:cursor-pointer ${isSelected ? 'bg-blue-500/10' : 'hover:bg-[var(--bg-overlay-md)]'}`}
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <div
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                    style={{ borderColor: isSelected ? '#60a5fa' : 'var(--border)', backgroundColor: isSelected ? '#60a5fa22' : 'transparent' }}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-blue-400" strokeWidth={3} />}
                  </div>
                  <Globe className={`h-3 w-3 shrink-0 ${isSelected ? 'text-blue-400' : 'text-[var(--text-faint)]'}`} strokeWidth={2} />
                  <span className={`text-[11px] w-14 shrink-0 font-medium ${isSelected ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}>{env.name}</span>
                  <span className="font-mono text-[11px] text-[var(--text-faint)] truncate">{env.baseUrl}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)] placeholder-[var(--text-faint)] transition-colors"
            placeholder="http://localhost:3000"
          />
        )}
      </div>

      {/* Bearer token */}
      {(needsAuth || mode === 'real') && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] flex items-center gap-1">
            <Key className="h-3 w-3" strokeWidth={2} /> Bearer Token
          </span>
          <input
            type="password"
            value={bearerToken}
            onChange={e => setBearerToken(e.target.value)}
            className="w-full rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-3 py-1.5 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-amber-400/50 focus:bg-amber-500/[0.07] placeholder-[var(--text-faint)] transition-colors"
            placeholder="Optional"
          />
        </label>
      )}

      {/* Fake data preview */}
      {mode === 'fake' && Object.keys(fields).length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-blue-400" strokeWidth={2} /> Auto-generated body
          </p>
          <div className="space-y-1">
            {Object.entries(fields).map(([name, def]) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-3 py-2"
              >
                <span className="text-[11px] text-[var(--text-secondary)] w-20 truncate shrink-0">{name}</span>
                <span className="text-[11px] text-[var(--text-faint)] shrink-0">{def.type}</span>
                <span className="ml-auto font-mono text-[11px] text-blue-400/80 truncate">
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] flex items-center gap-1.5">
            <Send className="h-3 w-3 text-blue-400" strokeWidth={2} /> Request body
          </p>
          <div className="space-y-2">
            {Object.entries(fields).map(([name, def]) => (
              <label key={name} className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {name}
                  {def.required && <span className="ml-1 text-[10px] text-rose-400">*</span>}
                </span>
                <input
                  value={formValues[name] ?? ''}
                  onChange={e => setFormValues(p => ({ ...p, [name]: e.target.value }))}
                  placeholder={`${def.type}${def.format ? ` (${def.format})` : ''}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)] placeholder-[var(--text-faint)] transition-colors"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* No body notice */}
      {mode === 'real' && Object.keys(fields).length === 0 && !isPost && (
        <p className="text-[12px] text-[var(--text-faint)] italic">
          No body required for {endpoint.method.toUpperCase()} requests.
        </p>
      )}

      {/* Run button */}
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-blue-500 py-2 text-[12px] font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors hover:cursor-pointer"
      >
        {running
          ? <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2} />
          : <Play className="h-[15px] w-[15px]" strokeWidth={2} />}
        {running ? 'Sending…' : `Run ${mode === 'fake' ? 'with Fake Data' : 'with Real Data'}`}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border overflow-hidden ${statusOk ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-red-500/25 bg-red-500/[0.05]'
            }`}
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
            {statusOk
              ? <Check className="h-[15px] w-[15px] text-emerald-400" strokeWidth={2} />
              : <AlertCircle className="h-[15px] w-[15px] text-red-400" strokeWidth={2} />}
            <span className={`text-[12px] font-medium ${statusOk ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.status > 0 ? result.status : 'Error'}
            </span>
            <span className="text-[11px] text-[var(--text-faint)]">{result.durationMs}ms</span>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </div>
          {result.error && (
            <p className="px-3 py-2.5 text-[12px] text-red-400">{result.error}</p>
          )}
          {!result.error && result.body != null && (
            <pre className="overflow-auto max-h-72 p-3 text-[11px] text-[var(--text-muted)] whitespace-pre-wrap break-all leading-5">
              {typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}
            </pre>
          )}
        </div>
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

  // ── Empty state ──
  if (!endpoint) {
    return (
      <div className="flex min-h-full w-full flex-col items-center justify-center gap-5 text-center p-12">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-blue-400">
            <FileCode2 className="h-7 w-7" strokeWidth={2} />
          </div>
        </div>
        <div>
          <p className="text-[13.5px] font-medium text-[var(--text-primary)]">No endpoint selected</p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Click <span className="text-blue-400 font-medium">INSPECT</span> on any endpoint in the Model view.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-4 py-2 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer"
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
    <div className="flex min-h-full w-full">

      {/* ══════════════════════ Left: endpoint details ══════════════════════ */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-[var(--border)] px-6 py-5">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] transition-colors hover:cursor-pointer"
          >
            <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2} />
          </button>

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <MethodChip method={endpoint.method} />
            <div className="min-w-0">
              <h1 className="text-[13.5px] font-medium text-[var(--text-primary)] leading-none truncate">{endpoint.path}</h1>
              {endpoint.handlerName && (
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{endpoint.handlerName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasSecurity && (
              <span className="flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1 text-[11px] text-amber-400">
                <Shield className="h-[15px] w-[15px]" strokeWidth={2} />
                {endpoint.security![0].scheme}
              </span>
            )}
            {shortSource && (
              <span className="hidden sm:block font-mono text-[11px] text-[var(--text-faint)] truncate max-w-[200px]">
                {shortSource}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">

          {/* Details grid */}
          <SectionCard>
            <SectionHeader icon={FileText} label="Details" />
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Method</p>
                <MethodChip method={endpoint.method} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Path</p>
                <code className="font-mono text-[12px] text-[var(--text-secondary)]">{endpoint.path}</code>
              </div>
              {endpoint.handlerName && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Handler</p>
                  <code className="font-mono text-[12px] text-[var(--text-muted)]">{endpoint.handlerName}</code>
                </div>
              )}
              {endpoint.source && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Source</p>
                  <code className="font-mono text-[11px] text-[var(--text-faint)]">{shortSource}</code>
                </div>
              )}
              {endpoint.requestBody?.contentType && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Content-Type</p>
                  <code className="font-mono text-[11px] text-[var(--text-faint)]">{endpoint.requestBody.contentType}</code>
                </div>
              )}
              {hasMiddleware && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5">Middleware</p>
                  <div className="flex flex-wrap gap-1.5">
                    {endpoint.middleware!.map((m, i) => (
                      <span
                        key={i}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]"
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Request Body */}
          {hasBody && (
            <SectionCard>
              <SectionHeader icon={Send} label="Request Body" count={Object.keys(fields).length} />
              <div className="p-4 space-y-1.5">
                <div className="flex items-center gap-4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                  <span className="w-28">Field</span>
                  <span className="w-16">Type</span>
                  <span>Format</span>
                  <span className="ml-auto">Required</span>
                </div>
                {Object.entries(fields).map(([name, def]) => (
                  <div
                    key={name}
                    className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] px-3 py-2 hover:bg-[var(--bg-overlay-md)] transition-colors"
                  >
                    <span className="w-28 shrink-0 font-mono text-[12px] text-[var(--text-primary)] truncate">{name}</span>
                    <span className="w-16 shrink-0 text-[11px] text-blue-400">{def.type}</span>
                    <span className="flex-1 text-[11px] text-[var(--text-faint)]">{def.format ?? '—'}</span>
                    {def.required
                      ? <span className="ml-auto shrink-0 rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400">required</span>
                      : <span className="ml-auto shrink-0 text-[10px] text-[var(--text-faint)]">optional</span>}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Responses */}
          {hasResponses && (
            <SectionCard>
              <SectionHeader icon={Check} label="Responses" count={Object.keys(responses).length} />
              <div className="p-4 space-y-1.5">
                {Object.entries(responses).map(([status, def]) => {
                  const ok = status.startsWith('2');
                  return (
                    <div
                      key={status}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${ok ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-red-500/20 bg-red-500/[0.05]'
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
                              className="rounded border border-[var(--border)] bg-[var(--bg-overlay-md)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]"
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

          {/* Source viewer */}
          <SourcePanel endpoint={endpoint} />

          {/* Related Files */}
          <RelatedFilesPanel endpoint={endpoint} />

          {/* Simulate — inline fallback for narrow viewports where the rail is hidden */}
          <SectionCard className="lg:hidden">
            <SectionHeader icon={Zap} label="Simulate Endpoint" />
            <div className="p-4">
              <SimulatePanel endpoint={endpoint} />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ══════════════════════ Right: simulate rail ══════════════════════ */}
      <aside className="hidden lg:flex w-[400px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--sidebar-bg)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-5 py-[18px]">
          <Zap className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
          <span className="text-[13.5px] font-medium text-[var(--text-primary)]">Simulate Endpoint</span>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <SimulatePanel endpoint={endpoint} />
        </div>
      </aside>
    </div>
  );
};