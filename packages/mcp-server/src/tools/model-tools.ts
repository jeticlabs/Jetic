import { z } from 'zod';
import { loadModel } from '../types';

export const readModelSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder (defaults to current directory)'),
  summaryOnly: z.boolean().optional().describe('If true, returns top-level metadata and counts instead of full payload'),
});

export function handleReadModel(args: z.infer<typeof readModelSchema>) {
  const { model, filePath, exists } = loadModel(args.projectPath);

  const notFoundHint = exists
    ? undefined
    : 'No .jetic/model.json exists yet at this location — the payload above is an in-memory default. Run "jetic init" then "jetic scan" in the project root, or point projectPath / JETIC_PROJECT_PATH at the correct project.';

  if (args.summaryOnly) {
    return {
      filePath,
      modelExists: exists,
      ...(notFoundHint ? { hint: notFoundHint } : {}),
      version: model.version,
      project: model.project,
      stats: {
        environmentsCount: model.environments?.length || 0,
        endpointsCount: model.endpoints?.length || 0,
        resourcesCount: model.resources?.length || 0,
        workflowsCount: model.workflows?.length || 0,
        securitySchemesCount: Object.keys(model.securitySchemes || {}).length,
      },
      environments: model.environments,
      generatedAt: model.generatedAt,
    };
  }

  return {
    filePath,
    modelExists: exists,
    ...(notFoundHint ? { hint: notFoundHint } : {}),
    model,
  };
}

export const listEndpointsSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).optional().describe('Filter by HTTP method'),
  tag: z.string().optional().describe('Filter by tag'),
  resource: z.string().optional().describe('Filter by resource name'),
  pathContains: z.string().optional().describe('Filter by route path substring'),
});

export function handleListEndpoints(args: z.infer<typeof listEndpointsSchema>) {
  const { model, filePath, exists } = loadModel(args.projectPath);
  let endpoints = model.endpoints || [];

  if (args.method) {
    endpoints = endpoints.filter((e) => e.method.toUpperCase() === args.method?.toUpperCase());
  }

  if (args.tag) {
    const searchTag = args.tag.toLowerCase();
    endpoints = endpoints.filter((e) => e.tags?.some((t) => t.toLowerCase() === searchTag));
  }

  if (args.resource) {
    const searchRes = args.resource.toLowerCase();
    endpoints = endpoints.filter((e) => e.resource?.toLowerCase() === searchRes);
  }

  if (args.pathContains) {
    const searchPath = args.pathContains.toLowerCase();
    endpoints = endpoints.filter((e) => e.path.toLowerCase().includes(searchPath));
  }

  return {
    filePath,
    modelExists: exists,
    totalCount: model.endpoints?.length || 0,
    filteredCount: endpoints.length,
    endpoints: endpoints.map((e) => ({
      id: e.id,
      method: e.method,
      path: e.path,
      name: e.name || e.summary || `${e.method} ${e.path}`,
      tags: e.tags || [],
      resource: e.resource,
      parametersCount: e.parameters?.length || 0,
      hasRequestBody: !!e.requestBody,
      responseCodes: Object.keys(e.responses || {}),
      source: e.source,
    })),
  };
}

export const getEndpointSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  id: z.string().optional().describe('Endpoint UUID identifier'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).optional().describe('HTTP method'),
  path: z.string().optional().describe('Endpoint path (e.g. /api/users/:id)'),
});

export function handleGetEndpoint(args: z.infer<typeof getEndpointSchema>) {
  const { model, filePath } = loadModel(args.projectPath);

  if (!args.id && (!args.method || !args.path)) {
    throw new Error('Must provide either "id" or both "method" and "path" to fetch an endpoint.');
  }

  const endpoint = model.endpoints.find((e) => {
    if (args.id && e.id === args.id) return true;
    if (args.method && args.path && e.method.toUpperCase() === args.method.toUpperCase() && e.path === args.path) {
      return true;
    }
    return false;
  });

  if (!endpoint) {
    return {
      found: false,
      message: `Endpoint not found matching: ${args.id || `${args.method} ${args.path}`}`,
    };
  }

  return {
    found: true,
    filePath,
    endpoint,
  };
}
