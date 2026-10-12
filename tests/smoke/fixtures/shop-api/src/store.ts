export interface User {
  id: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
}

export interface Order {
  id: string;
  ownerId: string;
  item: string;
  quantity: number;
}

/** In-memory state for the fixture API. One instance per Jest test file (module registry). */
export const store = {
  users: new Map<string, User>(),
  tokens: new Map<string, string>(), // token -> user id
  orders: new Map<string, Order>(),
  flakyCalls: new Map<string, number>(),
  nextId: 1,
  mode: {
    /** When true, the reports endpoint skips authentication (simulates a missing auth guard). */
    leaky: false,
    /** How many times `GET /api/flaky` fails with 503 per `?key=` before succeeding. */
    flakyFailures: 2,
  },
};

export function newId(prefix: string): string {
  return `${prefix}_${store.nextId++}`;
}

export function resetStore(): void {
  store.users.clear();
  store.tokens.clear();
  store.orders.clear();
  store.flakyCalls.clear();
  store.nextId = 1;
  store.mode.leaky = false;
  store.mode.flakyFailures = 2;
}
