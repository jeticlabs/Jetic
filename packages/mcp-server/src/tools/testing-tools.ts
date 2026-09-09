import { z } from 'zod';
import { loadModel } from '../types';
import { EndpointSimulator } from '@jetic/simulator';

export const testEndpointSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  id: z.string().optional().describe('Endpoint UUID identifier'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).optional().describe('HTTP method'),
  path: z.string().optional().describe('Endpoint route path'),
  envName: z.string().optional().describe('Target environment name (e.g. local, staging)'),
  baseUrl: z.string().optional().describe('Override target base URL (e.g. http://localhost:4000)'),
  customHeaders: z.record(z.string()).optional().describe('Custom request headers merged over generated ones (e.g. Authorization token). Actually sent with the request.'),
  customBody: z.record(z.any()).optional().describe('Custom request body payload replacing the generated one. Actually sent with the request.'),
  customQuery: z.record(z.any()).optional().describe('Custom query parameters merged over generated ones. Actually sent with the request.'),
  timeoutMs: z.number().int().positive().max(120000).optional().describe('Request timeout in milliseconds (default 15000, max 120000)'),
});

export async function handleTestEndpoint(args: z.infer<typeof testEndpointSchema>) {
  const { model, filePath } = loadModel(args.projectPath);

  if (!args.id && (!args.method || !args.path)) {
    throw new Error('Must provide either "id" or both "method" and "path" to test an endpoint.');
  }

  const endpoint = model.endpoints.find((e) => {
    if (args.id && e.id === args.id) return true;
    if (args.method && args.path && e.method.toUpperCase() === args.method.toUpperCase() && e.path === args.path) {
      return true;
    }
    return false;
  });

  if (!endpoint) {
    throw new Error(`Endpoint not found matching: ${args.id || `${args.method} ${args.path}`}`);
  }

  // Determine target base URL
  let targetEnv = model.environments?.find((e) => e.name === args.envName);
  if (!targetEnv) {
    targetEnv = model.environments?.[0] || { name: 'local', baseUrl: 'http://localhost:3000' };
  }

  const effectiveEnv = {
    ...targetEnv,
    baseUrl: args.baseUrl || targetEnv.baseUrl,
  };

  // Overrides are forwarded into the simulator so they are REALLY sent on
  // the wire (not just echoed back in the response object).
  const simulator = new EndpointSimulator(model, effectiveEnv);
  const result = await simulator.simulateEndpoint(endpoint, {
    headers: args.customHeaders,
    body: args.customBody,
    queryParams: args.customQuery,
    timeoutMs: args.timeoutMs,
  });

  return {
    success: result.passed,
    filePath,
    targetUrl: result.fullUrl,
    request: {
      method: result.method,
      path: result.path,
      headers: result.requestHeaders,
      queryParams: result.queryParams,
      body: result.requestBody,
    },
    response: {
      status: result.responseStatus,
      responseTimeMs: result.responseTimeMs,
      body: result.responseBody,
    },
    validation: {
      passed: result.validation.passed,
      failedFields: result.validation.failedFields,
      fieldValidations: result.validation.fieldValidations,
    },
    skipped: result.skipped,
    skipReason: result.skipReason,
    error: result.error,
  };
}
