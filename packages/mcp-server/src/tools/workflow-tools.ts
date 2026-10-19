import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { loadModel, projectRootOfModel } from '../types';
import { listWorkflowFiles, loadWorkflowByName, readWorkflowDefinitionFile } from '@jetic/model';
import { WorkflowSimulator, WorkflowDef } from '@jetic/simulator';
import {
  compactSimulationResult,
  deriveRunStatus,
  newRunId,
  statsFromSteps,
  stepToProgress,
  updateRunStatus,
  writeRunError,
  writeRunningStatus,
  writeSimulationRun,
} from '../run-store';

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

  // 1. Check .jetic/workflows/*.json|*.yaml|*.yml
  if (fs.existsSync(workflowsDir)) {
    const files = listWorkflowFiles(workflowsDir);
    for (const file of files) {
      const slug = file.replace(/\.(json|ya?ml)$/, '');
      const wfPath = path.join(workflowsDir, file);
      try {
        const data: WorkflowDef = readWorkflowDefinitionFile(wfPath);
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
  includeStepResults: z
    .boolean()
    .optional()
    .default(false)
    .describe('Return every step\'s full request/response detail (large payload). Default false returns a compact per-step summary plus a runId — use jetic_get_run for full detail.'),
  async: z
    .boolean()
    .optional()
    .default(false)
    .describe('Start the run in the background and return immediately with a runId. Poll it with jetic_get_run or jetic_list_runs.'),
  preflight: z
    .enum(['abort', 'warn', 'off'])
    .optional()
    .default('abort')
    .describe('Probe the target baseUrl before step 1. "abort" (default) fails fast when the server is unreachable; "warn" records the probe and continues; "off" skips it.'),
  strictTemplates: z
    .boolean()
    .optional()
    .default(true)
    .describe('Fail a step before sending when a {{template}} or :path param has no value (default true). Set false to restore legacy empty-string behaviour.'),
  requestTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(120000)
    .optional()
    .default(30000)
    .describe('Per-request timeout in ms (default 30000, max 120000).'),
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
          const fileWf: WorkflowDef = readWorkflowDefinitionFile(args.workflow);
          if (!Array.isArray((fileWf as any).steps)) {
            throw new Error(`Workflow file at ${args.workflow} is invalid: missing "steps" array.`);
          }
          selectedItem = {
            id: path.basename(args.workflow).replace(/\.(json|ya?ml)$/, ''),
            name: fileWf.name || path.basename(args.workflow).replace(/\.(json|ya?ml)$/, ''),
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
      workflowDef = readWorkflowDefinitionFile(selectedItem.filePath);
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
  // Memory and switch targets belong to the project being served, which is not necessarily the
  // server's working directory (e.g. `jetic mcp --project X`).
  const projectRoot = projectRootOfModel(filePath);
  const jeticDir = path.dirname(filePath);
  const workflowsDir = path.join(jeticDir, 'workflows');
  const simulator = new WorkflowSimulator(model, effectiveEnv, { projectRoot });

  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const plannedSteps = workflowDef.steps.map((s) => ({
    name: s.name || `${s.method} ${s.path}`,
    method: s.method,
    path: s.path,
  }));
  const runMeta = {
    workflowName: workflowDef.name || selectedItem.name,
    environment: effectiveEnv.name,
    baseUrl: effectiveEnv.baseUrl,
    startedAt,
    steps: plannedSteps,
  };

  const execute = async () => {
    const result = await simulator.simulateWorkflow(workflowDef, {
      clearMemory: args.clearMemory ?? false,
      loadWorkflow: (slugOrName) => loadWorkflowByName<WorkflowDef>(workflowsDir, slugOrName),
      strictTemplates: args.strictTemplates ?? true,
      preflight: args.preflight ?? 'abort',
      requestTimeoutMs: args.requestTimeoutMs ?? 30000,
      // Persist per-step progress so jetic_get_run can be polled while the run is in flight.
      onStepResult: (step) => {
        updateRunStatus(jeticDir, runId, (doc) => {
          if (!doc.steps) doc.steps = [];
          const progress = stepToProgress(step);
          const at = doc.steps.findIndex((s) => s.index === step.stepIndex && s.name === step.name);
          if (at >= 0) doc.steps[at] = progress;
          else doc.steps.push(progress);
          doc.stats = statsFromSteps(doc.steps);
        });
      },
    });
    const finishedAt = new Date().toISOString();
    const { reportPath } = writeSimulationRun(jeticDir, runId, result, {
      startedAt,
      finishedAt,
      workflowFile: selectedItem!.filePath,
    });
    return { result, reportPath };
  };

  // 5. Async mode: persist a "running" marker, hand the runId back immediately,
  //    and record the outcome when the background run finishes.
  if (args.async) {
    writeRunningStatus(jeticDir, runId, runMeta);
    execute()
      .then(() => undefined)
      .catch((err) => {
        try {
          writeRunError(jeticDir, runId, err, runMeta);
        } catch {
          // Status file is best-effort — never surface an unhandled rejection.
        }
      });
    return {
      status: 'running',
      runId,
      workflowName: runMeta.workflowName,
      environment: { name: effectiveEnv.name, baseUrl: effectiveEnv.baseUrl },
      message: `Run started in the background against ${effectiveEnv.baseUrl}. Poll with jetic_get_run { "runId": "${runId}" } or jetic_list_runs.`,
    };
  }

  const { result, reportPath } = await execute();

  // 6. Compact by default (one line per step); full bodies only on request.
  if (args.includeStepResults) {
    return {
      runId,
      status: deriveRunStatus(result),
      reportPath,
      filePath,
      workflowFile: selectedItem.filePath,
      ...result,
    };
  }
  return {
    ...compactSimulationResult(result, runId, reportPath),
    filePath,
    workflowFile: selectedItem.filePath,
  };
}
