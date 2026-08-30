import { z } from 'zod';
import { MiddlewareReference } from '@jetic/model';
import { JeticConfig } from '@jetic/core';

// ─── Known auth middleware patterns ──────────────────────────────────────────

const AUTH_MIDDLEWARE_PATTERNS = [
  /authenticate/i,
  /authorize/i,
  /verifyJwt/i,
  /verifyToken/i,
  /requireAuth/i,
  /isAuth/i,
  /checkAuth/i,
  /authGuard/i,
  /jwtMiddleware/i,
  /bearerToken/i,
  /passportJwt/i,
  /ensureLoggedIn/i,
  /withAuth/i,
  /protected/i,
];

/** Returns true if the middleware name looks like an auth guard. */
export function isAuthMiddleware(name: string): boolean {
  return AUTH_MIDDLEWARE_PATTERNS.some((p) => p.test(name));
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface EndpointContext {
  method: string;
  path: string;
  handlerName?: string;
  routeFileContent: string;
  contextFiles: Map<string, string>;
  /** Pre-discovered middleware names from static analysis */
  staticMiddleware?: string[];
}

/** A single extracted parameter (unified — covers body, query, path, header, cookie). */
export interface ExtractedParam {
  name: string;
  /** Where in the HTTP request this parameter lives */
  in: 'body' | 'query' | 'path' | 'header' | 'cookie';
  type: string;
  format?: string;
  required?: boolean;
  description?: string;
  example?: string;
}

/** A single extracted response. */
export interface ExtractedResponse {
  status: number;
  description: string;
  /** Response body fields (dot-notation for nested). */
  fields: Array<{ name: string; type: string }>;
}

export interface AnalysisResult {
  /** All parameters — body, query, path, header, cookie unified. */
  parameters: ExtractedParam[];
  /** Request body content type (null means no body). */
  requestBodyContentType: string | null;
  /** Whether the request body is required. */
  requestBodyRequired: boolean;
  /** Response definitions for each status code. */
  responses: ExtractedResponse[];
  /** Auth scheme names detected from middleware. */
  securitySchemes: string[];
  /** Resolved middleware references. */
  middleware: MiddlewareReference[];
}

// ─── Zod schema for AI output ────────────────────────────────────────────────

const AI_OUTPUT_SCHEMA = z.object({
  parameters: z.array(
    z.object({
      name: z.string(),
      in: z.enum(['body', 'query', 'path', 'header', 'cookie']),
      type: z.string(),
      format: z.string().optional(),
      required: z.boolean().optional(),
      description: z.string().optional(),
      example: z.string().optional(),
    })
  ),
  requestBodyContentType: z.string().nullable().optional(),
  requestBodyRequired: z.boolean().optional(),
  responses: z.array(
    z.object({
      status: z.number(),
      description: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
        })
      ),
    })
  ),
  securitySchemes: z.array(z.string()).optional(),
  middleware: z.array(z.object({ name: z.string() })),
});

// ─── AiAnalyzer ──────────────────────────────────────────────────────────────

export class AiAnalyzer {
  constructor(private config: JeticConfig) {}

  public async analyzeEndpoint(context: EndpointContext): Promise<AnalysisResult> {
    const empty: AnalysisResult = {
      parameters: [],
      requestBodyContentType: null,
      requestBodyRequired: false,
      responses: [],
      securitySchemes: [],
      middleware: [],
    };

    if (!this.config.ai) return empty;

    const { provider, model, apiKeyEnvVar } = this.config.ai;
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      console.warn(`[Jetic AI] Missing API key in environment variable: ${apiKeyEnvVar}`);
      return empty;
    }

    if (provider !== 'openai' && provider !== 'openrouter') {
      console.warn(`[Jetic AI] Unsupported provider: ${provider}`);
      return empty;
    }

    try {
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
        maxTokens: 1500,
        schema: AI_OUTPUT_SCHEMA,
        prompt,
      });

      // Infer security schemes from static middleware names if AI didn't return any
      const staticSecuritySchemes: string[] = [];
      for (const mwName of context.staticMiddleware ?? []) {
        if (isAuthMiddleware(mwName)) {
          staticSecuritySchemes.push(mwName);
        }
      }

      return {
        parameters: object.parameters as ExtractedParam[],
        requestBodyContentType: object.requestBodyContentType ?? null,
        requestBodyRequired: object.requestBodyRequired ?? false,
        responses: object.responses as ExtractedResponse[],
        securitySchemes: (object.securitySchemes && object.securitySchemes.length > 0)
          ? object.securitySchemes
          : staticSecuritySchemes,
        middleware: object.middleware as MiddlewareReference[],
      };
    } catch (error: any) {
      if (
        error?.name === 'APICallError' ||
        error?.statusCode === 401 ||
        (error?.data && error?.data?.error?.code === 401)
      ) {
        console.error(
          '[Jetic AI] Failed to analyze endpoint: Unauthorized. Please check your API key in the environment variables.'
        );
      } else {
        console.error(
          '[Jetic AI] Failed to analyze endpoint:',
          error instanceof Error ? error.message : String(error)
        );
      }
      return empty;
    }
  }

  private buildPrompt(context: EndpointContext): string {
    const { method, path, handlerName, routeFileContent, contextFiles, staticMiddleware } = context;

    const noBodyMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

    let prompt = `You are an API documentation expert. Analyze this Express.js endpoint and extract its contract.\n\n`;
    prompt += `ENDPOINT: ${method.toUpperCase()} ${path}\n`;
    if (handlerName) prompt += `HANDLER: ${handlerName}\n`;
    if (staticMiddleware && staticMiddleware.length > 0) {
      prompt += `MIDDLEWARE (static): ${staticMiddleware.join(', ')}\n`;
    }
    prompt += `\n`;

    // Source files
    prompt += `--- route file ---\n${routeFileContent.trim()}\n\n`;
    for (const [filePath, content] of contextFiles) {
      const baseName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
      prompt += `--- ${baseName} ---\n${content.trim()}\n\n`;
    }

    prompt += `INSTRUCTIONS — extract for ${method.toUpperCase()} ${path} ONLY:\n\n`;

    prompt += `1. parameters: ALL inputs as a unified array. Use the correct "in" value:\n`;
    prompt += `   - "body"   → req.body fields (POST/PUT/PATCH only)\n`;
    prompt += `   - "query"  → req.query fields\n`;
    prompt += `   - "path"   → req.params fields (e.g. :id → name="id", in="path", required=true)\n`;
    prompt += `   - "header" → req.headers fields\n`;
    prompt += `   - "cookie" → req.cookies fields\n`;
    if (noBodyMethod) {
      prompt += `   IMPORTANT: ${method.toUpperCase()} requests CANNOT have a body. Do NOT emit any "in":"body" parameters.\n`;
    }
    prompt += `\n`;

    prompt += `2. requestBodyContentType: the content type of the request body.\n`;
    if (noBodyMethod) {
      prompt += `   IMPORTANT: must be null for ${method.toUpperCase()} — this method has no body.\n`;
    } else {
      prompt += `   Use one of: "application/json", "multipart/form-data", "application/x-www-form-urlencoded", "text/plain", "application/xml", "application/octet-stream".\n`;
      prompt += `   Detect from: multer/upload → "multipart/form-data"; bodyParser.urlencoded → "application/x-www-form-urlencoded"; default → "application/json".\n`;
    }
    prompt += `\n`;

    prompt += `3. requestBodyRequired: true if body is mandatory, false otherwise. Always false for ${method.toUpperCase()}.\n\n`;

    prompt += `4. responses: array of ALL possible response codes this endpoint returns (look for res.status(...).json(...) or res.json(...)).\n`;
    prompt += `   Include: 200, 201, 400, 401, 403, 404, 409, 422, 500, etc. — whatever the code actually sends.\n`;
    prompt += `   For each response: status (number), description (string), fields (dot-notation response body fields).\n\n`;

    prompt += `5. securitySchemes: auth scheme names if the route is protected. Look for middleware like authenticateToken, verifyJWT, authGuard, etc.\n`;
    prompt += `   Return the middleware function name(s) that enforce auth. Empty array if public.\n\n`;

    prompt += `6. middleware: only middleware for THIS route (not the handler). Return name only.\n\n`;

    prompt += `Return valid JSON matching the schema. Be accurate — only extract what you can actually see in the code.\n`;

    return prompt;
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
}
