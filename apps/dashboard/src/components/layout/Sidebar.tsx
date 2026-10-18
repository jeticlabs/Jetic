import {
  LayoutGrid, Diamond,
  Database,
  Activity,
  Sparkles,
  InspectIcon,
  Layers2,
  Sun,
  Moon,
  GitCommitHorizontal,

} from 'lucide-react';
import { type PageId, type NavItemData } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { JeticIcon } from '../jetic-icon';

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
      { id: "changes", label: "Files changes", icon: GitCommitHorizontal },
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

const itemBase =
  "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors hover:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]";

const itemActive = "theme-bg-brand text-[color:var(--brand-foreground)] shadow-sm";
const itemIdle = "theme-text hover:theme-bg-overlay-md hover:theme-text-primary";

function NavItem({ icon: Icon, label, active = false, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`${itemBase} ${active ? itemActive : itemIdle}`}
    >
      <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ currentPage, onNavigate, onToggleAssistant, isAssistantOpen }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex w-60 shrink-0 flex-col select-none transition-colors duration-300 border-r theme-border theme-sidebar">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 pb-6 pt-5">
        <div className="flex items-center gap-2">
          <JeticIcon size={12} className="theme-text-primary" />
          <span className="text-[15px] font-semibold tracking-wide theme-text-primary">
            Jetic<span className="ml-1 theme-text-brand">Studio</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border theme-border theme-bg-overlay px-2 py-0.5 text-[11px] font-medium theme-text-muted">
          <span className="h-1.5 w-1.5 rounded-full theme-bg-brand" />
          v0.2.6
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-6">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <span className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider theme-text-muted">
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

      <div className="mx-3 my-3 hidden border-t theme-border" />

      {/* Jetic Assistant */}
      <div className="flex flex-col gap-0.5 px-3">
        <button
          type="button"
          onClick={onToggleAssistant}
          aria-pressed={isAssistantOpen}
          className={`hidden ${itemBase} ${isAssistantOpen ? itemActive : itemIdle}`}
        >
          <Sparkles className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
          <span>Jetic Assistant</span>
        </button>
      </div>

      <div className="mx-3 my-3 hidden border-t theme-border" />

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
        <div className="flex items-center gap-1 rounded-xl p-1 border theme-border theme-bg-overlay">
          {/* Dark button */}
          <button
            type="button"
            onClick={() => theme !== 'dark' && toggleTheme()}
            title="Dark mode"
            aria-pressed={theme === 'dark'}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors hover:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] ${theme === 'dark'
              ? 'theme-bg-brand text-[color:var(--brand-foreground)] shadow-sm'
              : 'theme-text-muted hover:theme-text'
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
            aria-pressed={theme === 'light'}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors hover:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] ${theme === 'light'
              ? 'theme-bg-brand text-[color:var(--brand-foreground)] shadow-sm'
              : 'theme-text-muted hover:theme-text'
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
