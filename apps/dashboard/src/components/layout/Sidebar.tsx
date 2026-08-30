import {
  LayoutGrid, Diamond,
  Database,
  Activity,
  Sparkles,
  InspectIcon,
  Layers2,
  Sun,
  Moon,

} from 'lucide-react';
import { type PageId, type NavItemData } from '../../types';
import { useTheme } from '../../context/ThemeContext';

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
      { id: "memory", label: "Memory & Environment", icon: Database },
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
      // { id: "events", label: "Events", icon: List },
    ]
  }
];

const miscItems: NavItemData[] = [
  //{ id: "settings", label: "Settings", icon: Settings },
  //  { id: "docs", label: "Docs", icon: HelpCircle },
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
        ? "bg-[var(--bg-overlay-md)] text-[var(--text-primary)] font-medium"
        : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-secondary)]"
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
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className="flex w-60 shrink-0 flex-col select-none transition-colors duration-300"
      style={{
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--sidebar-bg)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 pb-6 pt-5">
        <div className="flex items-center gap-2">
          {theme === 'dark' ? <img src="/jetic.png" alt="jetic" className="h-6 w-6" /> :
            <img src="/jetic_light.png" alt="jetic" className="h-5 w-5" />
          }

          <span
            className="text-[15px] tracking-wide"
            style={{ color: 'var(--text-primary)' }}
          >
            Jetic<span className="ml-1 text-blue-400 animate-pulse">Studio</span>
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-overlay)',
            color: 'var(--text-muted)',
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          v0.1.4
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-6">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <span
                className="px-3 pb-1 text-[11px] font-semibold tracking-wider"
                style={{ color: 'var(--text-faint)' }}
              >
                {group.label}
              </span>
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

      <div className="mx-3 my-3 hidden " style={{ borderTop: '1px solid var(--border)' }} />

      {/* Jetic Assistant */}
      <div className="flex flex-col gap-0.5 px-3">
        <button
          type="button"
          onClick={onToggleAssistant}
          className={`hidden relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors ${isAssistantOpen
            ? "bg-blue-500/10 text-blue-400"
            : "hover:bg-[var(--bg-overlay)]"
            }`}
          style={!isAssistantOpen ? { color: 'var(--text-secondary)' } : undefined}
        >
          <Sparkles className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
          <span>Jetic Assistant</span>
        </button>
      </div>

      <div className="mx-3 my-3 hidden" style={{ borderTop: '1px solid var(--border)' }} />

      {/* Misc nav items */}
      <div className="flex flex-col gap-0.5 px-3">
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



      {/* ── Theme toggle ──────────────────────────────────────────── */}
      <div className="px-3 pb-4 pt-3">
        <div
          className="flex items-center gap-2 rounded-xl p-1"
          style={{
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-overlay)',
          }}
        >
          {/* Dark button */}
          <button
            type="button"
            onClick={() => theme !== 'dark' && toggleTheme()}
            title="Dark mode"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all duration-200 hover:cursor-pointer ${theme === 'dark'
              ? 'bg-[#1e1e2e] text-blue-300 shadow-sm'
              : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'
              }`}
          >
            <Moon className="h-3 w-3 shrink-0" strokeWidth={2} />
            Dark
          </button>

          {/* Light button */}
          <button
            type="button"
            onClick={() => theme !== 'light' && toggleTheme()}
            title="Light mode"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all duration-200 hover:cursor-pointer ${theme === 'light'
              ? 'bg-white text-amber-500 shadow-sm'
              : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'
              }`}
          >
            <Sun className="h-3 w-3 shrink-0" strokeWidth={2} />
            Light
          </button>
        </div>
      </div>
    </div>
  );
}
