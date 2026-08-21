import { ResponseDefinition } from '@jetic/model';

/**
 * Result of validating a single response field.
 */
export interface FieldValidation {
  field: string;
  expectedType: string;
  actualType: string;
  actualValue: any;
  passed: boolean;
  /** The actual path where the value was resolved (may differ from field if found under a wrapper like 'data.') */
  resolvedPath?: string;
}

/**
 * Result of validating an entire response.
 */
export interface ValidationResult {
  statusPassed: boolean;
  expectedStatus: number;
  actualStatus: number;
  fieldValidations: FieldValidation[];
  totalFields: number;
  passedFields: number;
  failedFields: number;
  passed: boolean;
}

/**
 * Validates API responses against the expected schema
 * defined in the behavioral model.
 */
export class ResponseValidator {
  /**
   * Validate an HTTP response against the expected response definition.
   */
  public validate(
    actualStatus: number,
    actualBody: any,
    responses?: Record<string, ResponseDefinition>
  ): ValidationResult {
    // Determine what status we expected (use first success status as primary)
    const expectedStatus = this.getPrimaryExpectedStatus(responses);
    const statusPassed = actualStatus === expectedStatus;

    // Try to find a schema to validate against:
    // 1. First check if the actual status has a defined schema
    // 2. Fall back to the expected (primary) status schema
    // This ensures we still validate fields even when status codes mismatch
    const actualStatusDef = responses?.[String(actualStatus)];
    const expectedStatusDef = responses?.[String(expectedStatus)];
    const responseDef = actualStatusDef?.schema ? actualStatusDef : expectedStatusDef;

    // If no schema to validate against, just check status
    if (!responseDef?.schema) {
      return {
        statusPassed,
        expectedStatus,
        actualStatus,
        fieldValidations: [],
        totalFields: 0,
        passedFields: 0,
        failedFields: 0,
        passed: statusPassed,
      };
    }

    // Validate each field in the schema
    const fieldValidations: FieldValidation[] = [];

    // Common wrapper prefixes that APIs use (e.g., { data: { workspace: { ... } } })
    const wrapperPrefixes = ['data.', 'response.', 'result.', 'body.'];

    for (const [fieldPath, expectedType] of Object.entries(responseDef.schema)) {
      // Try the exact path first
      let actualValue = this.getNestedValue(actualBody, fieldPath);
      let resolvedPath = fieldPath;

      // If not found at exact path, try common wrapper prefixes
      if (actualValue === undefined || actualValue === null) {
        for (const prefix of wrapperPrefixes) {
          const wrappedPath = `${prefix}${fieldPath}`;
          const wrappedValue = this.getNestedValue(actualBody, wrappedPath);
          if (wrappedValue !== undefined && wrappedValue !== null) {
            actualValue = wrappedValue;
            resolvedPath = wrappedPath;
            break;
          }
        }
      }

      const actualType = this.getActualType(actualValue);
      const passed = this.typesMatch(actualType, expectedType);

      fieldValidations.push({
        field: fieldPath,
        expectedType,
        actualType,
        actualValue,
        passed,
        resolvedPath: resolvedPath !== fieldPath ? resolvedPath : undefined,
      });
    }

    const passedFields = fieldValidations.filter((f) => f.passed).length;
    const failedFields = fieldValidations.filter((f) => !f.passed).length;

    return {
      statusPassed,
      expectedStatus,
      actualStatus,
      fieldValidations,
      totalFields: fieldValidations.length,
      passedFields,
      failedFields,
      passed: failedFields === 0,
    };
  }

  /**
   * Get the primary expected success status code.
   * Prefers 200, 201, then the first 2xx code found.
   */
  private getPrimaryExpectedStatus(responses?: Record<string, ResponseDefinition>): number {
    if (!responses) return 200;

    const codes = Object.keys(responses).map(Number).sort();
    const successCodes = codes.filter((c) => c >= 200 && c < 300);

    if (successCodes.includes(200)) return 200;
    if (successCodes.includes(201)) return 201;
    if (successCodes.length > 0) return successCodes[0];

    return 200;
  }

  /**
   * Resolve a dot-notation path against an object.
   * e.g., "data.user.id" → obj.data.user.id
   */
  private getNestedValue(obj: any, path: string): any {
    if (obj === null || obj === undefined) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Get the runtime type of a value as a string.
   */
  private getActualType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Check if an actual type matches the expected type.
   * Handles loose matching (e.g., "number" matches both int and float).
   */
  private typesMatch(actualType: string, expectedType: string): boolean {
    const expected = expectedType.toLowerCase();
    const actual = actualType.toLowerCase();

    // Direct match
    if (actual === expected) return true;

    // Null/undefined never match (field is missing)
    if (actual === 'null' || actual === 'undefined') return false;

    // Number variants
    if (expected === 'number' && (actual === 'number' || actual === 'integer' || actual === 'float')) return true;
    if (expected === 'integer' && actual === 'number' && Number.isInteger(actual)) return true;

    // String is very permissive
    if (expected === 'string' && actual === 'string') return true;

    // Object can be array or object
    if (expected === 'object' && (actual === 'object' || actual === 'array')) return true;

    return false;
  }
}
