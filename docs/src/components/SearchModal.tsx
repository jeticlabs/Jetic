import { useEffect, useState } from 'react';
import { DOCS_REGISTRY } from '../content/docsMap';
import { Search, X, ArrowRight } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDoc: (id: string) => void;
}

export function SearchModal({ isOpen, onClose, onSelectDoc }: SearchModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results = DOCS_REGISTRY.filter((doc) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.description.toLowerCase().includes(q) ||
      doc.content.toLowerCase().includes(q)
    );
  });

  const handleSelect = (id: string) => {
    onSelectDoc(id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-20 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800 bg-[#0c0e14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-3.5">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search documentation topics, commands, or concepts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {results.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs">
              No topics found matching "{query}"
            </div>
          ) : (
            results.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => handleSelect(doc.id)}
                className="group flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-zinc-800/60 rounded-lg"
              >
                <div className="space-y-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700/50">
                      {doc.category}
                    </span>
                    <span className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                      {doc.title}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-1">{doc.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

