import { z } from 'zod';
import { randomUUID } from 'crypto';
import { loadModel, saveModel } from '../types';
import {
  Endpoint,
  Parameter,
  RequestBody,
  ResponseDefinition,
  EndpointSecurity,
  SourceReference,
  MiddlewareReference,
  PaginationConfig,
  RateLimitConfig,
  OwnershipConfig,
  EndpointProduces,
  EndpointConsumes,
} from '@jetic/model';

// ── Shared sub-schemas (reused by add + update) ─────────────────────────────

const parameterSchema = z.object({
  name: z.string().min(1).describe('Parameter name'),
  in: z.enum(['query', 'path', 'header', 'cookie', 'body']).optional().describe('Parameter location in HTTP request'),
  type: z.string().default('string').describe('Data type (string, number, boolean, array, object)'),
  format: z.string().optional().describe('Format specifier (e.g. uuid, email, date-time, int64)'),
  required: z.boolean().optional().describe('Whether parameter is required'),
  min: z.number().optional().describe('Minimum numeric value'),
  max: z.number().optional().describe('Maximum numeric value'),
  default: z.any().optional().describe('Default value'),
  example: z.any().optional().describe('Example value'),
  description: z.string().optional().describe('Description'),
});

const fieldDefinitionSchema = z.object({
  type: z.string().describe('Data type (string, number, boolean, array, object)'),
  format: z.string().optional().describe('Format specifier'),
  required: z.boolean().optional().describe('Required flag'),
  min: z.number().optional().describe('Minimum numeric value'),
  max: z.number().optional().describe('Maximum numeric value'),
  minLength: z.number().optional().describe('Minimum string length'),
  maxLength: z.number().optional().describe('Maximum string length'),
  description: z.string().optional().describe('Description'),
  example: z.any().optional().describe('Example value'),
  default: z.any().optional().describe('Default value'),
  enum: z.array(z.string()).optional().describe('Allowed enum values'),
});

export const constraintSchema = z.object({
  field: z.string().optional().describe('Field this constraint applies to'),
  rule: z.string().optional().describe('Rule name (e.g. minLength, matches, requiredIf)'),
  value: z.any().optional().describe('Rule value / threshold'),
  conflictStatus: z.number().int().optional().describe('HTTP status on conflict'),
  failureStatus: z.number().int().optional().describe('HTTP status on validation failure'),
  when: z.object({
    field: z.string().describe('Condition field'),
    present: z.boolean().optional(),
    equals: z.any().optional(),
  }).optional().describe('Conditional constraint trigger'),
  then: z.object({
    field: z.string().describe('Field to constrain'),
    type: z.string().describe('Expected type when condition holds'),
  }).optional().describe('Conditional constraint effect'),
});

const requestBodySchema = z.object({
  contentType: z.string().nullable().default('application/json').describe('Content-Type header (e.g. application/json, multipart/form-data)'),
  required: z.boolean().optional().describe('Whether request body is required'),
  fields: z.record(fieldDefinitionSchema).default({}).describe('Key-value record of payload fields'),
  constraints: z.array(constraintSchema).optional().describe('Business-rule constraints extracted from handler logic (e.g. password minLength)'),
});

const responseDefinitionSchema = z.object({
  contentType: z.string().optional().default('application/json'),
  description: z.string().optional().describe('Human readable response description'),
  schema: z.record(z.string()).optional().describe('Response body schema description (field -> type, dot paths allowed)'),
  example: z.any().optional().describe('Response payload example'),
  condition: z.string().optional().describe('Condition under which this response occurs'),
  ownershipCheck: z.boolean().optional().describe('Whether this response enforces an ownership check'),
});

const endpointSecuritySchema = z.object({
  scheme: z.string().describe('Name of security scheme declared in top-level securitySchemes (e.g. bearerAuth, apiKey)'),
  required: z.boolean().optional().default(true),
  scopes: z.array(z.string()).optional().describe('OAuth2 scopes (only for oauth2 schemes)'),
});

const sourceReferenceSchema = z.object({
  file: z.string().describe('Relative or absolute path to source file containing handler/route'),
  line: z.number().describe('Line number in source file'),
  column: z.number().optional(),
});

const middlewareSchema = z.object({
  name: z.string().min(1).describe('Middleware name as in code (e.g. "auth", "cors", "express.json", "rateLimit")'),
  type: z.string().optional().describe('Middleware category (e.g. "auth", "parser", "cors", "rate-limit", "validation", "logging")'),
  scheme: z.string().optional().describe('Security scheme this middleware enforces (e.g. bearerAuth)'),
  config: z.record(z.any()).optional().describe('Middleware options (e.g. { "max": 100, "windowMs": 60000 })'),
  source: sourceReferenceSchema.optional().describe('Where the middleware is applied in source'),
});

const paginationSchema = z.object({
  type: z.enum(['offset', 'cursor', 'page']).describe('Pagination strategy'),
  pageParam: z.string().optional().describe('Query param for page number/offset (e.g. "page")'),
  limitParam: z.string().optional().describe('Query param for page size (e.g. "limit")'),
  cursorParam: z.string().optional().describe('Query param for cursor (cursor strategy)'),
  totalPath: z.string().optional().describe('Response path to total count (e.g. "meta.total")'),
});

const rateLimitSchema = z.object({
  windowMs: z.number().int().positive().describe('Rate-limit window in milliseconds'),
  max: z.number().int().positive().describe('Max requests per window'),
  scope: z.string().optional().describe('Limit scope (e.g. "ip", "user", "global")'),
});

const ownershipSchema = z.object({
  ownerField: z.string().describe('Resource field holding the owner id (e.g. "userId")'),
  mustMatchAuthClaim: z.string().describe('Auth claim it must equal (e.g. "sub")'),
});

const producesSchema = z.object({
  variable: z.string().optional().describe('Memory variable name produced (e.g. "accessToken")'),
  responseField: z.string().optional().describe('Response path the value comes from (e.g. "data.accessToken")'),
  resourceStateChange: z.object({
    resource: z.string(),
    field: z.string(),
    setFrom: z.string(),
  }).optional().describe('Resource state mutation caused by this endpoint'),
});

const consumesSchema = z.object({
  variable: z.string().describe('Memory variable consumed (e.g. "accessToken")'),
  usedAs: z.string().describe('How it is used: "header:<Name>" (Bearer prefix auto-added for Authorization) or "body:<field>" / "query:<param>"'),
  producedBy: z.string().optional().describe('"METHOD /path" of the endpoint that produces it'),
});

// ── jetic_add_endpoint ──────────────────────────────────────────────────────

export const addEndpointSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).describe('HTTP method'),
  path: z.string().describe('Route path (e.g., /api/v1/users or /api/users/:id)'),
  name: z.string().optional().describe('Human-readable endpoint name (e.g., "Create User")'),
  summary: z.string().optional().describe('Short one-line summary'),
  description: z.string().optional().describe('Detailed description of endpoint functionality'),
  tags: z.array(z.string()).optional().describe('Category tags (e.g., ["users", "auth"])'),
  deprecated: z.boolean().optional().describe('Mark endpoint as deprecated'),
  timeout: z.number().int().positive().optional().describe('Request timeout in milliseconds'),
  handlerName: z.string().optional().describe('Handler / controller function name (e.g. UserController.create)'),
  resource: z.string().optional().describe('Associated domain resource (e.g. User, Order)'),
  source: sourceReferenceSchema.optional().describe('Source code provenance location'),
  security: z.array(endpointSecuritySchema).optional().describe('Security requirements (schemes must exist in top-level securitySchemes)'),
  middleware: z.array(middlewareSchema).optional().describe('Middleware chain IN EXECUTION ORDER (e.g. cors → json parser → auth → rateLimit → validator)'),
  parameters: z.array(parameterSchema).optional().describe('Query, path, header, or cookie parameters'),
  requestBody: requestBodySchema.optional().describe('Request body specification incl. business-rule constraints'),
  responses: z.record(responseDefinitionSchema).optional().describe('Response definitions keyed by status code (e.g. "200", "400")'),
  pagination: paginationSchema.optional().describe('Pagination config for list endpoints'),
  rateLimit: rateLimitSchema.optional().describe('Rate-limit config'),
  ownership: ownershipSchema.optional().describe('Ownership / authorization rule'),
  produces: z.array(producesSchema).optional().describe('Memory variables produced from responses (feeds workflows)'),
  consumes: z.array(consumesSchema).optional().describe('Memory variables consumed as headers/body (chained auth)'),
  overwriteIfExists: z.boolean().optional().default(true).describe('If endpoint with same method and path exists, update it instead of erroring'),
});

export function handleAddEndpoint(args: z.infer<typeof addEndpointSchema>) {
  const { model, filePath } = loadModel(args.projectPath);

  const normalizedPath = args.path.startsWith('/') ? args.path : `/${args.path}`;
  const methodUpper = args.method.toUpperCase() as Endpoint['method'];
  // NOTE: zod `.default(true)` only applies through schema validation (MCP
  // transport). Direct library callers may omit it, so anything but explicit
  // `false` counts as true.
  const overwriteIfExists = args.overwriteIfExists !== false;

  const existingIndex = model.endpoints.findIndex(
    (e) => e.method.toUpperCase() === methodUpper && e.path === normalizedPath
  );

  if (existingIndex >= 0 && !overwriteIfExists) {
    throw new Error(
      `Endpoint ${methodUpper} ${normalizedPath} already exists in ${filePath}. Set overwriteIfExists: true to update it.`
    );
  }

  for (const mw of args.middleware || []) {
    if (!mw.name || !mw.name.trim()) {
      throw new Error('Middleware entries must have a non-empty "name".');
    }
  }

  // Derive source reference if not provided
  const source: SourceReference = args.source || {
    file: 'manual-mcp',
    line: 1,
  };

  // Build standard responses if none specified
  const responses: Record<string, ResponseDefinition> = args.responses || {
    '200': {
      contentType: 'application/json',
      description: 'Successful request execution',
    },
    '400': {
      contentType: 'application/json',
      description: 'Bad request validation failure',
    },
    '500': {
      contentType: 'application/json',
      description: 'Internal server error',
    },
  };

  const previous = existingIndex >= 0 ? model.endpoints[existingIndex] : undefined;

  const newEndpoint: Endpoint = {
    id: previous?.id || randomUUID(),
    method: methodUpper,
    path: normalizedPath,
    name: args.name || `${methodUpper} ${normalizedPath}`,
    summary: args.summary,
    description: args.description,
    tags: args.tags || [],
    deprecated: args.deprecated,
    timeout: args.timeout,
    handlerName: args.handlerName,
    resource: args.resource,
    source,
    security: args.security as EndpointSecurity[] | undefined,
    // Explicit middleware wins; otherwise preserve the previous chain (never silently drop it).
    middleware: (args.middleware as MiddlewareReference[] | undefined) || previous?.middleware || [],
    parameters: args.parameters as Parameter[] | undefined,
    requestBody: args.requestBody as RequestBody | undefined,
    responses,
    pagination: args.pagination as PaginationConfig | undefined,
    rateLimit: (args.rateLimit as RateLimitConfig | undefined) || previous?.rateLimit,
    ownership: args.ownership as OwnershipConfig | undefined,
    produces: args.produces as EndpointProduces[] | undefined,
    consumes: args.consumes as EndpointConsumes[] | undefined,
  };

  if (existingIndex >= 0) {
    model.endpoints[existingIndex] = newEndpoint;
  } else {
    model.endpoints.push(newEndpoint);
  }

  saveModel(filePath, model);

  const unknownSchemes = (args.security || [])
    .map((s) => s.scheme)
    .filter((scheme) => model.securitySchemes && !(scheme in (model.securitySchemes || {})));

  return {
    success: true,
    action: existingIndex >= 0 ? 'updated' : 'added',
    filePath,
    endpointId: newEndpoint.id,
    ...(unknownSchemes.length > 0
      ? {
          warning: `Security scheme(s) not declared in top-level securitySchemes: ${unknownSchemes.join(', ')}. Declare them or run jetic_verify_model for details.`,
        }
      : {}),
    endpoint: newEndpoint,
  };
}

// ── jetic_update_endpoint ───────────────────────────────────────────────────

const endpointUpdatesSchema = z.object({
  name: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  deprecated: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
  handlerName: z.string().optional(),
  resource: z.string().optional(),
  source: sourceReferenceSchema.optional(),
  security: z.array(endpointSecuritySchema).optional(),
  middleware: z.array(middlewareSchema).optional().describe('Replaces the whole middleware chain (order = execution order)'),
  parameters: z.array(parameterSchema).optional(),
  requestBody: requestBodySchema.optional(),
  responses: z.record(responseDefinitionSchema).optional(),
  pagination: paginationSchema.optional(),
  rateLimit: rateLimitSchema.nullable().optional().describe('Set to null to remove rate limiting'),
  ownership: ownershipSchema.optional(),
  produces: z.array(producesSchema).optional(),
  consumes: z.array(consumesSchema).optional(),
});

export const updateEndpointSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  id: z.string().optional().describe('Target endpoint UUID'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).optional().describe('HTTP method'),
  path: z.string().optional().describe('Route path'),
  updates: endpointUpdatesSchema.describe('Partial endpoint properties to update (middleware replaces the whole chain)'),
});

export function handleUpdateEndpoint(args: z.infer<typeof updateEndpointSchema>) {
  const { model, filePath } = loadModel(args.projectPath);

  if (!args.id && (!args.method || !args.path)) {
    throw new Error('Must specify either "id" or both "method" and "path" to update an endpoint.');
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

  const { updates } = args;
  if (updates.name !== undefined) endpoint.name = updates.name;
  if (updates.summary !== undefined) endpoint.summary = updates.summary;
  if (updates.description !== undefined) endpoint.description = updates.description;
  if (updates.tags !== undefined) endpoint.tags = updates.tags;
  if (updates.deprecated !== undefined) endpoint.deprecated = updates.deprecated;
  if (updates.timeout !== undefined) endpoint.timeout = updates.timeout;
  if (updates.handlerName !== undefined) endpoint.handlerName = updates.handlerName;
  if (updates.resource !== undefined) endpoint.resource = updates.resource;
  if (updates.source !== undefined) endpoint.source = updates.source;
  if (updates.security !== undefined) endpoint.security = updates.security as EndpointSecurity[];
  if (updates.middleware !== undefined) {
    for (const mw of updates.middleware) {
      if (!mw.name || !mw.name.trim()) throw new Error('Middleware entries must have a non-empty "name".');
    }
    endpoint.middleware = updates.middleware as MiddlewareReference[];
  }
  if (updates.parameters !== undefined) endpoint.parameters = updates.parameters as Parameter[];
  if (updates.requestBody !== undefined) endpoint.requestBody = updates.requestBody as RequestBody;
  if (updates.responses !== undefined) endpoint.responses = updates.responses;
  if (updates.pagination !== undefined) endpoint.pagination = updates.pagination as PaginationConfig;
  if (updates.rateLimit !== undefined) endpoint.rateLimit = updates.rateLimit as RateLimitConfig | null;
  if (updates.ownership !== undefined) endpoint.ownership = updates.ownership as OwnershipConfig;
  if (updates.produces !== undefined) endpoint.produces = updates.produces as EndpointProduces[];
  if (updates.consumes !== undefined) endpoint.consumes = updates.consumes as EndpointConsumes[];

  saveModel(filePath, model);

  return {
    success: true,
    action: 'updated',
    filePath,
    endpointId: endpoint.id,
    endpoint,
  };
}

// ── jetic_delete_endpoint ───────────────────────────────────────────────────

export const deleteEndpointSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
  id: z.string().optional().describe('Target endpoint UUID'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).optional().describe('HTTP method'),
  path: z.string().optional().describe('Route path'),
});

export function handleDeleteEndpoint(args: z.infer<typeof deleteEndpointSchema>) {
  const { model, filePath } = loadModel(args.projectPath);

  if (!args.id && (!args.method || !args.path)) {
    throw new Error('Must specify either "id" or both "method" and "path" to delete an endpoint.');
  }

  const initialLength = model.endpoints.length;

  model.endpoints = model.endpoints.filter((e) => {
    if (args.id && e.id === args.id) return false;
    if (args.method && args.path && e.method.toUpperCase() === args.method.toUpperCase() && e.path === args.path) {
      return false;
    }
    return true;
  });

  const removedCount = initialLength - model.endpoints.length;

  if (removedCount === 0) {
    return {
      success: false,
      message: `No endpoint matched for deletion: ${args.id || `${args.method} ${args.path}`}`,
    };
  }

  saveModel(filePath, model);

  return {
    success: true,
    action: 'deleted',
    removedCount,
    filePath,
  };
}

