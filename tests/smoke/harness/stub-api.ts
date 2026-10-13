import * as http from 'http';
import { AddressInfo } from 'net';

export interface StubApi {
  url: string;
  /** Every request received, as "METHOD /path". */
  hits: string[];
  /** Hits excluding the `GET /` liveness probes some runners send before running. */
  requests(): string[];
  reset(): void;
  close(): Promise<void>;
}

/**
 * Tiny API for runner-parity tests. `POST /login` returns `{ data: { role: 'user' } }`;
 * `/missing` answers 404; every other path answers 200 `{ ok: true }`.
 */
export function startStubApi(): Promise<StubApi> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/login') return void res.end(JSON.stringify({ data: { role: 'user' } }));
    if (req.url === '/missing') {
      res.statusCode = 404;
      return void res.end(JSON.stringify({ error: 'not found' }));
    }
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        hits,
        requests: () => hits.filter((h) => h !== 'GET /'),
        reset: () => void (hits.length = 0),
        close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))),
      });
    })
  );
}
