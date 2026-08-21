import {
  BehavioralModel,
  Endpoint,
  Environment,
  SecurityScheme,
} from '@jetic/model';
import { DataGenerator } from './data-generator';
import { ResponseValidator, ValidationResult } from './response-validator';

/**
 * Result of simulating a single endpoint.
 */
export interface SimulationResult {
  endpoint: Endpoint;
  method: string;
  path: string;
  fullUrl: string;
  requestBody: Record<string, any> | null;
  requestHeaders: Record<string, string>;
  queryParams: Record<string, any>;

  responseStatus: number;
  responseBody: any;
  responseTimeMs: number;

  validation: ValidationResult;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  error?: string;
}

/**
 * Summary of simulating multiple endpoints.
 */
export interface SimulationSummary {
  totalEndpoints: number;
  passed: number;
  failed: number;
  skipped: number;
  totalTimeMs: number;
  results: SimulationResult[];
}

/**
 * Core simulation engine. Takes a behavioral model and an environment,
 * then executes requests against the live server with generated data,
 * validating responses against the model's expected schemas.
 */
export class EndpointSimulator {
  private dataGenerator: DataGenerator;
  private responseValidator: ResponseValidator;
  private environment: Environment;
  private securitySchemes: Record<string, SecurityScheme>;

  /** Cached tokens/variables produced by previous endpoint calls */
  private variableStore: Map<string, string> = new Map();

  constructor(
    private model: BehavioralModel,
    environment: Environment
  ) {
    this.dataGenerator = new DataGenerator();
    this.responseValidator = new ResponseValidator();
    this.environment = environment;
    this.securitySchemes = model.securitySchemes || {};
  }

  /**
   * Simulate a single endpoint.
   */
  public async simulateEndpoint(endpoint: Endpoint): Promise<SimulationResult> {
    // Check if we should skip (signature-based auth etc.)
    const skipReason = this.shouldSkip(endpoint);
    if (skipReason) {
      return this.createSkippedResult(endpoint, skipReason);
    }

    try {
      // Generate request data
      const body = this.hasBody(endpoint) ? this.dataGenerator.generateBody(endpoint) : null;
      const queryParams = this.dataGenerator.generateQueryParams(endpoint);

      // Build headers
      const headers = await this.buildHeaders(endpoint);

      // Resolve path parameters
      const resolvedPath = this.dataGenerator.resolvePathParams(endpoint.path, endpoint);

      // Build full URL
      let fullUrl = `${this.environment.baseUrl.replace(/\/$/, '')}${resolvedPath}`;

      // Append query params
      const queryString = Object.entries(queryParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (queryString) {
        fullUrl += `?${queryString}`;
      }

      // Execute request
      const startTime = Date.now();
      const fetchOptions: RequestInit = {
        method: endpoint.method,
        headers,
      };

      if (body && this.hasBody(endpoint)) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(fullUrl, fetchOptions);
      const responseTimeMs = Date.now() - startTime;

      // Parse response body
      let responseBody: any = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = null;
        }
      } else {
        responseBody = await response.text();
      }

      // Store produced variables for chaining
      this.storeProducedVariables(endpoint, responseBody);

      // Validate response
      const validation = this.responseValidator.validate(
        response.status,
        responseBody,
        endpoint.responses
      );

      return {
        endpoint,
        method: endpoint.method,
        path: endpoint.path,
        fullUrl,
        requestBody: body,
        requestHeaders: headers,
        queryParams,
        responseStatus: response.status,
        responseBody,
        responseTimeMs,
        validation,
        passed: validation.passed,
        skipped: false,
      };
    } catch (error: any) {
      return {
        endpoint,
        method: endpoint.method,
        path: endpoint.path,
        fullUrl: `${this.environment.baseUrl}${endpoint.path}`,
        requestBody: null,
        requestHeaders: {},
        queryParams: {},
        responseStatus: 0,
        responseBody: null,
        responseTimeMs: 0,
        validation: {
          statusPassed: false,
          expectedStatus: 200,
          actualStatus: 0,
          fieldValidations: [],
          totalFields: 0,
          passedFields: 0,
          failedFields: 0,
          passed: false,
        },
        passed: false,
        skipped: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Simulate all endpoints in the model.
   */
  public async simulateAll(
    onProgress?: (index: number, total: number, result: SimulationResult) => void
  ): Promise<SimulationSummary> {
    const results: SimulationResult[] = [];
    const startTime = Date.now();

    for (let i = 0; i < this.model.endpoints.length; i++) {
      const endpoint = this.model.endpoints[i];
      const result = await this.simulateEndpoint(endpoint);
      results.push(result);

      if (onProgress) {
        onProgress(i, this.model.endpoints.length, result);
      }
    }

    return {
      totalEndpoints: this.model.endpoints.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed && !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      totalTimeMs: Date.now() - startTime,
      results,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Check if an endpoint should be skipped.
   */
  private shouldSkip(endpoint: Endpoint): string | null {
    if (!endpoint.security) return null;

    for (const sec of endpoint.security) {
      const scheme = this.securitySchemes[sec.scheme];
      if (scheme?.type === 'signature') {
        return `signature auth (${sec.scheme})`;
      }
    }

    return null;
  }

  /**
   * Check if the endpoint expects a request body.
   */
  private hasBody(endpoint: Endpoint): boolean {
    const method = endpoint.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'DELETE') {
      return false;
    }
    return !!(endpoint.requestBody?.fields && Object.keys(endpoint.requestBody.fields).length > 0);
  }

  /**
   * Build request headers based on endpoint security and content type.
   */
  private async buildHeaders(endpoint: Endpoint): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    // Content-Type
    if (this.hasBody(endpoint)) {
      const ct = endpoint.requestBody?.contentType || 'application/json';
      headers['Content-Type'] = ct;
    }

    // Security headers
    if (endpoint.security) {
      for (const sec of endpoint.security) {
        if (sec.scheme === 'none') continue;

        const scheme = this.securitySchemes[sec.scheme];
        if (!scheme) continue;

        if (scheme.type === 'http' && scheme.scheme === 'bearer') {
          const token = await this.obtainToken(scheme);
          if (token) {
            const headerName = scheme.headerName || 'Authorization';
            const prefix = scheme.valuePrefix || 'Bearer ';
            headers[headerName] = `${prefix}${token}`;
          }
        } else if (scheme.type === 'apiKey' && scheme.headerName) {
          const storedValue = this.variableStore.get(scheme.headerName);
          if (storedValue) {
            headers[scheme.headerName] = storedValue;
          }
        }
      }
    }

    // Also check endpoint.consumes for header-based variables
    if (endpoint.consumes) {
      for (const consume of endpoint.consumes) {
        if (consume.usedAs.startsWith('header:')) {
          const headerName = consume.usedAs.replace('header:', '');
          const value = this.variableStore.get(consume.variable);
          if (value && !headers[headerName]) {
            // For Authorization headers, add Bearer prefix if not already present
            if (headerName === 'Authorization' && !value.startsWith('Bearer ')) {
              headers[headerName] = `Bearer ${value}`;
            } else {
              headers[headerName] = value;
            }
          }
        }
      }
    }

    return headers;
  }

  /**
   * Attempt to obtain an auth token by calling the obtainedFrom endpoint.
   */
  private async obtainToken(scheme: SecurityScheme): Promise<string | null> {
    // Check if we already have a token cached
    const cacheKey = `__token_${scheme.scheme || 'bearer'}`;
    const cached = this.variableStore.get(cacheKey);
    if (cached) return cached;

    // Also check common variable names
    const tokenVar = this.variableStore.get('accessToken') || this.variableStore.get('access_token');
    if (tokenVar) return tokenVar;

    // Try to obtain from the specified endpoint
    if (!scheme.obtainedFrom) return null;

    const { endpoint: epRef, field } = scheme.obtainedFrom;
    const [method, path] = epRef.split(' ');

    // Find the login/auth endpoint in the model
    const authEndpoint = this.model.endpoints.find(
      (ep) => ep.method === method && ep.path === path
    );

    if (!authEndpoint) return null;

    try {
      // First, check if we need to register a user first
      // Look for a register endpoint that produces the credentials needed for login
      const registerEndpoint = this.model.endpoints.find(
        (ep) => ep.method === 'POST' && (ep.path === '/register' || ep.path === '/signup')
      );

      let loginBody: Record<string, any>;

      if (registerEndpoint) {
        // Register first, then login with same credentials
        const regBody = this.dataGenerator.generateBody(registerEndpoint);
        const regUrl = `${this.environment.baseUrl.replace(/\/$/, '')}${registerEndpoint.path}`;

        const regResponse = await fetch(regUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(regBody),
        });

        if (regResponse.ok) {
          const regData = await regResponse.json();
          this.storeProducedVariables(registerEndpoint, regData);
        }

        // Build login body using the same credentials
        loginBody = {};
        if (authEndpoint.requestBody?.fields) {
          for (const [fieldName] of Object.entries(authEndpoint.requestBody.fields)) {
            // Try to reuse the registration values
            if (fieldName in regBody) {
              loginBody[fieldName] = regBody[fieldName];
            } else {
              loginBody[fieldName] = this.dataGenerator.generateFieldValue(fieldName, authEndpoint.requestBody.fields[fieldName]);
            }
          }
        }
      } else {
        loginBody = this.dataGenerator.generateBody(authEndpoint);
      }

      const loginUrl = `${this.environment.baseUrl.replace(/\/$/, '')}${path}`;
      const response = await fetch(loginUrl, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginBody),
      });

      if (!response.ok) return null;

      const data = await response.json();

      // Extract token from response using the field path
      const token = this.getNestedValue(data, field);
      if (token) {
        this.variableStore.set(cacheKey, token);
        this.variableStore.set('accessToken', token);
        // Store any other produced variables from the auth endpoint
        this.storeProducedVariables(authEndpoint, data);
      }

      return token || null;
    } catch {
      return null;
    }
  }

  /**
   * Store variables produced by an endpoint call for use by subsequent calls.
   */
  private storeProducedVariables(endpoint: Endpoint, responseBody: any): void {
    if (!endpoint.produces || !responseBody) return;

    for (const prod of endpoint.produces) {
      if (prod.variable && prod.responseField) {
        const value = this.getNestedValue(responseBody, prod.responseField);
        if (value !== undefined && value !== null) {
          this.variableStore.set(prod.variable, String(value));
        }
      }
    }
  }

  /**
   * Resolve a dot-notation path against an object.
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
   * Create a result for a skipped endpoint.
   */
  private createSkippedResult(endpoint: Endpoint, reason: string): SimulationResult {
    return {
      endpoint,
      method: endpoint.method,
      path: endpoint.path,
      fullUrl: `${this.environment.baseUrl}${endpoint.path}`,
      requestBody: null,
      requestHeaders: {},
      queryParams: {},
      responseStatus: 0,
      responseBody: null,
      responseTimeMs: 0,
      validation: {
        statusPassed: false,
        expectedStatus: 0,
        actualStatus: 0,
        fieldValidations: [],
        totalFields: 0,
        passedFields: 0,
        failedFields: 0,
        passed: false,
      },
      passed: false,
      skipped: true,
      skipReason: reason,
    };
  }
}
