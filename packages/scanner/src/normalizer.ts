import { createEndpointId, Endpoint, HttpMethod, normalizeEndpointPath } from '@jetic/model';
import { RawDiscovery } from './route-discovery';
import { resolvePaths } from './path-resolver';

export function normalizeDiscoveries(rawDiscoveries: RawDiscovery[]): Endpoint[] {
  const resolved = resolvePaths(rawDiscoveries);
  
  return resolved.map((raw) => {
    const method = raw.method.toUpperCase() as HttpMethod;
    const routePath = normalizeEndpointPath(raw.path);

    return {
      id: createEndpointId(method, routePath),
      method,
      path: routePath,
      handlerName: raw.handlerName,
      source: {
        file: raw.sourceFile,
        line: raw.line,
      },
      middleware: raw.middlewareNames
        ? raw.middlewareNames.map((name) => ({ name }))
        : [],
    };
  });
}
