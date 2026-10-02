import { normalizeDiscoveries } from './normalizer';
import { RawDiscovery } from './route-discovery';

describe('normalizeDiscoveries', () => {
  it('uses stable method and normalized path endpoint IDs', () => {
    const discovery: RawDiscovery = {
      method: 'get',
      path: '//api/orders/:orderId/',
      sourceFile: 'src/orders.ts',
      line: 12,
    };

    const first = normalizeDiscoveries([discovery])[0];
    const second = normalizeDiscoveries([discovery])[0];

    expect(first.id).toBe('GET /api/orders/:orderId');
    expect(first.path).toBe('/api/orders/:orderId');
    expect(second.id).toBe(first.id);
  });

  it('preserves the root route', () => {
    const discovery: RawDiscovery = {
      method: 'get',
      path: '/',
      sourceFile: 'src/health.ts',
      line: 4,
    };

    expect(normalizeDiscoveries([discovery])[0].id).toBe('GET /');
  });
});