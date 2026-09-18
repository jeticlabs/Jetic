// Import all markdown documentation files using Vite raw text imports
import introductionMd from './getting-started/introduction.md?raw';
import quickstartMd from './getting-started/quickstart.md?raw';
import cliReferenceMd from './getting-started/cli-reference.md?raw';

import behavioralModelMd from './core-concepts/behavioral-model.md?raw';
import workflowSpecMd from './core-concepts/workflow-spec.md?raw';
import memoryStoreMd from './core-concepts/memory-store.md?raw';
import fileChangesWatcherMd from './core-concepts/file-changes-watcher.md?raw';

import mcpServerMd from './integrations/mcp-server.md?raw';
import dashboardMd from './integrations/dashboard.md?raw';

import workflowTutorialMd from './tutorials/workflow-tutorial.md?raw';
import aiPromptsGuideMd from './tutorials/ai-prompts-guide.md?raw';

export interface DocItem {
  id: string;
  title: string;
  category: 'Getting Started' | 'Core Concepts' | 'Integrations' | 'Tutorials';
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
];

export const CATEGORIES = [
  'Getting Started',
  'Core Concepts',
  'Integrations',
  'Tutorials',
] as const;
