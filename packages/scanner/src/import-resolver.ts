import * as fs from 'fs';
import * as path from 'path';

export interface ResolvedContext {
  /** Map of absolute file path → source code content */
  files: Map<string, string>;
  /** Total character count of all resolved files */
  totalSize: number;
}

const MAX_TOTAL_SIZE = 15_000; // ~15KB cap to keep AI requests under free-tier token limits
const SUPPORTED_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * Resolves imports from a source file and collects related source code.
 * Follows the import graph up to `maxDepth` levels deep.
 */
export function resolveImports(
  filePath: string,
  maxDepth: number = 2
): ResolvedContext {
  const resolved = new Map<string, string>();
  let totalSize = 0;
  const visited = new Set<string>();

  function resolve(currentPath: string, depth: number) {
    const normalizedPath = normalizePath(currentPath);

    if (depth > maxDepth || visited.has(normalizedPath) || totalSize > MAX_TOTAL_SIZE) {
      return;
    }
    visited.add(normalizedPath);

    // Try to find the actual file
    const actualPath = resolveFilePath(normalizedPath);
    if (!actualPath) return;

    let content: string;
    try {
      content = fs.readFileSync(actualPath, 'utf8');
    } catch {
      return;
    }

    // Check size limit
    if (totalSize + content.length > MAX_TOTAL_SIZE) {
      // Truncate this file to fit
      const remaining = MAX_TOTAL_SIZE - totalSize;
      if (remaining > 500) { // Only include if we can get a meaningful chunk
        content = content.slice(0, remaining) + '\n// ... (truncated)';
        resolved.set(actualPath, content);
        totalSize += content.length;
      }
      return;
    }

    resolved.set(actualPath, content);
    totalSize += content.length;

    // Extract imports and resolve them recursively
    const imports = extractImportPaths(content);
    const dir = path.dirname(actualPath);

    for (const importPath of imports) {
      // Only follow relative imports (not node_modules)
      if (importPath.startsWith('.') || importPath.startsWith('/')) {
        const resolvedImportPath = path.resolve(dir, importPath);
        resolve(resolvedImportPath, depth + 1);
      }
    }
  }

  resolve(filePath, 0);
  return { files: resolved, totalSize };
}

/**
 * Resolves imports specifically for a given route file and returns
 * the organized context grouped by role (controller, service, middleware, types).
 */
export function resolveRouteContext(routeFilePath: string): {
  routeFile: string;
  contextFiles: Map<string, string>;
  summary: { controllers: number; services: number; middleware: number; types: number; other: number };
} {
  const context = resolveImports(routeFilePath, 2);
  const normalizedRoutePath = normalizePath(routeFilePath);

  // Remove the route file itself from context files — it will be sent separately
  let routeFileContent = '';
  for (const [filePath, content] of context.files) {
    if (normalizePath(filePath) === normalizedRoutePath || normalizePath(filePath).replace(/\\/g, '/') === normalizedRoutePath.replace(/\\/g, '/')) {
      routeFileContent = content;
      context.files.delete(filePath);
      break;
    }
  }

  // If we didn't get route file from resolver, read it directly
  if (!routeFileContent) {
    try {
      const actualPath = resolveFilePath(normalizedRoutePath);
      if (actualPath) {
        routeFileContent = fs.readFileSync(actualPath, 'utf8');
      }
    } catch {}
  }

  // Categorize files
  const summary = { controllers: 0, services: 0, middleware: 0, types: 0, other: 0 };
  for (const filePath of context.files.keys()) {
    const lower = filePath.toLowerCase();
    if (lower.includes('controller')) summary.controllers++;
    else if (lower.includes('service')) summary.services++;
    else if (lower.includes('middleware')) summary.middleware++;
    else if (lower.includes('type') || lower.includes('interface') || lower.includes('dto')) summary.types++;
    else summary.other++;
  }

  return {
    routeFile: routeFileContent,
    contextFiles: context.files,
    summary,
  };
}

/**
 * Extract import/require paths from source code using regex.
 * This avoids needing ts-morph for the resolver itself (keeping it fast).
 */
function extractImportPaths(source: string): string[] {
  const paths: string[] = [];

  // Match: import ... from 'path'
  const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    paths.push(match[1]);
  }

  // Match: import 'path' (side-effect imports)
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffectRegex.exec(source)) !== null) {
    paths.push(match[1]);
  }

  // Match: require('path')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(source)) !== null) {
    paths.push(match[1]);
  }

  // Match: export ... from 'path'
  const reExportRegex = /export\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reExportRegex.exec(source)) !== null) {
    paths.push(match[1]);
  }

  return [...new Set(paths)]; // deduplicate
}

/**
 * Try to resolve a file path with various extension fallbacks.
 */
function resolveFilePath(filePath: string): string | null {
  // Normalize backslashes
  const normalized = filePath.replace(/\\/g, '/');

  // Direct file exists
  if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
    return normalized;
  }

  // Try with extensions
  for (const ext of SUPPORTED_EXTENSIONS) {
    const withExt = normalized + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return withExt;
    }
  }

  // Try as directory with index file
  for (const ext of SUPPORTED_EXTENSIONS) {
    const indexPath = path.join(normalized, `index${ext}`);
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Normalize a file path for consistent comparison.
 */
function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}
