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
          if (args.length === 0) continue;

          // Resolve the path argument — handles string literals, constants, and property access
          const pathArg = resolveStringValue(args[0], sourceFile);
          if (pathArg === undefined) continue;
            
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
  
  return discoveries;
}

/**
 * Resolve a node to its string value. Handles:
 * 1. String literals: '/api/workspaces' → '/api/workspaces'
 * 2. Property access on objects: Constant.WORKSPACE_ROUTER → follows import → '/api/workspaces'
 * 3. Identifier constants: BASE_PATH → follows declaration → '/api'
 * 4. Template literals (no substitutions): `'/api/workspaces'` → '/api/workspaces'
 */
function resolveStringValue(node: Node, sourceFile: SourceFile): string | undefined {
  // Case 1: Direct string literal — the simple, existing case
  if (Node.isStringLiteral(node)) {
    return node.getLiteralValue();
  }

  // Case 2: No-substitution template literal e.g. `/api/workspaces`
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralValue();
  }

  // Case 3: Property access expression e.g. Constant.WORKSPACE_ROUTER
  if (Node.isPropertyAccessExpression(node)) {
    const propertyName = node.getName();
    const objectExpr = node.getExpression();

    // Resolve the object's symbol to find where it's declared/imported
    const symbol = objectExpr.getSymbol();
    if (!symbol) return undefined;

    const declarations = symbol.getDeclarations();
    if (!declarations || declarations.length === 0) return undefined;

    for (const decl of declarations) {
      // Handle: import Constant from './configs/app.constant'
      if (Node.isImportClause(decl) || Node.isImportSpecifier(decl)) {
        const importDecl = decl.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
        if (!importDecl) continue;

        // Get the actual source file of the import
        const importedSourceFile = importDecl.getModuleSpecifierSourceFile();
        if (!importedSourceFile) continue;

        return findPropertyStringValue(importedSourceFile, propertyName);
      }

      // Handle: const Constant = { WORKSPACE_ROUTER: '/api/workspaces' } (local declaration)
      if (Node.isVariableDeclaration(decl)) {
        const initializer = decl.getInitializer();
        if (initializer && Node.isObjectLiteralExpression(initializer)) {
          const prop = initializer.getProperty(propertyName);
          if (prop && Node.isPropertyAssignment(prop)) {
            const value = prop.getInitializer();
            if (value && Node.isStringLiteral(value)) {
              return value.getLiteralValue();
            }
          }
        }
      }
    }

    return undefined;
  }

  // Case 4: Identifier e.g. a constant variable like BASE_PATH
  if (Node.isIdentifier(node)) {
    const symbol = node.getSymbol();
    if (!symbol) return undefined;

    const declarations = symbol.getDeclarations();
    if (!declarations || declarations.length === 0) return undefined;

    for (const decl of declarations) {
      // Local variable: const BASE_PATH = '/api';
      if (Node.isVariableDeclaration(decl)) {
        const initializer = decl.getInitializer();
        if (initializer && Node.isStringLiteral(initializer)) {
          return initializer.getLiteralValue();
        }
      }

      // Re-exported or imported constant — follow the import
      if (Node.isImportSpecifier(decl) || Node.isImportClause(decl)) {
        const importDecl = decl.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
        if (!importDecl) continue;

        const importedSourceFile = importDecl.getModuleSpecifierSourceFile();
        if (!importedSourceFile) continue;

        // Look for a default export that is a string
        return findExportedStringValue(importedSourceFile, node.getText());
      }
    }

    return undefined;
  }

  return undefined;
}

/**
 * Search a source file for a property with the given name in exported objects/constants.
 * Handles patterns like:
 *   const Constant = { WORKSPACE_ROUTER: '/api/workspaces' };
 *   export default Constant;
 * Or:
 *   export default { WORKSPACE_ROUTER: '/api/workspaces' };
 */
function findPropertyStringValue(sourceFile: SourceFile, propertyName: string): string | undefined {
  // Strategy 1: Find all object literal expressions and look for the property
  const objectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  for (const obj of objectLiterals) {
    const prop = obj.getProperty(propertyName);
    if (prop && Node.isPropertyAssignment(prop)) {
      const value = prop.getInitializer();
      if (value && Node.isStringLiteral(value)) {
        return value.getLiteralValue();
      }
    }
  }

  // Strategy 2: Look for enum members
  const enumDecls = sourceFile.getDescendantsOfKind(SyntaxKind.EnumDeclaration);
  for (const enumDecl of enumDecls) {
    const member = enumDecl.getMember(propertyName);
    if (member) {
      const value = member.getInitializer();
      if (value && Node.isStringLiteral(value)) {
        return value.getLiteralValue();
      }
    }
  }

  return undefined;
}

/**
 * Find an exported string value by name in a source file.
 * Handles: export const BASE_PATH = '/api';
 */
function findExportedStringValue(sourceFile: SourceFile, name: string): string | undefined {
  // Check variable statements
  for (const statement of sourceFile.getStatements()) {
    if (Node.isVariableStatement(statement)) {
      for (const decl of statement.getDeclarations()) {
        if (decl.getName() === name) {
          const initializer = decl.getInitializer();
          if (initializer && Node.isStringLiteral(initializer)) {
            return initializer.getLiteralValue();
          }
        }
      }
    }
  }

  return undefined;
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
