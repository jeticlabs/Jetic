import { Project } from 'ts-morph';
import { BehavioralModel, CURRENT_MODEL_VERSION, Environment, Parameter, FieldDefinition } from '@jetic/model';
import { normalizeDiscoveries } from './normalizer';
import { discoverRoutes } from './route-discovery';
import { AiAnalyzer, isAuthMiddleware } from './ai-analyzer';
import { resolveRouteContext } from './import-resolver';
import { JeticConfig } from '@jetic/core';
import * as fs from 'fs';
import * as path from 'path';

// ─── HTTP methods that MUST NOT have a request body ──────────────────────────

const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
    this.writeLine('  \x1b[46m\x1b[30m\x1b[1m JETIC \x1b[0m  \x1b[36m\x1b[1mAI Scanner\x1b[0m');
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
  private aiAnalyzer: AiAnalyzer;

  constructor(private config: JeticConfig) {
    this.aiAnalyzer = new AiAnalyzer(config);
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

    // ── Phase 2: Import Resolution ──────────────────────────────────────────
    const routeContextCache = new Map<string, ReturnType<typeof resolveRouteContext>>();
    let totalContextFiles = 0;

    if (this.config.ai) {
      progress.phaseImportResolution();

      for (const routeFile of uniqueRouteFiles) {
        try {
          const ctx = resolveRouteContext(routeFile);
          routeContextCache.set(routeFile, ctx);
          totalContextFiles += ctx.contextFiles.size;
        } catch {
          // fallback: route file only
        }
      }

      progress.importResolutionResult(uniqueRouteFiles.size, totalContextFiles);

      // ── Phase 3: AI Analysis ─────────────────────────────────────────────
      progress.phaseAiAnalysis(endpoints.length);

      let requestParamCount = 0;
      let responseFieldCount = 0;
      let middlewareRefCount = 0;

      for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        const isNoBodyMethod = NO_BODY_METHODS.has(ep.method.toUpperCase());

        progress.endpointAnalyzing(i, endpoints.length, ep.method, ep.path);

        try {
          const routeCtx = routeContextCache.get(ep.source.file);
          const routeFileContent = routeCtx?.routeFile || '';
          const contextFiles = routeCtx?.contextFiles || new Map<string, string>();

          const aiData = await this.aiAnalyzer.analyzeEndpoint({
            method: ep.method,
            path: ep.path,
            handlerName: ep.handlerName,
            routeFileContent,
            contextFiles,
            staticMiddleware: ep.middleware.map((m) => m.name),
          });

          // ── 1. Separate body params from non-body params ──────────────────
          const bodyParams = isNoBodyMethod
            ? []
            : aiData.parameters.filter((p) => p.in === 'body');

          const nonBodyParams = aiData.parameters.filter((p) => p.in !== 'body');

          // ── 2. Path parameter injection ───────────────────────────────────
          // Ensure every :param in the path has a corresponding path parameter.
          const pathParamNames = extractPathParams(ep.path);
          const existingPathParamNames = new Set(
            nonBodyParams.filter((p) => p.in === 'path').map((p) => p.name)
          );
          for (const paramName of pathParamNames) {
            if (!existingPathParamNames.has(paramName)) {
              nonBodyParams.push({ name: paramName, in: 'path', type: 'string', required: true });
            }
          }

          // ── 3. Build requestBody (only for body-capable methods) ──────────
          if (!isNoBodyMethod && bodyParams.length > 0) {
            const fields: Record<string, FieldDefinition> = {};
            for (const p of bodyParams) {
              fields[p.name] = {
                type: p.type,
                required: p.required,
                ...(p.format ? { format: p.format } : {}),
                ...(p.description ? { description: p.description } : {}),
                
              };
            }

            // Detect content type
            let contentType = aiData.requestBodyContentType ?? 'application/json';
            if (ep.handlerName) {
              const hn = ep.handlerName.toLowerCase();
              if (hn.includes('upload') || hn.includes('file') || hn.includes('avatar') || hn.includes('image')) {
                contentType = 'multipart/form-data';
              }
            }

            ep.requestBody = {
              contentType,
              required: aiData.requestBodyRequired,
              fields,
              constraints: [],
            };
          } else {
            // Explicitly clear any requestBody that may have been set by static analysis
            delete (ep as any).requestBody;
          }

          // ── 4. Store non-body parameters ──────────────────────────────────
          if (nonBodyParams.length > 0) {
            ep.parameters = nonBodyParams.map((p) => {
              const param: Parameter = {
                name: p.name,
                in: p.in as Parameter['in'],
                type: p.type,
                required: p.required,
              };
              
              if (p.format) param.format = p.format;
              if (p.description) param.description = p.description;
              if (p.example) param.example = p.example;
              return param;
            });
          } else if (pathParamNames.length > 0) {
            // Even if AI returned nothing, ensure path params are recorded
            ep.parameters = pathParamNames.map((name) => ({
              name,
              in: 'path' as const,
              type: 'string',
              required: true,
            }));
          }

          // ── 5. Multi-status responses ─────────────────────────────────────
          if (aiData.responses.length > 0) {
            const responses: Record<string, any> = {};
            for (const r of aiData.responses) {
              const schema: Record<string, string> = {};
              for (const field of r.fields) {
                schema[field.name] = field.type;
              }
              responses[String(r.status)] = {
                contentType: 'application/json',
                description: r.description,
                ...(Object.keys(schema).length > 0 ? { schema } : {}),
              };
              responseFieldCount += r.fields.length;
            }
            ep.responses = responses;
          }

          // ── 6. Middleware ──────────────────────────────────────────────────
          if (aiData.middleware.length > 0) {
            ep.middleware = aiData.middleware;
          }

          // ── 7. Security wiring ─────────────────────────────────────────────
          // Use AI-detected schemes first, fall back to inspecting middleware names.
          const authSchemes: string[] = [...aiData.securitySchemes];
          if (authSchemes.length === 0) {
            for (const mw of ep.middleware) {
              if (isAuthMiddleware(mw.name)) authSchemes.push(mw.name);
            }
          }
          if (authSchemes.length > 0) {
            ep.security = authSchemes.map((scheme) => ({ scheme, required: true }));
          }

          requestParamCount += aiData.parameters.length;
          middlewareRefCount += ep.middleware.length;

          progress.endpointDone(i, endpoints.length, ep.method, ep.path);
        } catch {
          // On any error, still ensure path params are injected from the route pattern
          const pathParamNames = extractPathParams(ep.path);
          if (pathParamNames.length > 0 && !ep.parameters?.some((p) => p.in === 'path')) {
            ep.parameters = [
              ...(ep.parameters ?? []),
              ...pathParamNames.map((name) => ({
                name,
                in: 'path' as const,
                type: 'string',
                required: true,
              })),
            ];
          }
          // Ensure GET/HEAD/OPTIONS never have requestBody even on error
          if (isNoBodyMethod) delete (ep as any).requestBody;

          progress.endpointSkipped(i, endpoints.length, ep.method, ep.path, 'analysis failed');
        }
      }

      progress.summary({
        endpoints: endpoints.length,
        requestParams: requestParamCount,
        responseFields: responseFieldCount,
        middlewareRefs: middlewareRefCount,
        routeFiles: uniqueRouteFiles.size,
        contextFiles: totalContextFiles,
      });
    } else {
      // No AI — still inject path params from route patterns (free, no AI needed)
      for (const ep of endpoints) {
        const pathParamNames = extractPathParams(ep.path);
        if (pathParamNames.length > 0) {
          ep.parameters = pathParamNames.map((name) => ({
            name,
            in: 'path' as const,
            type: 'string',
            required: true,
          }));
        }
        // Wire security from static middleware
        const authSchemes = ep.middleware.filter((m) => isAuthMiddleware(m.name)).map((m) => m.name);
        if (authSchemes.length > 0) {
          ep.security = authSchemes.map((scheme) => ({ scheme, required: true }));
        }
      }
    }

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
