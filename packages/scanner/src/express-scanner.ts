import { Project } from 'ts-morph';
import { BehavioralModel, CURRENT_MODEL_VERSION } from '@jetic/model';
import { normalizeDiscoveries } from './normalizer';
import { discoverRoutes } from './route-discovery';
import { AiAnalyzer } from './ai-analyzer';
import { resolveRouteContext } from './import-resolver';
import { JeticConfig } from '@jetic/core';

// ─── Progress Reporter ───────────────────────────────────────────────
class ProgressReporter {
  private startTime: number = Date.now();
  private currentPhase: string = '';
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIdx = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private linesWritten = 0;

  start() {
    this.startTime = Date.now();
    this.writeLine('');
    this.writeLine('  \x1b[1m\x1b[36m⚡ Jetic AI Scanner\x1b[0m');
    this.writeLine('  \x1b[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    this.writeLine('');
  }

  phaseDiscovery() {
    this.currentPhase = 'discovery';
    this.startSpinner('🔍 Scanning project for routes...');
  }

  discoveryResult(endpointCount: number, fileCount: number) {
    this.stopSpinner();
    this.writeLine(`  \x1b[32m✓\x1b[0m Found \x1b[1m${endpointCount}\x1b[0m endpoints across \x1b[1m${fileCount}\x1b[0m route files`);
    this.writeLine('');
  }

  phaseImportResolution() {
    this.currentPhase = 'import-resolution';
    this.startSpinner('📂 Resolving imports & dependencies...');
  }

  importResolutionResult(routeFileCount: number, contextFileCount: number) {
    this.stopSpinner();
    this.writeLine(`  \x1b[32m✓\x1b[0m Resolved \x1b[1m${contextFileCount}\x1b[0m related files from \x1b[1m${routeFileCount}\x1b[0m route files`);
    this.writeLine('');
  }

  phaseAiAnalysis(totalEndpoints: number) {
    this.currentPhase = 'ai-analysis';
    this.writeLine('  \x1b[35m🤖 AI analyzing endpoints...\x1b[0m');
    this.writeLine('');
  }

  endpointAnalyzing(index: number, total: number, method: string, path: string) {
    const progressBar = this.buildProgressBar(index, total);
    const label = `${method} ${path}`;
    // Write progress line (will be overwritten)
    process.stdout.write(`\r  ${progressBar} \x1b[33m${index}\x1b[0m/\x1b[1m${total}\x1b[0m  \x1b[2m⏳ ${label}\x1b[0m\x1b[K`);
  }

  endpointDone(index: number, total: number, method: string, path: string) {
    const progressBar = this.buildProgressBar(index + 1, total);
    const label = `${method} ${path}`;
    process.stdout.write(`\r  ${progressBar} \x1b[32m${index + 1}\x1b[0m/\x1b[1m${total}\x1b[0m  \x1b[32m✓\x1b[0m ${label}\x1b[K`);
    process.stdout.write('\n');
  }

  endpointSkipped(index: number, total: number, method: string, path: string, reason: string) {
    const progressBar = this.buildProgressBar(index + 1, total);
    process.stdout.write(`\r  ${progressBar} \x1b[32m${index + 1}\x1b[0m/\x1b[1m${total}\x1b[0m  \x1b[33m⊘\x1b[0m ${method} ${path} \x1b[2m(${reason})\x1b[0m\x1b[K`);
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
    this.writeLine('  \x1b[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
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
    const empty = width - filled;
    const bar = '\x1b[35m' + '━'.repeat(filled) + '\x1b[2m' + '░'.repeat(empty) + '\x1b[0m';
    return bar;
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
      process.stdout.write('\r\x1b[K'); // clear line
    }
  }

  private writeLine(text: string) {
    console.log(text);
    this.linesWritten++;
  }
}

// ─── Express Scanner ──────────────────────────────────────────────────
export class ExpressScanner {
  private aiAnalyzer: AiAnalyzer;

  constructor(private config: JeticConfig) {
    this.aiAnalyzer = new AiAnalyzer(config);
  }

  public async scan(): Promise<BehavioralModel> {
    const progress = new ProgressReporter();
    progress.start();

    // ── Phase 1: Discovery ──────────────────────────────────────────
    progress.phaseDiscovery();

    const project = new Project({
      tsConfigFilePath: `${this.config.projectRoot}/tsconfig.json`,
    });

    const rawDiscoveries = discoverRoutes(project);
    const endpoints = normalizeDiscoveries(rawDiscoveries);

    // Count unique route files
    const uniqueRouteFiles = new Set(endpoints.map((ep) => ep.source.file));
    progress.discoveryResult(endpoints.length, uniqueRouteFiles.size);

    // ── Phase 2: Import Resolution ──────────────────────────────────
    let totalContextFiles = 0;

    // Cache resolved context per route file (so we don't re-resolve the same file)
    const routeContextCache = new Map<string, ReturnType<typeof resolveRouteContext>>();

    if (this.config.ai) {
      progress.phaseImportResolution();

      for (const routeFile of uniqueRouteFiles) {
        try {
          const ctx = resolveRouteContext(routeFile);
          routeContextCache.set(routeFile, ctx);
          totalContextFiles += ctx.contextFiles.size;
        } catch {
          // If resolution fails, we'll fall back to just the route file
        }
      }

      progress.importResolutionResult(uniqueRouteFiles.size, totalContextFiles);

      // ── Phase 3: AI Analysis ────────────────────────────────────────
      progress.phaseAiAnalysis(endpoints.length);

      let requestParamCount = 0;
      let responseFieldCount = 0;
      let middlewareRefCount = 0;

      for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        progress.endpointAnalyzing(i, endpoints.length, ep.method, ep.path);

        try {
          // Get the cached route context
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

          ep.requestBody = aiData.requestBody;
          ep.returnOutput = aiData.returnOutput;
          // Merge: prefer AI middleware but keep static middleware as fallback
          if (aiData.middleware.length > 0) {
            ep.middleware = aiData.middleware;
          }
          // else keep the statically discovered middleware from normalizer

          requestParamCount += ep.requestBody.length;
          responseFieldCount += ep.returnOutput.length;
          middlewareRefCount += ep.middleware.length;

          progress.endpointDone(i, endpoints.length, ep.method, ep.path);
        } catch (e) {
          progress.endpointSkipped(i, endpoints.length, ep.method, ep.path, 'analysis failed');
        }
      }

      // ── Summary ──────────────────────────────────────────────────────
      progress.summary({
        endpoints: endpoints.length,
        requestParams: requestParamCount,
        responseFields: responseFieldCount,
        middlewareRefs: middlewareRefCount,
        routeFiles: uniqueRouteFiles.size,
        contextFiles: totalContextFiles,
      });
    }

    return {
      version: CURRENT_MODEL_VERSION,
      generatedAt: new Date().toISOString(),
      project: { name: this.config.projectRoot.split('/').pop()?.split('\\').pop() || 'express-project' },
      endpoints,
    };
  }
}
