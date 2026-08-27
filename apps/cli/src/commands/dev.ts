import { Command } from 'commander';
import express from 'express';
import path from 'path';
import fs from 'fs';
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
      try {
        if (!fs.existsSync(jeticDir)) return res.json([]);
        const files = fs.readdirSync(jeticDir).filter(f => f.endsWith('.json') && f !== 'model.json' && f !== 'memory.json');
        const workflows: any[] = [];
        for (const file of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(jeticDir, file), 'utf8'));
            if (data.steps && Array.isArray(data.steps)) workflows.push({ _file: file, ...data });
          } catch {}
        }
        res.json(workflows);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Workflow run – Server-Sent Events stream ─────────────────────────
    app.post('/api/workflows/run', async (req, res) => {
      const { file } = req.body as { file: string };
      if (!file) { return res.status(400).json({ error: 'file is required' }); }

      const jeticDir = path.join(process.cwd(), '.jetic');
      const wfPath = path.join(jeticDir, file);
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

      // Resolve base URL from model
      let baseUrl = 'http://localhost:4000';
      const modelPath = path.join(jeticDir, 'model.json');
      if (fs.existsSync(modelPath)) {
        try {
          const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
          const localEnv = (model.environments || []).find((e: any) => e.name === 'local');
          if (localEnv) baseUrl = localEnv.baseUrl;
        } catch {}
      }

      send('start', { name: workflow.name, totalSteps: workflow.steps.length, baseUrl });

      // Register close handler AFTER flushing start — any close before this is irrelevant
      let aborted = false;
      req.on('close', () => { aborted = true; });

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

      async function resolveMemoryTemplates(value: string): Promise<string> {
        const matches = [...value.matchAll(/\{\{([^}]+)\}\}/g)];
        let result = value;
        for (const [placeholder, expr] of matches.map(m => [m[0], m[1].trim()])) {
          if (expr.includes(':') && !expr.startsWith('faker.')) {
            const [scope, key] = expr.split(':', 2);
            const mem = new Mem({ scope });
            const val = await mem.get(key);
            result = result.replace(placeholder, val != null ? String(val) : '');
          }
        }
        return result;
      }

      async function resolveStr(v: string): Promise<string> {
        let s = await resolveTemplate(v);
        s = await resolveMemoryTemplates(s);
        return s;
      }

      async function executeStep(step: any): Promise<any> {
        const startTime = Date.now();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const bodyExtra: Record<string, any> = {};

        // Resolve inject
        for (const [target, memKeyOrTpl] of Object.entries(step.inject ?? {}) as [string, string][]) {
          const strVal = memKeyOrTpl.includes('{{')
            ? await resolveStr(memKeyOrTpl)
            : await (async () => {
                const [scope, key] = memKeyOrTpl.includes(':') ? memKeyOrTpl.split(':', 2) : ['workflow', memKeyOrTpl];
                const val = await new Mem({ scope }).get(key);
                return val != null ? String(val) : '';
              })();

          if (!strVal) continue;
          if (target.startsWith('body:')) bodyExtra[target.slice(5)] = strVal;
          else headers[target.startsWith('header:') ? target.slice(7) : target] = strVal;
        }

        // Resolve body templates
        const resolvedBody: Record<string, any> = {};
        for (const [k, v] of Object.entries(step.body ?? {})) {
          resolvedBody[k] = typeof v === 'string' ? await resolveStr(v) : v;
        }

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
        resolvedPath = await resolveStr(resolvedPath);

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
      for (let i = 0; i < workflow.steps.length; i++) {
        if (aborted) break;
        const step = workflow.steps[i];
        send('step_start', { index: i, step: { name: step.name, method: step.method, path: step.path } });

        const result = await executeStep(step);

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

    // We use the dashboard dist folder from the workspace node_modules
    // since we've added @jetic/dashboard as a dependency.
    try {
      const dashboardPackagePath = require.resolve('@jetic/dashboard/package.json');
      const dashboardDistPath = path.join(path.dirname(dashboardPackagePath), 'dist');
      
      if (!fs.existsSync(dashboardDistPath)) {
        console.warn(`Dashboard build not found at ${dashboardDistPath}. Please build the dashboard first.`);
      }

      // Serve static files
      app.use(express.static(dashboardDistPath));

      // SPA fallback
      app.get('*', (req, res) => {
        const indexPath = path.join(dashboardDistPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('Dashboard not built yet.');
        }
      });
    } catch (e) {
      console.error('Could not find @jetic/dashboard. Ensure it is installed and built.', e);
    }

    app.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`\n🚀 Jetic Studio is running at ${url}\n`);
      
      const { exec } = require('child_process');
      const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
      exec(`${start} ${url}`);
    });
  });
