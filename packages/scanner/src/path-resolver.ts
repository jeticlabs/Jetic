import { RawDiscovery } from './route-discovery';
import * as path from 'path';

export function resolvePaths(discoveries: RawDiscovery[]): RawDiscovery[] {
  const resolved: RawDiscovery[] = [];
  // file + routerName -> prefix
  const prefixes = new Map<string, string>(); 

  // First pass: find app.use('/prefix', router)
  for (const d of discoveries) {
    if (d.isRouterUse && d.routerName) {
      if (d.importedFrom) {
        // Resolve the import path relative to the source file
        const dir = path.dirname(d.sourceFile);
        // Extremely naive module resolution for MVP
        let targetFile = path.resolve(dir, d.importedFrom);
        if (!targetFile.endsWith('.ts')) targetFile += '.ts';
        targetFile = targetFile.replace(/\\/g, '/'); // normalize for ts-morph paths
        prefixes.set(`${targetFile}:router`, d.path);
        prefixes.set(`${targetFile}:default`, d.path); // handle default exports
      } else {
        // Local router
        prefixes.set(`${d.sourceFile}:${d.routerName}`, d.path);
      }
    }
  }

  // Second pass: apply prefixes
  for (const d of discoveries) {
    if (!d.isRouterUse) {
      // Find a prefix matching this file and router
      let prefix = prefixes.get(`${d.sourceFile}:${d.routerName}`) || '';
      if (!prefix) {
         // Maybe it was exported as default
         prefix = prefixes.get(`${d.sourceFile}:default`) || '';
      }
      
      let fullPath = prefix + (d.path === '/' && prefix ? '' : d.path);
      fullPath = fullPath.replace(/\/+/g, '/'); // clean up double slashes
      
      resolved.push({
        ...d,
        path: fullPath
      });
    }
  }

  return resolved;
}
