import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemoryEntry {
  key: string; // e.g. "global:userName"
  value: any;
}



// ─── API helpers ─────────────────────────────────────────────────────────────

const API = '/api/memory';

async function fetchMemory(): Promise<MemoryEntry[]> {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`Failed to fetch memory (${res.status})`);
  return res.json();
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

function MaskedValue({ value }: { value: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const displayVal = value.length > 200 ? value.slice(0, 200) + '…' : value;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="cursor-pointer min-w-[200px]"
    >
      {isHovered ? (
        <p className="text-zinc-300 text-wrap break-all transition-colors">
          {displayVal}
        </p>
      ) : (
        <p className="text-zinc-500 font-mono tracking-widest select-none">
          ******
        </p>
      )}
    </div>
  );
}


// ─── ScopeGroup ──────────────────────────────────────────────────────────────



// ─── Add Entry Modal ──────────────────────────────────────────────────────────

function AddEntryModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    keyRef.current?.focus();
  }, []);

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
      <div className="relative w-full max-w-md rounded border border-white/[0.08] bg-[#111111] shadow-2xl shadow-black/60 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base  text-white">Add Memory Entry</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Key / Identifier
            </label>
            <input
              ref={keyRef}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="global:myKey  or  myKey"
              className="w-full rounded border border-white/[0.08] bg-white/[0.03] px-3 py-2  text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all "
            />
            <p className="mt-1 text-[10px] text-zinc-600">
              Prefix with <code className="text-zinc-500">scope:</code> to organise by scope (e.g.{' '}
              <code className="text-zinc-500">user:name</code>). Defaults to{' '}
              <code className="text-zinc-500">global</code>.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Value</label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter a string value…"
              rows={4}
              className="w-full resize-none rounded border border-white/[0.08] bg-white/[0.03] px-3 py-2  text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all "
            />
          </div>

          {formError && (
            <p className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2  text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded bg-violet-600 px-4 py-2  font-medium text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Memory() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await fetchMemory();
      setEntries(data);
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
      setEntries((prev) => prev.filter((e) => e.key !== key));
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

  const filteredEntries = entries.filter(
    (e) =>
      !filter ||
      e.key.toLowerCase().includes(filter.toLowerCase()) ||
      formatValue(e.value).toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex min-h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5 sticky">
        <div className="flex items-center gap-3">

          <div>
            <h1 className="text-[15px]  text-white leading-none">Memory</h1>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {loading
                ? 'Loading…'
                : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} stored`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 disabled:opacity-40 transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5  font-medium text-white hover:bg-violet-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Entry
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Search */}
        {!loading && entries.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by key or value…"
              className="w-full rounded border border-white/[0.06] bg-white/[0.02] py-2 pl-9 pr-4  text-zinc-300 placeholder-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded border border-white/[0.04] bg-white/[0.02]"
                style={{ opacity: 1 - i * 0.2 }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 rounded border border-red-500/20 bg-red-500/[0.05] p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <p className=" font-medium text-red-300">Could not load memory</p>
              <p className="mt-1 text-xs text-red-500/80">{error}</p>
            </div>
            <button
              onClick={() => load()}
              className="rounded border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-violet-400">
                <Brain className="h-7 w-7" />
              </div>
            </div>
            <div>
              <p className=" font-medium text-zinc-300">Memory is empty</p>
              <p className="mt-1 text-xs text-zinc-600">
                Add your first entry or run{' '}
                <code className="text-zinc-500">jetic memory add</code> in the CLI.
              </p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded bg-violet-600 px-4 py-2  font-medium text-white hover:bg-violet-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Entry
            </button>
          </div>
        )}

        {/* No filter matches */}
        {!loading && !error && entries.length > 0 && filter && filteredEntries.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Search className="h-6 w-6 text-zinc-700" />
            <p className=" text-zinc-500">No entries match "{filter}"</p>
            <button
              onClick={() => setFilter('')}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Table View */}
        {!loading && !error && filteredEntries.length > 0 && (
          <div className="border-y border-white/[0.06] bg-white/[0.02] overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="border-b border-white/[0.06] bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 font-medium text-zinc-400 w-32">Scope</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 w-48">Key</th>
                  <th className="px-4 py-3 font-medium text-zinc-400">Value</th>
                  <th className="px-4 py-3 font-medium text-zinc-400 text-right w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredEntries.map((entry) => {
                  const scope = entry.key.includes(':') ? entry.key.split(':')[0] : 'global';
                  const short = shortKey(entry.key);
                  const val = formatValue(entry.value);
                  const isDeleting = deletingKey === entry.key;

                  return (
                    <tr key={entry.key} className="group hover:bg-white/[0.025] transition-colors">
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400 uppercase tracking-wider">
                          {scope}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded bg-white/[0.06] px-2 py-0.5 text-zinc-300">
                          {short}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <MaskedValue value={val} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(entry.key)}
                          disabled={isDeleting}
                          title="Delete entry"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-600group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
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
          <p className="text-center text-xs text-zinc-600">
            Showing {filteredEntries.length} of {entries.length} entries
          </p>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && entries.length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-white/[0.04] px-6 py-3 text-[10px] text-zinc-700">
          <Clock className="h-3 w-3" />
          Data read from <code className="text-zinc-600">.jetic/memory.json</code>
          <span className="ml-auto">
            <button
              onClick={() => load(true)}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Refresh
            </button>
          </span>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddEntryModal onClose={() => setShowAdd(false)} onSave={handleAdd} />
      )}
    </div>
  );
}
