import { useState } from 'react';
import { CATEGORIES, DOCS_REGISTRY } from '../content/docsMap';
import {
  Sparkles,
  Zap,
  Terminal,
  Brain,
  GitBranch,
  Database,
  RefreshCw,
  Bot,
  LayoutDashboard,
  GraduationCap,
  MessageSquareCode,
  Search,
  ChevronRight,
  Boxes,
  Layers,
  Route,
  FileSearch,
  Cog,
  SearchCode,
  Network,
  PanelsTopLeft,
  Rocket,
  UserCheck,
  ShieldAlert,
  Footprints,
  Command,
  Wrench,
  FileJson,
  LifeBuoy,
  HeartHandshake,
} from 'lucide-react';

interface SidebarProps {
  activeDocId: string;
  onSelectDoc: (id: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  Zap,
  Terminal,
  Boxes,
  Layers,
  Route,
  Brain,
  FileSearch,
  GitBranch,
  Database,
  RefreshCw,
  Cog,
  SearchCode,
  Network,
  Bot,
  LayoutDashboard,
  PanelsTopLeft,
  Rocket,
  GraduationCap,
  MessageSquareCode,
  UserCheck,
  ShieldAlert,
  Footprints,
  Command,
  Wrench,
  FileJson,
  LifeBuoy,
  HeartHandshake,
};

export function Sidebar({ activeDocId, onSelectDoc }: SidebarProps) {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredRegistry = DOCS_REGISTRY.filter((doc) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return doc.title.toLowerCase().includes(q) || doc.description.toLowerCase().includes(q);
  });

  return (
    <aside className="flex h-full w-full flex-col bg-[#090b11]">
      {/* Sidebar Filter Input */}
      <div className="p-3 border-b border-zinc-800/60">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter topics..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>
      </div>

      {/* Navigation Sections */}
      <nav aria-label="Documentation Categories" className="flex-1 overflow-y-auto p-3 space-y-5">
        {CATEGORIES.map((category) => {
          const itemsInCategory = filteredRegistry.filter((d) => d.category === category);
          if (itemsInCategory.length === 0) return null;

          return (
            <div key={category} className="space-y-1">
              <h3 className="px-2 text-xs font-semibold text-zinc-400">
                {category}
              </h3>
              <div className="space-y-0.5">
                {itemsInCategory.map((item) => {
                  const isActive = item.id === activeDocId;
                  const Icon = ICON_MAP[item.iconName] ?? Sparkles;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectDoc(item.id)}
                      className={`group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${isActive
                          ? 'bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                        }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                        <span className="truncate">{item.title}</span>
                      </div>
                      {isActive && <ChevronRight className="h-3 w-3 shrink-0 text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

