import * as fs from 'fs';
import * as path from 'path';
import { Node, Project, SyntaxKind } from 'ts-morph';
import { createEndpointId, Endpoint, HttpMethod, normalizeEndpointPath } from '@jetic/model';
import { defineAdapter, AdapterContext, AdapterScanResult } from '@jetic/scanner-sdk';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

interface PrefixScope {
  bodyStart: number;
  bodyEnd: number;
  prefix: string;
}

/**
 * Finds `instance.register(pluginFnOrRef, { prefix: '/x' })` calls where the
 * plugin is a function declared in the SAME file, and records its body range
 * so route calls lexically inside it can be prefixed. Cross-file plugins
 * (the common real-world case) are not resolved — documented limitation.
 */
function collectPrefixScopes(sourceFile: ReturnType<Project['getSourceFiles']>[number]): PrefixScope[] {
  const scopes: PrefixScope[] = [];

  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();
    if (!Node.isPropertyAccessExpression(expr) || expr.getName() !== 'register') continue;

    const args = callExpr.getArguments();
    if (args.length < 2) continue;

    const optionsArg = args[1];
    if (!Node.isObjectLiteralExpression(optionsArg)) continue;
    const prefixProp = optionsArg.getProperty('prefix');
    if (!prefixProp || !Node.isPropertyAssignment(prefixProp)) continue;
    const prefixInit = prefixProp.getInitializer();
    if (!prefixInit || !Node.isStringLiteral(prefixInit)) continue;
    const prefix = prefixInit.getLiteralValue();

    const pluginArg = args[0];
    let body: Node | undefined;
    if (Node.isFunctionExpression(pluginArg) || Node.isArrowFunction(pluginArg)) {
      body = pluginArg.getBody();
    } else if (Node.isIdentifier(pluginArg)) {
      const decl = pluginArg.getSymbol()?.getDeclarations()?.[0];
      if (decl && (Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl))) {
        const initializer = Node.isVariableDeclaration(decl) ? decl.getInitializer() : decl;
        if (initializer && (Node.isFunctionDeclaration(initializer) || Node.isFunctionExpression(initializer) || Node.isArrowFunction(initializer))) {
          body = initializer.getBody();
        }
      }
    }

    if (body) {
      scopes.push({ bodyStart: body.getStart(), bodyEnd: body.getEnd(), prefix });
    }
  }

  return scopes;
}

function resolvePrefixedPath(routeStart: number, routePath: string, scopes: PrefixScope[]): string {
  const enclosing = scopes
    .filter((s) => routeStart >= s.bodyStart && routeStart <= s.bodyEnd)
    .sort((a, b) => b.bodyEnd - b.bodyStart - (a.bodyEnd - a.bodyStart)); // outermost (largest range) first

  const prefixes = enclosing.map((s) => s.prefix);
  return normalizeEndpointPath([...prefixes, routePath].join('/'));
}

/** Finds `instance.METHOD('/path', handler)` calls — the Fastify route registration shape. */
function discoverFastifyRoutes(project: Project, projectRoot: string): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const prefixScopes = collectPrefixScopes(sourceFile);

    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = callExpr.getExpression();
      if (!Node.isPropertyAccessExpression(expr)) continue;

      const methodName = expr.getName().toLowerCase();
      if (!HTTP_METHODS.has(methodName)) continue;

      const args = callExpr.getArguments();
      if (args.length === 0 || !Node.isStringLiteral(args[0])) continue;

      const routePath = resolvePrefixedPath(callExpr.getStart(), args[0].getLiteralValue(), prefixScopes);
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
 * Fastify adapter (project.md §9). Scans `instance.get/post/.../delete(path, handler)`
 * call sites via ts-morph, resolving `fastify.register(plugin, { prefix })` when the
 * plugin function is declared in the SAME file as the route calls. Cross-file plugin
 * modules (the common real-world layout) are not resolved — known limitation.
 */
export const fastifyAdapter = defineAdapter({
  id: 'fastify',
  name: 'Fastify',

  detect(ctx: AdapterContext): boolean {
    return ctx.dependencies.has('fastify');
  },

  async scan(ctx: AdapterContext): Promise<AdapterScanResult> {
    const tsConfigPath = path.join(ctx.projectRoot, 'tsconfig.json');
    const project = fs.existsSync(tsConfigPath)
      ? new Project({ tsConfigFilePath: tsConfigPath })
      : new Project({});

    if (!fs.existsSync(tsConfigPath)) {
      project.addSourceFilesAtPaths(path.join(ctx.projectRoot, '**/*.{ts,js}'));
    }

    const endpoints = discoverFastifyRoutes(project, ctx.projectRoot);
    return { endpoints, securitySchemes: {}, environments: [] };
  },
});
