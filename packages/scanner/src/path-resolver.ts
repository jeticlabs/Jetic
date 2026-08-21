import { RawDiscovery } from './route-discovery';
import * as path from 'path';
import * as fs from 'fs';

const SUPPORTED_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * Normalize a file path to a consistent forward-slash string for use as a map key.
 */
function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}

/**
 * Try resolving an import path to an actual file on disk.
 * Handles: direct files, files without extensions, and index files.
 */
function resolveImportToFile(importPath: string): string | null {
  const normalized = importPath.replace(/\\/g, '/');

  // Already a real file?
  if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
    return normalizePath(normalized);
  }

  // Try appending known extensions
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = normalized + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return normalizePath(candidate);
    }
  }

  // Try as a directory with index file
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = path.join(normalized, `index${ext}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return normalizePath(candidate);
    }
  }

  return null;
}

export function resolvePaths(discoveries: RawDiscovery[]): RawDiscovery[] {
  const resolved: RawDiscovery[] = [];
  // normalized file path + routerName → prefix
  const prefixes = new Map<string, string>();

  // First pass: find app.use('/prefix', router) and map imported route files to their prefix
  for (const d of discoveries) {
    if (d.isRouterUse && d.routerName) {
      if (d.importedFrom) {
        // Resolve the import path relative to the source file
        const dir = path.dirname(d.sourceFile);
        const rawTarget = path.resolve(dir, d.importedFrom);

        // Try to find the actual file (with extension fallbacks)
        const resolvedTarget = resolveImportToFile(rawTarget);
        const targetKey = resolvedTarget
          ? resolvedTarget
          : normalizePath(rawTarget.endsWith('.ts') ? rawTarget : rawTarget + '.ts');

        prefixes.set(`${targetKey}:router`, d.path);
        prefixes.set(`${targetKey}:default`, d.path); // handle default exports
      } else {
        // Local router — key by the normalized source file
        const key = normalizePath(d.sourceFile);
        prefixes.set(`${key}:${d.routerName}`, d.path);
      }
    }
  }

  // Second pass: apply prefixes to actual route definitions
  for (const d of discoveries) {
    if (!d.isRouterUse) {
      const normalizedFile = normalizePath(d.sourceFile);

      // Try exact routerName key first
      let prefix = prefixes.get(`${normalizedFile}:${d.routerName}`) || '';

      // Fallback: default export key (handles `export default router`)
      if (!prefix) {
        prefix = prefixes.get(`${normalizedFile}:default`) || '';
      }

      // Build full path: strip trailing slash from prefix when path is exactly '/'
      let fullPath = prefix + (d.path === '/' && prefix ? '' : d.path);
      fullPath = fullPath.replace(/\/+/g, '/'); // collapse double slashes

      resolved.push({
        ...d,
        path: fullPath,
      });
    }
  }

  return resolved;
}
