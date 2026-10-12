/**
 * Tier 5 — runner parity on a real journey (the shop-api fixture): the same saved workflow must
 * reach the same verdict, with the same HTTP traffic, in `jetic test`, `jetic simulate workflow`,
 * the MCP server and the dashboard's runner. (Condition semantics: t5-parity.)
 */
import { broken, checkoutWithMemoryId, forbiddenAdmin, happyCheckout, humanOtp, VALID_OTP } from '../fixtures/workflows';
import { ALL_RUNNERS, Outcome, RunContext, RunnerName, runOn } from '../harness/runners';
import { startShopApi, ShopApi } from '../harness/shop-api';
import { createShopProject, WorkflowJson } from '../harness/shop-project';

let api: ShopApi;
beforeAll(async () => {
  api = await startShopApi();
});
afterAll(() => api.close());

async function contextFor(workflow: WorkflowJson, env?: NodeJS.ProcessEnv): Promise<RunContext> {
  const slug = workflow.name;
  const project = await createShopProject({ baseUrl: api.url, workflows: { [slug]: workflow } });
  return { project, slug, baseUrl: api.url, env, hits: () => api.hits, resetApi: () => api.reset() };
}

const signature = (outcomes: Partial<Record<RunnerName, Outcome>>) =>
  Object.fromEntries(Object.entries(outcomes).map(([name, o]) => [name, o]));

describe('Tier 5 — one journey, four runners', () => {
  test('SMK-501 happy-checkout (register → login → order → fetch it by id) agrees everywhere', async () => {
    const outcomes = await runOn(await contextFor(happyCheckout));
    const expected: Outcome = {
      passed: true,
      requests: ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/orders', 'GET /api/orders/ord_N'],
    };
    expect(signature(outcomes)).toEqual(Object.fromEntries(ALL_RUNNERS.map((name) => [name, expected])));
  });

  test('SMK-501b a negative journey (a normal user is refused the admin endpoint) passes everywhere', async () => {
    const outcomes = await runOn(await contextFor(forbiddenAdmin));
    const expected: Outcome = {
      passed: true,
      requests: ['POST /api/auth/register', 'POST /api/auth/login', 'DELETE /api/admin/users/u_N'],
    };
    expect(signature(outcomes)).toEqual(Object.fromEntries(ALL_RUNNERS.map((name) => [name, expected])));
  });

  test('SMK-501c a workflow expecting 200 from a missing route fails everywhere', async () => {
    const outcomes = await runOn(await contextFor(broken));
    const expected: Outcome = { passed: false, requests: ['GET /api/does-not-exist'] };
    expect(signature(outcomes)).toEqual(Object.fromEntries(ALL_RUNNERS.map((name) => [name, expected])));
  });

  test('SMK-501d {{human:otp}} supplied by JETIC_HUMAN_OTP passes everywhere, without prompting', async () => {
    const outcomes = await runOn(await contextFor(humanOtp, { JETIC_HUMAN_OTP: VALID_OTP }));
    const expected: Outcome = { passed: true, requests: ['POST /api/otp/verify'] };
    expect(signature(outcomes)).toEqual(Object.fromEntries(ALL_RUNNERS.map((name) => [name, expected])));
  });

  test('SMK-501e without a value, the non-interactive runners fail the same way (the dashboard would prompt)', async () => {
    const outcomes = await runOn(await contextFor(humanOtp), ['test', 'cli', 'mcp']);
    expect(outcomes.test!.passed).toBe(false);
    expect(outcomes.cli!.passed).toBe(false);
    expect(outcomes.mcp!.passed).toBe(false);
  });

  // `/orders/:id` filled from a memory key captured earlier (`workflow:id`) — exactly what the MCP
  // validator tells authors to do. `jetic test` and MCP honor it; the other two send a literal ":id".
  test.failing('KG-32 a path param filled from captured memory works in every runner', async () => {
    const outcomes = await runOn(await contextFor(checkoutWithMemoryId));
    const expected: Outcome = {
      passed: true,
      requests: ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/orders', 'GET /api/orders/ord_N'],
    };
    expect(signature(outcomes)).toEqual(Object.fromEntries(ALL_RUNNERS.map((name) => [name, expected])));
  });

  test('SMK-504 the runners that DO honor memory-filled path params agree with each other and with the validator', async () => {
    const context = await contextFor(checkoutWithMemoryId);
    const outcomes = await runOn(context, ['test', 'mcp']);
    const expected: Outcome = {
      passed: true,
      requests: ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/orders', 'GET /api/orders/ord_N'],
    };
    expect(signature(outcomes)).toEqual({ test: expected, mcp: expected });
  });
});
