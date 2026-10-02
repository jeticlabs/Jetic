import { Project } from 'ts-morph';
import { BehavioralModel, CURRENT_MODEL_VERSION, Environment, Parameter } from '@jetic/model';
import { normalizeDiscoveries } from './normalizer';
import { discoverRoutes } from './route-discovery';
import { isAuthMiddleware } from './security';
import { JeticConfig } from '@jetic/core';
import * as fs from 'fs';
import * as path from 'path';

// ─── Extract path parameters from an Express route path ──────────────────────

/**
 * Extracts parameter names from Express path patterns.
 * Handles:  /users/:id/posts/:postId   →  ['id', 'postId']
 *           /files/{fileId}            →  ['fileId']   (OpenAPI style)
 */
function extractPathParams(routePath: string): string[] {
  const params: string[] = [];
  // Express style :param
  const expressRe = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = expressRe.exec(routePath)) !== null) params.push(m[1]);
  // OpenAPI style {param}
  const openApiRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  while ((m = openApiRe.exec(routePath)) !== null) params.push(m[1]);
  return [...new Set(params)];
}

// ─── Environment Detection ────────────────────────────────────────────────────

function detectEnvironments(projectRoot: string, jeticDir: string): Environment[] {
  const existingModelPath = path.join(jeticDir, 'model.json');
  if (fs.existsSync(existingModelPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingModelPath, 'utf-8')) as BehavioralModel;
      if (existing.environments && existing.environments.length > 0) {
        return existing.environments;
      }
    } catch {}
  }

  let port = 3000;
  const envFilePath = path.join(projectRoot, '.env');
  if (fs.existsSync(envFilePath)) {
    try {
      const envContent = fs.readFileSync(envFilePath, 'utf-8');
      const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
      if (portMatch) port = parseInt(portMatch[1], 10);
    } catch {}
  }

  return [{ name: 'local', baseUrl: `http://localhost:${port}` }];
}

// ─── Progress Reporter ────────────────────────────────────────────────────────

class ProgressReporter {
  private startTime: number = Date.now();
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIdx = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;

  start() {
    this.startTime = Date.now();
    this.writeLine('');
    this.writeLine('  \x1b[46m\x1b[30m\x1b[1m JETIC \x1b[0m  \x1b[36m\x1b[1mStatic Scanner\x1b[0m');
    this.writeLine('');
  }

  phaseDiscovery() { this.startSpinner('🔍 Scanning project for routes...'); }

  discoveryResult(endpointCount: number, fileCount: number) {
    this.stopSpinner();
    this.writeLine(`  \x1b[32m✓\x1b[0m Found \x1b[1m${endpointCount}\x1b[0m endpoints across \x1b[1m${fileCount}\x1b[0m route files`);
    this.writeLine('');
  }

  phaseImportResolution() { this.startSpinner('📂 Resolving imports & dependencies...'); }

  importResolutionResult(routeFileCount: number, contextFileCount: number) {
    this.stopSpinner();
    this.writeLine(`  \x1b[32m✓\x1b[0m Resolved \x1b[1m${contextFileCount}\x1b[0m related files from \x1b[1m${routeFileCount}\x1b[0m route files`);
    this.writeLine('');
  }

  phaseAiAnalysis(_totalEndpoints: number) {
    this.writeLine('  \x1b[35m🤖 AI analyzing endpoints...\x1b[0m');
    this.writeLine('');
  }

  endpointAnalyzing(index: number, total: number, method: string, p: string) {
    const bar = this.buildProgressBar(index, total);
    process.stdout.write(`\r  ${bar} \x1b[33m${index}\x1b[0m/\x1b[1m${total}\x1b[0m  \x1b[2m⏳ ${method} ${p}\x1b[0m\x1b[K`);
  }

  endpointDone(index: number, total: number, method: string, p: string) {
    const bar = this.buildProgressBar(index + 1, total);
    process.stdout.write(`\r  ${bar} \x1b[32m${index + 1}\x1b[0m/\x1b[1m${total}\x1b[0m  \x1b[32m✓\x1b[0m ${method} ${p}\x1b[K`);
    process.stdout.write('\n');
  }

  endpointSkipped(index: number, total: number, method: string, p: string, reason: string) {
    const bar = this.buildProgressBar(index + 1, total);
    process.stdout.write(`\r  ${bar} \x1b[32m${index + 1}\x1b[0m/\x1b[1m${total}\x1b[0m  \x1b[33m⊘\x1b[0m ${method} ${p} \x1b[2m(${reason})\x1b[0m\x1b[K`);
    process.stdout.write('\n');
  }

  summary(stats: {
    endpoints: number;
    requestParams: number;
    responseFields: number;
    middlewareRefs: number;
    routeFiles: number;
    contextFiles: number;
  }) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    this.writeLine('');
    this.writeLine('  \x1b[2m──────────────────────────────────────────────────\x1b[0m');
    this.writeLine(`  \x1b[1m\x1b[32m✅ Analysis complete!\x1b[0m \x1b[2m(${elapsed}s)\x1b[0m`);
    this.writeLine('');
    this.writeLine(`  \x1b[36m├─\x1b[0m \x1b[1m${stats.endpoints}\x1b[0m endpoints discovered`);
    this.writeLine(`  \x1b[36m├─\x1b[0m \x1b[1m${stats.requestParams}\x1b[0m request parameters extracted`);
    this.writeLine(`  \x1b[36m├─\x1b[0m \x1b[1m${stats.responseFields}\x1b[0m response fields mapped`);
    this.writeLine(`  \x1b[36m├─\x1b[0m \x1b[1m${stats.middlewareRefs}\x1b[0m middleware references resolved`);
    this.writeLine(`  \x1b[36m└─\x1b[0m \x1b[1m${stats.routeFiles}\x1b[0m route files → \x1b[1m${stats.contextFiles}\x1b[0m related files resolved`);
    this.writeLine('');
  }

  private buildProgressBar(current: number, total: number): string {
    const width = 24;
    const filled = Math.round((current / total) * width);
    return '\x1b[35m' + '━'.repeat(filled) + '\x1b[2m' + '░'.repeat(width - filled) + '\x1b[0m';
  }

  private startSpinner(message: string) {
    this.spinnerIdx = 0;
    this.spinnerInterval = setInterval(() => {
      const frame = this.spinnerFrames[this.spinnerIdx % this.spinnerFrames.length];
      process.stdout.write(`\r  \x1b[36m${frame}\x1b[0m ${message}`);
      this.spinnerIdx++;
    }, 80);
  }

  private stopSpinner() {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
      process.stdout.write('\r\x1b[K');
    }
  }

  private writeLine(text: string) { console.log(text); }
}

// ─── Express Scanner ──────────────────────────────────────────────────────────

export class ExpressScanner {
  constructor(private config: JeticConfig) {
  }

  public async scan(): Promise<BehavioralModel> {
    const progress = new ProgressReporter();
    progress.start();

    // ── Phase 1: Static Discovery ───────────────────────────────────────────
    progress.phaseDiscovery();

    const project = new Project({
      tsConfigFilePath: `${this.config.projectRoot}/tsconfig.json`,
    });

    const rawDiscoveries = discoverRoutes(project);
    const endpoints = normalizeDiscoveries(rawDiscoveries);

    const uniqueRouteFiles = new Set(endpoints.map((ep) => ep.source.file));
    progress.discoveryResult(endpoints.length, uniqueRouteFiles.size);

    // ── Phase 2: Static parameter and middleware analysis ───────────────────
    for (const ep of endpoints) {
      const pathParamNames = extractPathParams(ep.path);
      if (pathParamNames.length > 0) {
        ep.parameters = pathParamNames.map((name): Parameter => ({
          name,
          in: 'path',
          type: 'string',
          required: true,
        }));
      }

      const authSchemes = ep.middleware
        .filter((middleware) => isAuthMiddleware(middleware.name))
        .map((middleware) => middleware.name);
      if (authSchemes.length > 0) {
        ep.security = authSchemes.map((scheme) => ({ scheme, required: true }));
      }
    }

    progress.summary({
      endpoints: endpoints.length,
      requestParams: endpoints.reduce((total, endpoint) => total + (endpoint.parameters?.length ?? 0), 0),
      responseFields: 0,
      middlewareRefs: endpoints.reduce((total, endpoint) => total + endpoint.middleware.length, 0),
      routeFiles: uniqueRouteFiles.size,
      contextFiles: 0,
    });

    return {
      version: CURRENT_MODEL_VERSION,
      generatedAt: new Date().toISOString(),
      project: {
        name: this.config.projectRoot.split('/').pop()?.split('\\').pop() || 'express-project',
        language: 'typescript',
        framework: 'express',
      },
      environments: detectEnvironments(this.config.projectRoot, this.config.jeticDir),
      securitySchemes: {},
      resources: [],
      endpoints,
      dependencies: [],
      workflows: [],
      stateMachines: [],
    };
  }
}
