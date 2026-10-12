/**
 * Canonical workflows against the shop-api fixture, shared by every tier.
 * Keep them small and obvious: when one fails, the cause should be a Jetic bug, not the workflow.
 */
import { WorkflowJson } from '../harness/shop-project';

export { VALID_OTP } from './shop-api/src/routes/otp';

const register = {
  name: 'Register',
  method: 'POST',
  path: '/api/auth/register',
  body: { email: '{{faker.internet.email}}', password: '{{faker.internet.password}}' },
  captureInput: { 'workflow:email': 'email', 'workflow:password': 'password' },
  capture: { 'workflow:userId': 'data.user.id' },
  expectStatus: 201,
};

const login = {
  name: 'Login',
  method: 'POST',
  path: '/api/auth/login',
  body: { email: '{{workflow:email}}', password: '{{workflow:password}}' },
  capture: { 'workflow:accessToken': 'data.accessToken' },
  expectStatus: 200,
};

const authHeader = { 'header:Authorization': 'Bearer {{workflow:accessToken}}' };

export const happyCheckout: WorkflowJson = {
  name: 'happy-checkout',
  steps: [
    register,
    login,
    {
      name: 'Create order',
      method: 'POST',
      path: '/api/orders',
      inject: authHeader,
      body: { item: 'widget', quantity: 2 },
      capture: { 'workflow:orderId': 'data.id' },
      expectStatus: 201,
    },
    {
      name: 'Get order',
      method: 'GET',
      path: '/api/orders/:id',
      inject: { ...authHeader, 'body:id': 'workflow:orderId' },
      expectStatus: 200,
    },
  ],
};

/** A normal user tries an admin-only endpoint and must be refused. */
export const forbiddenAdmin: WorkflowJson = {
  name: 'forbidden-admin',
  steps: [
    register,
    login,
    { name: 'Delete user as non-admin', method: 'DELETE', path: '/api/admin/users/:id', inject: authHeader, body: { id: 'u_999' }, expectStatus: 403 },
  ],
};

/** Expects 200 from a route that does not exist: must fail. */
export const broken: WorkflowJson = {
  name: 'broken',
  steps: [{ name: 'Missing route', method: 'GET', path: '/api/does-not-exist', expectStatus: 200 }],
};

/** `GET /api/flaky` answers 503 twice per key, then 200. Retry only exists in WorkflowSimulator. */
export const retryFlaky = (times: number, key = 'k'): WorkflowJson => ({
  name: 'retry-flaky',
  steps: [{ name: 'Flaky call', method: 'GET', path: '/api/flaky', body: { key }, retry: { times }, expectStatus: 200 }],
});

/** Needs a one-time code that only a human could know; CI supplies it with JETIC_HUMAN_OTP. */
export const humanOtp: WorkflowJson = {
  name: 'human-otp',
  steps: [{ name: 'Verify OTP', method: 'POST', path: '/api/otp/verify', body: { otp: '{{human:otp}}' }, expectStatus: 200 }],
};

/**
 * Same journey as `happyCheckout`, but the order id travels in memory (`workflow:id`, captured from the
 * create response) and fills `/api/orders/:id` from there, instead of through `inject: { "body:id": … }`.
 * Both styles are valid for the runners that support them; the MCP validator only accepts this one.
 */
export const checkoutWithMemoryId: WorkflowJson = {
  name: 'checkout-memory-id',
  steps: [
    register,
    login,
    {
      name: 'Create order',
      method: 'POST',
      path: '/api/orders',
      inject: authHeader,
      body: { item: 'widget', quantity: 2 },
      capture: { 'workflow:id': 'data.id' },
      expectStatus: 201,
    },
    { name: 'Get order', method: 'GET', path: '/api/orders/:id', inject: authHeader, expectStatus: 200 },
  ],
};
