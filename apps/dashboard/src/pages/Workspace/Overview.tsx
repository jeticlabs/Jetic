import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Database,
  Globe,
  HelpCircleIcon,
  Layers,
  Loader2,
  Network,
  PlayCircle,
  Plus,
  RefreshCw,
  ScanLine,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
  X,
  Zap,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ModelData {
  version: string;
  generatedAt: string;
  project: { name: string; language?: string; framework?: string };
  environments?: { name: string; baseUrl: string }[];
  defaultEnvironment?: string;
  endpoints: { id: string; method: string; path: string; handlerName?: string; security?: any[] }[];
}

interface Workflow {
  _file: string;
  name: string;
  generatedAt?: string;
  steps: { name: string; method: string; path: string }[];
}

interface MemEntry { key: string; value: any }

// ─── Method colours (semantic — stay consistent across light/dark) ───────────

const MC: Record<string, { bg: string; text: string; dot: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: '#34d399' },
  POST: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: '#60a5fa' },
  PUT: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: '#fbbf24' },
  PATCH: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: '#fb923c' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: '#f87171' },
};
function mc(m: string) {
  return MC[m.toUpperCase()] ?? { bg: 'bg-[var(--bg-overlay-md)]', text: 'text-[var(--text-muted)]', dot: '#a1a1aa' };
}

// ─── StatCard ───────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent = 'blue',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent?: 'blue' | 'emerald' | 'amber' | 'red' | 'zinc';
}) {
  const colors = {
    blue: { glow: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    emerald: { glow: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    amber: { glow: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    red: { glow: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    zinc: { glow: 'bg-[var(--bg-overlay-md)]', text: 'text-[var(--text-muted)]', border: 'border-[var(--border)]' },
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] p-4 hover:bg-[var(--bg-overlay-md)] transition-colors">
      <div className={`absolute top-0 right-0 h-20 w-20 rounded-full blur-2xl ${colors.glow} opacity-50 -translate-y-4 translate-x-4`} />
      <div className="relative">
        <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] ${colors.glow}`}>
          <Icon className={`h-[15px] w-[15px] ${colors.text}`} strokeWidth={2} />
        </div>
        <p className="text-2xl font-semibold text-[var(--text-primary)] tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section card ───────────────────────────────────────────────────────────────

function SCard({
  title, icon: Icon, action, children, noPad = false,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-2.5 bg-[var(--bg-overlay-md)]">
        {Icon && <Icon className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />}
        <span className="text-[11px] font-semibold tracking-wider text-[var(--text-faint)] uppercase">{title}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className={noPad ? '' : 'p-4'}>{children}</div>
    </div>
  );
}

// ─── Method pill ────────────────────────────────────────────────────────────────

function MethodPill({ method }: { method: string }) {
  const s = mc(method);
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium tracking-widest ${s.bg} ${s.text}`}>
      {method.toUpperCase()}
    </span>
  );
}

// ─── Empty inline state ─────────────────────────────────────────────────────────

function EmptyRow({ msg }: { msg: string }) {
  return <p className="py-6 text-center text-[12px] text-[var(--text-faint)]">{msg}</p>;
}

// ─── Add Environment Dialog ─────────────────────────────────────────────────

function AddEnvDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string, baseUrl: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required'); return; }
    if (!baseUrl.trim() || baseUrl === 'https://') { setErr('Base URL is required'); return; }
    setSaving(true); setErr('');
    try { await onSave(name.trim(), baseUrl.trim()); onClose(); }
    catch (e: any) { setErr(e.message); setSaving(false); }
  };

  const inputCls = 'w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-sm rounded-lg p-6 shadow-2xl shadow-black/60"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--sidebar-bg)' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}>
              <Globe className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
            </div>
            <h2 className="text-[13.5px] font-medium" style={{ color: 'var(--text-primary)' }}>Add Environment</h2>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)]" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-muted)' }}>
            <X className="h-[15px] w-[15px]" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Name</label>
            <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="production" className={inputCls} style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Base URL</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className={`${inputCls} font-mono`} style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-primary)' }} />
          </div>
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[12px] transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)]" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-muted)' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:cursor-pointer hover:bg-blue-400 disabled:opacity-50">
              {saving && <Loader2 className="h-[14px] w-[14px] animate-spin" strokeWidth={2} />}
              {saving ? 'Saving…' : 'Add Environment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Overview page ──────────────────────────────────────────────────────────────

export function Overview({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [model, setModel] = useState<ModelData | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [memory, setMemory] = useState<MemEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultEnv, setDefaultEnv] = useState<string | null>(null);
  const [showAddEnv, setShowAddEnv] = useState(false);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [deletingEnv, setDeletingEnv] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [mRes, wRes, memRes, envRes] = await Promise.allSettled([
        fetch('/api/model').then(r => r.ok ? r.json() : null),
        fetch('/api/workflows').then(r => r.ok ? r.json() : []),
        fetch('/api/memory').then(r => r.ok ? r.json() : []),
        fetch('/api/model/environments').then(r => r.ok ? r.json() : null),
      ]);
      if (mRes.status === 'fulfilled') setModel(mRes.value);
      if (wRes.status === 'fulfilled') setWorkflows(wRes.value ?? []);
      if (memRes.status === 'fulfilled') setMemory(memRes.value ?? []);
      if (envRes.status === 'fulfilled' && envRes.value) setDefaultEnv(envRes.value.defaultEnvironment ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const endpointCount = model?.endpoints?.length ?? 0;
  const workflowCount = workflows.length;
  const memoryCount = memory.length;
  const securedCount = model?.endpoints?.filter(e => (e.security?.length ?? 0) > 0).length ?? 0;
  const methodDist = (model?.endpoints ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.method.toUpperCase()] = (acc[e.method.toUpperCase()] ?? 0) + 1;
    return acc;
  }, {});
  const recentEndpoints = (model?.endpoints ?? []).slice(0, 8);
  const recentWorkflows = workflows.slice(0, 4);
  const recentMemory = memory.slice(0, 6);

  return (
    <div className="flex min-h-full w-full flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
        <div>
          <h1 className="text-[15px] font-medium text-[var(--text-primary)] leading-none">
            {model?.project?.name ?? 'Overview'}
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {loading
              ? 'Loading…'
              : model
                ? `${model.project.framework ?? model.project.language ?? ''} · v${model.version} · ${new Date(model.generatedAt).toLocaleString()}`
                : 'No model yet — run a scan'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href='https://docs.jetic.online'
            target='_blank'
            className={`relative hover:cursor-pointer flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors text-[var(--text-muted)]  hover:cursor-pointer  hover:text-[var(--text-secondary)] `}
          >

            <HelpCircleIcon className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
            <span>Jetic Documentation</span>
          </a>

          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] disabled:opacity-40 transition-colors hover:cursor-pointer"
          >
            <RefreshCw className={`h-[15px] w-[15px] ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>
          {!loading && !model && (
            <button
              type="button"
              onClick={() => onNavigate?.('model')}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-400 transition-colors hover:cursor-pointer"
            >
              <ScanLine className="h-[15px] w-[15px]" strokeWidth={2} /> Scan Project
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)]"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="m-6 flex flex-col items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-10 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" strokeWidth={2} />
            <p className="text-[13px] text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[12px] text-red-400 hover:bg-red-500/20 transition-colors hover:cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Main content */}
        {!loading && !error && (
          <div className="p-6 space-y-5">

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Endpoints" value={endpointCount} icon={Network} accent="blue" />
              <StatCard label="Workflows" value={workflowCount} icon={Workflow} accent="zinc" />
              <StatCard label="Memory Keys" value={memoryCount} icon={Database} accent="emerald" />
              <StatCard
                label="Secured"
                value={securedCount}
                icon={Shield}
                accent="amber"
                sub={endpointCount > 0 ? `${Math.round(securedCount / endpointCount * 100)}% of routes` : undefined}
              />
            </div>

            {/* ── Project info + method distribution ── */}
            {model && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

                {/* Project info */}
                <SCard title="Project" icon={Sparkles}>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)]">
                        <Terminal className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium text-[var(--text-primary)]">{model.project.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {model.project.framework ?? model.project.language ?? 'Unknown framework'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                          Environments
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowAddEnv(true)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-blue-400 transition-colors hover:bg-blue-500/10 hover:cursor-pointer"
                          style={{ border: '1px solid var(--border)' }}
                        >
                          <Plus className="h-3 w-3" strokeWidth={2} /> Add
                        </button>
                      </div>
                      {(model.environments?.length ?? 0) === 0 ? (
                        <p className="text-[12px] italic" style={{ color: 'var(--text-faint)' }}>No environments configured</p>
                      ) : (
                        <div className="space-y-1">
                          {model.environments!.map(env => {
                            const isDefault = defaultEnv === env.name;
                            const isSettingThis = settingDefault === env.name;
                            const isDeletingThis = deletingEnv === env.name;
                            return (
                              <div
                                key={env.name}
                                className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all ${isDefault ? 'border-blue-500/30 bg-blue-500/[0.05]' : 'border-[var(--border)] bg-[var(--bg-overlay-md)]'}`}
                              >
                                {/* Radio */}
                                <button
                                  type="button"
                                  title={isDefault ? 'Default environment' : 'Set as default'}
                                  onClick={async () => {
                                    if (isDefault) return;
                                    setSettingDefault(env.name);
                                    try {
                                      await fetch(`/api/model/environments/${encodeURIComponent(env.name)}/default`, { method: 'PUT' });
                                      setDefaultEnv(env.name);
                                      setModel(prev => prev ? { ...prev, defaultEnvironment: env.name } : prev);
                                    } finally { setSettingDefault(null); }
                                  }}
                                  className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors hover:cursor-pointer"
                                  style={{ borderColor: isDefault ? '#60a5fa' : 'var(--border)', backgroundColor: isDefault ? '#60a5fa22' : 'transparent' }}
                                >
                                  {isSettingThis
                                    ? <Loader2 className="h-2.5 w-2.5 text-blue-400 animate-spin" strokeWidth={3} />
                                    : isDefault && <Check className="h-2.5 w-2.5 text-blue-400" strokeWidth={3} />}
                                </button>
                                <Globe className="h-[14px] w-[14px] text-[var(--text-faint)] shrink-0" strokeWidth={2} />
                                <span className={`text-[11px] w-16 shrink-0 font-medium ${isDefault ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}>{env.name}</span>
                                <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate flex-1">{env.baseUrl}</span>
                                {isDefault && <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400 border border-blue-500/20">default</span>}
                                {/* Delete */}
                                <button
                                  type="button"
                                  disabled={isDeletingThis}
                                  onClick={async () => {
                                    setDeletingEnv(env.name);
                                    try {
                                      await fetch(`/api/model/environments/${encodeURIComponent(env.name)}`, { method: 'DELETE' });
                                      setModel(prev => prev ? { ...prev, environments: prev.environments?.filter(e => e.name !== env.name) } : prev);
                                      if (defaultEnv === env.name) setDefaultEnv(null);
                                    } finally { setDeletingEnv(null); }
                                  }}
                                  className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-all hover:cursor-pointer hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                                >
                                  {isDeletingThis
                                    ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                                    : <Trash2 className="h-3 w-3" strokeWidth={2} />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onNavigate?.('model')}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-blue-500 hover:text-white hover:border-blue-400 transition-colors hover:cursor-pointer"
                      >
                        <Layers className="h-[15px] w-[15px]" strokeWidth={2} /> View Model
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate?.('simulations')}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-primary)] transition-colors hover:cursor-pointer"
                      >
                        <PlayCircle className="h-[15px] w-[15px]" strokeWidth={2} /> Simulations
                      </button>
                    </div>
                  </div>
                </SCard>

                {/* Method distribution */}
                <SCard title="Method Distribution" icon={Activity}>
                  {Object.keys(methodDist).length === 0
                    ? <EmptyRow msg="No endpoints scanned yet" />
                    : (
                      <div className="space-y-3">
                        {Object.entries(methodDist)
                          .sort(([, a], [, b]) => b - a)
                          .map(([method, count]) => {
                            const s = mc(method);
                            const pct = Math.round(count / endpointCount * 100);
                            return (
                              <div key={method}>
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className={`text-[12px] font-medium ${s.text}`}>{method}</span>
                                  <span className="text-[11px] text-[var(--text-muted)]">
                                    {count}{' '}
                                    <span className="text-[var(--text-faint)]">({pct}%)</span>
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-overlay-md)]">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, background: s.dot }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )
                  }
                </SCard>
              </div>
            )}

            {/* ── Recent Endpoints ── */}
            <SCard
              title="Endpoints"
              icon={Network}
              noPad
              action={
                <button
                  type="button"
                  onClick={() => onNavigate?.('model')}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors hover:cursor-pointer"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              }
            >
              {recentEndpoints.length === 0
                ? <EmptyRow msg="No endpoints — scan your project first" />
                : (
                  <div className="divide-y divide-[var(--border)]">
                    {recentEndpoints.map(ep => {
                      const s = mc(ep.method);
                      return (
                        <div
                          key={ep.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-overlay-md)] transition-colors"
                        >
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.dot }} />
                          <MethodPill method={ep.method} />
                          <span className="flex-1 truncate font-mono text-[12px] text-[var(--text-secondary)]">{ep.path}</span>
                          {ep.handlerName && (
                            <span className="hidden sm:block truncate text-[11px] text-[var(--text-faint)] max-w-[140px]">
                              {ep.handlerName}
                            </span>
                          )}
                          {(ep.security?.length ?? 0) > 0 && (
                            <Shield className="h-[15px] w-[15px] text-amber-500/60 shrink-0" strokeWidth={2} />
                          )}
                        </div>
                      );
                    })}
                    {endpointCount > 8 && (
                      <div className="px-4 py-2.5 text-[11px] text-[var(--text-faint)]">
                        +{endpointCount - 8} more endpoints
                      </div>
                    )}
                  </div>
                )
              }
            </SCard>

            {/* ── Workflows + Memory ── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

              {/* Workflows */}
              <SCard
                title="Workflows"
                icon={Workflow}
                noPad
                action={
                  <button
                    type="button"
                    onClick={() => onNavigate?.('simulations')}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors hover:cursor-pointer"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                }
              >
                {recentWorkflows.length === 0
                  ? <EmptyRow msg="No workflows found" />
                  : (
                    <div className="divide-y divide-[var(--border)]">
                      {recentWorkflows.map((wf, i) => (
                        <button
                          type="button"
                          key={i}
                          onClick={() => onNavigate?.('simulations')}
                          className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-overlay-md)] text-left transition-colors hover:cursor-pointer"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-overlay-md)]">
                            <Zap className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-[var(--text-primary)]">{wf.name}</p>
                            <p className="text-[11px] text-[var(--text-faint)]">{wf.steps.length} steps</p>
                          </div>
                          <ChevronRight className="h-[15px] w-[15px] shrink-0 text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
                        </button>
                      ))}
                    </div>
                  )
                }
              </SCard>

              {/* Memory */}
              <SCard
                title="Runtime Memory"
                icon={Database}
                noPad
                action={
                  <button
                    type="button"
                    onClick={() => onNavigate?.('memory')}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors hover:cursor-pointer"
                  >
                    Inspect <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                }
              >
                {recentMemory.length === 0
                  ? <EmptyRow msg="No memory entries" />
                  : (
                    <div className="divide-y divide-[var(--border)]">
                      {recentMemory.map((entry, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-overlay-md)] transition-colors"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/50 shrink-0" />
                          <span className="font-mono text-[11px] text-[var(--text-secondary)] flex-1 truncate">{entry.key}</span>
                          <span className="text-[11px] text-[var(--text-faint)] truncate max-w-[100px]">
                            {typeof entry.value === 'object'
                              ? JSON.stringify(entry.value)
                              : String(entry.value)}
                          </span>
                        </div>
                      ))}
                      {memory.length > 6 && (
                        <p className="px-4 py-2.5 text-[11px] text-[var(--text-faint)]">
                          +{memory.length - 6} more entries
                        </p>
                      )}
                    </div>
                  )
                }
              </SCard>
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-faint)]">
              <Clock className="h-[15px] w-[15px]" strokeWidth={2} />
              {model
                ? `Model generated ${new Date(model.generatedAt).toLocaleString()}`
                : 'No model generated yet'}
            </div>

          </div>
        )}
      </div>


      {/* Add Environment Dialog */}
      {showAddEnv && (
        <AddEnvDialog
          onClose={() => setShowAddEnv(false)}
          onSave={async (name, baseUrl) => {
            const res = await fetch('/api/model/environments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, baseUrl }),
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? 'Failed'); }
            const data = await res.json();
            setModel(prev => prev ? { ...prev, environments: data.environments } : prev);
            if (data.defaultEnvironment) setDefaultEnv(data.defaultEnvironment);
          }}
        />
      )}
    </div>
  );
}