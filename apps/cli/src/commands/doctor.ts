import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { loadConfig, readJsonSync } from '@jetic/core';
import { BehavioralModel } from '@jetic/model';
import { AdapterRegistry, createAdapterContext } from '@jetic/scanner-sdk';
import { expressAdapter } from '@jetic/adapter-express';
import { fastifyAdapter } from '@jetic/adapter-fastify';
import { nextjsAdapter } from '@jetic/adapter-nextjs';
import { nestjsAdapter } from '@jetic/adapter-nestjs';
import { honoAdapter } from '@jetic/adapter-hono';
import { validateWorkflowDefinition } from '@jetic/mcp-server';

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

export const doctorCommand = new Command('doctor')
  .description('Diagnose common Jetic setup problems')
  .action(async () => {
    const checks: CheckResult[] = [];
    const config = loadConfig();

    const [major] = process.versions.node.split('.').map(Number);
    checks.push({ label: `Node.js ${process.versions.node}`, ok: major >= 20 });

    checks.push({
      label: 'jetic.config.json',
      ok: config.projectConfig !== null,
      detail: config.projectConfig ? undefined : 'not found — run "jetic init" (defaults still apply)',
    });

    const registry = new AdapterRegistry();
    registry.register(expressAdapter);
    registry.register(fastifyAdapter);
    registry.register(nextjsAdapter);
    registry.register(nestjsAdapter);
    registry.register(honoAdapter);
    const ctx = createAdapterContext(config.projectRoot, config.jeticDir);
    const detected = registry.detect(ctx);
    checks.push({
      label: 'Adapter detection',
      ok: !!detected,
      detail: detected ? detected.name : 'no adapter detected — model must be authored via MCP tools',
    });

    const modelPath = path.join(config.jeticDir, 'model.json');
    const model = readJsonSync<BehavioralModel>(modelPath);
    checks.push({
      label: 'Model valid',
      ok: !!model && Array.isArray(model.endpoints),
      detail: model ? `${model.endpoints.length} endpoints` : `not found at ${modelPath} — run "jetic scan"`,
    });

    let workflowFiles: string[] = [];
    if (fs.existsSync(config.workflowsDir)) {
      workflowFiles = fs.readdirSync(config.workflowsDir).filter((f) => f.endsWith('.json'));
    }
    let invalidWorkflows = 0;
    for (const file of workflowFiles) {
      const wf = readJsonSync<Record<string, any>>(path.join(config.workflowsDir, file));
      const report = validateWorkflowDefinition(wf || {}, { projectPath: config.projectRoot });
      if (!report.valid) invalidWorkflows++;
    }
    checks.push({
      label: `Workflows valid (${workflowFiles.length} found)`,
      ok: invalidWorkflows === 0,
      detail: invalidWorkflows > 0 ? `${invalidWorkflows} invalid` : undefined,
    });

    const portAvailable = await checkPortAvailable(8787);
    checks.push({
      label: 'Port 8787 available (jetic dev)',
      ok: portAvailable,
      detail: portAvailable ? undefined : 'in use — pass --port to "jetic dev"',
    });

    console.log('\nJETIC DOCTOR\n');
    let allOk = true;
    for (const check of checks) {
      allOk = allOk && check.ok;
      const icon = check.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      const detail = check.detail ? ` \x1b[2m(${check.detail})\x1b[0m` : '';
      console.log(`  ${icon} ${check.label}${detail}`);
    }

    console.log(allOk ? '\nNo problems found.\n' : '\nSome checks failed — see details above.\n');
    if (!allOk) process.exitCode = 1;
  });
