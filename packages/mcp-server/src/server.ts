import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { SerializedTransport } from './serial-transport';
import {
  readModelSchema,
  handleReadModel,
  listEndpointsSchema,
  handleListEndpoints,
  getEndpointSchema,
  handleGetEndpoint,
} from './tools/model-tools';
import {
  addEndpointSchema,
  handleAddEndpoint,
  updateEndpointSchema,
  handleUpdateEndpoint,
  deleteEndpointSchema,
  handleDeleteEndpoint,
} from './tools/endpoint-tools';
import { verifyModelSchema, handleVerifyModel } from './tools/validation-tools';
import { testEndpointSchema, handleTestEndpoint } from './tools/testing-tools';
import { manageEnvironmentSchema, handleManageEnvironment } from './tools/environment-tools';
import {
  listWorkflowsSchema,
  handleListWorkflows,
  simulateWorkflowSchema,
  handleSimulateWorkflow,
} from './tools/workflow-tools';
import {
  validateWorkflowSchema,
  handleValidateWorkflow,
  createWorkflowSchema,
  handleCreateWorkflow,
  updateWorkflowSchema,
  handleUpdateWorkflow,
  deleteWorkflowSchema,
  handleDeleteWorkflow,
} from './tools/workflow-authoring-tools';

export const JETIC_MCP_SERVER_NAME = 'jetic-mcp-server';

/**
 * Server version, read from this package's package.json at runtime so the
 * value advertised in the MCP `initialize` handshake can never drift from
 * the published version. Falls back to '0.1.0' for bundled layouts.
 */
export function getJeticMcpVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // ignore — use fallback below
  }
  return '0.1.0';
}

/**
 * Guidance surfaced to MCP clients via the `instructions` field of the
 * `initialize` response. Modern editors (opencode, Antigravity, Cursor,
 * Claude Code) display this to the model so it picks a sane tool order:
 * read first, mutate second, verify last.
 */
export const JETIC_MCP_INSTRUCTIONS = [
  'Jetic MCP manages API behavioral models stored in `.jetic/model.json`.',
  'Suggested workflow for AI agents:',
  '1. Start with `jetic_read_model` (summaryOnly=true) to learn the project layout.',
  '2. Use `jetic_list_endpoints` / `jetic_get_endpoint` before changing anything.',
  '3. Mutating tools (`jetic_add_endpoint`, `jetic_update_endpoint`, `jetic_delete_endpoint`, `jetic_manage_environment`) write to disk — confirm intent with the user first when the change is destructive (delete/overwrite).',
  '4. After edits, run `jetic_verify_model` and fix reported errors.',
  '5. Use `jetic_test_endpoint` / `jetic_simulate_workflow` only against a running server (local/staging); pass `baseUrl` to override the stored environment URL.',
  'Authoring workflows: NEVER hand-write workflow files blind. Build the steps, then run `jetic_validate_workflow` with the inline definition (dry run), fix reported errors, save with `jetic_create_workflow`, and finally execute with `jetic_simulate_workflow`. Chain steps with capture/captureInput (producer) + inject or {{workflow:key}} templates (consumer).',
  'Project resolution: every tool accepts an optional `projectPath`. If omitted, the server uses the `JETIC_PROJECT_PATH` environment variable, falling back to its own working directory. Set one of them to the project root so the server edits the right `.jetic/model.json`.',
].join('\n');

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const READ_LIVE: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  // Performs real HTTP requests against the target server.
  openWorldHint: true,
};

const WRITES_MODEL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

type Handler = (args: any) => unknown | Promise<unknown>;

function toTextResult(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

function toErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true as const, content: [{ type: 'text' as const, text: message }] };
}

/**
 * Creates (but does not connect) the Jetic MCP server.
 *
 * Uses the current `registerTool` API (not the deprecated `tool()` overloads)
 * and declares per-tool `annotations` so editors can badge read-only vs
 * destructive tools and gate destructive calls behind user approval.
 */
export function createJeticMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: JETIC_MCP_SERVER_NAME,
      version: getJeticMcpVersion(),
    },
    { instructions: JETIC_MCP_INSTRUCTIONS }
  );

  const register = (
    name: string,
    title: string,
    description: string,
    inputSchema: Record<string, any>,
    annotations: ToolAnnotations,
    handler: Handler
  ) => {
    server.registerTool(
      name,
      { title, description, inputSchema, annotations },
      async (args: any) => {
        try {
          return toTextResult(await handler(args));
        } catch (err) {
          return toErrorResult(err);
        }
      }
    );
  };

  register(
    'jetic_read_model',
    'Read Jetic model',
    'Reads .jetic/model.json from the workspace and returns the full behavioral model or a metadata summary. Start here before any other Jetic tool.',
    readModelSchema.shape,
    READ_ONLY,
    handleReadModel
  );

  register(
    'jetic_list_endpoints',
    'List endpoints',
    'Lists API endpoints discovered in .jetic/model.json with optional filters by method, tag, resource, or path substring.',
    listEndpointsSchema.shape,
    READ_ONLY,
    handleListEndpoints
  );

  register(
    'jetic_get_endpoint',
    'Get endpoint details',
    'Returns full structural details (parameters, request body, schemas, security, responses) of one endpoint, looked up by ID or by method + path.',
    getEndpointSchema.shape,
    READ_ONLY,
    handleGetEndpoint
  );

  register(
    'jetic_add_endpoint',
    'Add endpoint',
    'Adds a new endpoint definition to .jetic/model.json (or updates the existing method+path route when overwriteIfExists is true, the default). Adheres to the Jetic Behavioral Model schema.',
    addEndpointSchema.shape,
    WRITES_MODEL,
    handleAddEndpoint
  );

  register(
    'jetic_update_endpoint',
    'Update endpoint',
    'Partially updates an existing endpoint in .jetic/model.json, addressed by ID or by method + path. Only the fields inside "updates" are changed.',
    updateEndpointSchema.shape,
    WRITES_MODEL,
    handleUpdateEndpoint
  );

  register(
    'jetic_delete_endpoint',
    'Delete endpoint',
    'Removes an endpoint from .jetic/model.json by ID or by method + path. Destructive: confirm with the user before calling.',
    deleteEndpointSchema.shape,
    DESTRUCTIVE,
    handleDeleteEndpoint
  );

  register(
    'jetic_verify_model',
    'Verify model',
    'Validates .jetic/model.json: duplicate routes, unbound path parameters, invalid status codes, missing responses, dangling source links, unknown security schemes. Run after every edit.',
    verifyModelSchema.shape,
    READ_ONLY,
    handleVerifyModel
  );

  register(
    'jetic_test_endpoint',
    'Test endpoint live',
    'Executes a live HTTP request for one endpoint against the target environment (or baseUrl override) and returns status, timing, payload, and schema validation. Requires a running server.',
    testEndpointSchema.shape,
    READ_LIVE,
    handleTestEndpoint
  );

  register(
    'jetic_manage_environment',
    'Manage environments',
    'Lists, adds, updates, or deletes target deployment environments (e.g. local, staging, production) in .jetic/model.json. Delete is destructive.',
    manageEnvironmentSchema.shape,
    WRITES_MODEL,
    handleManageEnvironment
  );

  register(
    'jetic_list_workflows',
    'List workflows',
    'Lists multi-step integration test workflows from .jetic/workflows/*.json, .jetic/workflow.json, or embedded model.json workflows.',
    listWorkflowsSchema.shape,
    READ_ONLY,
    handleListWorkflows
  );

  register(
    'jetic_simulate_workflow',
    'Simulate workflow',
    'Executes a full end-to-end multi-step workflow simulation with dynamic memory capture, header injection, and schema validation against the live server.',
    simulateWorkflowSchema.shape,
    READ_LIVE,
    handleSimulateWorkflow
  );

  register(
    'jetic_simulate',
    'Simulate workflow (alias)',
    'Alias of jetic_simulate_workflow: runs a multi-step user-journey workflow against the live server. Prefer jetic_simulate_workflow in new prompts.',
    simulateWorkflowSchema.shape,
    READ_LIVE,
    handleSimulateWorkflow
  );

  register(
    'jetic_validate_workflow',
    'Validate workflow',
    'Deep-validates a workflow WITHOUT saving or running it: step structure, endpoint cross-checks against model.json, and memory data-flow analysis (every {{scope:key}} must be captured by an earlier step). Accepts a saved workflow reference or an inline definition for pre-save dry runs.',
    validateWorkflowSchema.shape,
    READ_ONLY,
    handleValidateWorkflow
  );

  register(
    'jetic_create_workflow',
    'Create workflow',
    'Creates a .jetic/workflows/<slug>.json workflow from ordered steps with capture/inject memory chaining. Refuses to save when validation errors exist (error messages say exactly how to fix); use validateOnly for a dry run. Can also migrate an embedded model.json workflow via fromModelWorkflow.',
    createWorkflowSchema.shape,
    WRITES_MODEL,
    handleCreateWorkflow
  );

  register(
    'jetic_update_workflow',
    'Update workflow',
    'Updates a saved file workflow: rename, description/environment, full steps replacement, or appendSteps. Validates before writing and refuses to save on errors.',
    updateWorkflowSchema.shape,
    WRITES_MODEL,
    handleUpdateWorkflow
  );

  register(
    'jetic_delete_workflow',
    'Delete workflow',
    'Deletes a saved .jetic/workflows/*.json workflow file by slug, name, or path. Destructive: confirm with the user before calling. Cannot delete model.json-embedded workflows.',
    deleteWorkflowSchema.shape,
    DESTRUCTIVE,
    handleDeleteWorkflow
  );

  return server;
}

/**
 * Connects the Jetic MCP server to stdio and blocks until the transport
 * closes. Never writes to stdout outside the transport (MCP protocol rule).
 *
 * Inbound requests pass through {@link SerializedTransport} so pipelined or
 * parallel tool calls from an agent execute strictly one at a time, in
 * arrival order — required for a stateful read-modify-write model file.
 */
export async function runMcpServer(): Promise<void> {
  const server = createJeticMcpServer();
  const transport = new SerializedTransport(new StdioServerTransport());
  await server.connect(transport);
  process.stderr.write(
    `jetic-mcp v${getJeticMcpVersion()} listening on stdio (project: ${
      process.env.JETIC_PROJECT_PATH || process.cwd()
    })\n`
  );
}
