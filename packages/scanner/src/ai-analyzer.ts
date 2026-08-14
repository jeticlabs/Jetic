import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { Parameter, MiddlewareReference } from '@jetic/model';
import { JeticConfig } from '@jetic/core';

export class AiAnalyzer {
  constructor(private config: JeticConfig) {}

  public async analyzeHandler(sourceCode: string): Promise<{ parameters: Parameter[], middleware: MiddlewareReference[] }> {
    if (!this.config.ai) {
      return { parameters: [], middleware: [] }; // Return empty if AI not configured
    }

    const { provider, model, apiKeyEnvVar } = this.config.ai;
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      console.warn(`[Jetic AI] Missing API key in environment variable: ${apiKeyEnvVar}`);
      return { parameters: [], middleware: [] };
    }

    if (provider !== 'openai') {
      console.warn(`[Jetic AI] Unsupported provider: ${provider}`);
      return { parameters: [], middleware: [] };
    }

    const openai = createOpenAI({
      apiKey,
    });

    try {
      const { object } = await generateObject({
        model: openai(model),
        schema: z.object({
          parameters: z.array(z.object({
            name: z.string(),
            in: z.enum(['query', 'path', 'header', 'body']),
            type: z.string(),
            required: z.boolean()
          })).describe("Parameters extracted from request properties like req.params, req.body, etc."),
          middleware: z.array(z.object({
            name: z.string()
          })).describe("Any explicit middleware detected inside the handler logic.")
        }),
        prompt: `Analyze the following Express route handler and extract the expected parameters and middleware usage.
        
Handler Source:
\`\`\`typescript
${sourceCode}
\`\`\`
`,
      });

      return {
        parameters: object.parameters as Parameter[],
        middleware: object.middleware as MiddlewareReference[],
      };
    } catch (error) {
      console.error('[Jetic AI] Failed to analyze handler', error);
      return { parameters: [], middleware: [] };
    }
  }
}
