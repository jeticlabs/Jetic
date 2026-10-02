import { normalizeConstraints } from '@jetic/model';

describe('normalizeConstraints', () => {
  it('normalizes explicit field metadata in stable order', () => {
    expect(normalizeConstraints({
      quantity: { type: 'integer', required: true, min: 1, max: 10 },
      status: { type: 'string', enum: ['open', 'closed'] },
      name: { type: 'string', minLength: 2, maxLength: 40 },
    })).toEqual([
      { kind: 'required', field: 'quantity' },
      { kind: 'min', field: 'quantity', value: 1, inclusive: true },
      { kind: 'max', field: 'quantity', value: 10, inclusive: true },
      { kind: 'enum', field: 'status', values: ['open', 'closed'] },
      { kind: 'minLength', field: 'name', value: 2 },
      { kind: 'maxLength', field: 'name', value: 40 },
    ]);
  });

  it('keeps legacy rules explicitly unparsed', () => {
    const legacy = { field: 'email', rule: 'requiredIf', value: 'verified' };

    expect(normalizeConstraints({}, [legacy])).toEqual([
      { kind: 'unparsed', source: JSON.stringify(legacy) },
    ]);
  });
});