import { DOCS_REGISTRY } from '../content/docsMap';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface DocPaginationProps {
  currentDocId: string;
  onSelectDoc: (id: string) => void;
}

export function DocPagination({ currentDocId, onSelectDoc }: DocPaginationProps) {
  const currentIndex = DOCS_REGISTRY.findIndex((d) => d.id === currentDocId);
  const prevDoc = currentIndex > 0 ? DOCS_REGISTRY[currentIndex - 1] : null;
  const nextDoc = currentIndex < DOCS_REGISTRY.length - 1 ? DOCS_REGISTRY[currentIndex + 1] : null;

  return (
    <nav aria-label="Pagination" className="mt-14 flex flex-col gap-4 border-t border-zinc-800/80 pt-8 sm:flex-row sm:items-center sm:justify-between">
      {prevDoc ? (
        <button
          type="button"
          onClick={() => onSelectDoc(prevDoc.id)}
          className="group flex flex-1 flex-col items-start rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/70"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 group-hover:text-zinc-300">
            <ArrowLeft className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300" />
            Previous
          </span>
          <span className="mt-1.5 text-sm font-semibold text-zinc-200 group-hover:text-white">
            {prevDoc.title}
          </span>
        </button>
      ) : (
        <div className="flex-1" />
      )}

      {nextDoc && (
        <button
          type="button"
          onClick={() => onSelectDoc(nextDoc.id)}
          className="group flex flex-1 flex-col items-end rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-4 text-right transition-colors hover:border-zinc-700 hover:bg-zinc-900/70"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 group-hover:text-zinc-300">
            Next
            <ArrowRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300" />
          </span>
          <span className="mt-1.5 text-sm font-semibold text-zinc-200 group-hover:text-white">
            {nextDoc.title}
          </span>
        </button>
      )}
    </nav>
  );
}

