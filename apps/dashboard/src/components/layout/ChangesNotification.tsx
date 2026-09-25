import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X, Check, Copy } from 'lucide-react';

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

const SYNC_PROMPT = "Check recent file changes (jetic_get_changes). Re-analyse ONLY those modified files to update .jetic/model.json instead of reading the entire codebase";

interface ChangesNotificationProps {
  onNavigateToChanges?: () => void;
}

export function ChangesNotification({ onNavigateToChanges }: ChangesNotificationProps) {
  const [data, setData] = useState<ChangesFile | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const fetchChanges = useCallback(async () => {
    try {
      const res = await fetch('/api/changes');
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      // Ignore network errors during silent background polling
    }
  }, []);

  useEffect(() => {
    fetchChanges();
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    try {
      es = new EventSource('/api/changes/stream');
      es.onmessage = (e) => {
        try { setData(JSON.parse(e.data)); } catch { }
      };
      es.onerror = () => {
        if (!poll) poll = setInterval(fetchChanges, 3000);
      };
    } catch {
      poll = setInterval(fetchChanges, 3000);
    }

    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [fetchChanges]);

  const changesCount = data?.changes?.length ?? 0;

  // Auto-reset dismiss state when changes count drops back to 0
  useEffect(() => {
    if (changesCount === 0) {
      setIsDismissed(false);
    }
  }, [changesCount]);

  const handleCopyPrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(SYNC_PROMPT);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  if (changesCount === 0 || isDismissed) {
    return null;
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] w-[420px] max-w-[calc(100vw-3rem)] rounded-xl border border-amber-500/35 p-4 shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom-5 theme-sidebar theme-text-primary"
      style={{
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4), 0 0 15px rgba(245, 158, 11, 0.1)',
      }}
    >
      {/* Toast Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25">
            <AlertTriangle className="h-4 w-4" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold tracking-tight theme-text-primary">
              Model is not currently in sync with codebase
            </h4>
            <p className="text-[11px] theme-text-muted">
              Detected <span className="font-medium text-amber-400">{changesCount} change{changesCount > 1 ? 's' : ''}</span> in your codebase.
            </p>
          </div>
        </div>

        {/* Cancel / Dismiss button */}
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          title="Cancel"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors theme-text-muted hover:theme-bg-overlay-md hover:cursor-pointer"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* Small list preview of changes */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {data?.changes.slice(0, 3).map((c) => {
          const fileName = c.filePath.split('/').pop() ?? c.filePath;
          return (
            <span
              key={c.filePath}
              onClick={() => onNavigateToChanges?.()}
              className="truncate max-w-[130px] rounded px-2 py-0.5 font-mono text-[10.5px] hover:border-amber-500/50 hover:cursor-pointer transition-colors theme-bg-overlay border theme-border theme-text-muted"
              title={c.filePath}
            >
              {fileName}
            </span>
          );
        })}
        {changesCount > 3 && (
          <span
            onClick={() => onNavigateToChanges?.()}
            className="rounded px-1.5 py-0.5 text-[10.5px] font-medium hover:cursor-pointer theme-bg-overlay-md theme-text-faint"
          >
            +{changesCount - 3} more
          </span>
        )}
      </div>

      {/* Rescan prompt block */}
      <div className="mt-3.5 pt-3 border-t theme-border">
        <p className="text-[11px] mb-2 font-medium theme-text-muted">
          Then you need to rescan the codebase:
        </p>

        <div
          className="relative flex items-center justify-between rounded-lg p-2.5 font-mono text-[11px] leading-relaxed group theme-bg-base border theme-border theme-text"
        >
          <span className="pr-16 select-all font-mono text-[11px] leading-relaxed theme-text-primary">
            {SYNC_PROMPT}
          </span>

          <button
            type="button"
            onClick={handleCopyPrompt}
            title="Copy prompt"
            className={`absolute right-2 top-2.5 flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-sans font-medium transition-all shadow-sm hover:cursor-pointer border theme-border ${copiedPrompt ? 'bg-blue-500/20 text-blue-400' : 'theme-bg-overlay-md theme-text-muted'}`}
          >
            {copiedPrompt ? (
              <>
                <Check className="h-3 w-3 text-blue-400" strokeWidth={2} />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" strokeWidth={2} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
