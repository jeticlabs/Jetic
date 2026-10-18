import { useState, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
//import { Topbar } from "./components/layout/Topbar";
import { AssistantPanel } from "./components/layout/AssistantPanel";
import { ChangesNotification } from "./components/layout/ChangesNotification";
import { type PageId } from "./types";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { JeticAnimatedIcon } from "./components/jetic-animated-icon";

// Workspace
import { Overview } from "./pages/Workspace/Overview";
import { Simulations } from "./pages/Workspace/Simulations";
import { Model } from "./pages/Workspace/Model";
import { Inspect } from "./pages/Workspace/Inspect";

// Agent
import { Agents } from "./pages/Agent/Agents";
import { Tools } from "./pages/Agent/Tools";
import { Context } from "./pages/Agent/Context";
import { Memory } from "./pages/Agent/Memory";

// Environment
import { APIs } from "./pages/Environment/APIs";
import { Email } from "./pages/Environment/Email";
import { OAuth } from "./pages/Environment/OAuth";
import { Webhooks } from "./pages/Environment/Webhooks";

// Observability
import { Traces } from "./pages/Observability/Traces";
import { Events } from "./pages/Observability/Events";
import { Changes } from "./pages/Observability/Changes";

// Misc
import { Settings } from "./pages/Misc/Settings";
import { Docs } from "./pages/Misc/Docs";

// ─── Endpoint type (shared) ───────────────────────────────────────────────────

export interface EndpointForInspect {
  id: string;
  method: string;
  path: string;
  handlerName?: string;
  source?: { file: string; line: number };
  requestBody?: { contentType?: string; fields?: Record<string, { type: string; required?: boolean; format?: string }> };
  responses?: Record<string, { schema?: Record<string, string> }>;
  middleware?: { name: string }[];
  security?: { scheme: string }[];
}

const VALID_PAGES: PageId[] = [
  "overview", "simulations", "model", "inspect",
  "agents", "tools", "context", "memory",
  "apis", "email", "oauth", "webhooks",
  "traces", "events", "changes", "settings", "docs"
];

const LOADER_MS = 5000;

/** Boot splash shown while Jetic Local Studio warms up. */
function LoadingScreen() {
  const { theme } = useTheme();
  return (
    <div className="jetic-surface flex h-screen w-full flex-col items-center justify-center gap-7">
      <JeticAnimatedIcon
        size={56}
        loop
        sheen={theme === "dark" ? "#000" : "#fff"}
        className="theme-text-primary"
      />
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[13.5px] font-medium tracking-tight theme-text-primary">
          Jetic Local Studio is loading…
        </span>
        <span className="text-[11px] theme-text-muted">Preparing your workspace</span>
      </div>
      <div className="h-[3px] w-40 overflow-hidden rounded-full theme-bg-overlay">
        <div className="jetic-loader-bar h-full w-full origin-left rounded-full theme-bg-brand" />
      </div>
    </div>
  );
}

function AppInner() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<PageId>(() => {
    const saved = localStorage.getItem("active_sidebar_item") as PageId;
    return VALID_PAGES.includes(saved) ? saved : "overview";
  });
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [inspectedEndpoint, setInspectedEndpoint] = useState<EndpointForInspect | null>(() => {
    try {
      const saved = localStorage.getItem("inspected_endpoint");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Trace filter context: when navigating to Traces from Simulations/Model
  const [traceFilter, setTraceFilter] = useState<{ workflowName?: string; endpointPath?: string; traceId?: string } | undefined>(undefined);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), LOADER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("active_sidebar_item", currentPage);
  }, [currentPage]);

  useEffect(() => {
    if (inspectedEndpoint) {
      localStorage.setItem("inspected_endpoint", JSON.stringify(inspectedEndpoint));
    } else {
      localStorage.removeItem("inspected_endpoint");
    }
  }, [inspectedEndpoint]);

  const navigateTo = (page: PageId) => {
    if (page !== "inspect") setInspectedEndpoint(null);
    if (page !== "traces") setTraceFilter(undefined);
    setCurrentPage(page);
  };

  const handleInspect = (ep: EndpointForInspect) => {
    setInspectedEndpoint(ep);
    setCurrentPage("inspect");
  };

  /** Navigate to Traces page with an optional filter (workflow name or endpoint path) */
  const navigateToTraces = (filter?: { workflowName?: string; endpointPath?: string; traceId?: string }) => {
    setTraceFilter(filter);
    setCurrentPage('traces');
  };

  const renderPage = () => {
    switch (currentPage) {
      // Workspace
      case "overview": return <Overview onNavigate={navigateTo as any} />;
      case "simulations": return <Simulations onViewTraces={navigateToTraces} />;
      case "model": return <Model onInspect={handleInspect} onViewTraces={navigateToTraces} />;
      case "inspect": return <Inspect endpoint={inspectedEndpoint} onBack={() => navigateTo("model")} />;

      // Agent
      case "agents": return <Agents />;
      case "tools": return <Tools />;
      case "context": return <Context />;
      case "memory": return <Memory />;

      // Environment
      case "apis": return <APIs />;
      case "email": return <Email />;
      case "oauth": return <OAuth />;
      case "webhooks": return <Webhooks />;

      // Observability
      case "traces": return <Traces initialFilter={traceFilter} onNavigate={navigateTo} />;
      case "events": return <Events />;
      case "changes": return <Changes onNavigate={navigateTo as any} />;


      // Misc
      case "settings": return <Settings />;
      case "docs": return <Docs />;

      default: return <Overview />;
    }
  };

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="flex h-screen w-full overflow-hidden antialiased [font-feature-settings:'ss01'] font-sans text-xs transition-colors duration-300 theme-bg-base theme-text">
      <Sidebar
        currentPage={currentPage}
        onNavigate={navigateTo}
        onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
        isAssistantOpen={isAssistantOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col relative">

        <div className="flex min-h-0 flex-1 overflow-auto transition-colors duration-300 theme-bg-base">
          {renderPage()}
        </div>

        <AssistantPanel
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
        />

        <ChangesNotification onNavigateToChanges={() => navigateTo("changes")} />
      </div>
    </div>
  );
}

export const App = () => (
  <ThemeProvider>
    <AppInner />
  </ThemeProvider>
);