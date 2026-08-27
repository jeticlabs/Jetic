import {
  LayoutGrid, Diamond,
  Database,
  Activity, List,
  Sparkles, Settings, HelpCircle,
  InspectIcon,
  Layers2
} from 'lucide-react';
import { type PageId, type NavItemData } from '../../types';

interface SidebarGroup {
  label: string;
  items: NavItemData[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    label: "WORKFLOW",
    items: [
      { id: "overview", label: "Overview", icon: LayoutGrid },
      { id: "model", label: "Model", icon: Layers2 },
      { id: "simulations", label: "Simulations", icon: Diamond },
      { id: "inspect", label: "Inspect", icon: InspectIcon },
    ]
  },
  {
    label: "AGENT",
    items: [
      // { id: "agents", label: "Agents", icon: CircleDot },
      //   { id: "tools", label: "Tools", icon: Wrench },
      //   { id: "context", label: "Context", icon: FileText },
      { id: "memory", label: "Memory", icon: Database },
    ]
  },
  /* {
     label: "ENVIRONMENT",
     items: [
       { id: "apis", label: "APIs", icon: Globe },
      // { id: "email", label: "Email", icon: Mail },
      // { id: "oauth", label: "OAuth", icon: Key },
      // { id: "webhooks", label: "Webhooks", icon: Zap },
     ]
   },*/
  {
    label: "OBSERVABILITY",
    items: [
      { id: "traces", label: "Traces", icon: Activity },
      { id: "events", label: "Events", icon: List },
    ]
  }
];

const miscItems: NavItemData[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "docs", label: "Docs", icon: HelpCircle },
];

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onToggleAssistant: () => void;
  isAssistantOpen: boolean;
}

function NavItem({ icon: Icon, label, active = false, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative hover:cursor-pointer flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors ${active
        ? "bg-white/[0.07] text-white font-medium"
        : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
        }`}
    >
      {active && (
        <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-blue-500" />
      )}
      <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ currentPage, onNavigate, onToggleAssistant, isAssistantOpen }: SidebarProps) {
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-black/30 select-none">
      <div className="flex items-center justify-between px-4 pb-6 pt-5">
        <div className="flex items-center gap-2">
          <img src="/jetic.png" alt="jetic" className="h-6 w-6" />
          <span className="text-[15px]  tracking-wide text-white">Jetic<span className='ml-1  text-blue-300 animate-pulse'>Studio</span> </span>
        </div>
        <div className="flex  items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
          v1.0.0
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-6">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <span className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-zinc-500">{group.label}</span>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={currentPage === item.id}
                    onClick={() => onNavigate(item.id as PageId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-3 my-3 border-t border-white/10" />

      <div className="flex flex-col gap-0.5 px-3">
        <button
          type="button"
          onClick={onToggleAssistant}
          className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors ${isAssistantOpen
            ? "bg-blue-500/10 text-blue-400"
            : "text-zinc-300 hover:bg-white/[0.05]"
            }`}
        >
          <Sparkles className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
          <span>Jetic Assistant</span>
        </button>
      </div>

      <div className="mx-3 my-3 border-t border-white/10" />

      <div className="flex flex-col gap-0.5 px-3 pb-4">
        {miscItems.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={currentPage === item.id}
            onClick={() => onNavigate(item.id as PageId)}
          />
        ))}
      </div>
    </div>
  );
}
