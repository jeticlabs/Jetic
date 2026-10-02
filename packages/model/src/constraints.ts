import { Constraint, FieldDefinition, LegacyConstraint } from './schema';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeConstraints(
  fields: Record<string, FieldDefinition>,
  legacyConstraints: LegacyConstraint[] = []
): Constraint[] {
  const constraints: Constraint[] = [];

  for (const [field, definition] of Object.entries(fields)) {
    if (definition.required) {
      constraints.push({ kind: 'required', field });
    }

    if (isFiniteNumber(definition.min)) {
      constraints.push({ kind: 'min', field, value: definition.min, inclusive: true });
    }
    if (isFiniteNumber(definition.max)) {
      constraints.push({ kind: 'max', field, value: definition.max, inclusive: true });
    }
    if (isFiniteNumber(definition.minLength)) {
      constraints.push({ kind: 'minLength', field, value: definition.minLength });
    }
    if (isFiniteNumber(definition.maxLength)) {
      constraints.push({ kind: 'maxLength', field, value: definition.maxLength });
    }
    if (definition.enum?.length) {
      constraints.push({ kind: 'enum', field, values: [...definition.enum] });
    }
  }

  for (const legacy of legacyConstraints) {
    constraints.push({ kind: 'unparsed', source: JSON.stringify(legacy) });
  }

  return constraints;
}