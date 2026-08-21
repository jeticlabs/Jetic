import { faker } from '@faker-js/faker';
import {
  FieldDefinition,
  RequestBody,
  Endpoint,
  Parameter,
} from '@jetic/model';

/**
 * Generates realistic fake data for API request bodies based on
 * field definitions and constraints from the behavioral model.
 */
export class DataGenerator {
  /**
   * Generate a complete request body for an endpoint.
   */
  public generateBody(endpoint: Endpoint): Record<string, any> {
    const body: Record<string, any> = {};

    if (!endpoint.requestBody?.fields) {
      return body;
    }

    for (const [fieldName, fieldDef] of Object.entries(endpoint.requestBody.fields)) {
      // Skip optional fields 30% of the time for realism
      if (!fieldDef.required && Math.random() < 0.3) {
        continue;
      }
      body[fieldName] = this.generateFieldValue(fieldName, fieldDef);
    }

    return body;
  }

  /**
   * Generate query parameters for an endpoint.
   */
  public generateQueryParams(endpoint: Endpoint): Record<string, any> {
    const params: Record<string, any> = {};

    if (!endpoint.parameters) {
      return params;
    }

    for (const param of endpoint.parameters) {
      if (param.in === 'query') {
        if (param.default !== undefined) {
          params[param.name] = param.default;
        } else if (param.required) {
          params[param.name] = this.generateParamValue(param);
        }
      }
    }

    return params;
  }

  /**
   * Generate path parameters for an endpoint (replace :param placeholders).
   */
  public resolvePathParams(path: string, endpoint: Endpoint): string {
    let resolved = path;

    if (!endpoint.parameters) {
      return resolved;
    }

    for (const param of endpoint.parameters) {
      if (param.in === 'path') {
        const value = this.generateParamValue(param);
        resolved = resolved.replace(`:${param.name}`, String(value));
      }
    }

    return resolved;
  }

  /**
   * Generate a value for a single field based on its name and definition.
   * Uses smart heuristics to pick the most realistic faker method.
   */
  public generateFieldValue(fieldName: string, fieldDef: FieldDefinition): any {
    const name = fieldName.toLowerCase();
    const type = (fieldDef.type || 'string').toLowerCase();
    const format = (fieldDef.format || '').toLowerCase();

    // ── Type-based routing ────────────────────────────────────────────
    switch (type) {
      case 'string':
        return this.generateString(name, format, fieldDef);
      case 'number':
      case 'integer':
      case 'float':
        return this.generateNumber(name, fieldDef);
      case 'boolean':
        return faker.datatype.boolean();
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return this.generateString(name, format, fieldDef);
    }
  }

  // ── Private generators ──────────────────────────────────────────────

  private generateString(name: string, format: string, fieldDef: FieldDefinition): string {
    // Format-based first
    if (format === 'email' || name.includes('email')) {
      return faker.internet.email();
    }
    if (format === 'uri' || format === 'url' || name.includes('url') || name.includes('website')) {
      return faker.internet.url();
    }
    if (format === 'uuid' || name === 'id' || name.endsWith('id') || name.endsWith('_id')) {
      return faker.string.uuid();
    }
    if (format === 'date' || format === 'date-time' || name.includes('date') || name.includes('_at') || name.endsWith('at')) {
      return faker.date.recent().toISOString();
    }
    if (format === 'ipv4' || name.includes('ip')) {
      return faker.internet.ipv4();
    }

    // Name-based heuristics
    if (name.includes('password') || name.includes('passwd') || name.includes('secret')) {
      const minLen = fieldDef.minLength || 8;
      return faker.internet.password({ length: Math.max(minLen, 12), memorable: false, prefix: 'Aa1!' });
    }
    if (name.includes('name') && (name.includes('user') || name.includes('full') || name.includes('display'))) {
      return faker.person.fullName();
    }
    if (name.includes('first') && name.includes('name')) {
      return faker.person.firstName();
    }
    if (name.includes('last') && name.includes('name')) {
      return faker.person.lastName();
    }
    if (name === 'name' || name.includes('_name') || name.includes('title')) {
      return faker.lorem.words(2);
    }
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
      return faker.phone.number();
    }
    if (name.includes('address') || name.includes('street')) {
      return faker.location.streetAddress();
    }
    if (name.includes('city')) {
      return faker.location.city();
    }
    if (name.includes('country')) {
      return faker.location.country();
    }
    if (name.includes('zip') || name.includes('postal')) {
      return faker.location.zipCode();
    }
    if (name.includes('token') || name.includes('key') || name.includes('hash')) {
      return faker.string.alphanumeric(32);
    }
    if (name.includes('description') || name.includes('bio') || name.includes('about')) {
      return faker.lorem.paragraph();
    }
    if (name.includes('image') || name.includes('avatar') || name.includes('photo')) {
      return faker.image.url();
    }
    if (name.includes('color') || name.includes('colour')) {
      return faker.color.rgb();
    }
    if (name.includes('reference') || name.includes('ref')) {
      return faker.string.alphanumeric(16).toUpperCase();
    }
    if (name.includes('device')) {
      return faker.string.uuid();
    }
    if (name.includes('event')) {
      return faker.helpers.arrayElement(['charge.success', 'charge.failed', 'transfer.success']);
    }

    // Enum support
    if (fieldDef.enum && fieldDef.enum.length > 0) {
      return faker.helpers.arrayElement(fieldDef.enum);
    }

    // Fallback
    const minLen = fieldDef.minLength || 1;
    const maxLen = fieldDef.maxLength || 50;
    return faker.string.alpha({ length: { min: minLen, max: Math.min(maxLen, 50) } });
  }

  private generateNumber(name: string, fieldDef: FieldDefinition): number {
    const min = fieldDef.min ?? 1;
    const max = fieldDef.max ?? 1000;

    if (name.includes('age')) {
      return faker.number.int({ min: 18, max: 80 });
    }
    if (name.includes('price') || name.includes('amount') || name.includes('cost')) {
      return parseFloat(faker.commerce.price({ min: 1, max: 10000 }));
    }
    if (name.includes('quantity') || name.includes('count') || name.includes('limit')) {
      return faker.number.int({ min: Math.max(min, 1), max: Math.min(max, 100) });
    }
    if (name.includes('page')) {
      return faker.number.int({ min: 1, max: 10 });
    }
    if (name.includes('minute') || name.includes('duration')) {
      return faker.number.int({ min: Math.max(min, 1), max: Math.min(max, 120) });
    }
    if (name.includes('year')) {
      return faker.number.int({ min: 2020, max: 2030 });
    }

    return faker.number.int({ min, max });
  }

  private generateParamValue(param: Parameter): any {
    const type = (param.type || 'string').toLowerCase();

    if (type === 'number' || type === 'integer') {
      const min = param.min ?? 1;
      const max = param.max ?? 100;
      return faker.number.int({ min, max });
    }

    // For path params, generate UUIDs by default
    if (param.in === 'path') {
      return faker.string.uuid();
    }

    return faker.string.alpha(8);
  }
}
