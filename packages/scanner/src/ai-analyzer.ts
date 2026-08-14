import { z } from 'zod';
import { Parameter, MiddlewareReference } from '@jetic/model';
import { JeticConfig } from '@jetic/core';

export interface EndpointContext {
  method: string;
  path: string;
  handlerName?: string;
  routeFileContent: string;
  contextFiles: Map<string, string>;
  /** Pre-discovered middleware names from static analysis */
  staticMiddleware?: string[];
}

export interface AnalysisResult {
  requestBody: Parameter[];
  returnOutput: Parameter[];
  middleware: MiddlewareReference[];
}

export class AiAnalyzer {
  constructor(private config: JeticConfig) {}

  public async analyzeEndpoint(context: EndpointContext): Promise<AnalysisResult> {
    if (!this.config.ai) {
      return { requestBody: [], returnOutput: [], middleware: [] };
    }

    const { provider, model, apiKeyEnvVar } = this.config.ai;
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      console.warn(`[Jetic AI] Missing API key in environment variable: ${apiKeyEnvVar}`);
      return { requestBody: [], returnOutput: [], middleware: [] };
    }

    if (provider !== 'openai' && provider !== 'openrouter') {
      console.warn(`[Jetic AI] Unsupported provider: ${provider}`);
      return { requestBody: [], returnOutput: [], middleware: [] };
    }

    try {
      // Use native dynamic import via Function to prevent TypeScript from transpiling it to require()
      const importDynamic = new Function('modulePath', 'return import(modulePath)');
      const { generateObject } = await importDynamic('ai');
      
      let aiModel;
      if (provider === 'openai') {
        const { createOpenAI } = await importDynamic('@ai-sdk/openai');
        const openai = createOpenAI({ apiKey });
        aiModel = openai(model);
      } else if (provider === 'openrouter') {
        const { createOpenRouter } = await importDynamic('@openrouter/ai-sdk-provider');
        const openrouter = createOpenRouter({ apiKey });
        aiModel = openrouter(model);
      }

      const prompt = this.buildPrompt(context);

      const { object } = await generateObject({
        model: aiModel!,
        mode: 'json',
        maxTokens: 500,
        schema: z.object({
          requestBody: z.array(z.object({
            name: z.string(),
            in: z.enum(['query', 'path', 'header', 'body']).optional(),
            type: z.string(),
            required: z.boolean().optional()
          })),
          returnOutput: z.array(z.object({
            name: z.string(),
            type: z.string()
          })),
          middleware: z.array(z.object({
            name: z.string()
          }))
        }),
        prompt,
      });

      return {
        requestBody: object.requestBody as Parameter[],
        returnOutput: object.returnOutput as Parameter[],
        middleware: object.middleware as MiddlewareReference[],
      };
    } catch (error: any) {
      if (error?.name === 'APICallError' || error?.statusCode === 401 || (error?.data && error?.data?.error?.code === 401)) {
        console.error('[Jetic AI] Failed to analyze endpoint: Unauthorized. Please check your API key in the environment variables.');
      } else {
        console.error('[Jetic AI] Failed to analyze endpoint:', error instanceof Error ? error.message : String(error));
      }
      return { requestBody: [], returnOutput: [], middleware: [] };
    }
  }

  /**
   * @deprecated Use analyzeEndpoint() instead. Kept for backward compatibility.
   */
  public async analyzeHandler(sourceCode: string): Promise<AnalysisResult> {
    return this.analyzeEndpoint({
      method: 'UNKNOWN',
      path: 'UNKNOWN',
      routeFileContent: sourceCode,
      contextFiles: new Map(),
    });
  }

  private buildPrompt(context: EndpointContext): string {
    const { method, path, handlerName, routeFileContent, contextFiles, staticMiddleware } = context;

    let prompt = `Analyze Express endpoint: ${method} ${path}`;
    if (handlerName) prompt += ` (handler: ${handlerName})`;
    if (staticMiddleware && staticMiddleware.length > 0) {
      prompt += `\nMiddleware: ${staticMiddleware.join(', ')}`;
    }
    prompt += `\n\n`;

    // Add route file — only include the route file content, trimmed
    prompt += `--- route file ---\n${routeFileContent.trim()}\n\n`;

    // Add context files (no grouping headers, just file names)
    for (const [filePath, content] of contextFiles) {
      const baseName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
      prompt += `--- ${baseName} ---\n${content.trim()}\n\n`;
    }

    prompt += `Extract for ${method} ${path} ONLY:\n`;
    prompt += `- requestBody: fields from req.body/params/query/headers. Set "in" accordingly.\n`;
    prompt += `- returnOutput: response fields from res.json/send. Use dot notation for nested.\n`;
    prompt += `- middleware: only middleware on this route, not the handler.\n`;

    return prompt;
  }
}
