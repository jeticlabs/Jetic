import * as http from 'http';
import * as path from 'path';
import { AddressInfo } from 'net';
import { createApp } from '../fixtures/shop-api/src/app';
import { resetStore, store } from '../fixtures/shop-api/src/store';
import { SMOKE_ROOT } from './paths';

export const SHOP_FIXTURE_DIR = path.join(SMOKE_ROOT, 'fixtures', 'shop-api');
export const SHOP_PORT_FROM_ENV = 3456; // fixtures/shop-api/.env

export interface ShopApi {
  url: string;
  port: number;
  /** Every request received, as "METHOD /path?query". */
  hits: string[];
  /** Clears fixture state (users, orders, counters, modes) and the hit log. Call in beforeEach. */
  reset(): void;
  setMode(mode: Partial<typeof store.mode>): void;
  /** Number of registered users — lets tests prove that a run really changed server state. */
  userCount(): number;
  orderCount(): number;
  close(): Promise<void>;
}

/**
 * Serves the shop-api fixture in-process on an ephemeral port. State lives in the fixture's
 * module-level store, so run at most one instance per Jest test file.
 */
export function startShopApi(): Promise<ShopApi> {
  resetStore();
  const app = createApp();
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    app(req, res);
  });

  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        hits,
        reset: () => {
          resetStore();
          hits.length = 0;
        },
        setMode: (mode) => void Object.assign(store.mode, mode),
        userCount: () => store.users.size,
        orderCount: () => store.orders.size,
        close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))),
      });
    })
  );
}
