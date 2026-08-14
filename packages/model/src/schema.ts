export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface SourceReference {
  file: string;
  line: number;
  column?: number;
}

export interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'body';
  type: string;
  required: boolean;
}

export interface MiddlewareReference {
  name: string;
  source?: SourceReference;
}

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  source: SourceReference;
  parameters: Parameter[];
  middleware: MiddlewareReference[];
}

export interface ProjectMetadata {
  name: string;
}

export interface BehavioralModel {
  version: string;
  generatedAt: string;
  project: ProjectMetadata;
  endpoints: Endpoint[];
}

export const CURRENT_MODEL_VERSION = '0.1';
