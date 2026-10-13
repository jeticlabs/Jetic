import {
  conditionKind,
  describeInvalidCondition,
  evaluateLegacyCondition,
  evaluateRules,
  RulesCondition,
  CONDITION_OPERATORS,
} from './conditions';

const identity = async (value: string) => value;
/** Resolves {{name}} from a map, like a memory-backed resolver would. */
const fromMap = (values: Record<string, string>) => async (value: string) =>
  value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key) => values[key] ?? '');

describe('conditionKind', () => {
  it.each([
    [{ rules: { all: [] }, onFail: 'abort' }, 'rules'],
    [{ if: '{{workflow:role}}', equals: 'admin' }, 'legacy'],
    [{ if: '{{workflow:role}}' }, 'legacy'],
    [{ rules: { all: [] }, if: 'x' }, 'rules'], // rules wins
    [{}, 'invalid'],
    [{ rules: 'nope' }, 'invalid'],
    [{ onFail: 'abort' }, 'invalid'],
    [null, 'invalid'],
    ['equals', 'invalid'],
    [[], 'invalid'],
  ])('%j → %s', (condition, expected) => {
    expect(conditionKind(condition)).toBe(expected);
  });

  it('explains an invalid condition', () => {
    expect(describeInvalidCondition({ onFail: 'abort' })).toContain('keys: onFail');
    expect(describeInvalidCondition('x')).toContain('must be an object');
  });
});

describe('evaluateRules', () => {
  const rule = (operator: any, left: string, right?: string) => ({ left, operator, right });
  const run = (all: any[], values: Record<string, string> = {}) => evaluateRules({ all }, fromMap(values));

  it.each<[string, string, string | undefined, boolean]>([
    ['equals', 'a', 'a', true],
    ['equals', 'a', 'b', false],
    ['not_equals', 'a', 'b', true],
    ['greater_than', '10', '9', true],
    ['greater_than', '9', '10', false],
    ['greater_than_or_equal', '10', '10', true],
    ['less_than', '1', '2', true],
    ['less_than_or_equal', '2', '2', true],
    ['exists', 'x', undefined, true],
    ['exists', '', undefined, false],
    ['not_exists', '', undefined, true],
    ['is_empty', '', undefined, true],
    ['is_not_empty', 'x', undefined, true],
    ['contains', 'hello', 'ell', true],
    ['not_contains', 'hello', 'zzz', true],
    ['starts_with', 'hello', 'he', true],
    ['ends_with', 'hello', 'lo', true],
    ['contains', 'hello', undefined, false], // missing operand never matches
  ])('%s(%j, %j) → %s', async (operator, left, right, expected) => {
    expect((await run([rule(operator, left, right)])).passed).toBe(expected);
  });

  it('covers every documented operator', () => {
    expect(CONDITION_OPERATORS).toHaveLength(14);
  });

  it('resolves templates on both sides', async () => {
    const result = await run([rule('equals', '{{workflow:role}}', '{{workflow:expected}}')], {
      'workflow:role': 'admin',
      'workflow:expected': 'admin',
    });
    expect(result.passed).toBe(true);
  });

  it('AND requires every rule and names the failing ones', async () => {
    const result = await run([rule('equals', 'a', 'a'), rule('equals', 'a', 'b')]);
    expect(result).toEqual({ passed: false, reason: 'Failed: a equals b' });
  });

  it('OR requires at least one rule', async () => {
    const group = { any: [rule('equals', 'a', 'b'), rule('equals', 'c', 'c')] };
    expect((await evaluateRules(group, identity)).passed).toBe(true);
    expect((await evaluateRules({ any: [rule('equals', 'a', 'b')] }, identity)).passed).toBe(false);
  });

  it('requires both groups when all and any are given', async () => {
    const group = { all: [rule('equals', 'a', 'a')], any: [rule('equals', 'x', 'y')] };
    expect((await evaluateRules(group, identity)).passed).toBe(false);
  });

  it('passes when there are no rules, and fails on an unknown operator', async () => {
    expect(await evaluateRules({}, identity)).toEqual({ passed: true, reason: 'No rules defined' });
    const bad = await evaluateRules({ all: [rule('looks_like', 'a', 'a')] }, identity);
    expect(bad.passed).toBe(false);
    expect(bad.reason).toContain('unknown operator');
  });
});

describe('evaluateLegacyCondition', () => {
  const run = (condition: any, values: Record<string, string> = {}) => evaluateLegacyCondition(condition, fromMap(values));

  it('matches on equals / notEquals / contains / in / numeric comparisons', async () => {
    const v = { 'workflow:role': 'admin', 'workflow:n': '5' };
    expect((await run({ if: '{{workflow:role}}', equals: 'admin' }, v)).matched).toBe(true);
    expect((await run({ if: '{{workflow:role}}', equals: 'user' }, v)).matched).toBe(false);
    expect((await run({ if: '{{workflow:role}}', notEquals: 'user' }, v)).matched).toBe(true);
    expect((await run({ if: '{{workflow:role}}', contains: 'dm' }, v)).matched).toBe(true);
    expect((await run({ if: '{{workflow:role}}', in: ['admin', 'root'] }, v)).matched).toBe(true);
    expect((await run({ if: '{{workflow:n}}', greaterThan: 4 }, v)).matched).toBe(true);
    expect((await run({ if: '{{workflow:n}}', lessThan: 4 }, v)).matched).toBe(false);
  });

  it('bare condition is a truthy check', async () => {
    expect((await run({ if: '{{workflow:flag}}' }, { 'workflow:flag': 'yes' })).matched).toBe(true);
    for (const falsy of ['', 'false', '0', 'null', 'undefined']) {
      expect((await run({ if: '{{workflow:flag}}' }, { 'workflow:flag': falsy })).matched).toBe(false);
    }
  });

  it('exists: true/false', async () => {
    expect((await run({ if: '{{workflow:x}}', exists: true }, { 'workflow:x': 'v' })).matched).toBe(true);
    expect((await run({ if: '{{workflow:x}}', exists: false }, {})).matched).toBe(true);
  });
});

describe('types', () => {
  it('RulesCondition requires onFail', () => {
    const condition: RulesCondition = { rules: { all: [] }, onFail: 'switch', switchToWorkflow: 'other', returnOnComplete: true };
    expect(condition.onFail).toBe('switch');
  });
});
