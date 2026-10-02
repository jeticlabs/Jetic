import * as fs from 'fs';
import * as path from 'path';
import { Project } from 'ts-morph';
import { createEndpointId, Endpoint, HttpMethod, normalizeEndpointPath } from '@jetic/model';
import { defineAdapter, AdapterContext, AdapterScanResult } from '@jetic/scanner-sdk';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** Converts an App Router `app/api/users/[id]/route.ts` file path into `/api/users/:id`. */
function routeFileToPath(appDir: string, filePath: string): string {
  const rel = path.relative(appDir, path.dirname(filePath)).replace(/\\/g, '/');
  const segments = rel
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('[...') && segment.endsWith(']')) return `:${segment.slice(4, -1)}*`;
      if (segment.startsWith('[') && segment.endsWith(']')) return `:${segment.slice(1, -1)}`;
      if (segment.startsWith('(') && segment.endsWith(')')) return ''; // route group, no path segment
      return segment;
    })
    .filter(Boolean);
  return normalizeEndpointPath('/' + segments.join('/'));
}

/** Finds Next.js App Router `route.ts`/`route.js` files and their exported HTTP method handlers. */
function discoverNextRoutes(project: Project, appDir: string): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const base = path.basename(sourceFile.getFilePath());
    if (!/^route\.(ts|js|tsx|jsx)$/.test(base)) continue;

    const routePath = routeFileToPath(appDir, sourceFile.getFilePath());
    const exportedDeclarations = sourceFile.getExportedDeclarations();

    for (const [exportName] of exportedDeclarations) {
      if (!HTTP_METHODS.has(exportName)) continue;
      const method = exportName as HttpMethod;

      endpoints.push({
        id: createEndpointId(method, routePath),
        method,
        path: routePath,
        handlerName: exportName,
        source: {
          file: path.relative(path.dirname(appDir), sourceFile.getFilePath()),
          line: 1,
        },
        middleware: [],
      });
    }
  }

  return endpoints;
}

/**
 * Next.js App Router adapter (project.md §9). Only scans `app/**\/route.ts`
 * handlers — the `pages/api/*` (Pages Router) convention is not covered in
 * this first pass.
 */
export const nextjsAdapter = defineAdapter({
  id: 'nextjs',
  name: 'Next.js',

  detect(ctx: AdapterContext): boolean {
    return ctx.dependencies.has('next');
  },

  async scan(ctx: AdapterContext): Promise<AdapterScanResult> {
    const appDir = fs.existsSync(path.join(ctx.projectRoot, 'app'))
      ? path.join(ctx.projectRoot, 'app')
      : path.join(ctx.projectRoot, 'src', 'app');

    if (!fs.existsSync(appDir)) {
      return { endpoints: [], securitySchemes: {}, environments: [] };
    }

    const project = new Project({});
    project.addSourceFilesAtPaths(path.join(appDir, '**/route.{ts,js,tsx,jsx}'));

    const endpoints = discoverNextRoutes(project, appDir);
    return { endpoints, securitySchemes: {}, environments: [] };
  },
});
