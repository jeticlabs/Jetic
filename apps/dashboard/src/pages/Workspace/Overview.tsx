import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Clock,
  Database,

  Globe,
  Layers,
  Network,
  PlayCircle,
  RefreshCw,
  ScanLine,
  Shield,
  Sparkles,
  Terminal,

  Workflow,
  Zap,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ModelData {
  version: string;
  generatedAt: string;
  project: { name: string; language?: string; framework?: string };
  environments?: { name: string; baseUrl: string }[];
  endpoints: { id: string; method: string; path: string; handlerName?: string; security?: any[] }[];
}

interface Workflow {
  _file: string;
  name: string;
  generatedAt?: string;
  steps: { name: string; method: string; path: string }[];
}

interface MemEntry { key: string; value: any }

// ─── Method colours ─────────────────────────────────────────────────────────────

const MC: Record<string, { bg: string; text: string; dot: string }> = {
  GET: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: '#34d399' },
  POST: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: '#60a5fa' },
  PUT: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: '#fbbf24' },
  PATCH: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: '#fb923c' },
  DELETE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: '#f87171' },
};
function mc(m: string) {
  return MC[m.toUpperCase()] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: '#a1a1aa' };
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
    zinc: { glow: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors">
      <div className={`absolute top-0 right-0 h-20 w-20 rounded-full blur-2xl ${colors.glow} opacity-50 -translate-y-4 translate-x-4`} />
      <div className="relative">
        <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 ${colors.glow}`}>
          <Icon className={`h-[15px] w-[15px] ${colors.text}`} strokeWidth={2} />
        </div>
        <p className="text-2xl font-semibold text-white tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] text-zinc-600">{sub}</p>}
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
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5">
        {Icon && <Icon className="h-[15px] w-[15px] text-blue-400/70" strokeWidth={2} />}
        <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{title}</span>
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
  return <p className="py-6 text-center text-[12px] text-zinc-600">{msg}</p>;
}

// ─── Overview page ──────────────────────────────────────────────────────────────

export function Overview({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [model, setModel] = useState<ModelData | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [memory, setMemory] = useState<MemEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [mRes, wRes, memRes] = await Promise.allSettled([
        fetch('/api/model').then(r => r.ok ? r.json() : null),
        fetch('/api/workflows').then(r => r.ok ? r.json() : []),
        fetch('/api/memory').then(r => r.ok ? r.json() : []),
      ]);
      if (mRes.status === 'fulfilled') setModel(mRes.value);
      if (wRes.status === 'fulfilled') setWorkflows(wRes.value ?? []);
      if (memRes.status === 'fulfilled') setMemory(memRes.value ?? []);
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
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <div>
          <h1 className="text-[15px] font-medium text-white leading-none">
            {model?.project?.name ?? 'Overview'}
          </h1>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {loading
              ? 'Loading…'
              : model
                ? `${model.project.framework ?? model.project.language ?? ''} · v${model.version} · ${new Date(model.generatedAt).toLocaleString()}`
                : 'No model yet — run a scan'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-[15px] w-[15px] ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>
          {!loading && !model && (
            <button
              onClick={() => onNavigate?.('model')}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-400 transition-colors"
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
                className="h-14 animate-pulse rounded-lg border border-white/10 bg-white/[0.02]"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="m-6 flex flex-col items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-10 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" strokeWidth={2} />
            <p className="text-[13px] text-red-300">{error}</p>
            <button
              onClick={() => load()}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[12px] text-red-400 hover:bg-red-500/20 transition-colors"
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
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                        <Terminal className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium text-white">{model.project.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          {model.project.framework ?? model.project.language ?? 'Unknown framework'}
                        </p>
                      </div>
                    </div>

                    {(model.environments?.length ?? 0) > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                          Environments
                        </p>
                        <div className="space-y-1">
                          {model.environments!.map(env => (
                            <div
                              key={env.name}
                              className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                            >
                              <Globe className="h-[15px] w-[15px] text-zinc-600 shrink-0" strokeWidth={2} />
                              <span className="text-[11px] text-zinc-500 w-12 shrink-0">{env.name}</span>
                              <span className="font-mono text-[11px] text-zinc-400 truncate">{env.baseUrl}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => onNavigate?.('model')}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[12px] text-zinc-400 hover:bg-blue-500 hover:text-white hover:border-blue-400 transition-colors"
                      >
                        <Layers className="h-[15px] w-[15px]" strokeWidth={2} /> View Model
                      </button>
                      <button
                        onClick={() => onNavigate?.('simulations')}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[12px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 transition-colors"
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
                                  <span className="text-[11px] text-zinc-500">
                                    {count}{' '}
                                    <span className="text-zinc-600">({pct}%)</span>
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
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
                  onClick={() => onNavigate?.('model')}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              }
            >
              {recentEndpoints.length === 0
                ? <EmptyRow msg="No endpoints — scan your project first" />
                : (
                  <div className="divide-y divide-white/[0.06]">
                    {recentEndpoints.map(ep => {
                      const s = mc(ep.method);
                      return (
                        <div
                          key={ep.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
                        >
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.dot }} />
                          <MethodPill method={ep.method} />
                          <span className="flex-1 truncate font-mono text-[12px] text-zinc-300">{ep.path}</span>
                          {ep.handlerName && (
                            <span className="hidden sm:block truncate text-[11px] text-zinc-600 max-w-[140px]">
                              {ep.handlerName}
                            </span>
                          )}
                          {(ep.security?.length ?? 0) > 0 && (
                            <Shield className="h-[15px] w-[15px] text-amber-500/50 shrink-0" strokeWidth={2} />
                          )}
                        </div>
                      );
                    })}
                    {endpointCount > 8 && (
                      <div className="px-4 py-2.5 text-[11px] text-zinc-600">
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
                    onClick={() => onNavigate?.('simulations')}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                }
              >
                {recentWorkflows.length === 0
                  ? <EmptyRow msg="No workflows found" />
                  : (
                    <div className="divide-y divide-white/[0.06]">
                      {recentWorkflows.map((wf, i) => (
                        <button
                          key={i}
                          onClick={() => onNavigate?.('simulations')}
                          className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] text-left transition-colors"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                            <Zap className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-zinc-200">{wf.name}</p>
                            <p className="text-[11px] text-zinc-600">{wf.steps.length} steps</p>
                          </div>
                          <ChevronRight className="h-[15px] w-[15px] shrink-0 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
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
                    onClick={() => onNavigate?.('memory')}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Inspect <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                }
              >
                {recentMemory.length === 0
                  ? <EmptyRow msg="No memory entries" />
                  : (
                    <div className="divide-y divide-white/[0.06]">
                      {recentMemory.map((entry, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/50 shrink-0" />
                          <span className="font-mono text-[11px] text-zinc-400 flex-1 truncate">{entry.key}</span>
                          <span className="text-[11px] text-zinc-600 truncate max-w-[100px]">
                            {typeof entry.value === 'object'
                              ? JSON.stringify(entry.value)
                              : String(entry.value)}
                          </span>
                        </div>
                      ))}
                      {memory.length > 6 && (
                        <p className="px-4 py-2.5 text-[11px] text-zinc-600">
                          +{memory.length - 6} more entries
                        </p>
                      )}
                    </div>
                  )
                }
              </SCard>
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center gap-2 border-t border-white/10 pt-3 text-[11px] text-zinc-600">
              <Clock className="h-[15px] w-[15px]" strokeWidth={2} />
              {model
                ? `Model generated ${new Date(model.generatedAt).toLocaleString()}`
                : 'No model generated yet'}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}