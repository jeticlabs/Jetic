import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  Globe,
  HelpCircle,
  Loader2,
  Network,
  PlayCircle,
  Plus,
  RefreshCw,
  ScanLine,
  Shield,
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

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

// ─── Method colours (semantic — stay consistent across light/dark) ───────────

const MC: Record<string, { bg: string; text: string; dot: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: '#34d399' },
  POST: { bg: 'bg-[color:var(--brand)]/10', text: 'text-[color:var(--brand)]', dot: 'var(--brand)' },
  PUT: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: '#fbbf24' },
  PATCH: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: '#fb923c' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: '#f87171' },
};
function mc(m: string) {
  return MC[m.toUpperCase()] ?? { bg: 'theme-bg-overlay-md', text: 'theme-text-muted', dot: 'var(--text-muted)' };
}

// ─── Shared bits ────────────────────────────────────────────────────────────────

const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-lg border theme-border theme-bg-overlay px-3 py-1.5 text-[12px] font-medium theme-text-muted transition-colors hover:cursor-pointer hover:theme-bg-overlay-md hover:theme-text disabled:opacity-40';

const linkBtn =
  'inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--brand)] transition-colors hover:cursor-pointer hover:opacity-80';

function StatCard({
  label, value, sub, icon: Icon, accent = 'blue',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: IconType;
  accent?: 'blue' | 'emerald' | 'amber' | 'red' | 'zinc';
}) {
  const iconColor = {
    blue: 'text-[color:var(--brand)]',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    zinc: 'theme-text-muted',
  }[accent];

  return (
    <div className="rounded-lg border theme-border theme-bg-overlay p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium theme-text-muted">{label}</p>
        <Icon className={`h-[15px] w-[15px] ${iconColor}`} strokeWidth={2} />
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none tabular-nums theme-text-primary">{value}</p>
      <p className="mt-1.5 h-4 text-[11px] theme-text-faint">{sub ?? '\u00A0'}</p>
    </div>
  );
}

function SCard({
  title, icon: Icon, action, children, noPad = false,
}: {
  title: string;
  icon?: IconType;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border theme-border theme-bg-overlay">
      <header className="flex items-center gap-2 border-b theme-border px-4 py-3">
        {Icon && <Icon className="h-[15px] w-[15px] theme-text-muted" strokeWidth={2} />}
        <h2 className="text-[13px] font-medium theme-text-primary">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className={noPad ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

function MethodPill({ method }: { method: string }) {
  const s = mc(method);
  return (
    <span className={`inline-flex w-14 shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${s.bg} ${s.text}`}>
      {method.toUpperCase()}
    </span>
  );
}

function EmptyRow({ icon: Icon, msg, hint }: { icon?: IconType; msg: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
      {Icon && (
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border theme-border theme-bg-overlay-md">
          <Icon className="h-[15px] w-[15px] theme-text-faint" strokeWidth={2} />
        </div>
      )}
      <p className="text-[12px] font-medium theme-text-muted">{msg}</p>
      {hint && <p className="text-[11px] theme-text-faint">{hint}</p>}
    </div>
  );
}

// ─── Add Environment Dialog ─────────────────────────────────────────────────

function AddEnvDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string, baseUrl: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required'); return; }
    if (!baseUrl.trim() || baseUrl === 'https://') { setErr('Base URL is required'); return; }
    setSaving(true); setErr('');
    try { await onSave(name.trim(), baseUrl.trim()); onClose(); }
    catch (e: any) { setErr(e.message); setSaving(false); }
  };

  const inputCls =
    'w-full rounded-lg border theme-border theme-bg-overlay px-3 py-2 text-[12px] theme-text-primary outline-none transition-colors focus:border-[color:var(--brand)]/50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-env-title"
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border theme-border theme-sidebar p-6 shadow-2xl shadow-black/60"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border theme-border theme-bg-overlay">
              <Globe className="h-[15px] w-[15px] text-[color:var(--brand)]" strokeWidth={2} />
            </div>
            <div>
              <h2 id="add-env-title" className="text-[13.5px] font-medium leading-none theme-text-primary">Add environment</h2>
              <p className="mt-1 text-[11px] theme-text-faint">Target for simulations and scans</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg border theme-border theme-bg-overlay theme-text-muted transition-colors hover:cursor-pointer hover:theme-bg-overlay-md"
          >
            <X className="h-[15px] w-[15px]" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="env-name" className="mb-1.5 block text-[12px] font-medium theme-text-muted">Name</label>
            <input id="env-name" ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="production" className={inputCls} />
          </div>
          <div>
            <label htmlFor="env-url" className="mb-1.5 block text-[12px] font-medium theme-text-muted">Base URL</label>
            <input id="env-url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className={`${inputCls} font-mono`} />
          </div>
          {err && (
            <p className="flex items-center gap-1.5 text-[12px] text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> {err}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 border-t theme-border pt-4">
            <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--action)] px-4 py-1.5 text-[12px] font-medium text-[color:var(--action-foreground)] transition-colors hover:cursor-pointer hover:bg-[var(--action-hover)] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-[14px] w-[14px] animate-spin" strokeWidth={2} />}
              {saving ? 'Saving…' : 'Add environment'}
            </button>
          </div>
        </div>
      </form>
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
  const totalSteps = workflows.reduce((n, w) => n + (w.steps?.length ?? 0), 0);
  const methodDist = (model?.endpoints ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.method.toUpperCase()] = (acc[e.method.toUpperCase()] ?? 0) + 1;
    return acc;
  }, {});
  const recentEndpoints = (model?.endpoints ?? []).slice(0, 8);
  const recentWorkflows = workflows.slice(0, 4);
  const recentMemory = memory.slice(0, 6);

  const setAsDefault = async (name: string) => {
    setSettingDefault(name);
    try {
      await fetch(`/api/model/environments/${encodeURIComponent(name)}/default`, { method: 'PUT' });
      setDefaultEnv(name);
      setModel(prev => prev ? { ...prev, defaultEnvironment: name } : prev);
    } finally { setSettingDefault(null); }
  };

  const removeEnv = async (name: string) => {
    setDeletingEnv(name);
    try {
      await fetch(`/api/model/environments/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setModel(prev => prev ? { ...prev, environments: prev.environments?.filter(e => e.name !== name) } : prev);
      if (defaultEnv === name) setDefaultEnv(null);
    } finally { setDeletingEnv(null); }
  };

  const metaParts = model
    ? [
      model.project.framework ?? model.project.language,
      `v${model.version}`,
      `Updated ${new Date(model.generatedAt).toLocaleString()}`,
    ].filter(Boolean) as string[]
    : [];

  return (
    <div className="flex min-h-full w-full flex-col">

      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b theme-border px-6 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-semibold leading-none theme-text-primary">
            {model?.project?.name ?? 'Overview'}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] theme-text-muted">
            {loading ? (
              <span>Loading…</span>
            ) : model ? (
              metaParts.map((p, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="theme-text-faint" aria-hidden>/</span>}
                  <span>{p}</span>
                </React.Fragment>
              ))
            ) : (
              <span>No model yet. Run a scan to get started.</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a href="https://docs.jetic.space" target="_blank" rel="noopener noreferrer" className={ghostBtn}>
            <HelpCircle className="h-[15px] w-[15px]" strokeWidth={2} />
            Docs
            <ExternalLink className="h-3 w-3 theme-text-faint" strokeWidth={2} />
          </a>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            aria-label="Refresh"
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-lg border theme-border theme-bg-overlay theme-text-muted transition-colors hover:cursor-pointer hover:theme-bg-overlay-md hover:theme-text disabled:opacity-40"
          >
            <RefreshCw className={`h-[15px] w-[15px] ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>
          {!loading && !model ? (
            <button
              type="button"
              onClick={() => onNavigate?.('model')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--action)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--action-foreground)] transition-colors hover:cursor-pointer hover:bg-[var(--action-hover)]"
            >
              <ScanLine className="h-[15px] w-[15px]" strokeWidth={2} /> Scan project
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate?.('simulations')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--action)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--action-foreground)] transition-colors hover:cursor-pointer hover:bg-[var(--action-hover)]"
            >
              <PlayCircle className="h-[15px] w-[15px]" strokeWidth={2} /> Simulations
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">
        <div className=" w-full">

          {/* Loading skeleton (mirrors final layout) */}
          {loading && (
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-[104px] animate-pulse rounded-lg border theme-border theme-bg-overlay" />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="h-80 animate-pulse rounded-lg border theme-border theme-bg-overlay lg:col-span-2" />
                <div className="h-80 animate-pulse rounded-lg border theme-border theme-bg-overlay" />
              </div>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="m-6 flex flex-col items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-10 text-center">
              <AlertCircle className="h-7 w-7 text-red-400" strokeWidth={2} />
              <div>
                <p className="text-[13px] font-medium text-red-300">Couldn't load the overview</p>
                <p className="mt-1 text-[12px] text-red-300/80">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => load()}
                className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[12px] font-medium text-red-400 transition-colors hover:cursor-pointer hover:bg-red-500/20"
              >
                Try again
              </button>
            </div>
          )}

          {/* Main content */}
          {!loading && !error && (
            <div className="space-y-5 p-6">

              {/* ── Stats ── */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Endpoints"
                  value={endpointCount}
                  icon={Network}
                  accent="blue"
                  sub={endpointCount > 0 ? `${Object.keys(methodDist).length} HTTP methods` : undefined}
                />
                <StatCard
                  label="Secured routes"
                  value={securedCount}
                  icon={Shield}
                  accent="amber"
                  sub={endpointCount > 0 ? `${Math.round((securedCount / endpointCount) * 100)}% of endpoints` : undefined}
                />
                <StatCard
                  label="Workflows"
                  value={workflowCount}
                  icon={Workflow}
                  accent="zinc"
                  sub={workflowCount > 0 ? `${totalSteps} total steps` : undefined}
                />
                <StatCard label="Memory keys" value={memoryCount} icon={Database} accent="emerald" />
              </div>

              {/* ── Endpoints (main) + Environments / Methods (side) ── */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

                <div className="lg:col-span-2">
                  <SCard
                    title="Endpoints"
                    icon={Network}
                    noPad
                    action={
                      <button type="button" onClick={() => onNavigate?.('model')} className={linkBtn}>
                        View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    }
                  >
                    {recentEndpoints.length === 0 ? (
                      <EmptyRow icon={Network} msg="No endpoints yet" hint="Scan your project to discover routes." />
                    ) : (
                      <>
                        <div className="hidden items-center gap-3 border-b theme-border theme-bg-overlay-md px-4 py-2 text-[11px] font-medium theme-text-faint sm:flex">
                          <span className="w-14">Method</span>
                          <span className="flex-1">Path</span>
                          <span className="w-36">Handler</span>
                          <span className="w-4" />
                        </div>
                        <div className="divide-y divide-[var(--border)]">
                          {recentEndpoints.map(ep => {
                            const secured = (ep.security?.length ?? 0) > 0;
                            return (
                              <div key={ep.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:theme-bg-overlay-md">
                                <MethodPill method={ep.method} />
                                <span className="flex-1 truncate font-mono text-[12px] theme-text" title={ep.path}>{ep.path}</span>
                                <span className="hidden w-36 truncate text-[11px] theme-text-faint sm:block" title={ep.handlerName}>
                                  {ep.handlerName ?? '—'}
                                </span>
                                <span className="flex w-4 justify-end" title={secured ? 'Secured' : undefined}>
                                  {secured && <Shield className="h-[14px] w-[14px] text-amber-500/70" strokeWidth={2} />}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {endpointCount > 8 && (
                          <div className="border-t theme-border px-4 py-2.5 text-[11px] theme-text-faint">
                            Showing 8 of {endpointCount} endpoints
                          </div>
                        )}
                      </>
                    )}
                  </SCard>
                </div>

                <div className="space-y-5">

                  {/* Environments */}
                  <SCard
                    title="Environments"
                    icon={Globe}
                    action={
                      model && (
                        <button
                          type="button"
                          onClick={() => setShowAddEnv(true)}
                          className="inline-flex items-center gap-1 rounded-lg border theme-border px-2 py-1 text-[11px] font-medium text-[color:var(--brand)] transition-colors hover:cursor-pointer hover:bg-[color:var(--brand)]/10"
                        >
                          <Plus className="h-3 w-3" strokeWidth={2} /> Add
                        </button>
                      )
                    }
                  >
                    {!model || (model.environments?.length ?? 0) === 0 ? (
                      <p className="py-2 text-center text-[12px] theme-text-faint">No environments configured</p>
                    ) : (
                      <div className="space-y-1.5">
                        {model.environments!.map(env => {
                          const isDefault = defaultEnv === env.name;
                          const isSettingThis = settingDefault === env.name;
                          const isDeletingThis = deletingEnv === env.name;
                          return (
                            <div
                              key={env.name}
                              className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${isDefault ? 'border-[color:var(--brand)]/30 bg-[color:var(--brand)]/[0.05]' : 'theme-border theme-bg-overlay-md'}`}
                            >
                              <button
                                type="button"
                                aria-label={isDefault ? `${env.name} is the default environment` : `Set ${env.name} as default`}
                                title={isDefault ? 'Default environment' : 'Set as default'}
                                onClick={() => { if (!isDefault) setAsDefault(env.name); }}
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors hover:cursor-pointer ${isDefault ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/20' : 'theme-border bg-transparent'}`}
                              >
                                {isSettingThis
                                  ? <Loader2 className="h-2.5 w-2.5 animate-spin text-[color:var(--brand)]" strokeWidth={3} />
                                  : isDefault && <Check className="h-2.5 w-2.5 text-[color:var(--brand)]" strokeWidth={3} />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`truncate text-[12px] font-medium ${isDefault ? 'text-[color:var(--brand)]' : 'theme-text-primary'}`}>{env.name}</span>
                                  {isDefault && (
                                    <span className="shrink-0 rounded-full border border-[color:var(--brand)]/20 bg-[color:var(--brand)]/10 px-1.5 py-px text-[9px] font-semibold text-[color:var(--brand)]">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="truncate font-mono text-[11px] theme-text-faint" title={env.baseUrl}>{env.baseUrl}</p>
                              </div>
                              <button
                                type="button"
                                disabled={isDeletingThis}
                                aria-label={`Delete ${env.name}`}
                                onClick={() => removeEnv(env.name)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-transparent theme-text-faint opacity-60 transition-all hover:cursor-pointer hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
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
                  </SCard>

                  {/* Method distribution */}
                  <SCard title="Method distribution" icon={Activity}>
                    {Object.keys(methodDist).length === 0 ? (
                      <p className="py-2 text-center text-[12px] theme-text-faint">No endpoints scanned yet</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(methodDist)
                          .sort(([, a], [, b]) => b - a)
                          .map(([method, count]) => {
                            const s = mc(method);
                            const pct = Math.round((count / endpointCount) * 100);
                            return (
                              <div key={method}>
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className={`text-[12px] font-medium ${s.text}`}>{method}</span>
                                  <span className="text-[11px] tabular-nums theme-text-muted">
                                    {count} <span className="theme-text-faint">({pct}%)</span>
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full theme-bg-overlay-md">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.dot }} />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </SCard>
                </div>
              </div>

              {/* ── Workflows + Memory ── */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

                <SCard
                  title="Workflows"
                  icon={Workflow}
                  noPad
                  action={
                    <button type="button" onClick={() => onNavigate?.('simulations')} className={linkBtn}>
                      View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  }
                >
                  {recentWorkflows.length === 0 ? (
                    <EmptyRow icon={Workflow} msg="No workflows found" hint="Workflows you create will show up here." />
                  ) : (
                    <div className="divide-y divide-[var(--border)]">
                      {recentWorkflows.map((wf, i) => (
                        <button
                          type="button"
                          key={wf._file ?? i}
                          onClick={() => onNavigate?.('simulations')}
                          className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:cursor-pointer hover:theme-bg-overlay-md"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border theme-border theme-bg-overlay-md">
                            <Zap className="h-[14px] w-[14px] text-[color:var(--brand)]" strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] theme-text-primary">{wf.name}</p>
                            <p className="text-[11px] theme-text-faint">{wf.steps.length} {wf.steps.length === 1 ? 'step' : 'steps'}</p>
                          </div>
                          <ChevronRight className="h-[15px] w-[15px] shrink-0 theme-text-faint opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2} />
                        </button>
                      ))}
                    </div>
                  )}
                </SCard>

                <SCard
                  title="Runtime memory"
                  icon={Database}
                  noPad
                  action={
                    <button type="button" onClick={() => onNavigate?.('memory')} className={linkBtn}>
                      Inspect <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  }
                >
                  {recentMemory.length === 0 ? (
                    <EmptyRow icon={Database} msg="No memory entries" hint="Values stored at runtime appear here." />
                  ) : (
                    <div className="divide-y divide-[var(--border)]">
                      {recentMemory.map((entry, i) => (
                        <div key={entry.key ?? i} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:theme-bg-overlay-md">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/60" />
                          <span className="flex-1 truncate font-mono text-[12px] theme-text" title={entry.key}>{entry.key}</span>
                          <span className="max-w-[120px] truncate font-mono text-[11px] theme-text-faint">
                            {typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value)}
                          </span>
                        </div>
                      ))}
                      {memory.length > 6 && (
                        <p className="px-4 py-2.5 text-[11px] theme-text-faint">+{memory.length - 6} more entries</p>
                      )}
                    </div>
                  )}
                </SCard>
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center gap-2 border-t theme-border pt-3 text-[11px] theme-text-faint">
                <Clock className="h-[14px] w-[14px]" strokeWidth={2} />
                {model ? `Model generated ${new Date(model.generatedAt).toLocaleString()}` : 'No model generated yet'}
              </div>
            </div>
          )}
        </div>
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