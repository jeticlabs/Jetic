import { Project, SourceFile, CallExpression, Node, SyntaxKind, Identifier } from 'ts-morph';

export interface RawDiscovery {
  method: string;
  path: string;
  sourceFile: string;
  line: number;
  routerName?: string;
  isRouterUse?: boolean;
  importedFrom?: string;
  handlerName?: string;
  middlewareNames?: string[];
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

export function discoverRoutes(project: Project): RawDiscovery[] {
  const discoveries: RawDiscovery[] = [];
  
  for (const sourceFile of project.getSourceFiles()) {
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    
    for (const callExpr of callExpressions) {
      const expr = callExpr.getExpression();
      
      if (Node.isPropertyAccessExpression(expr)) {
        const methodName = expr.getName();
        const callerExpr = expr.getExpression();
        const callerName = callerExpr.getText();
        
        if (HTTP_METHODS.includes(methodName) || methodName === 'use') {
          const args = callExpr.getArguments();
          if (args.length > 0 && Node.isStringLiteral(args[0])) {
            const pathArg = args[0].getLiteralValue();
            
            let importedFrom: string | undefined = undefined;
            if (methodName === 'use' && args.length > 1) {
              const routerArg = args[1];
              if (Node.isIdentifier(routerArg)) {
                // Check if it's imported
                const declarations = routerArg.getSymbol()?.getDeclarations();
                if (declarations && declarations.length > 0) {
                  const decl = declarations[0];
                  if (Node.isImportSpecifier(decl) || Node.isImportClause(decl)) {
                    const importDecl = decl.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
                    if (importDecl) {
                      importedFrom = importDecl.getModuleSpecifierValue();
                    }
                  }
                }
              }
            }

            // Extract handler name and middleware for HTTP method routes
            let handlerName: string | undefined;
            const middlewareNames: string[] = [];

            if (HTTP_METHODS.includes(methodName)) {
              // Arguments after the path string are middleware and/or handler
              // The last argument is typically the handler; everything in between is middleware
              const handlerArgs = args.slice(1); // skip the path argument

              if (handlerArgs.length > 0) {
                // Last argument is the handler
                const lastArg = handlerArgs[handlerArgs.length - 1];
                handlerName = extractCallableName(lastArg);

                // Everything before the last argument is middleware
                for (let i = 0; i < handlerArgs.length - 1; i++) {
                  const mwName = extractCallableName(handlerArgs[i]);
                  if (mwName) {
                    middlewareNames.push(mwName);
                  }
                }
              }
            }

            discoveries.push({
              method: methodName === 'use' ? 'USE' : methodName.toUpperCase(),
              path: pathArg,
              sourceFile: sourceFile.getFilePath(),
              line: callExpr.getStartLineNumber(),
              routerName: methodName === 'use' && args.length > 1 ? args[1].getText() : callerName,
              isRouterUse: methodName === 'use',
              importedFrom,
              handlerName,
              middlewareNames,
            });
          }
        }
      }
    }
  }
  
  return discoveries;
}

/**
 * Extract a readable name from a call argument that represents a handler or middleware.
 * Handles patterns like:
 * - Identifier: `authenticateToken` → "authenticateToken"
 * - PropertyAccess: `AuthController.register` → "AuthController.register"
 * - ArrowFunction/FunctionExpression: `(req, res) => { ... }` → "(anonymous)"
 * - CallExpression: `validate(schema)` → "validate"
 */
function extractCallableName(node: Node): string | undefined {
  if (Node.isIdentifier(node)) {
    return node.getText();
  }
  
  if (Node.isPropertyAccessExpression(node)) {
    return node.getText();
  }

  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    return '(anonymous)';
  }

  if (Node.isCallExpression(node)) {
    // e.g., validate(schema) — extract the function name
    const callExpr = node.getExpression();
    if (Node.isIdentifier(callExpr)) {
      return callExpr.getText();
    }
    if (Node.isPropertyAccessExpression(callExpr)) {
      return callExpr.getText();
    }
  }

  return node.getText();
}
