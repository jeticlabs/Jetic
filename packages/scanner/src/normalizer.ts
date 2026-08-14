import { Endpoint, HttpMethod } from '@jetic/model';
import { RawDiscovery } from './route-discovery';
import { resolvePaths } from './path-resolver';
import * as crypto from 'crypto';

export function normalizeDiscoveries(rawDiscoveries: RawDiscovery[]): Endpoint[] {
  const resolved = resolvePaths(rawDiscoveries);
  
  return resolved.map((raw) => ({
    id: crypto.randomUUID(),
    method: raw.method as HttpMethod,
    path: raw.path,
    source: {
      file: raw.sourceFile,
      line: raw.line,
    },
    parameters: [],
    middleware: [],
  }));
}
