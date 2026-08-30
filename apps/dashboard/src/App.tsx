import { useState, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
//import { Topbar } from "./components/layout/Topbar";
import { AssistantPanel } from "./components/layout/AssistantPanel";
import { type PageId } from "./types";
import { ThemeProvider } from "./context/ThemeContext";

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
  "traces", "events", "settings", "docs"
];

function AppInner() {
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

      // Misc
      case "settings": return <Settings />;
      case "docs": return <Docs />;

      default: return <Overview />;
    }
  };

  return (
    <div
      className="flex h-screen w-full overflow-hidden antialiased [font-feature-settings:'ss01'] font-sans text-xs transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}
    >
      <Sidebar
        currentPage={currentPage}
        onNavigate={navigateTo}
        onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
        isAssistantOpen={isAssistantOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col relative">

        <div
          className="flex min-h-0 flex-1 overflow-auto transition-colors duration-300"
          style={{ backgroundColor: 'var(--bg-base)' }}
        >
          {renderPage()}
        </div>

        <AssistantPanel
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
        />
      </div>
    </div>
  );
}

export const App = () => (
  <ThemeProvider>
    <AppInner />
  </ThemeProvider>
);