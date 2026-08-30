import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain,
  Check,
  Clock,

  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemoryEntry {
  key: string;
  value: any;
}

interface Environment {
  name: string;
  baseUrl: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const API = '/api/memory';

async function fetchMemory(): Promise<MemoryEntry[]> {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`Failed to fetch memory (${res.status})`);
  return res.json();
}

async function fetchEnvironments(): Promise<Environment[]> {
  try {
    const res = await fetch('/api/model');
    if (!res.ok) return [];
    const model = await res.json();
    return model?.environments ?? [];
  } catch {
    return [];
  }
}

async function addMemory(key: string, value: string): Promise<void> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Failed to add entry (${res.status})`);
  }
}

async function deleteMemory(key: string): Promise<void> {
  const res = await fetch(API, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error(`Failed to delete entry (${res.status})`);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatValue(value: any): string {
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function shortKey(fullKey: string): string {
  const idx = fullKey.indexOf(':');
  return idx !== -1 ? fullKey.slice(idx + 1) : fullKey;
}

function getScope(key: string): string {
  return key.includes(':') ? key.split(':')[0] : 'global';
}

function MaskedValue({ value }: { value: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const displayVal = value.length > 200 ? value.slice(0, 200) + '…' : value;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="cursor-pointer max-w-[300px]"
    >
      {isHovered ? (
        <p
          className="text-[12px] break-all transition-colors truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {displayVal}
        </p>
      ) : (
        <p
          className="text-[12px] font-mono tracking-widest select-none"
          style={{ color: 'var(--text-faint)' }}
        >
          ••••••
        </p>
      )}
    </div>
  );
}

// ─── Add Entry Modal ──────────────────────────────────────────────────────────

function AddEntryModal({
  onClose,
  onSave,
  defaultScope,
}: {
  onClose: () => void;
  onSave: (key: string, value: string) => Promise<void>;
  defaultScope?: string;
}) {
  const [key, setKey] = useState(defaultScope ? `${defaultScope}:` : '');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => { keyRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) { setFormError('Key is required'); return; }
    if (value.trim() === '') { setFormError('Value is required'); return; }
    setSaving(true);
    setFormError('');
    try {
      await onSave(key.trim(), value.trim());
      onClose();
    } catch (err: any) {
      setFormError(err.message ?? 'An error occurred');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-lg p-6 shadow-2xl shadow-black/60"
        style={{
          border: '1px solid var(--border)',
          backgroundColor: 'var(--sidebar-bg)',
        }}
      >

        {/* Modal header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}
            >
              <Plus className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
            </div>
            <h2 className="text-[13.5px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Add Memory Entry
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)]"
            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-muted)' }}
          >
            <X className="h-[15px] w-[15px]" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Key field */}
          <div>
            <label
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-faint)' }}
            >
              Key / Identifier
            </label>
            <input
              ref={keyRef}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="global:myKey  or  myKey"
              className="w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)]"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-primary)' }}
            />
            <p className="mt-1.5 text-[10px]" style={{ color: 'var(--text-faint)' }}>
              Prefix with{' '}
              <code
                className="rounded px-1 py-0.5 text-[10px]"
                style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-muted)' }}
              >
                scope:
              </code>{' '}
              to organise by scope (e.g.{' '}
              <code
                className="rounded px-1 py-0.5 text-[10px]"
                style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-muted)' }}
              >
                user:name
              </code>
              ). Defaults to{' '}
              <code
                className="rounded px-1 py-0.5 text-[10px]"
                style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-muted)' }}
              >
                global
              </code>
              .
            </p>
          </div>

          {/* Value field */}
          <div>
            <label
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-faint)' }}
            >
              Value
            </label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter a string value…"
              rows={4}
              className="w-full resize-none rounded-lg px-3 py-2 text-[12px] outline-none transition-colors focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)]"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Form error */}
          {formError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
              <p className="text-[12px] text-red-400">{formError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[12px] transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)]"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:cursor-pointer hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2} />}
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Scope Modal ──────────────────────────────────────────────────────────

function AddScopeModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug) { setError('Enter a valid scope name'); return; }
    onSave(slug);
    onClose();
  };

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
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}
            >
              <Plus className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
            </div>
            <h2 className="text-[13.5px] font-medium" style={{ color: 'var(--text-primary)' }}>Add Scope</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)]"
            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-muted)' }}
          >
            <X className="h-[15px] w-[15px]" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
              Scope Name
            </label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="e.g. session, user, cart"
              className="w-full rounded-lg px-3 py-2 text-[12px] outline-none transition-colors focus:border-blue-500/50"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-primary)' }}
            />
            <p className="mt-1.5 text-[10px]" style={{ color: 'var(--text-faint)' }}>
              Memory entries under this scope will be keyed as{' '}
              <code className="rounded px-1 py-0.5 text-[10px]" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-muted)' }}>
                {name.trim() ? name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : 'scope'}:key
              </code>
            </p>
          </div>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[12px] transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)]"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:cursor-pointer hover:bg-blue-400"
            >
              <Check className="h-[14px] w-[14px]" strokeWidth={2} /> Create Scope
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scope Card ───────────────────────────────────────────────────────────────

const BUILT_IN_SCOPE_ICONS: Record<string, React.ElementType> = {
  workflow: Workflow,
  global: Layers,
};

const SCOPE_COLORS: Record<string, { border: string; bg: string; dot: string; text: string; activeBg: string; activeBorder: string }> = {
  workflow: {
    border: 'border-blue-500/20', bg: 'bg-blue-500/5', dot: 'bg-blue-500/40',
    text: 'text-blue-400', activeBg: 'bg-blue-500/15', activeBorder: 'border-blue-500/40',
  },
  environment: {
    border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', dot: 'bg-emerald-500/40',
    text: 'text-emerald-400', activeBg: 'bg-emerald-500/15', activeBorder: 'border-emerald-500/40',
  },
  global: {
    border: 'border-[var(--border)]', bg: 'bg-[var(--bg-overlay)]', dot: 'bg-[var(--text-faint)]',
    text: 'text-[var(--text-muted)]', activeBg: 'bg-[var(--bg-overlay-md)]', activeBorder: 'border-[var(--border)]',
  },
};
const DEFAULT_COLOR = {
  border: 'border-purple-500/20', bg: 'bg-purple-500/5', dot: 'bg-purple-500/40',
  text: 'text-purple-400', activeBg: 'bg-purple-500/15', activeBorder: 'border-purple-500/40',
};

function getScopeColor(scope: string) {
  return SCOPE_COLORS[scope] ?? DEFAULT_COLOR;
}

interface ScopeInfo {
  id: string;
  label: string;
  count: number;
  isBuiltIn?: boolean;
  isCustom?: boolean;
}

function ScopeCard({
  scope,
  active,
  onClick,
}: {
  scope: ScopeInfo;
  active: boolean;
  onClick: () => void;
}) {
  const c = getScopeColor(scope.id);
  const Icon = BUILT_IN_SCOPE_ICONS[scope.id] ?? Brain;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-all duration-200 hover:cursor-pointer ${active ? `${c.activeBg} ${c.activeBorder}` : `${c.border} ${c.bg} hover:${c.activeBg}`}`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${c.border} bg-[var(--bg-overlay)]`}>
          <Icon className={`h-[14px] w-[14px] ${c.text}`} strokeWidth={2} />
        </div>
        {active && (
          <div className={`flex h-4 w-4 items-center justify-center rounded-full ${c.activeBg}`}>
            <Check className={`h-2.5 w-2.5 ${c.text}`} strokeWidth={3} />
          </div>
        )}
      </div>
      <div>
        <p className={`text-[12px] font-medium ${c.text}`}>{scope.label}</p>
        <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
          {scope.count} {scope.count === 1 ? 'entry' : 'entries'}
        </p>
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Memory() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [customScopes, setCustomScopes] = useState<string[]>([]);
  const [activeScope, setActiveScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAddScope, setShowAddScope] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [data, envs] = await Promise.all([fetchMemory(), fetchEnvironments()]);
      setEntries(data);
      setEnvironments(envs);
    } catch (e: any) {
      setError(e.message ?? 'Could not load memory data. Is `jetic dev` running?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (key: string) => {
    setDeletingKey(key);
    try {
      await deleteMemory(key);
      setEntries(prev => prev.filter(e => e.key !== key));
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete entry');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleAdd = async (key: string, value: string) => {
    await addMemory(key, value);
    const data = await fetchMemory();
    setEntries(data);
  };

  // ── Build scope list ──────────────────────────────────────────────────────

  // All scopes that appear in entries
  const entryScopes = Array.from(new Set(entries.map(e => getScope(e.key))));

  const countForScope = (scope: string) =>
    entries.filter(e => getScope(e.key) === scope).length;

  // Built-in scopes: workflow always shown; environment if envs exist in model
  const builtInScopes: ScopeInfo[] = [
    {
      id: 'workflow',
      label: 'Workflow',
      count: countForScope('workflow'),
      isBuiltIn: true,
    },
    ...environments.map(env => ({
      id: `environment.${env.name}`,
      label: env.name,
      count: countForScope(`environment.${env.name}`),
      isBuiltIn: true,
    })),
  ];

  // Custom scopes: user-added + any appearing in entries that aren't built-in
  const builtInIds = new Set(['workflow', ...environments.map(e => `environment.${e.name}`)]);
  const detectedCustom = entryScopes.filter(s => !builtInIds.has(s) && s !== 'global');
  const allCustomScopes = Array.from(new Set([...customScopes, ...detectedCustom]));

  const allScopes: ScopeInfo[] = [
    ...builtInScopes,
    ...allCustomScopes.map(s => ({
      id: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      count: countForScope(s),
      isCustom: true,
    })),
    {
      id: 'global',
      label: 'Global',
      count: countForScope('global'),
      isBuiltIn: true,
    },
  ];

  // ── Filtering ─────────────────────────────────────────────────────────────

  const scopeFilteredEntries = activeScope
    ? entries.filter(e => getScope(e.key) === activeScope)
    : entries;

  const filteredEntries = scopeFilteredEntries.filter(
    e =>
      !filter ||
      e.key.toLowerCase().includes(filter.toLowerCase()) ||
      formatValue(e.value).toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-6 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-[15px] font-medium leading-none" style={{ color: 'var(--text-primary)' }}>
            Memory
          </h1>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {loading
              ? 'Loading…'
              : activeScope
                ? `${filteredEntries.length} entries in ${activeScope}`
                : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} stored`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)] hover:text-[var(--text-secondary)] disabled:opacity-40"
            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-muted)' }}
          >
            <RefreshCw className={`h-[15px] w-[15px] ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:cursor-pointer hover:bg-blue-400"
          >
            <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
            Add Entry
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">

        {/* ── Scope cards ── */}
        {!loading && !error && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                Scopes
              </p>
              <button
                onClick={() => setShowAddScope(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors hover:cursor-pointer hover:bg-[var(--bg-overlay-md)]"
                style={{ border: '1px solid var(--border)', color: 'var(--text-faint)' }}
              >
                <Plus className="h-3 w-3" strokeWidth={2} /> Add Scope
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {allScopes.map(scope => (
                <ScopeCard
                  key={scope.id}
                  scope={scope}
                  active={activeScope === scope.id}
                  onClick={() => setActiveScope(prev => prev === scope.id ? null : scope.id)}
                />
              ))}
            </div>
            {activeScope && (
              <button
                type="button"
                onClick={() => setActiveScope(null)}
                className="mt-2 text-[11px] transition-colors hover:cursor-pointer hover:text-blue-300"
                style={{ color: 'var(--text-faint)' }}
              >
                ← Show all scopes
              </button>
            )}
          </div>
        )}

        {/* Divider */}
        {!loading && !error && <div style={{ borderTop: '1px solid var(--border)' }} />}

        {/* Search bar */}
        {!loading && entries.length > 0 && (
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2"
              strokeWidth={2}
              style={{ color: 'var(--text-faint)' }}
            />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={activeScope ? `Filter ${activeScope} entries…` : 'Filter by key or value…'}
              className="w-full rounded-lg py-2 pl-9 pr-9 text-[12px] outline-none transition-colors focus:border-blue-500/50 focus:bg-[var(--bg-overlay-md)]"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-lg transition-colors hover:cursor-pointer hover:text-[var(--text-secondary)]"
                style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-faint)' }}
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg"
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-overlay)',
                  opacity: 1 - i * 0.2,
                }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-400">
              <Brain className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[13.5px] font-medium text-red-300">Could not load memory</p>
              <p className="mt-1 text-[11px] text-red-500/70">{error}</p>
            </div>
            <button
              onClick={() => load()}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[12px] text-red-400 transition-colors hover:cursor-pointer hover:bg-red-500/20"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl" />
              <div
                className="relative flex h-16 w-16 items-center justify-center rounded-lg text-blue-400"
                style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}
              >
                <Brain className="h-7 w-7" strokeWidth={2} />
              </div>
            </div>
            <div>
              <p className="text-[13.5px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                Memory is empty
              </p>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                Add your first entry or run{' '}
                <code
                  className="rounded px-1.5 py-0.5 text-[11px]"
                  style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-muted)' }}
                >
                  jetic memory add
                </code>{' '}
                in the CLI.
              </p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:cursor-pointer hover:bg-blue-400"
            >
              <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
              Add Entry
            </button>
          </div>
        )}

        {/* Empty scope state */}
        {!loading && !error && entries.length > 0 && activeScope && filteredEntries.length === 0 && !filter && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}
            >
              <Brain className="h-[15px] w-[15px]" strokeWidth={2} style={{ color: 'var(--text-faint)' }} />
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              No entries in <code className="text-blue-400">{activeScope}</code> scope
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:cursor-pointer hover:bg-blue-400"
            >
              <Plus className="h-[14px] w-[14px]" strokeWidth={2} /> Add to {activeScope}
            </button>
          </div>
        )}

        {/* No filter matches */}
        {!loading && !error && entries.length > 0 && filter && filteredEntries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}
            >
              <Search className="h-[15px] w-[15px]" strokeWidth={2} style={{ color: 'var(--text-faint)' }} />
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              No entries match "{filter}"
            </p>
            <button
              onClick={() => setFilter('')}
              className="text-[12px] text-blue-400 transition-colors hover:cursor-pointer hover:text-blue-300"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* ── Table ── */}
        {!loading && !error && filteredEntries.length > 0 && (
          <div
            className="overflow-y-auto rounded-lg"
            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}
          >
            <table className="w-full text-left whitespace-nowrap">

              {/* Table head */}
              <thead
                style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}
              >
                <tr>
                  <th
                    className="w-32 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    Scope
                  </th>
                  <th
                    className="w-48 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    Key
                  </th>
                  <th
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    Value
                  </th>
                  <th
                    className="w-16 px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              {/* Table body */}
              <tbody>
                {filteredEntries.map((entry, i) => {
                  const scope = getScope(entry.key);
                  const short = shortKey(entry.key);
                  const val = formatValue(entry.value);
                  const isDeleting = deletingKey === entry.key;
                  const c = getScopeColor(scope);

                  return (
                    <tr
                      key={entry.key}
                      className="group transition-colors hover:bg-[var(--bg-overlay-md)]"
                      style={i !== 0 ? { borderTop: '1px solid var(--border)' } : undefined}
                    >
                      {/* Scope */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${c.border} ${c.text}`}
                          style={{ backgroundColor: 'var(--bg-overlay-md)' }}
                        >
                          {scope}
                        </span>
                      </td>

                      {/* Key */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-lg px-2.5 py-0.5 font-mono text-[11px]"
                          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-secondary)' }}
                        >
                          {short}
                        </span>
                      </td>

                      {/* Value */}
                      <td className="px-4 py-3">
                        <MaskedValue value={val} />
                      </td>

                      {/* Delete */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(entry.key)}
                          disabled={isDeleting}
                          title="Delete entry"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:cursor-pointer hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-faint)' }}
                        >
                          {isDeleting
                            ? <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2} />
                            : <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Filter summary */}
        {!loading && !error && filter && filteredEntries.length > 0 && (
          <p className="text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>
            Showing {filteredEntries.length} of {scopeFilteredEntries.length} entries
          </p>
        )}
      </div>

      {/* ── Footer ── */}
      {!loading && !error && entries.length > 0 && (
        <div
          className="flex items-center gap-1.5 px-6 py-3 text-[11px]"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-faint)' }}
        >
          <Clock className="h-[15px] w-[15px]" strokeWidth={2} />
          Data read from{' '}
          <code
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay-md)', color: 'var(--text-muted)' }}
          >
            .jetic/memory.json
          </code>
          <span className="ml-auto">
            <button
              onClick={() => load(true)}
              className="text-[11px] transition-colors hover:cursor-pointer hover:text-blue-400"
              style={{ color: 'var(--text-faint)' }}
            >
              Refresh
            </button>
          </span>
        </div>
      )}

      {/* Add modals */}
      {showAdd && (
        <AddEntryModal
          onClose={() => setShowAdd(false)}
          onSave={handleAdd}
          defaultScope={activeScope ?? undefined}
        />
      )}
      {showAddScope && (
        <AddScopeModal
          onClose={() => setShowAddScope(false)}
          onSave={(name) => setCustomScopes(prev => prev.includes(name) ? prev : [...prev, name])}
        />
      )}
    </div>
  );
}