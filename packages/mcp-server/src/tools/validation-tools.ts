import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { loadModel, projectRootOfModel } from '../types';

export const verifyModelSchema = z.object({
  projectPath: z.string().optional().describe('Path to project root or .jetic folder'),
});

export interface VerificationIssue {
  severity: 'error' | 'warning';
  endpointId?: string;
  route?: string;
  code: string;
  message: string;
  recommendation: string;
}

function extractPathParams(routePath: string): string[] {
  const params: string[] = [];
  const expressRe = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = expressRe.exec(routePath)) !== null) params.push(m[1]);
  const openApiRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  while ((m = openApiRe.exec(routePath)) !== null) params.push(m[1]);
  return [...new Set(params)];
}

export function handleVerifyModel(args: z.infer<typeof verifyModelSchema>) {
  const { model, filePath } = loadModel(args.projectPath);
  const issues: VerificationIssue[] = [];

  const projectRoot = projectRootOfModel(filePath);

  // Check environments
  if (!model.environments || model.environments.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_ENVIRONMENTS',
      message: 'No environments defined in model.json.',
      recommendation: 'Add at least one target environment (e.g., local baseUrl http://localhost:3000).',
    });
  }

  // Check endpoints
  const routeMap = new Map<string, string>(); // method:path -> endpointId

  for (const ep of model.endpoints) {
    const routeKey = `${ep.method.toUpperCase()} ${ep.path}`;

    // Check duplicate endpoints
    if (routeMap.has(routeKey)) {
      issues.push({
        severity: 'error',
        endpointId: ep.id,
        route: routeKey,
        code: 'DUPLICATE_ENDPOINT',
        message: `Duplicate endpoint route "${routeKey}" found.`,
        recommendation: 'Remove duplicate endpoint or change route path/method.',
      });
    } else {
      routeMap.set(routeKey, ep.id);
    }

    // Check path parameters binding
    const declaredPathParams = extractPathParams(ep.path);
    if (declaredPathParams.length > 0) {
      const definedParams = ep.parameters?.filter((p) => p.in === 'path' || !p.in).map((p) => p.name) || [];
      for (const paramName of declaredPathParams) {
        if (!definedParams.includes(paramName)) {
          issues.push({
            severity: 'warning',
            endpointId: ep.id,
            route: routeKey,
            code: 'UNBOUND_PATH_PARAM',
            message: `Path parameter ":${paramName}" in route path is not defined in parameters array.`,
            recommendation: `Add path parameter "${paramName}" to endpoint parameters array.`,
          });
        }
      }
    }

    // Check responses keys
    if (ep.responses) {
      for (const statusCode of Object.keys(ep.responses)) {
        if (isNaN(Number(statusCode)) && statusCode !== 'default') {
          issues.push({
            severity: 'error',
            endpointId: ep.id,
            route: routeKey,
            code: 'INVALID_STATUS_CODE',
            message: `Invalid response status code key "${statusCode}". Must be numeric (e.g., "200") or "default".`,
            recommendation: 'Fix response status code key.',
          });
        }
      }
    } else {
      issues.push({
        severity: 'warning',
        endpointId: ep.id,
        route: routeKey,
        code: 'MISSING_RESPONSES',
        message: `Endpoint "${routeKey}" has no response definitions.`,
        recommendation: 'Define expected HTTP status code responses (e.g. 200, 400, 500).',
      });
    }

    // Check source file existence
    if (ep.source && ep.source.file && ep.source.file !== 'manual-mcp') {
      const srcFile = path.isAbsolute(ep.source.file)
        ? ep.source.file
        : path.join(projectRoot, ep.source.file);

      if (!fs.existsSync(srcFile)) {
        issues.push({
          severity: 'warning',
          endpointId: ep.id,
          route: routeKey,
          code: 'SOURCE_FILE_NOT_FOUND',
          message: `Referenced source file "${ep.source.file}" does not exist on disk.`,
          recommendation: 'Update source.file reference to point to correct relative file path.',
        });
      }
    }

    // Check security scheme references
    if (ep.security) {
      for (const sec of ep.security) {
        if (model.securitySchemes && !model.securitySchemes[sec.scheme]) {
          issues.push({
            severity: 'warning',
            endpointId: ep.id,
            route: routeKey,
            code: 'UNKNOWN_SECURITY_SCHEME',
            message: `Security scheme "${sec.scheme}" is referenced but not declared in top-level securitySchemes.`,
            recommendation: `Declare scheme "${sec.scheme}" in model.json securitySchemes.`,
          });
        }
      }
    }
  }

  // ── Field completeness checks (Phase 3 gate) ────────────────────────────
  // Surfaces missing/empty user-facing fields as MISSING_FIELD_* warnings so
  // the AI knows exactly what to fill before advancing to Phase 4.

  const fieldCompleteness: Record<string, { missingFields: string[] }> = {};

  for (const ep of model.endpoints) {
    const routeKey = `${ep.method.toUpperCase()} ${ep.path}`;
    const missing: string[] = [];

    if (!ep.description || ep.description.trim() === '') {
      missing.push('description');
      issues.push({
        severity: 'warning',
        endpointId: ep.id,
        route: routeKey,
        code: 'MISSING_FIELD_DESCRIPTION',
        message: `Endpoint "${routeKey}" has no description.`,
        recommendation: 'Add a concise description of what this endpoint does.',
      });
    }

    if (!ep.tags || ep.tags.length === 0) {
      missing.push('tags');
      issues.push({
        severity: 'warning',
        endpointId: ep.id,
        route: routeKey,
        code: 'MISSING_FIELD_TAGS',
        message: `Endpoint "${routeKey}" has no tags.`,
        recommendation: 'Add at least one tag to group this endpoint (e.g. "auth", "users").',
      });
    }

    if (ep.parameters) {
      for (const p of ep.parameters) {
        if (!p.description || p.description.trim() === '') {
          const field = `parameters[${p.name}].description`;
          missing.push(field);
          issues.push({
            severity: 'warning',
            endpointId: ep.id,
            route: routeKey,
            code: 'MISSING_FIELD_PARAM_DESCRIPTION',
            message: `Parameter "${p.name}" on "${routeKey}" has no description.`,
            recommendation: `Add a description to parameter "${p.name}".`,
          });
        }
      }
    }

    if (ep.responses) {
      for (const [statusCode, resp] of Object.entries(ep.responses)) {
        const r = resp as any;
        if (!r.description || String(r.description).trim() === '') {
          const field = `responses[${statusCode}].description`;
          missing.push(field);
          issues.push({
            severity: 'warning',
            endpointId: ep.id,
            route: routeKey,
            code: 'MISSING_FIELD_RESPONSE_DESCRIPTION',
            message: `Response "${statusCode}" on "${routeKey}" has no description.`,
            recommendation: `Add a description to the ${statusCode} response (e.g. "User created successfully").`,
          });
        }
      }
    }

    if (missing.length > 0) {
      fieldCompleteness[ep.id] = { missingFields: missing };
    }
  }

  const allFieldsFilled = Object.keys(fieldCompleteness).length === 0;

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    filePath,
    isValid: errors.length === 0,
    allFieldsFilled,
    totalEndpoints: model.endpoints.length,
    summary: {
      errorsCount: errors.length,
      warningsCount: warnings.length,
    },
    issues,
    fieldCompleteness,
    phaseGate: {
      phase3Complete: errors.length === 0 && allFieldsFilled,
      message:
        errors.length === 0 && allFieldsFilled
          ? 'Model is valid and all fields are complete. You may advance to Phase 4 — ask the user what simulation or workflow they want to build.'
          : 'Fix all errors and fill missing fields before proceeding to Phase 4.',
    },
  };
}
