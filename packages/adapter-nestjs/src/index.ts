import * as fs from 'fs';
import * as path from 'path';
import { Node, Project, SyntaxKind } from 'ts-morph';
import { createEndpointId, Endpoint, HttpMethod, normalizeEndpointPath } from '@jetic/model';
import { defineAdapter, AdapterContext, AdapterScanResult } from '@jetic/scanner-sdk';

const HTTP_DECORATORS: Record<string, HttpMethod> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Head: 'HEAD',
  Options: 'OPTIONS',
};

function decoratorPathArg(decoratorArgs: Node[]): string {
  const first = decoratorArgs[0];
  if (first && Node.isStringLiteral(first)) return first.getLiteralValue();
  return '';
}

/** Reads `@Controller('prefix')` + `@Get/@Post/...('path')` decorator pairs via ts-morph. */
function discoverNestRoutes(project: Project, projectRoot: string): Endpoint[] {
  const endpoints: Endpoint[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const classDecl of sourceFile.getClasses()) {
      const controllerDecorator = classDecl.getDecorator('Controller');
      if (!controllerDecorator) continue;

      const controllerPrefix = decoratorPathArg(controllerDecorator.getArguments());

      for (const method of classDecl.getMethods()) {
        for (const decoratorName of Object.keys(HTTP_DECORATORS)) {
          const decorator = method.getDecorator(decoratorName);
          if (!decorator) continue;

          const routeSuffix = decoratorPathArg(decorator.getArguments());
          const fullPath = normalizeEndpointPath(`${controllerPrefix}/${routeSuffix}`.replace(/\/+/g, '/'));
          const httpMethod = HTTP_DECORATORS[decoratorName];

          endpoints.push({
            id: createEndpointId(httpMethod, fullPath),
            method: httpMethod,
            path: fullPath,
            handlerName: `${classDecl.getName()}.${method.getName()}`,
            source: {
              file: path.relative(projectRoot, sourceFile.getFilePath()),
              line: method.getStartLineNumber(),
            },
            middleware: [],
          });
        }
      }
    }
  }

  return endpoints;
}

/** NestJS adapter (project.md §9): reads `@Controller`/`@Get`/`@Post`/... decorator metadata via ts-morph. */
export const nestjsAdapter = defineAdapter({
  id: 'nestjs',
  name: 'NestJS',

  detect(ctx: AdapterContext): boolean {
    return ctx.dependencies.has('@nestjs/core') || ctx.dependencies.has('@nestjs/common');
  },

  async scan(ctx: AdapterContext): Promise<AdapterScanResult> {
    const tsConfigPath = path.join(ctx.projectRoot, 'tsconfig.json');
    const project = fs.existsSync(tsConfigPath)
      ? new Project({ tsConfigFilePath: tsConfigPath })
      : new Project({});

    if (!fs.existsSync(tsConfigPath)) {
      project.addSourceFilesAtPaths(path.join(ctx.projectRoot, '**/*.ts'));
    }

    const endpoints = discoverNestRoutes(project, ctx.projectRoot);
    return { endpoints, securitySchemes: {}, environments: [] };
  },
});
