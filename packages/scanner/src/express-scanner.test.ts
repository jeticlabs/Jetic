import { ExpressScanner } from './express-scanner';
import * as path from 'path';

describe('ExpressScanner', () => {
  it('discovers routes accurately from the fixture', async () => {
    const fixturePath = path.resolve(__dirname, '../../../examples/express-shop');
    const scanner = new ExpressScanner({ projectRoot: fixturePath, jeticDir: path.join(fixturePath, '.jetic') });
    const model = await scanner.scan();

    expect(model.endpoints.length).toBeGreaterThan(0);
    
    // Verify basic health endpoint
    const health = model.endpoints.find(e => e.path === '/health');
    expect(health).toBeDefined();
    expect(health?.method).toBe('GET');

    // Verify nested routes
    const getOrder = model.endpoints.find(e => e.path === '/api/orders/:id' && e.method === 'GET');
    expect(getOrder).toBeDefined();
    expect(getOrder?.source.file.includes('orders.ts')).toBe(true);

    const createUser = model.endpoints.find(e => e.path === '/api/users' && e.method === 'GET');
    expect(createUser).toBeDefined();
    expect(createUser?.source.file.includes('users.ts')).toBe(true);
  });
});
