/**
 * Step conditions — the single implementation shared by every workflow runner
 * (`WorkflowSimulator`, `jetic simulate workflow`, and the `jetic dev` SSE runner).
 *
 * Two shapes exist:
 *
 *  - **Rules** (canonical): evaluated AFTER the step runs; `onFail` decides the flow.
 *    `{ rules: { all|any: [{ left, operator, right? }] }, onFail: 'abort'|'continue'|'switch' }`
 *    This is what Jetic Studio authors.
 *
 *  - **Legacy guard** (still supported): evaluated BEFORE the step; a miss skips just that step.
 *    `{ if: '{{workflow:role}}', equals: 'admin' }`
 *
 * Anything else is `invalid` and runners must FAIL the run — silently ignoring an
 * unrecognized condition would let a broken workflow report green.
 */

export type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'greater_than_or_equal'
  | 'less_than' | 'less_than_or_equal'
  | 'exists' | 'not_exists'
  | 'is_empty' | 'is_not_empty'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with';

export const CONDITION_OPERATORS: readonly ConditionOperator[] = [
  'equals', 'not_equals',
  'greater_than', 'greater_than_or_equal',
  'less_than', 'less_than_or_equal',
  'exists', 'not_exists',
  'is_empty', 'is_not_empty',
  'contains', 'not_contains',
  'starts_with', 'ends_with',
];

/** Operators that take no `right` operand. */
export const UNARY_OPERATORS: readonly ConditionOperator[] = ['exists', 'not_exists', 'is_empty', 'is_not_empty'];

export interface ConditionRule {
  left: string;
  operator: ConditionOperator;
  right?: string;
}

export interface ConditionGroup {
  /** AND — every rule must hold. */
  all?: ConditionRule[];
  /** OR — at least one rule must hold. When both are given, both groups must hold. */
  any?: ConditionRule[];
}

export type ConditionOnFail = 'abort' | 'continue' | 'switch';

export interface RulesCondition {
  rules: ConditionGroup;
  /**
   * What to do when the rules do not hold:
   *  - `abort`    — fail the workflow
   *  - `continue` — stop the remaining steps; the workflow does NOT fail (branch not applicable)
   *  - `switch`   — run `switchToWorkflow`; with `returnOnComplete` resume here afterwards, otherwise end
   */
  onFail: ConditionOnFail;
  switchToWorkflow?: string;
  returnOnComplete?: boolean;
}

export interface LegacyCondition {
  /** Template expression to resolve, e.g. "{{workflow:role}}" */
  if: string;
  equals?: string;
  notEquals?: string;
  contains?: string;
  /** true → value must be non-empty; false → value must be empty */
  exists?: boolean;
  greaterThan?: number;
  lessThan?: number;
  in?: string[];
}

export type StepCondition = RulesCondition | LegacyCondition;

/** Resolves `{{faker.*}}`, `{{scope:key}}` and `{{human:key}}` templates inside a string. */
export type TemplateResolver = (value: string) => Promise<string>;

export type ConditionKind = 'rules' | 'legacy' | 'invalid';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function conditionKind(condition: unknown): ConditionKind {
  if (!isObject(condition)) return 'invalid';
  if (isObject(condition.rules)) return 'rules';
  if (typeof condition.if === 'string') return 'legacy';
  return 'invalid';
}

export function isRulesCondition(condition: unknown): condition is RulesCondition {
  return conditionKind(condition) === 'rules';
}

export function isLegacyCondition(condition: unknown): condition is LegacyCondition {
  return conditionKind(condition) === 'legacy';
}

/** Human-readable reason an `invalid` condition could not be understood. */
export function describeInvalidCondition(condition: unknown): string {
  if (!isObject(condition)) return 'condition must be an object';
  const keys = Object.keys(condition);
  return (
    `unrecognized condition (keys: ${keys.join(', ') || 'none'}). ` +
    'Use { "rules": { "all": [{ "left", "operator", "right" }] }, "onFail": "abort|continue|switch" }'
  );
}

async function evaluateRule(rule: ConditionRule, resolve: TemplateResolver): Promise<{ ok: boolean; unknownOperator?: boolean }> {
  const left = await resolve(String(rule.left ?? ''));
  const right = rule.right !== undefined ? await resolve(String(rule.right)) : undefined;

  switch (rule.operator) {
    case 'equals':                return { ok: left === right };
    case 'not_equals':            return { ok: left !== right };
    case 'greater_than':          return { ok: Number(left) > Number(right) };
    case 'greater_than_or_equal': return { ok: Number(left) >= Number(right) };
    case 'less_than':             return { ok: Number(left) < Number(right) };
    case 'less_than_or_equal':    return { ok: Number(left) <= Number(right) };
    case 'exists':                return { ok: left !== '' && left !== undefined };
    case 'not_exists':            return { ok: left === '' || left === undefined };
    case 'is_empty':              return { ok: left === '' };
    case 'is_not_empty':          return { ok: left !== '' };
    case 'contains':              return { ok: right !== undefined && left.includes(right) };
    case 'not_contains':          return { ok: right !== undefined && !left.includes(right) };
    case 'starts_with':           return { ok: right !== undefined && left.startsWith(right) };
    case 'ends_with':             return { ok: right !== undefined && left.endsWith(right) };
    default:                      return { ok: false, unknownOperator: true };
  }
}

function describeRule(rule: ConditionRule): string {
  return `${rule.left} ${rule.operator}${rule.right !== undefined ? ` ${rule.right}` : ''}`;
}

/** Evaluates a rule group. No rules at all passes (nothing to enforce). */
export async function evaluateRules(
  group: ConditionGroup,
  resolve: TemplateResolver
): Promise<{ passed: boolean; reason: string }> {
  const all = Array.isArray(group.all) ? group.all : undefined;
  const any = Array.isArray(group.any) ? group.any : undefined;
  if ((!all || all.length === 0) && (!any || any.length === 0)) {
    return { passed: true, reason: 'No rules defined' };
  }

  const failing: string[] = [];
  let passed = true;

  if (all && all.length > 0) {
    const results = [];
    for (const rule of all) results.push({ rule, ...(await evaluateRule(rule, resolve)) });
    const bad = results.filter((r) => !r.ok);
    if (bad.length > 0) {
      passed = false;
      failing.push(...bad.map((r) => (r.unknownOperator ? `${describeRule(r.rule)} (unknown operator)` : describeRule(r.rule))));
    }
  }

  if (any && any.length > 0) {
    const results = [];
    for (const rule of any) results.push({ rule, ...(await evaluateRule(rule, resolve)) });
    if (!results.some((r) => r.ok)) {
      passed = false;
      failing.push(`none of: ${results.map((r) => describeRule(r.rule)).join(' | ')}`);
    }
  }

  const mode = all && any ? 'AND+OR' : all ? 'AND' : 'OR';
  return {
    passed,
    reason: passed ? `All conditions met (${mode})` : `Failed: ${failing.join(', ')}`,
  };
}

/** Evaluates a legacy pre-step guard. `matched: true` means the step should run. */
export async function evaluateLegacyCondition(
  condition: LegacyCondition,
  resolve: TemplateResolver
): Promise<{ matched: boolean; evaluated: string }> {
  const evaluated = await resolve(condition.if);
  let matched: boolean;

  if (condition.exists !== undefined) {
    const hasValue = evaluated !== '' && evaluated !== 'null' && evaluated !== 'undefined';
    matched = condition.exists ? hasValue : !hasValue;
  } else if (condition.equals !== undefined) {
    matched = evaluated === condition.equals;
  } else if (condition.notEquals !== undefined) {
    matched = evaluated !== condition.notEquals;
  } else if (condition.contains !== undefined) {
    matched = evaluated.includes(condition.contains);
  } else if (condition.greaterThan !== undefined) {
    matched = Number(evaluated) > condition.greaterThan;
  } else if (condition.lessThan !== undefined) {
    matched = Number(evaluated) < condition.lessThan;
  } else if (condition.in !== undefined) {
    matched = condition.in.includes(evaluated);
  } else {
    // No explicit operator — truthy check (non-empty, not 'false'/'0'/'null'/'undefined')
    matched = evaluated !== '' && evaluated !== 'false' && evaluated !== '0' && evaluated !== 'null' && evaluated !== 'undefined';
  }

  return { matched, evaluated };
}
