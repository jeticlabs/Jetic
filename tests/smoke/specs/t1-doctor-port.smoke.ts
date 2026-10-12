/**
 * Tier 1 — `jetic doctor` and port 8787. Port availability is machine state, so these tests live in
 * their own file and only ever hold the port themselves; they step aside if something else owns it.
 */
import * as net from 'net';
import { expectExit, runCli } from '../harness/cli';
import { createShopProject } from '../harness/shop-project';

const DOCTOR_PORT = 8787;

/** Listens on the port doctor probes; resolves null if it is already taken by another process. */
function occupy(port: number): Promise<net.Server | null> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(null));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
const release = (server: net.Server) => new Promise<void>((resolve) => server.close(() => resolve()));

describe('Tier 1 — doctor and the dev port', () => {
  test('SMK-112c a healthy project with a free port exits 0 with "No problems found"', async () => {
    const holder = await occupy(DOCTOR_PORT);
    if (!holder) return void console.warn(`port ${DOCTOR_PORT} is in use on this machine; skipping`);
    await release(holder); // we only wanted proof that nothing else holds it

    const project = await createShopProject();
    const args = ['doctor'];
    const result = await runCli(args, { cwd: project.dir });
    expectExit(args, result, 0);
    expect(result.out).toContain('No problems found.');
    expect(result.out).toContain(`Port ${DOCTOR_PORT} available`);
  });

  test('SMK-112d an occupied port fails the check and the exit code', async () => {
    const holder = await occupy(DOCTOR_PORT);
    if (!holder) return void console.warn(`port ${DOCTOR_PORT} is in use on this machine; skipping`);
    try {
      const project = await createShopProject();
      const args = ['doctor'];
      const result = await runCli(args, { cwd: project.dir });
      expectExit(args, result, 1);
      expect(result.out).toMatch(/✗ Port 8787 available.*in use/);
      expect(result.out).toContain('Some checks failed');
    } finally {
      await release(holder);
    }
  });
});
