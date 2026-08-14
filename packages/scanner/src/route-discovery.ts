import { Project, SourceFile, CallExpression, Node, SyntaxKind, Identifier } from 'ts-morph';

export interface RawDiscovery {
  method: string;
  path: string;
  sourceFile: string;
  line: number;
  routerName?: string;
  isRouterUse?: boolean;
  importedFrom?: string;
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

            discoveries.push({
              method: methodName === 'use' ? 'USE' : methodName.toUpperCase(),
              path: pathArg,
              sourceFile: sourceFile.getFilePath(),
              line: callExpr.getStartLineNumber(),
              routerName: methodName === 'use' && args.length > 1 ? args[1].getText() : callerName,
              isRouterUse: methodName === 'use',
              importedFrom
            });
          }
        }
      }
    }
  }
  
  return discoveries;
}
