export function normalizeEndpointPath(routePath: string): string {
  const withLeadingSlash = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const collapsed = withLeadingSlash.replace(/\/+/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed;
}

export function createEndpointId(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${normalizeEndpointPath(routePath)}`;
}