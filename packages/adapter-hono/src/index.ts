import * as fs from 'fs';
import * as path from 'path';
import { Node, Project, SyntaxKind } from 'ts-morph';
import { createEndpointId, Endpoint, HttpMethod, normalizeEndpointPath } from '@jetic/model';
import { defineAdapter, AdapterContext, AdapterScanResult } from '@jetic/scanner-sdk';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

/** Finds `instance.METHOD('/path', handler)` calls \u2014 the Hono route registration shape. */
function discoverHonoRoutes(project: Project, projectRoot: string): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = callExpr.getExpression();
      if (!Node.isPropertyAccessExpression(expr)) continue;

      const methodName = expr.getName().toLowerCase();
      if (!HTTP_METHODS.has(methodName)) continue;

      const args = callExpr.getArguments();
      if (args.length === 0 || !Node.isStringLiteral(args[0])) continue;

      const routePath = normalizeEndpointPath(args[0].getLiteralValue());
      const method = methodName.toUpperCase() as HttpMethod;
      const lastArg = args[args.length - 1];
      const handlerName = Node.isIdentifier(lastArg) ? lastArg.getText() : undefined;

      endpoints.push({
        id: createEndpointId(method, routePath),
        method,
        path: routePath,
        handlerName,
        source: {
          file: path.relative(projectRoot, sourceFile.getFilePath()),
          line: callExpr.getStartLineNumber(),
        },
        middleware: [],
      });
    }
  }

  return endpoints;
}

/**
 * Hono adapter (project.md \u00a79). Scans `instance.get/post/.../delete(path, handler)`
 * call sites via ts-morph. Does not resolve `app.route('/prefix', subApp)`
 * nesting \u2014 same known limitation as the Fastify adapter's plugin prefixes.
 */
export const honoAdapter = defineAdapter({
  id: 'hono',
  name: 'Hono',

  detect(ctx: AdapterContext): boolean {
    return ctx.dependencies.has('hono');
  },

  async scan(ctx: AdapterContext): Promise<AdapterScanResult> {
    const tsConfigPath = path.join(ctx.projectRoot, 'tsconfig.json');
    const project = fs.existsSync(tsConfigPath)
      ? new Project({ tsConfigFilePath: tsConfigPath })
      : new Project({});

    if (!fs.existsSync(tsConfigPath)) {
      project.addSourceFilesAtPaths(path.join(ctx.projectRoot, '**/*.{ts,js}'));
    }

    const endpoints = discoverHonoRoutes(project, ctx.projectRoot);
    return { endpoints, securitySchemes: {}, environments: [] };
  },
});
