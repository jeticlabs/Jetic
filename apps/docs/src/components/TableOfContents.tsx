import { useMemo } from 'react';
import { List } from 'lucide-react';

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const headings = useMemo(() => {
    const lines = content.split('\n');
    const items: TOCItem[] = [];

    lines.forEach((line) => {
      const h2Match = line.match(/^##\s+(.+)$/);
      const h3Match = line.match(/^###\s+(.+)$/);

      if (h2Match) {
        const text = h2Match[1].replace(/[*_~`]/g, '').trim();
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        items.push({ id, text, level: 2 });
      } else if (h3Match) {
        const text = h3Match[1].replace(/[*_~`]/g, '').trim();
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        items.push({ id, text, level: 3 });
      }
    });

    return items;
  }, [content]);

  if (headings.length === 0) return null;

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
        <List className="h-3.5 w-3.5 text-zinc-400" />
        <span>On this page</span>
      </div>

      <nav aria-label="Table of contents" className="space-y-1.5 border-l border-zinc-800 pl-3 text-xs">
        {headings.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => handleScrollTo(h.id)}
            className={`block w-full text-left transition-colors ${h.level === 3
                ? 'pl-2.5 text-zinc-500 hover:text-zinc-300 text-[11.5px]'
                : 'text-zinc-400 hover:text-zinc-100 font-medium'
              }`}
          >
            {h.text}
          </button>
        ))}
      </nav>
    </div>
  );
}

