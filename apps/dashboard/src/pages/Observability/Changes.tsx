import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PageId } from '../../types';
import {
  GitCommitHorizontal,
  RefreshCw,
  Trash2,
  Search,
  Check,
  Copy,
  AlertCircle,
  FileCode,
  FileText,
  Database,
  FileEdit,
} from 'lucide-react';

interface ChangeEntry {
  filePath: string;
  absolutePath: string;
  changedAt: string;
  eventType: 'change' | 'rename';
}

interface ChangesFile {
  version: number;
  watchedSince: string;
  projectRoot: string;
  changes: ChangeEntry[];
}

function getFileIcon(filePath: string): { icon: React.ElementType; color: string } {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'py', 'go', 'rs'].includes(ext))
    return { icon: FileCode, color: 'text-blue-400' };
  if (['json', 'yaml', 'yml', 'toml', 'env'].includes(ext))
    return { icon: FileText, color: 'text-amber-400' };
  if (['sql', 'prisma', 'graphql', 'gql'].includes(ext))
    return { icon: Database, color: 'text-emerald-400' };
  return { icon: FileEdit, color: 'text-[var(--text-muted)]' };
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface ChangesProps {
  onNavigate?: (page: PageId) => void;
}

export function Changes({ onNavigate: _onNavigate }: ChangesProps = {}) {
  const [data, setData] = useState<ChangesFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const fetchChanges = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/changes');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch changes');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const handleClear = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await fetch('/api/changes', { method: 'DELETE' });
      await fetchChanges(true);
    } catch (err: any) {
      alert(`Clear failed: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  useEffect(() => {
    fetchChanges();
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    try {
      es = new EventSource('/api/changes/stream');
      es.onopen = () => setIsLive(true);
      es.onmessage = (e) => {
        try { setData(JSON.parse(e.data)); } catch { }
      };
      es.onerror = () => {
        setIsLive(false);
        if (!poll) poll = setInterval(() => fetchChanges(true), 2000);
      };
    } catch {
      poll = setInterval(() => fetchChanges(true), 2000);
    }

    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [fetchChanges]);

  const filteredChanges = useMemo(() => {
    if (!data?.changes) return [];
    if (!searchQuery) return data.changes;
    const q = searchQuery.toLowerCase();
    return data.changes.filter(c => c.filePath.toLowerCase().includes(q));
  }, [data, searchQuery]);

  const changesCount = data?.changes?.length ?? 0;

  return (
    <div
      className="flex flex-1 flex-col min-h-0"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--sidebar-bg)' }}
      >
        <div className="flex items-center gap-2.5">
          <GitCommitHorizontal className="h-[15px] w-[15px] shrink-0" style={{ color: 'var(--text-muted)' }} strokeWidth={2} />
          <span className="text-[13.5px] font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>
            File Changes
          </span>

          {changesCount > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--bg-overlay-md)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              {changesCount}
            </span>
          )}

          {/* Live indicator — same pill style as version badge in sidebar */}
          <div
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-overlay)',
              color: 'var(--text-muted)',
            }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-blue-500 animate-pulse' : 'bg-[var(--text-faint)]'}`} />
            {isLive ? 'Live' : 'Polling'}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fetchChanges(false)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-overlay)',
              color: 'var(--text-muted)',
            }}
          >
            <RefreshCw className={`h-3 w-3 shrink-0 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing || changesCount === 0}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-overlay)',
              color: 'var(--text-muted)',
            }}
          >
            <Trash2 className="h-3 w-3 shrink-0" strokeWidth={2} />
            {isClearing ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 shrink-0"
            style={{ color: 'var(--text-faint)' }}
            strokeWidth={2}
          />
          <input
            type="text"
            placeholder="Filter by filename or path…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg py-1.5 pl-8 pr-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            style={{
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-overlay)',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-[11px]"
          style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" strokeWidth={2} />
          {error}
        </div>
      )}

      {/* ── List ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 p-10" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw className="h-4 w-4 animate-spin text-blue-400" strokeWidth={2} />
            <span className="text-[12px]">Connecting…</span>
          </div>
        ) : filteredChanges.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 p-10 text-center">
            <Check className="h-5 w-5 mb-1 text-blue-400" strokeWidth={2} />
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {changesCount === 0 ? 'No pending changes' : 'No files match filter'}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {changesCount === 0
                ? 'File edits appear here in real-time.'
                : 'Try a different search.'}
            </span>
          </div>
        ) : (
          filteredChanges.map((change) => {
            const { icon: Icon, color } = getFileIcon(change.filePath);
            const parts = change.filePath.split('/');
            const fileName = parts.pop() ?? change.filePath;
            const dir = parts.join('/');
            const isCopied = copiedPath === change.filePath;

            return (
              <div
                key={change.filePath}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-overlay)]"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <Icon className={`h-[15px] w-[15px] shrink-0 ${color}`} strokeWidth={1.75} />

                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate  text-[12.5px] font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {fileName}
                  </span>
                  {dir && (
                    <span
                      className="truncate  text-[11px]"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      {dir}/
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5  text-[10px]"
                    style={{
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-overlay)',
                      color: 'var(--text-faint)',
                    }}
                  >
                    {change.eventType}
                  </span>

                  <span
                    className="w-14 text-right  text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {formatRelativeTime(change.changedAt)}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleCopy(change.filePath)}
                    title="Copy path"
                    className="flex h-6 w-6 items-center justify-center rounded transition-colors"
                    style={{
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-overlay)',
                      color: 'var(--text-faint)',
                    }}
                  >
                    {isCopied
                      ? <Check className="h-3 w-3 text-blue-400" strokeWidth={2} />
                      : <Copy className="h-3 w-3" strokeWidth={2} />
                    }
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}