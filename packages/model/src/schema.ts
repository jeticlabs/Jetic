// ─── Primitives ─────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface SourceReference {
  file: string;
  line: number;
  column?: number;
}

// ─── Environments ───────────────────────────────────────────────────────────

export interface EnvironmentVariable {
  source: 'env' | 'file' | 'inline';
  required?: boolean;
  secret?: boolean;
  default?: string;
}

export interface Environment {
  name: string;
  baseUrl: string;
  variables?: Record<string, EnvironmentVariable>;
}

// ─── Security Schemes ───────────────────────────────────────────────────────

export interface SecuritySchemeObtainedFrom {
  endpoint: string;
  field: string;
}

export interface SecurityScheme {
  type: 'http' | 'apiKey' | 'signature' | 'oauth2' | 'none';
  scheme?: string;
  bearerFormat?: string;
  headerName?: string;
  valuePrefix?: string;
  obtainedFrom?: SecuritySchemeObtainedFrom;
  refreshedFrom?: SecuritySchemeObtainedFrom;
  failureModes?: string[];
  /** Signature-based auth */
  algorithm?: string;
  signedPayload?: string;
  secretVariable?: string;
}

// ─── Resources ──────────────────────────────────────────────────────────────

export interface Resource {
  name: string;
  idField?: string;
  ownedBy?: string;
}

// ─── Field Definitions ──────────────────────────────────────────────────────

export interface FieldDefinition {
  type: string;
  format?: string;
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  default?: any;
  enum?: string[];
  description?: string;
  example?: any;
}

// ─── Constraints ────────────────────────────────────────────────────────────

export interface ConstraintCondition {
  field: string;
  present?: boolean;
  equals?: any;
}

export interface ConstraintThen {
  field: string;
  type: string;
}

export interface Constraint {
  field?: string;
  rule?: string;
  value?: any;
  conflictStatus?: number;
  failureStatus?: number;
  source?: SourceReference;
  /** Conditional constraints */
  when?: ConstraintCondition;
  then?: ConstraintThen;
}

// ─── Request / Response ─────────────────────────────────────────────────────

export interface RequestBody {
  contentType: string | null;
  required?: boolean;
  fields: Record<string, FieldDefinition>;
  constraints?: Constraint[];
}

export interface ResponseDefinition {
  contentType?: string;
  description?: string;
  schema?: Record<string, string>;
  example?: any;
  condition?: string;
  ownershipCheck?: boolean;
}

// ─── Parameters (query, path, header, cookie) ───────────────────────────────

export interface Parameter {
  name: string;
  /** Where the parameter lives in the HTTP request */
  in?: 'query' | 'path' | 'header' | 'cookie' | 'body';
  type: string;
  format?: string;
  required?: boolean;
  default?: any;
  example?: any;
  min?: number;
  max?: number;
  description?: string;
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export interface MiddlewareReference {
  name: string;
  type?: string;
  scheme?: string;
  config?: Record<string, any>;
  source?: SourceReference;
}

// ─── Endpoint Security ──────────────────────────────────────────────────────

export interface EndpointSecurity {
  scheme: string;
  required?: boolean;
  scopes?: string[];
}

// ─── Produces / Consumes (data flow) ────────────────────────────────────────

export interface EndpointProduces {
  variable?: string;
  responseField?: string;
  resourceStateChange?: {
    resource: string;
    field: string;
    setFrom: string;
  };
}

export interface EndpointConsumes {
  variable: string;
  usedAs: string;
  producedBy?: string;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface PaginationConfig {
  type: 'offset' | 'cursor' | 'page';
  pageParam?: string;
  limitParam?: string;
  cursorParam?: string;
  totalPath?: string;
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  scope?: string;
}

// ─── Ownership ──────────────────────────────────────────────────────────────

export interface OwnershipConfig {
  ownerField: string;
  mustMatchAuthClaim: string;
}

// ─── Endpoint ───────────────────────────────────────────────────────────────

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;

  /** Human-readable name, e.g. "Create User" */
  name?: string;

  /** Short description of what this endpoint does */
  description?: string;

  /** Grouping tags, e.g. ["auth", "users"] */
  tags?: string[];

  /** Whether this endpoint is deprecated */
  deprecated?: boolean;

  /** Request timeout in milliseconds */
  timeout?: number;

  resource?: string;
  handlerName?: string;
  source: SourceReference;
  summary?: string;

  /** Security requirements for this endpoint */
  security?: EndpointSecurity[];

  /** Query / path / header / cookie parameters */
  parameters?: Parameter[];

  /** Request body definition */
  requestBody?: RequestBody;

  /** Response definitions keyed by HTTP status code string */
  responses?: Record<string, ResponseDefinition>;

  /** Middleware chain */
  middleware: MiddlewareReference[];

  /** Pagination configuration */
  pagination?: PaginationConfig;

  /** Rate limiting */
  rateLimit?: RateLimitConfig | null;

  /** Ownership / authorization rules */
  ownership?: OwnershipConfig;

  /** Variables this endpoint produces */
  produces?: EndpointProduces[];

  /** Variables this endpoint consumes */
  consumes?: EndpointConsumes[];
}

// ─── Dependencies ───────────────────────────────────────────────────────────

export interface Dependency {
  from: string;
  to: string;
  via: string;
}

// ─── Workflows ──────────────────────────────────────────────────────────────

export interface WorkflowStep {
  call: string;
  auth?: string;
  body?: Record<string, any>;
  bind?: Record<string, string>;
  expectStatus?: number;
  description?: string;
}

export interface Workflow {
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

// ─── State Machines ─────────────────────────────────────────────────────────

export interface StateTransition {
  from: string;
  to: string;
  via: string;
  condition?: string;
}

export interface InvalidTransition {
  from: string;
  to: string;
  expectStatus?: number;
  description?: string;
}

export interface StateMachine {
  resource: string;
  states: string[];
  transitions: StateTransition[];
  invalidTransitions?: InvalidTransition[];
}

// ─── Project Metadata ───────────────────────────────────────────────────────

export interface ProjectMetadata {
  name: string;
  language?: string;
  framework?: string;
}

// ─── Top-Level Behavioral Model ─────────────────────────────────────────────

export interface BehavioralModel {
  version: string;
  generatedAt: string;
  project: ProjectMetadata;

  /** Deployment environments (local, staging, prod, etc.) */
  environments?: Environment[];

  /** Authentication/authorization schemes */
  securitySchemes?: Record<string, SecurityScheme>;

  /** API resources / domain entities */
  resources?: Resource[];

  /** Discovered API endpoints */
  endpoints: Endpoint[];

  /** Inter-endpoint data dependencies */
  dependencies?: Dependency[];

  /** Multi-step test workflows */
  workflows?: Workflow[];

  /** Resource lifecycle state machines */
  stateMachines?: StateMachine[];
}

export const CURRENT_MODEL_VERSION = '0.3';
