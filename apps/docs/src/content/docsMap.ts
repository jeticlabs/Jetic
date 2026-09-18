// Import all markdown documentation files using Vite raw text imports
import introductionMd from './getting-started/introduction.md?raw';
import quickstartMd from './getting-started/quickstart.md?raw';
import cliReferenceMd from './getting-started/cli-reference.md?raw';

import behavioralModelMd from './core-concepts/behavioral-model.md?raw';
import endpointDeepDiveMd from './core-concepts/endpoint-deep-dive.md?raw';
import workflowSpecMd from './core-concepts/workflow-spec.md?raw';
import memoryStoreMd from './core-concepts/memory-store.md?raw';
import fileChangesWatcherMd from './core-concepts/file-changes-watcher.md?raw';
import simulatorEngineMd from './core-concepts/simulator-engine.md?raw';
import scannerEngineMd from './core-concepts/scanner-engine.md?raw';
import stateMachinesMd from './core-concepts/state-machines.md?raw';

import mcpServerMd from './integrations/mcp-server.md?raw';
import dashboardMd from './integrations/dashboard.md?raw';
import dashboardPagesMd from './integrations/dashboard-pages.md?raw';
import deploymentMd from './integrations/deployment.md?raw';

import workflowTutorialMd from './tutorials/workflow-tutorial.md?raw';
import aiPromptsGuideMd from './tutorials/ai-prompts-guide.md?raw';
import humanWorkflowsMd from './tutorials/human-workflows.md?raw';
import negativeTestingMd from './tutorials/negative-testing.md?raw';
import migrationGuideMd from './tutorials/migration-guide.md?raw';

// Architecture
import archOverviewMd from './architecture/overview.md?raw';
import archTechStackMd from './architecture/tech-stack.md?raw';
import archDataFlowMd from './architecture/data-flow.md?raw';

// Reference
import refCliCommandsMd from './reference/cli-commands.md?raw';
import refMcpToolsMd from './reference/mcp-tools.md?raw';
import refSchemasMd from './reference/artifact-schemas.md?raw';
import refTroubleshootingMd from './reference/troubleshooting.md?raw';
import refContributingMd from './reference/contributing.md?raw';

export interface DocItem {
  id: string;
  title: string;
  category: 'Getting Started' | 'Architecture' | 'Core Concepts' | 'Integrations' | 'Tutorials' | 'Reference';
  description: string;
  content: string;
  iconName: string;
}

export const DOCS_REGISTRY: DocItem[] = [
  // Getting Started
  {
    id: 'introduction',
    title: 'Introduction',
    category: 'Getting Started',
    description: 'What is Jetic? Core philosophy, architecture, and features.',
    content: introductionMd,
    iconName: 'Sparkles',
  },
  {
    id: 'quickstart',
    title: 'Quickstart Guide',
    category: 'Getting Started',
    description: 'Get up and running with Jetic in under 2 minutes.',
    content: quickstartMd,
    iconName: 'Zap',
  },
  {
    id: 'cli-reference',
    title: 'CLI Command Reference',
    category: 'Getting Started',
    description: 'Complete reference for jetic CLI commands and options.',
    content: cliReferenceMd,
    iconName: 'Terminal',
  },

  // Architecture
  {
    id: 'arch-overview',
    title: 'Monorepo Architecture',
    category: 'Architecture',
    description: 'pnpm workspaces, dependency graph, and build pipeline.',
    content: archOverviewMd,
    iconName: 'Boxes',
  },
  {
    id: 'arch-tech-stack',
    title: 'Tech Stack',
    category: 'Architecture',
    description: 'Runtime, libraries, frontend, and tooling versions.',
    content: archTechStackMd,
    iconName: 'Layers',
  },
  {
    id: 'arch-data-flow',
    title: 'Data Flow',
    category: 'Architecture',
    description: 'Code → Model → Workflow → Memory → Trace pipeline.',
    content: archDataFlowMd,
    iconName: 'Route',
  },

  // Core Concepts
  {
    id: 'behavioral-model',
    title: 'Behavioral Model (model.json)',
    category: 'Core Concepts',
    description: 'Schema specification and AST resolution engine.',
    content: behavioralModelMd,
    iconName: 'Brain',
  },
  {
    id: 'endpoint-deep-dive',
    title: 'Endpoint Deep Dive',
    category: 'Core Concepts',
    description: 'Every field of Endpoint — middleware, security, pagination, ownership.',
    content: endpointDeepDiveMd,
    iconName: 'FileSearch',
  },
  {
    id: 'workflow-spec',
    title: 'Stateful Workflows',
    category: 'Core Concepts',
    description: 'Multi-step workflow format, capture directives, and faker data.',
    content: workflowSpecMd,
    iconName: 'GitBranch',
  },
  {
    id: 'memory-store',
    title: 'Scoped Runtime Memory',
    category: 'Core Concepts',
    description: 'Key-value state storage, scopes, and string interpolation syntax.',
    content: memoryStoreMd,
    iconName: 'Database',
  },
  {
    id: 'file-changes-watcher',
    title: 'File Changes Watcher',
    category: 'Core Concepts',
    description: 'Zero-dependency SSE file watcher and delta AI re-indexing.',
    content: fileChangesWatcherMd,
    iconName: 'RefreshCw',
  },
  {
    id: 'simulator-engine',
    title: 'Simulator Engine',
    category: 'Core Concepts',
    description: 'DataGenerator, ResponseValidator, WorkflowSimulator execution.',
    content: simulatorEngineMd,
    iconName: 'Cog',
  },
  {
    id: 'scanner-engine',
    title: 'Scanner Engine',
    category: 'Core Concepts',
    description: '4-phase ts-morph AST pipeline — discovery to normalization.',
    content: scannerEngineMd,
    iconName: 'SearchCode',
  },
  {
    id: 'state-machines',
    title: 'State Machines & Dependencies',
    category: 'Core Concepts',
    description: 'Resource lifecycles and inter-endpoint data flow.',
    content: stateMachinesMd,
    iconName: 'Network',
  },

  // Integrations
  {
    id: 'mcp-server',
    title: 'MCP Server (jetic mcp)',
    category: 'Integrations',
    description: 'Model Context Protocol server and 20 tools for AI IDEs.',
    content: mcpServerMd,
    iconName: 'Bot',
  },
  {
    id: 'dashboard',
    title: 'Jetic Studio Dashboard',
    category: 'Integrations',
    description: 'Local web IDE, REST client, AI builder, and ReactFlow traces.',
    content: dashboardMd,
    iconName: 'LayoutDashboard',
  },
  {
    id: 'dashboard-pages',
    title: 'Dashboard Pages',
    category: 'Integrations',
    description: 'Deep dive into all 7 Studio pages with screenshots.',
    content: dashboardPagesMd,
    iconName: 'PanelsTopLeft',
  },
  {
    id: 'deployment',
    title: 'Deployment & Environments',
    category: 'Integrations',
    description: 'NPM publishing, global install, and environment management.',
    content: deploymentMd,
    iconName: 'Rocket',
  },

  // Tutorials
  {
    id: 'workflow-tutorial',
    title: 'Multi-Step Workflow Tutorial',
    category: 'Tutorials',
    description: 'Step-by-step masterclass on synthesizing API integration tests.',
    content: workflowTutorialMd,
    iconName: 'GraduationCap',
  },
  {
    id: 'ai-prompts-guide',
    title: 'AI Prompts Cookbook',
    category: 'Tutorials',
    description: 'Copy-paste prompt recipes for AI code assistants.',
    content: aiPromptsGuideMd,
    iconName: 'MessageSquareCode',
  },
  {
    id: 'human-workflows',
    title: 'Human-in-the-Loop Workflows',
    category: 'Tutorials',
    description: 'OTP and secrets via {{human:key}} — CLI prompts and dashboard dialogs.',
    content: humanWorkflowsMd,
    iconName: 'UserCheck',
  },
  {
    id: 'negative-testing',
    title: 'Negative & Conditional Testing',
    category: 'Tutorials',
    description: 'expectStatus, 14 operators, abort/continue/switch branching.',
    content: negativeTestingMd,
    iconName: 'ShieldAlert',
  },
  {
    id: 'migration-guide',
    title: 'Migration Guide',
    category: 'Tutorials',
    description: 'Adding Jetic to any stack — Express scan vs MCP manual modeling.',
    content: migrationGuideMd,
    iconName: 'Footprints',
  },

  // Reference
  {
    id: 'ref-cli-commands',
    title: 'CLI Commands Deep Dive',
    category: 'Reference',
    description: 'Per-command implementation — dev.ts SSE, scan.ts phases, mcp.ts transport.',
    content: refCliCommandsMd,
    iconName: 'Command',
  },
  {
    id: 'ref-mcp-tools',
    title: 'MCP Tools Reference',
    category: 'Reference',
    description: 'Full 18-tool catalog with zod schemas and structured order.',
    content: refMcpToolsMd,
    iconName: 'Wrench',
  },
  {
    id: 'ref-schemas',
    title: 'Artifact Schemas',
    category: 'Reference',
    description: '.jetic/model.json, workflows, memory.json, changes.json, traces.',
    content: refSchemasMd,
    iconName: 'FileJson',
  },
  {
    id: 'ref-troubleshooting',
    title: 'Troubleshooting & FAQ',
    category: 'Reference',
    description: 'Stale UI, 0 endpoints, AI failures — exact error strings and fixes.',
    content: refTroubleshootingMd,
    iconName: 'LifeBuoy',
  },
  {
    id: 'ref-contributing',
    title: 'Contributing & Development',
    category: 'Reference',
    description: 'Local setup, conventions, and release process.',
    content: refContributingMd,
    iconName: 'HeartHandshake',
  },
];

export const CATEGORIES = [
  'Getting Started',
  'Architecture',
  'Core Concepts',
  'Integrations',
  'Tutorials',
  'Reference',
] as const;
