import { Project } from 'ts-morph';
import { BehavioralModel, CURRENT_MODEL_VERSION } from '@jetic/model';
import { normalizeDiscoveries } from './normalizer';
import { discoverRoutes } from './route-discovery';
import { AiAnalyzer } from './ai-analyzer';
import { JeticConfig } from '@jetic/core';
import * as fs from 'fs';

export class ExpressScanner {
  private aiAnalyzer: AiAnalyzer;

  constructor(private config: JeticConfig) {
    this.aiAnalyzer = new AiAnalyzer(config);
  }

  public async scan(): Promise<BehavioralModel> {
    const project = new Project({
      tsConfigFilePath: `${this.config.projectRoot}/tsconfig.json`,
    });

    const rawDiscoveries = discoverRoutes(project);
    const endpoints = normalizeDiscoveries(rawDiscoveries);

    // AI Enrichment
    if (this.config.ai) {
      console.log(`[Jetic AI] Enriching ${endpoints.length} endpoints via ${this.config.ai.provider}...`);
      for (const ep of endpoints) {
        try {
          // Extremely naive code extraction for MVP
          const code = fs.readFileSync(ep.source.file, 'utf8').split('\n').slice(ep.source.line - 1, ep.source.line + 10).join('\n');
          const aiData = await this.aiAnalyzer.analyzeHandler(code);
          ep.parameters = aiData.parameters;
          ep.middleware = aiData.middleware;
        } catch (e) {
          // ignore
        }
      }
    }

    return {
      version: CURRENT_MODEL_VERSION,
      generatedAt: new Date().toISOString(),
      project: { name: 'express-project' },
      endpoints,
    };
  }
}
