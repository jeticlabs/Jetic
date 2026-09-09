import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { loadModel } from '../types';
import { WorkflowSimulator, WorkflowDef } from '@jetic/simulator';

export const listWorkflowsSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
});

export interface WorkflowSummaryItem {
  id: string;
  name: string;
  description?: string;
  source: 'workflows_dir' | 'legacy_file' | 'model_json';
  filePath?: string;
  stepsCount: number;
  steps: Array<{ name: string; method: string; path: string }>;
}

export function handleListWorkflows(args: z.infer<typeof listWorkflowsSchema>) {
  const { model, filePath } = loadModel(args.projectPath);
  const jeticDir = path.dirname(filePath);
  const workflowsDir = path.join(jeticDir, 'workflows');

  const workflows: WorkflowSummaryItem[] = [];

  // 1. Check .jetic/workflows/*.json
  if (fs.existsSync(workflowsDir)) {
    const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const slug = file.replace(/\.json$/, '');
      const wfPath = path.join(workflowsDir, file);
      try {
        const data: WorkflowDef = JSON.parse(fs.readFileSync(wfPath, 'utf-8'));
        workflows.push({
          id: slug,
          name: data.name || slug,
          description: data.description,
          source: 'workflows_dir',
          filePath: wfPath,
          stepsCount: data.steps?.length || 0,
          steps: (data.steps || []).map((s) => ({
            name: s.name || `${s.method} ${s.path}`,
            method: s.method,
            path: s.path,
          })),
        });
      } catch (err: any) {
        // Skip unparseable files
      }
    }
  }

  // 2. Check legacy .jetic/workflow.json
  const legacyPath = path.join(jeticDir, 'workflow.json');
  if (fs.existsSync(legacyPath)) {
    try {
      const data: WorkflowDef = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
      workflows.push({
        id: 'workflow',
        name: data.name || 'Default Workflow',
        description: data.description,
        source: 'legacy_file',
        filePath: legacyPath,
        stepsCount: data.steps?.length || 0,
        steps: (data.steps || []).map((s) => ({
          name: s.name || `${s.method} ${s.path}`,
          method: s.method,
          path: s.path,
        })),
      });
    } catch {
      // Skip invalid legacy file
    }
  }

  // 3. Check workflows embedded in model.json
  if (model.workflows && model.workflows.length > 0) {
    for (let i = 0; i < model.workflows.length; i++) {
      const wf = model.workflows[i];
      const id = wf.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      workflows.push({
        id: `model:${id}`,
        name: wf.name,
        description: wf.description,
        source: 'model_json',
        filePath,
        stepsCount: wf.steps?.length || 0,
        steps: (wf.steps || []).map((s: any) => {
          let method = 'GET';
          let reqPath = s.call || '/';
          if (s.call && s.call.includes(' ')) {
            const parts = s.call.split(' ');
            method = parts[0];
            reqPath = parts[1];
          }
          return {
            name: s.description || `${method} ${reqPath}`,
            method,
            path: reqPath,
          };
        }),
      });
    }
  }

  return {
    filePath,
    totalCount: workflows.length,
    workflows,
  };
}

export const simulateWorkflowSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  workflow: z.string().optional().describe('Workflow slug, name, or JSON file path to execute. If omitted, defaults to available workflow'),
  envName: z.string().optional().describe('Target environment name (e.g., local, staging)'),
  baseUrl: z.string().optional().describe('Override target base URL (e.g. http://localhost:3000)'),
  clearMemory: z.boolean().optional().default(false).describe('If true, clears Jetic memory before execution'),
});

export async function handleSimulateWorkflow(args: z.infer<typeof simulateWorkflowSchema>) {
  const { model, filePath } = loadModel(args.projectPath);

  // 1. Find target workflow
  const availableWorkflows = handleListWorkflows({ projectPath: args.projectPath });

  if (availableWorkflows.workflows.length === 0) {
    throw new Error('No workflows found in workspace. Create a workflow file in .jetic/workflows/ or .jetic/model.json.');
  }

  let selectedItem: WorkflowSummaryItem | undefined;

  if (args.workflow) {
    const search = args.workflow.toLowerCase();
    selectedItem = availableWorkflows.workflows.find(
      (w) =>
        w.id.toLowerCase() === search ||
        w.name.toLowerCase() === search ||
        (w.filePath && path.resolve(w.filePath).toLowerCase() === path.resolve(args.workflow!).toLowerCase())
    );
    if (!selectedItem) {
      if (fs.existsSync(args.workflow)) {
        try {
          const fileWf: WorkflowDef = JSON.parse(fs.readFileSync(args.workflow, 'utf-8'));
          if (!Array.isArray((fileWf as any).steps)) {
            throw new Error(`Workflow file at ${args.workflow} is invalid: missing "steps" array.`);
          }
          selectedItem = {
            id: path.basename(args.workflow, '.json'),
            name: fileWf.name || path.basename(args.workflow, '.json'),
            description: fileWf.description,
            source: 'workflows_dir',
            filePath: path.resolve(args.workflow),
            stepsCount: fileWf.steps?.length || 0,
            steps: (fileWf.steps || []).map((s) => ({ name: s.name || `${s.method} ${s.path}`, method: s.method, path: s.path })),
          };
        } catch (err: any) {
          throw new Error(`Failed to parse workflow file at ${args.workflow}: ${err.message}`);
        }
      }
    }
  } else {
    selectedItem = availableWorkflows.workflows[0];
  }

  if (!selectedItem) {
    throw new Error(
      `Workflow "${args.workflow}" not found. Available workflows: ${availableWorkflows.workflows.map((w) => w.id).join(', ')}`
    );
  }

  // 2. Load complete workflow definition
  let workflowDef: WorkflowDef;
  if (selectedItem.source === 'model_json') {
    const rawWf = model.workflows!.find((w) => w.name === selectedItem!.name);
    if (!rawWf) {
      throw new Error(`Workflow "${selectedItem.name}" disappeared from model.json between listing and execution.`);
    }
    workflowDef = {
      name: rawWf.name,
      description: rawWf.description,
      steps: rawWf.steps.map((s: any) => {
        let method = 'GET';
        let reqPath = s.call || '/';
        if (s.call && s.call.includes(' ')) {
          const parts = s.call.split(' ');
          method = parts[0];
          reqPath = parts[1];
        }
        return {
          name: s.description || `${method} ${reqPath}`,
          method,
          path: reqPath,
          body: s.body,
          expectStatus: s.expectStatus,
        };
      }),
    };
  } else {
    if (!selectedItem.filePath) {
      throw new Error(`Workflow "${selectedItem.name}" has no backing file to load.`);
    }
    try {
      workflowDef = JSON.parse(fs.readFileSync(selectedItem.filePath, 'utf-8'));
    } catch (err: any) {
      throw new Error(`Failed to load workflow file at ${selectedItem.filePath}: ${err?.message || err}`);
    }
    if (!Array.isArray((workflowDef as any).steps)) {
      throw new Error(`Workflow file at ${selectedItem.filePath} is invalid: missing "steps" array.`);
    }
  }

  // 3. Resolve Environment Base URL
  let targetEnv = model.environments?.find((e) => e.name === args.envName);
  if (!targetEnv) {
    targetEnv = model.environments?.[0] || { name: 'local', baseUrl: 'http://localhost:3000' };
  }

  const effectiveEnv = {
    ...targetEnv,
    baseUrl: args.baseUrl || targetEnv.baseUrl,
  };

  // 4. Delegate workflow simulation directly to WorkflowSimulator from @jetic/simulator
  const simulator = new WorkflowSimulator(model, effectiveEnv);
  const result = await simulator.simulateWorkflow(workflowDef, { clearMemory: args.clearMemory ?? false });

  return {
    ...result,
    filePath,
    workflowFile: selectedItem.filePath,
  };
}
