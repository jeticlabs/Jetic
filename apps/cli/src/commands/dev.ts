import { Command } from 'commander';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { loadConfig } from '@jetic/core';
import { JeticMemory } from '@jetic/memory';

export const devCommand = new Command('dev')
  .description('Start the Jetic local dashboard')
  .option('-p, --port <number>', 'Port to run the dashboard on', '8787')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const app = express();
    
    app.use(express.json());

    // Allow dashboard dev server to call the API during development
    app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (_req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });

    // ─── Model API ───────────────────────────────────────────────────────
    app.get('/api/model', (_req, res) => {
      const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
      try {
        if (!fs.existsSync(modelPath)) return res.json(null);
        res.json(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.put('/api/model/endpoint/:id', (req, res) => {
      const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
      try {
        if (!fs.existsSync(modelPath)) return res.status(404).json({ error: 'model.json not found' });
        const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        const idx = model.endpoints.findIndex((e: any) => e.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Endpoint not found' });
        model.endpoints[idx] = { ...model.endpoints[idx], ...req.body };
        fs.writeFileSync(modelPath, JSON.stringify(model, null, 2), 'utf8');
        res.json({ ok: true, endpoint: model.endpoints[idx] });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Create a brand-new endpoint
    app.post('/api/model/endpoint', (req, res) => {
      const jeticDir = path.join(process.cwd(), '.jetic');
      const modelPath = path.join(jeticDir, 'model.json');
      try {
        const ep = req.body;
        if (!ep.method || !ep.path) {
          return res.status(400).json({ error: 'method and path are required' });
        }

        // Ensure .jetic dir exists
        if (!fs.existsSync(jeticDir)) fs.mkdirSync(jeticDir, { recursive: true });

        // Load or create model.json
        let model: any;
        if (fs.existsSync(modelPath)) {
          model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        } else {
          model = {
            version: '1',
            generatedAt: new Date().toISOString(),
            project: { name: path.basename(process.cwd()) },
            endpoints: [],
          };
        }

        // Auto-generate id if not provided
        if (!ep.id) {
          const base = `${ep.method.toLowerCase()}-${ep.path.replace(/^\//, '').replace(/[/:{}]/g, '-').replace(/-+/g, '-').replace(/-$/, '')}`;
          let id = base;
          let counter = 2;
          while (model.endpoints.some((e: any) => e.id === id)) {
            id = `${base}-${counter++}`;
          }
          ep.id = id;
        }

        model.endpoints.push(ep);
        model.generatedAt = new Date().toISOString();
        fs.writeFileSync(modelPath, JSON.stringify(model, null, 2), 'utf8');
        res.json({ ok: true, endpoint: ep, model });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/model/scan', async (_req, res) => {
      try {
        const { loadConfig, writeJsonSync, ensureDirSync } = await import('@jetic/core');
        const { ExpressScanner } = await import('@jetic/scanner');
        const config = loadConfig();
        ensureDirSync(config.jeticDir);
        const scanner = new ExpressScanner(config);
        const model = await scanner.scan();
        const modelPath = path.join(config.jeticDir, 'model.json');
        writeJsonSync(modelPath, model);
        res.json({ ok: true, endpointCount: model.endpoints.length, model });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Environments API ────────────────────────────────────────────────

    function readModel(modelPath: string): any | null {
      if (!fs.existsSync(modelPath)) return null;
      return JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    }
    function writeModel(modelPath: string, model: any) {
      fs.writeFileSync(modelPath, JSON.stringify(model, null, 2), 'utf8');
    }

    app.get('/api/model/environments', (req, res) => {
      const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
      const model = readModel(modelPath);
      if (!model) return res.json({ environments: [], defaultEnvironment: null });
      const envs = model.environments ?? [];
      const defaultEnv = model.defaultEnvironment || envs.find((e: any) => e.default)?.name || envs[0]?.name || null;
      res.json({
        environments: envs,
        defaultEnvironment: defaultEnv,
      });
    });

    app.post('/api/model/environments', (req, res) => {
      const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
      const { name, baseUrl } = req.body ?? {};
      if (!name || !baseUrl) return res.status(400).json({ error: 'name and baseUrl are required' });
      const model = readModel(modelPath);
      if (!model) return res.status(404).json({ error: 'model.json not found' });
      if (!model.environments) model.environments = [];
      if (model.environments.find((e: any) => e.name === name))
        return res.status(409).json({ error: `Environment "${name}" already exists` });
      model.environments.push({ name, baseUrl });
      writeModel(modelPath, model);
      const defaultEnv = model.defaultEnvironment || model.environments?.find((e: any) => e.default)?.name || model.environments?.[0]?.name || null;
      res.json({ ok: true, environments: model.environments, defaultEnvironment: defaultEnv });
    });

    app.put('/api/model/environments/:name', (req, res) => {
      const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
      const model = readModel(modelPath);
      if (!model) return res.status(404).json({ error: 'model.json not found' });
      const idx = (model.environments ?? []).findIndex((e: any) => e.name === req.params.name);
      if (idx === -1) return res.status(404).json({ error: 'Environment not found' });
      model.environments[idx] = { ...model.environments[idx], ...req.body };
      writeModel(modelPath, model);
      const defaultEnv = model.defaultEnvironment || model.environments?.find((e: any) => e.default)?.name || model.environments?.[0]?.name || null;
      res.json({ ok: true, environments: model.environments, defaultEnvironment: defaultEnv });
    });

    app.delete('/api/model/environments/:name', (req, res) => {
      const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
      const model = readModel(modelPath);
      if (!model) return res.status(404).json({ error: 'model.json not found' });
      model.environments = (model.environments ?? []).filter((e: any) => e.name !== req.params.name);
      if (model.defaultEnvironment === req.params.name) delete model.defaultEnvironment;
      writeModel(modelPath, model);
      const defaultEnv = model.defaultEnvironment || model.environments?.find((e: any) => e.default)?.name || model.environments?.[0]?.name || null;
      res.json({ ok: true, environments: model.environments, defaultEnvironment: defaultEnv });
    });

    app.put('/api/model/environments/:name/default', (req, res) => {
      const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
      const model = readModel(modelPath);
      if (!model) return res.status(404).json({ error: 'model.json not found' });
      const exists = (model.environments ?? []).some((e: any) => e.name === req.params.name);
      if (!exists) return res.status(404).json({ error: 'Environment not found' });
      model.defaultEnvironment = req.params.name;
      if (Array.isArray(model.environments)) {
        model.environments.forEach((e: any) => {
          e.default = (e.name === req.params.name);
        });
      }
      writeModel(modelPath, model);
      res.json({ ok: true, defaultEnvironment: model.defaultEnvironment });
    });

    // ─── Source viewer ────────────────────────────────────────────────────
    app.get('/api/model/source', (req, res) => {
      const file = req.query.file as string;
      const line = parseInt(req.query.line as string, 10) || 1;
      if (!file) return res.status(400).json({ error: 'file is required' });
      try {
        // Resolve relative to cwd
        const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
        if (!fs.existsSync(resolved)) {
          return res.status(404).json({ error: `File not found: ${resolved}` });
        }
        const content = fs.readFileSync(resolved, 'utf8');
        const lines = content.split('\n');
        // Return ~40 lines centred on the handler line
        const start = Math.max(0, line - 5);
        const end = Math.min(lines.length, line + 35);
        const snippet = lines.slice(start, end).join('\n');
        res.json({ source: snippet, startLine: start + 1, totalLines: lines.length, file: resolved });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Related files ────────────────────────────────────────────────────
    app.get('/api/model/related', (req, res) => {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'id is required' });
      try {
        const modelPath = path.join(process.cwd(), '.jetic', 'model.json');
        if (!fs.existsSync(modelPath)) return res.json({ files: [] });
        const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        const endpoint = (model.endpoints || []).find((e: any) => e.id === id);
        if (!endpoint || !endpoint.source?.file) return res.json({ files: [] });

        const sourceFile = path.isAbsolute(endpoint.source.file)
          ? endpoint.source.file
          : path.join(process.cwd(), endpoint.source.file);

        if (!fs.existsSync(sourceFile)) return res.json({ files: [] });

        // Parse import/require statements from the source file
        const content = fs.readFileSync(sourceFile, 'utf8');
        const importRegex = /(?:import\s+.*?from\s+['"](.+?)['"]|require\(['"](.+?)['"]\))/g;
        const relatedFiles: string[] = [];
        const sourceDir = path.dirname(sourceFile);
        let match: RegExpExecArray | null;

        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1] || match[2];
          if (!importPath || importPath.startsWith('@') || !importPath.startsWith('.')) continue;
          const exts = ['', '.ts', '.js', '.tsx', '.jsx'];
          for (const ext of exts) {
            const candidate = path.resolve(sourceDir, importPath + ext);
            if (fs.existsSync(candidate)) {
              // Return path relative to cwd
              relatedFiles.push(path.relative(process.cwd(), candidate));
              break;
            }
          }
        }

        // Also include the source file itself if not already there
        const relSelf = path.relative(process.cwd(), sourceFile);
        const files = [relSelf, ...relatedFiles.filter(f => f !== relSelf)];
        res.json({ files });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });


    // ─── Workflows API ───────────────────────────────────────────────────
    app.get('/api/workflows', (_req, res) => {
      const jeticDir = path.join(process.cwd(), '.jetic');
      const workflowsDir = path.join(jeticDir, 'workflows');
      try {
        const workflows: any[] = [];

        // Read from .jetic/workflows/ folder (primary)
        if (fs.existsSync(workflowsDir)) {
          const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));
          for (const file of files) {
            try {
              const data = JSON.parse(fs.readFileSync(path.join(workflowsDir, file), 'utf8'));
              if (data.steps && Array.isArray(data.steps)) {
                workflows.push({ _file: `workflows/${file}`, ...data });
              }
            } catch {}
          }
        }

        // Legacy fallback: .jetic/workflow.json
        const legacyPath = path.join(jeticDir, 'workflow.json');
        if (fs.existsSync(legacyPath)) {
          try {
            const data = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
            if (data.steps && Array.isArray(data.steps)) {
              workflows.push({ _file: 'workflow.json', _legacy: true, ...data });
            }
          } catch {}
        }

        res.json(workflows);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Create workflow ──────────────────────────────────────────────────
    app.post('/api/workflows', (req, res) => {
      const { name } = req.body as { name: string };
      if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

      const jeticDir = path.join(process.cwd(), '.jetic');
      const workflowsDir = path.join(jeticDir, 'workflows');
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filePath = path.join(workflowsDir, `${slug}.json`);

      if (fs.existsSync(filePath)) {
        return res.status(409).json({ error: `Workflow "${slug}" already exists` });
      }

      const workflow = {
        name: name.trim(),
        generatedAt: new Date().toISOString(),
        steps: [],
      };

      try {
        fs.mkdirSync(workflowsDir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');
        res.json({ ok: true, _file: `workflows/${slug}.json`, slug, ...workflow });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Update workflow ──────────────────────────────────────────────────
    app.put('/api/workflows/:name', (req, res) => {
      const slug = req.params.name;
      const jeticDir = path.join(process.cwd(), '.jetic');
      const workflowsDir = path.join(jeticDir, 'workflows');
      let filePath = path.join(workflowsDir, `${slug}.json`);

      if (!fs.existsSync(filePath)) {
        const legacyPath = path.join(jeticDir, 'workflow.json');
        if (slug === 'workflow' && fs.existsSync(legacyPath)) {
          filePath = legacyPath;
        } else {
          return res.status(404).json({ error: `Workflow "${slug}" not found` });
        }
      }

      try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const updated = { ...existing, ...req.body };
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
        const relFile = filePath.endsWith('workflow.json') && !filePath.includes('workflows') ? 'workflow.json' : `workflows/${slug}.json`;
        res.json({ ok: true, _file: relFile, ...updated });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Delete workflow ──────────────────────────────────────────────────
    app.delete('/api/workflows/:name', (req, res) => {
      const slug = req.params.name;
      const jeticDir = path.join(process.cwd(), '.jetic');
      const workflowsDir = path.join(jeticDir, 'workflows');
      const filePath = path.join(workflowsDir, `${slug}.json`);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Workflow "${slug}" not found` });
      }

      try {
        fs.unlinkSync(filePath);
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── AI-generate workflow ─────────────────────────────────────────────────
    app.post('/api/workflows/generate', async (req, res) => {
      const { goal, name } = req.body as { goal?: string; name?: string };
      const workflowGoal = goal || name || 'Full user journey';

      const jeticDir   = path.join(process.cwd(), '.jetic');
      const config     = loadConfig();

      if (!config.ai) {
        return res.status(400).json({ error: 'AI is not configured. Run `jetic config ai` first.' });
      }

      // Load model.json
      const modelPath = path.join(jeticDir, 'model.json');
      if (!fs.existsSync(modelPath)) {
        return res.status(400).json({ error: 'No model.json found. Run `jetic scan` first.' });
      }

      let model: any;
      try { model = JSON.parse(fs.readFileSync(modelPath, 'utf8')); }
      catch { return res.status(500).json({ error: 'Failed to read model.json' }); }

      const { provider, model: aiModel, apiKeyEnvVar } = config.ai;
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) return res.status(400).json({ error: `Missing API key in env var: ${apiKeyEnvVar}` });

      // Build endpoint catalogue
      const endpointSummary = (model.endpoints ?? []).map((ep: any) => {
        const mw       = (ep.middleware ?? []).map((m: any) => m.name).join(', ');
        const auth     = mw ? ` [requiresAuth: ${mw}]` : ' [public]';
        const bodyFields = ep.requestBody?.fields
          ? Object.entries(ep.requestBody.fields)
              .map(([k, v]: [string, any]) => `${k}:${(v as any).type ?? 'string'}`).join(', ')
          : '';
        const bodyStr = bodyFields ? ` body={${bodyFields}}` : '';
        const respParts: string[] = [];
        for (const [status, def] of Object.entries(ep.responses ?? {})) {
          const schema = (def as any).schema;
          if (schema) respParts.push(`${status}:{${Object.keys(schema).slice(0, 8).join(', ')}}`);
        }
        const respStr = respParts.length ? ` response=[${respParts.join(' | ')}]` : '';
        return `${ep.method} ${ep.path}${auth}${bodyStr}${respStr}`;
      }).join('\n');

      const canonicalExample = `{
  "name": "Admin creates workspace, invites teacher, creates class and logs out",
  "steps": [
    { "name": "Admin creates a workspace", "method": "POST", "path": "/api/workspaces/setup",
      "description": "Register a new workspace",
      "body": { "workspace_name": "{{faker.company.name}}", "admin_email": "{{faker.internet.email}}", "admin_password": "{{faker.internet.password}}" },
      "captureInput": { "workflow:adminEmail": "admin_email", "workflow:adminPassword": "admin_password" },
      "capture": { "workflow:workspaceID": "data.workspace.id" }, "expectStatus": 201 },
    { "name": "Admin logs in", "method": "POST", "path": "/api/auth/login",
      "description": "Authenticate with created credentials",
      "body": { "user_email": "{{workflow:adminEmail}}", "user_password": "{{workflow:adminPassword}}" },
      "capture": { "workflow:accessToken": "data.accessToken" }, "expectStatus": 200 },
    { "name": "Admin creates a class", "method": "POST", "path": "/api/classes",
      "description": "Create a class inside the workspace",
      "inject": { "header:Authorization": "Bearer {{workflow:accessToken}}" },
      "body": { "name": "{{faker.word.noun}} Class", "workspaceId": "{{workflow:workspaceID}}" },
      "capture": { "workflow:classID": "data.id" }, "expectStatus": 201 },
    { "name": "Admin logs out", "method": "POST", "path": "/api/auth/logout",
      "description": "Invalidate the session",
      "inject": { "header:Authorization": "Bearer {{workflow:accessToken}}" },
      "body": {}, "expectStatus": 200 }
  ]
}`;

      const prompt = `You are an expert API integration test designer.
Generate a workflow JSON for the API below.

━━━ PROJECT ━━━
Name: ${model.project?.name ?? 'API'}
Framework: ${model.project?.framework ?? 'unknown'}
Workflow goal: "${workflowGoal}"

━━━ ENDPOINTS ━━━
${endpointSummary}

━━━ TEMPLATE SYNTAX ━━━
{{faker.internet.email}}, {{faker.internet.password}}, {{faker.internet.username}},
{{faker.company.name}}, {{faker.word.noun}}, {{faker.word.adjective}},
{{faker.string.uuid}}, {{faker.commerce.productName}}, {{faker.phone.number}},
{{workflow:KEY}} → value captured from a previous step

━━━ FIELD RULES ━━━
body         — request body; use {{faker.*}} for generated fields, {{workflow:KEY}} for captured values
captureInput — save resolved BODY fields to memory BEFORE the HTTP call: { "workflow:KEY": "bodyFieldName" }
capture      — save RESPONSE fields to memory AFTER success: { "workflow:KEY": "dot.path" }
inject       — inject memory into headers/body; Bearer auth: { "header:Authorization": "Bearer {{workflow:accessToken}}" }
expectStatus — 201 for creates, 200 for others, 204 for deletes
⚠ EVERY [requiresAuth] endpoint MUST inject the Authorization header.

━━━ EXAMPLE ━━━
${canonicalExample}

━━━ GENERATE ━━━
Using ONLY the endpoints above (exact paths and methods), generate a complete workflow for: "${workflowGoal}".
5-12 steps. Every step must have name, method, path, description, body (even {}), expectStatus.
Wire captures/injects so every step gets the data it needs from previous steps.
Output valid JSON only.
`;

      try {
        const importDynamic = new Function('modulePath', 'return import(modulePath)');
        const { generateObject } = await importDynamic('ai');
        const { z }             = await importDynamic('zod');

        let aiModelObj: any;
        if (provider === 'openai') {
          const { createOpenAI }    = await importDynamic('@ai-sdk/openai');
          aiModelObj = createOpenAI({ apiKey })(aiModel);
        } else {
          const { createOpenRouter } = await importDynamic('@openrouter/ai-sdk-provider');
          aiModelObj = createOpenRouter({ apiKey })(aiModel);
        }

        const StepSchema = z.object({
          name:         z.string(),
          method:       z.string(),
          path:         z.string(),
          description:  z.string().optional(),
          body:         z.record(z.string(), z.any()).optional(),
          captureInput: z.record(z.string(), z.string()).optional(),
          capture:      z.record(z.string(), z.string()).optional(),
          inject:       z.record(z.string(), z.string()).optional(),
          expectStatus: z.number().int().min(100).max(599),
        });
        const WorkflowSchema = z.object({
          name:  z.string(),
          steps: z.array(StepSchema).min(3).max(15),
        });

        const { object } = await generateObject({
          model:     aiModelObj,
          mode:      'json',
          maxTokens: 4000,
          schema:    WorkflowSchema,
          prompt,
        });

        const workflow = {
          name:        object.name as string,
          generatedAt: new Date().toISOString(),
          steps:       object.steps,
        };

        // Save to .jetic/workflows/<slug>.json
        const workflowsDir = path.join(jeticDir, 'workflows');
        const slug         = (object.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow';
        const filePath     = path.join(workflowsDir, `${slug}.json`);
        fs.mkdirSync(workflowsDir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf8');

        res.json({ ok: true, _file: `workflows/${slug}.json`, slug, ...workflow });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Interactive human input ({{human:key}}) ──────────────────────────
    // One pending question per run. POST /api/workflows/human-input resolves it.
    interface HumanWaiter {
      key: string;
      stepIndex: number;
      resolve: (value: string | null) => void;
    }
    const humanInputWaiters = new Map<string, HumanWaiter>();
    const HUMAN_INPUT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes, then the step fails

    class HumanInputAbort extends Error {
      constructor(key: string, reason: string) {
        super(`Human input for "{{human:${key}}}" ${reason}`);
        this.name = 'HumanInputAbort';
      }
    }

    app.post('/api/workflows/human-input', (req, res) => {
      const { runId, key, value } = req.body as { runId: string; key: string; value?: string | null };
      if (!runId || !key) { return res.status(400).json({ error: 'runId and key are required' }); }
      const waiter = humanInputWaiters.get(runId);
      if (!waiter || waiter.key !== key) {
        return res.status(404).json({ error: 'no pending human input for this run/key (answered, timed out, or run ended)' });
      }
      humanInputWaiters.delete(runId);
      waiter.resolve(typeof value === 'string' ? value : null);
      res.json({ ok: true });
    });

    // ─── Workflow run – Server-Sent Events stream ─────────────────────────
    app.post('/api/workflows/run', async (req, res) => {
      const { file, humanInputs: preseededHuman } = req.body as { file: string; humanInputs?: Record<string, string> };
      if (!file) { return res.status(400).json({ error: 'file is required' }); }

      const jeticDir = path.join(process.cwd(), '.jetic');
      // Support both 'workflows/<slug>.json' and legacy 'workflow.json'
      const wfPath = path.isAbsolute(file) ? file : path.join(jeticDir, file);
      if (!fs.existsSync(wfPath)) { return res.status(404).json({ error: 'workflow file not found' }); }

      let workflow: any;
      try { workflow = JSON.parse(fs.readFileSync(wfPath, 'utf8')); }
      catch (e: any) { return res.status(400).json({ error: e.message }); }

      // ── Pre-load async imports BEFORE opening the SSE stream so that
      // the async yield doesn't trigger req 'close' before the loop runs ──
      const { JeticMemory: Mem } = await import('@jetic/memory');
      const { faker } = await import('@faker-js/faker');

      // SSE headers – opened AFTER imports so aborted stays false
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const send = (type: string, data: any) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };

      // Resolve base URL from request body or model
      let baseUrl = req.body?.baseUrl;
      if (!baseUrl) {
        const modelPath = path.join(jeticDir, 'model.json');
        if (fs.existsSync(modelPath)) {
          try {
            const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
            const envs = model.environments || [];
            const defName = model.defaultEnvironment || envs.find((e: any) => e.default)?.name;
            const defEnv = envs.find((e: any) => e.name === defName) || envs.find((e: any) => e.name === 'local') || envs[0];
            if (defEnv?.baseUrl) baseUrl = defEnv.baseUrl;
          } catch {}
        }
      }
      if (!baseUrl) baseUrl = 'http://localhost:4000';

      // ── Human-input coordination ──────────────────────────────────────
      // {{human:key}} pauses the run: we emit `human_input_required` over SSE
      // and wait until POST /api/workflows/human-input delivers the value.
      const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      // Pre-seeded answers (client collected up-front); used without persisting.
      const runHumanCache = new Map<string, string>(Object.entries(preseededHuman ?? {}));

      // Pre-scan every {{human:key}} so clients can show up-front what this
      // run will ask for vs. what is already known (run/env/memory).
      const HUMAN_KEY_RE = /\{\{\s*human:([^}]+?)\s*\}\}/g;
      const collectHumanRefs = (): string[] => {
        const keys = new Set<string>();
        for (const step of workflow.steps || []) {
          for (const hay of [step?.path, JSON.stringify(step?.body ?? {}), JSON.stringify(step?.inject ?? {}), JSON.stringify(step?.condition ?? {})]) {
            if (!hay) continue;
            HUMAN_KEY_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = HUMAN_KEY_RE.exec(hay)) !== null) {
              const k = (m[1] || '').trim();
              if (k) keys.add(k);
            }
          }
        }
        return [...keys];
      };
      const humanEnvName = (key: string) => `JETIC_HUMAN_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      const humanSource = async (key: string): Promise<'run' | 'env' | 'memory' | 'prompt'> => {
        if (runHumanCache.has(key)) return 'run';
        if (process.env[humanEnvName(key)]) return 'env';
        try {
          const v = await new Mem({ scope: 'human' }).get(key);
          if (v != null && String(v) !== '') return 'memory';
        } catch {}
        return 'prompt';
      };
      const neededHuman: Array<{ key: string; source: string }> = [];
      for (const k of collectHumanRefs()) neededHuman.push({ key: k, source: await humanSource(k) });

      send('start', { name: workflow.name, totalSteps: workflow.steps.length, baseUrl, runId, humanKeys: neededHuman });

      // Register close handler AFTER flushing start — any close before this is irrelevant
      let aborted = false;
      req.on('close', () => {
        aborted = true;
        const waiter = humanInputWaiters.get(runId);
        if (waiter) {
          humanInputWaiters.delete(runId);
          waiter.resolve(null); // unblock the run loop so it can finish cleanly
        }
      });

      // ── inline the minimal executor (avoids importing CLI internals) ──
      function deepGet(obj: any, dotPath: string): any {
        return dotPath.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((o, k) => o?.[k], obj);
      }

      async function resolveTemplate(value: string): Promise<string> {
        return value.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
          expr = expr.trim();
          if (expr.startsWith('faker.')) {
            try {
              let fn: any = faker;
              for (const part of expr.split('.').slice(1)) fn = fn[part];
              return typeof fn === 'function' ? String(fn()) : String(fn);
            } catch { return expr; }
          }
          return _; // memory refs handled below via async
        });
        // Note: memory template refs ({{scope:key}}) require async — handled separately
      }

      async function resolveMemoryTemplates(value: string, stepIndex = -1, stepName = ''): Promise<string> {
        const matches = [...value.matchAll(/\{\{([^}]+)\}\}/g)];
        let result = value;
        for (const [placeholder, expr] of matches.map(m => [m[0], m[1].trim()])) {
          if (expr.includes(':') && !expr.startsWith('faker.')) {
            const [scope, key] = expr.split(':', 2);
            const val = await resolveMemValue(scope, key, stepIndex, stepName);
            result = result.replace(placeholder, val);
          }
        }
        return result;
      }

      async function resolveStr(v: string, stepIndex = -1, stepName = ''): Promise<string> {
        let s = await resolveTemplate(v);
        s = await resolveMemoryTemplates(s, stepIndex, stepName);
        return s;
      }

      async function resolveValueRecursive(val: any, stepIndex = -1, stepName = ''): Promise<any> {
        if (typeof val === 'string') {
          return await resolveStr(val, stepIndex, stepName);
        }
        if (Array.isArray(val)) {
          const res = [];
          for (const item of val) {
            res.push(await resolveValueRecursive(item, stepIndex, stepName));
          }
          return res;
        }
        if (val && typeof val === 'object' && val.constructor === Object) {
          const res: Record<string, any> = {};
          for (const [k, v] of Object.entries(val)) {
            res[k] = await resolveValueRecursive(v, stepIndex, stepName);
          }
          return res;
        }
        return val;
      }

      /**
       * Single choke point for scope:key lookups. `human:` pauses the SSE run
       * until the dashboard user answers (or a pre-seeded/env value exists);
       * every other scope reads Jetic memory as before.
       */
      async function resolveMemValue(scope: string, key: string, stepIndex: number, stepName: string): Promise<string> {
        if (scope !== 'human') {
          const mem = new Mem({ scope });
          const val = await mem.get(key);
          return val != null ? String(val) : '';
        }
        // Pre-seeded for this run (client collected up-front) — used as-is, not persisted.
        if (runHumanCache.has(key)) {
          send('human_resolved', { index: stepIndex, key, source: 'run' });
          return runHumanCache.get(key)!;
        }
        // CI-safe override, same convention as the terminal runner.
        const envVal = process.env[humanEnvName(key)];
        if (envVal !== undefined && envVal !== '') {
          send('human_resolved', { index: stepIndex, key, source: 'env' });
          return envVal;
        }
        // Pause and ask the human via SSE.
        const mem = new Mem({ scope: 'human' });
        const answer = await waitForHumanInput(runId, key, stepIndex, stepName, send);
        if (answer === null) {
          throw new HumanInputAbort(key, aborted ? 'was cancelled' : 'timed out after 10 minutes');
        }
        await mem.set(key, answer);
        send('human_resolved', { index: stepIndex, key, source: 'prompt' });
        return answer;
      }

      function waitForHumanInput(
        forRunId: string,
        key: string,
        stepIndex: number,
        stepName: string,
        sendFn: (type: string, data: any) => void,
      ): Promise<string | null> {
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            if (humanInputWaiters.get(forRunId)?.key === key) {
              humanInputWaiters.delete(forRunId);
              resolve(null);
            }
          }, HUMAN_INPUT_TIMEOUT_MS);
          humanInputWaiters.set(forRunId, {
            key,
            stepIndex,
            resolve: (value) => { clearTimeout(timer); resolve(value); },
          });
          sendFn('human_input_required', { runId: forRunId, key, stepIndex, stepName });
        });
      }

      async function executeStep(step: any, stepIndex: number): Promise<any> {
        const startTime = Date.now();
        const stepName = step.name || `${step.method} ${step.path}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const bodyExtra: Record<string, any> = {};

        // Resolve inject
        for (const [target, memKeyOrTpl] of Object.entries(step.inject ?? {}) as [string, string][]) {
          const strVal = memKeyOrTpl.includes('{{')
            ? await resolveStr(memKeyOrTpl, stepIndex, stepName)
            : await (async () => {
                const [scope, key] = memKeyOrTpl.includes(':') ? memKeyOrTpl.split(':', 2) : ['workflow', memKeyOrTpl];
                return resolveMemValue(scope, key, stepIndex, stepName);
              })();

          if (!strVal) continue;
          if (target.startsWith('body:')) bodyExtra[target.slice(5)] = strVal;
          else headers[target.startsWith('header:') ? target.slice(7) : target] = strVal;
        }

        // Resolve body templates recursively
        const resolvedBody = await resolveValueRecursive(step.body ?? {}, stepIndex, stepName);

        const requestBody = { ...bodyExtra, ...resolvedBody };

        // captureInput
        for (const [memKey, bodyField] of Object.entries(step.captureInput ?? {}) as [string, string][]) {
          const val = requestBody[bodyField];
          if (val != null) {
            const [scope, key] = memKey.includes(':') ? memKey.split(':', 2) : ['workflow', memKey];
            await new Mem({ scope }).set(key, val);
          }
        }

        // Resolve path params
        let resolvedPath = step.path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_: string, p: string) =>
          requestBody[p] !== undefined ? String(requestBody[p]) : `:${p}`
        );
        // Also resolve {{}} in path
        resolvedPath = await resolveStr(resolvedPath, stepIndex, stepName);

        const finalUrl = `${baseUrl.replace(/\/$/, '')}${resolvedPath}`;
        const expectedStatus = step.expectStatus ?? 200;

        try {
          const isBodyMethod = !['GET', 'HEAD'].includes(step.method.toUpperCase());
          const fetchOpts: RequestInit = { method: step.method.toUpperCase(), headers };
          if (isBodyMethod && Object.keys(requestBody).length > 0) {
            fetchOpts.body = JSON.stringify(requestBody);
          } else if (!isBodyMethod && Object.keys(requestBody).length > 0) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(requestBody)) if (v != null) params.set(k, String(v));
            // Don't append query params for now — keep simple
          }

          const response = await fetch(finalUrl, fetchOpts);
          const durationMs = Date.now() - startTime;

          let responseBody: any = null;
          const ct = response.headers.get('content-type') ?? '';
          if (ct.includes('application/json')) {
            try { responseBody = await response.json(); } catch {}
          } else {
            responseBody = await response.text();
          }

          const passed = response.status === expectedStatus ||
            (response.status >= 200 && response.status < 300 && expectedStatus >= 200 && expectedStatus < 300);

          // Capture
          const captured: string[] = [];
          if (passed) {
            for (const [memKey, responsePath] of Object.entries(step.capture ?? {}) as [string, string][]) {
              const val = deepGet(responseBody, responsePath);
              if (val != null) {
                const [scope, key] = memKey.includes(':') ? memKey.split(':', 2) : ['workflow', memKey];
                await new Mem({ scope }).set(key, val);
                captured.push(`${memKey} ← ${responsePath}`);
              }
            }
          }

          return { status: response.status, passed, durationMs, captured, injected: headers, responseBody, error: null };
        } catch (err: any) {
          return { status: 0, passed: false, durationMs: Date.now() - startTime, captured: [], injected: headers, responseBody: null, error: err.message };
        }
      }

      // ── Execute steps, emitting SSE events ──
      let passed = 0; let failed = 0;

      // ── Inline condition evaluator (mirrors dashboard + CLI logic) ─────────
      async function resolveCondRef(ref: string, stepIndex: number, stepName: string): Promise<string> {
        const matches = [...ref.matchAll(/\{\{([^}]+)\}\}/g)];
        let result = ref;
        for (const [placeholder, expr] of matches.map(m => [m[0], m[1].trim()])) {
          if (expr.includes(':') && !expr.startsWith('faker.')) {
            const [scope, key] = expr.split(':', 2);
            result = result.replace(placeholder, await resolveMemValue(scope, key, stepIndex, stepName));
          }
        }
        return result;
      }

      async function evalCondRule(rule: { left: string; operator: string; right?: string }, stepIndex: number, stepName: string): Promise<boolean> {
        const left = await resolveCondRef(rule.left, stepIndex, stepName);
        const right = rule.right !== undefined ? await resolveCondRef(rule.right, stepIndex, stepName) : undefined;
        switch (rule.operator) {
          case 'equals':                return left === right;
          case 'not_equals':            return left !== right;
          case 'greater_than':          return Number(left) > Number(right);
          case 'greater_than_or_equal': return Number(left) >= Number(right);
          case 'less_than':             return Number(left) < Number(right);
          case 'less_than_or_equal':    return Number(left) <= Number(right);
          case 'exists':                return left !== '' && left !== undefined;
          case 'not_exists':            return left === '' || left === undefined;
          case 'is_empty':              return left === '';
          case 'is_not_empty':          return left !== '';
          case 'contains':              return right !== undefined && left.includes(right);
          case 'not_contains':          return right !== undefined && !left.includes(right);
          case 'starts_with':           return right !== undefined && left.startsWith(right);
          case 'ends_with':             return right !== undefined && left.endsWith(right);
          default:                      return false;
        }
      }

      async function evalCondition(condition: any, stepIndex: number, stepName: string): Promise<{ passed: boolean; reason: string }> {
        const rules: any[] = condition.rules?.all ?? condition.rules?.any ?? [];
        const isAnd = !!(condition.rules?.all);
        if (rules.length === 0) return { passed: true, reason: 'No rules' };
        const results: { rule: any; ok: boolean }[] = [];
        for (const rule of rules) results.push({ rule, ok: await evalCondRule(rule, stepIndex, stepName) });
        const passed = isAnd ? results.every(r => r.ok) : results.some(r => r.ok);
        const failing = results.filter(r => !r.ok);
        const reason = passed
          ? `All conditions met (${isAnd ? 'AND' : 'OR'})`
          : `Failed: ${failing.map(r => `${r.rule.left} ${r.rule.operator}${r.rule.right !== undefined ? ' ' + r.rule.right : ''}`).join(', ')}`;
        return { passed, reason };
      }

      for (let i = 0; i < workflow.steps.length; i++) {
        if (aborted) break;
        const step = workflow.steps[i];
        send('step_start', { index: i, step: { name: step.name, method: step.method, path: step.path } });

        let result;
        try {
          result = await executeStep(step, i);
        } catch (err: any) {
          if (err instanceof HumanInputAbort || err?.name === 'HumanInputAbort') {
            send('aborted', { index: i, reason: err.message });
            res.end();
            return;
          }
          throw err;
        }

        if (result.passed) passed++; else failed++;
        send('step_result', {
          index: i,
          step: { name: step.name, method: step.method, path: step.path, description: step.description },
          status: result.status,
          passed: result.passed,
          durationMs: result.durationMs,
          captured: result.captured,
          injected: result.injected,
          responseBody: result.responseBody,
          error: result.error,
        });

        // ── Evaluate step condition (if present) ──────────────────────────
        if (step.condition && !aborted) {
          const condResult = await evalCondition(step.condition, i, step.name || `${step.method} ${step.path}`);
          send('condition_result', {
            index: i,
            passed: condResult.passed,
            reason: condResult.reason,
            onFail: step.condition.onFail,
            switchToWorkflow: step.condition.switchToWorkflow,
          });

          if (!condResult.passed) {
            const { onFail, returnOnComplete } = step.condition;
            if (onFail === 'abort') {
              send('aborted', { index: i, reason: `Condition failed at step ${i + 1}: ${condResult.reason}` });
              res.end();
              return;
            } else if (onFail === 'continue') {
              // Mark remaining steps as skipped and finish
              send('done', { passed, failed, total: workflow.steps.length, conditionBranch: 'continue' });
              res.end();
              return;
            } else if (onFail === 'switch') {
              if (!returnOnComplete) {
                // Transfer of control: end this workflow
                send('done', {
                  passed,
                  failed,
                  total: workflow.steps.length,
                  conditionBranch: 'switch',
                  switchToWorkflow: step.condition.switchToWorkflow,
                });
                res.end();
                return;
              }
              // If returnOnComplete is true, continue loop in current workflow!
            }
          }
        }

        // Only abort the chain if the step explicitly failed AND continueOnFailure is not set
        // AND the failure is a hard error (not just a bad status code)
        if (!result.passed && !step.continueOnFailure && result.error) {
          send('aborted', { index: i, reason: result.error ?? `Status ${result.status} ≠ ${step.expectStatus ?? 200}` });
          res.end();
          return;
        }
      }

      send('done', { passed, failed, total: workflow.steps.length });
      res.end();
    });

    // Memory API
    app.get('/api/memory', (_req, res) => {
      try {
        const allMemory = JeticMemory.getAllMemory();
        const entries: Array<{ key: string; value: any }> = [];
        for (const scope in allMemory) {
          for (const key in allMemory[scope]) {
            entries.push({ key: `${scope}:${key}`, value: allMemory[scope][key] });
          }
        }
        res.json(entries);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/memory', async (req, res) => {
      const { key: rawKey, value } = req.body as { key: string; value: string };
      if (!rawKey || value === undefined) {
        return res.status(400).json({ error: 'key and value are required' });
      }
      const parts = rawKey.split(':');
      const scope = parts.length > 1 ? parts[0] : 'global';
      const key = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
      const memory = new JeticMemory({ scope });
      await memory.set(key, value);
      res.json({ ok: true });
    });

    app.delete('/api/memory', async (req, res) => {
      const { key: rawKey } = req.body as { key: string };
      if (!rawKey) {
        return res.status(400).json({ error: 'key is required' });
      }
      const parts = rawKey.split(':');
      const scope = parts.length > 1 ? parts[0] : 'global';
      const key = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
      const memory = new JeticMemory({ scope });
      await memory.delete(key);
      res.json({ ok: true });
    });

    // ─── Traces API (.jetic/traces/*.json) ───────────────────────────────────
    const getTracesDir = () => path.join(process.cwd(), '.jetic', 'traces');

    app.get('/api/traces', (_req, res) => {
      try {
        const dir = getTracesDir();
        if (!fs.existsSync(dir)) return res.json([]);
        const records: any[] = [];
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
          try { records.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch {}
        }
        records.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        res.json(records);
      } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/traces/:id', (req, res) => {
      try {
        const p = path.join(getTracesDir(), `${req.params.id}.json`);
        if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
        res.json(JSON.parse(fs.readFileSync(p, 'utf8')));
      } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/traces', (req, res) => {
      try {
        const record = req.body;
        if (!record?.id) return res.status(400).json({ error: 'id required' });
        const dir = getTracesDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `trace_${record.id}.json`), JSON.stringify(record, null, 2), 'utf8');
        res.json({ ok: true, id: record.id });
      } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/api/traces/:id', (req, res) => {
      try {
        const p = path.join(getTracesDir(), `trace_${req.params.id}.json`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        res.json({ ok: true });
      } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/api/traces', (_req, res) => {
      try {
        const dir = getTracesDir();
        if (fs.existsSync(dir)) {
          for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
            try { fs.unlinkSync(path.join(dir, f)); } catch {}
          }
        }
        res.json({ ok: true });
      } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    // Locate the dashboard static files.
    // Resolution order is deliberate:
    //   1. Workspace source (apps/dashboard/dist) — always the freshest during
    //      development, so a dashboard-only rebuild takes effect on the next
    //      `jetic dev` without needing a CLI rebuild.
    //   2. Bundled copy (dist/dashboard) — what global `npm install -g` serves;
    //      refreshed on every CLI build (see package.json build script).
    try {
      let dashboardDistPath: string | null = null;

      try {
        const dashboardPackagePath = require.resolve('@jetic/dashboard/package.json');
        const workspaceDist = path.join(path.dirname(dashboardPackagePath), 'dist');
        if (fs.existsSync(workspaceDist)) dashboardDistPath = workspaceDist;
      } catch {}

      if (!dashboardDistPath) {
        const bundled = path.join(__dirname, 'dashboard');
        if (fs.existsSync(bundled)) dashboardDistPath = bundled;
      }

      if (!dashboardDistPath) {
        const sibling = path.join(__dirname, '..', 'dashboard');
        if (fs.existsSync(sibling)) dashboardDistPath = sibling;
      }

      if (!dashboardDistPath) {
        console.warn('Dashboard build not found. Build it with: pnpm --filter @jetic/dashboard run build');
      } else {
        // Serve static files
        app.use(express.static(dashboardDistPath));

        // SPA fallback
        app.get('*', (_req, res) => {
          const indexPath = path.join(dashboardDistPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            res.status(404).send('Dashboard not built yet.');
          }
        });
      }
    } catch (e) {
      console.error('Could not find dashboard static files. Ensure it is built.', e);
    }

    app.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`\n🚀 Jetic Studio is running at ${url}\n`);
      
      const { exec } = require('child_process');
      const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
      exec(`${start} ${url}`);
    });
  });
