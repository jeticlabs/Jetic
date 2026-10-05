import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateWorkflowDefinition } from './workflow-authoring-tools';

describe('validateWorkflowDefinition — conditions', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jetic-validate-'));
    fs.mkdirSync(path.join(projectDir, '.jetic', 'workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.jetic', 'model.json'),
      JSON.stringify({ version: '0.3', generatedAt: '', project: { name: 'p' }, environments: [], endpoints: [] })
    );
  });
  afterEach(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  const login = { name: 'Login', method: 'POST', path: '/login', capture: { 'workflow:role': 'data.role' } };
  const validate = (condition: unknown, step: object = login) =>
    validateWorkflowDefinition(
      { name: 'wf', steps: [{ ...step, condition }, { name: 'Next', method: 'GET', path: '/next' }] },
      { projectPath: projectDir, allowUnknownEndpoints: true }
    );
  const codes = (report: ReturnType<typeof validate>) => [...report.errors, ...report.warnings].map((i) => i.code);
  const rule = (extra: object = {}) => ({ left: '{{workflow:role}}', operator: 'equals', right: 'admin', ...extra });

  it('accepts a rules condition that reads what the same step captured', () => {
    const report = validate({ rules: { all: [rule()] }, onFail: 'abort' });
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it('still accepts the legacy if-guard, which runs before its step', () => {
    const guarded = (condition: object) =>
      validateWorkflowDefinition(
        { name: 'wf', steps: [login, { name: 'Admin', method: 'GET', path: '/admin', condition }] },
        { projectPath: projectDir, allowUnknownEndpoints: true }
      );
    expect(guarded({ if: '{{workflow:role}}', equals: 'admin' }).errors).toEqual([]);

    // The guard cannot see this step's own capture, so the same guard on the login step is an error.
    expect(codes(validate({ if: '{{workflow:role}}', equals: 'admin' }))).toContain('UNDEFINED_MEMORY_REF');
  });

  it.each([
    ['an object that is neither shape', { onFail: 'abort' }, 'BAD_CONDITION'],
    ['a non-object', 'admin', 'BAD_CONDITION'],
    ['an unknown operator', { rules: { all: [rule({ operator: 'looks_like' })] }, onFail: 'abort' }, 'BAD_CONDITION_OPERATOR'],
    ['a binary operator without "right"', { rules: { all: [{ left: '{{workflow:role}}', operator: 'equals' }] }, onFail: 'abort' }, 'CONDITION_MISSING_RIGHT'],
    ['rules.all that is not an array', { rules: { all: 'x' }, onFail: 'abort' }, 'BAD_CONDITION'],
    ['a missing onFail', { rules: { all: [rule()] } }, 'BAD_CONDITION_ONFAIL'],
    ['an invalid onFail', { rules: { all: [rule()] }, onFail: 'explode' }, 'BAD_CONDITION_ONFAIL'],
    ['switch without a target', { rules: { all: [rule()] }, onFail: 'switch' }, 'CONDITION_SWITCH_NO_TARGET'],
    ['switch to itself', { rules: { all: [rule()] }, onFail: 'switch', switchToWorkflow: 'wf' }, 'CONDITION_SWITCH_SELF'],
    ['a reference nothing captures', { rules: { all: [rule({ left: '{{workflow:nope}}' })] }, onFail: 'abort' }, 'UNDEFINED_MEMORY_REF'],
  ])('rejects %s', (_label, condition, code) => {
    const report = validate(condition);
    expect(report.valid).toBe(false);
    expect(report.errors.map((e) => e.code)).toContain(code);
  });

  it('allows unary operators without "right"', () => {
    const report = validate({ rules: { all: [{ left: '{{workflow:role}}', operator: 'exists' }] }, onFail: 'abort' });
    expect(report.errors).toEqual([]);
  });

  it('warns, but does not fail, for rules with nothing to check', () => {
    const report = validate({ rules: { all: [] }, onFail: 'abort' });
    expect(report.valid).toBe(true);
    expect(codes(report)).toContain('CONDITION_NO_RULES');
  });

  it('warns when a switch target does not exist yet, and is quiet when it does', () => {
    const condition = { rules: { all: [rule()] }, onFail: 'switch', switchToWorkflow: 'other' };
    expect(codes(validate(condition))).toContain('CONDITION_SWITCH_TARGET_MISSING');

    fs.writeFileSync(path.join(projectDir, '.jetic', 'workflows', 'other.json'), JSON.stringify({ name: 'Other', steps: [] }));
    expect(codes(validate(condition))).not.toContain('CONDITION_SWITCH_TARGET_MISSING');
    expect(validate(condition).valid).toBe(true);
  });

  it('warns about switch-only fields on other onFail values', () => {
    const report = validate({ rules: { all: [rule()] }, onFail: 'abort', returnOnComplete: true });
    expect(codes(report)).toContain('CONDITION_UNUSED_SWITCH_FIELDS');
  });

  it('collects {{human:key}} refs used in conditions', () => {
    const report = validate({ rules: { all: [rule({ left: '{{human:otp}}' })] }, onFail: 'abort' });
    expect(report.humanKeys).toContain('otp');
    expect(report.errors).toEqual([]);
  });
});
