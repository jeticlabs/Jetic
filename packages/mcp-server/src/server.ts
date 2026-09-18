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
import {
  initProjectSchema,
  handleInitProject,
  scanProjectSchema,
  handleScanProject,
  getChangesSchema,
  handleGetChanges,
  clearChangesSchema,
  handleClearChanges,
} from './tools/project-tools';
import {
  getSessionPhaseSchema,
  handleGetSessionPhase,
} from './tools/session-tools';
import {
  scaffoldWorkflowSchema,
  handleScaffoldWorkflow,
} from './tools/workflow-designer-tools';

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
 * Claude Code) display this to the model so it follows the strict
 * 4-phase order enforced by `jetic_get_session_phase`.
 */
export const JETIC_MCP_INSTRUCTIONS = [
  'Jetic MCP manages API behavioral models in `.jetic/`. You MUST follow this strict 4-phase order. Never skip, reorder, or bypass any phase.',
  '',
  '━━ PHASE 1 — INITIALIZE ━━',
  'Call `jetic_get_session_phase` at the very start of every session. If phase=1 (modelExists:false), call `jetic_init` to scaffold .jetic/model.json.',
  'Gate: DO NOT advance to Phase 2 until modelExists is true.',
  '',
  '━━ PHASE 2 — SCAN ━━',
  'Populate the model with endpoints:',
  '  • Express+TypeScript (tsconfig.json present): call `jetic_scan` (static, keyless, no AI provider needed).',
  '  • Any other stack or scan gaps: read source code and call `jetic_add_endpoint` for every route (middleware chains, security, constraints, pagination, produces/consumes).',
  'Gate: DO NOT advance to Phase 3 until endpointsCount > 0.',
  '',
  '━━ PHASE 3 — VERIFY ━━',
  'Call `jetic_verify_model`. Fix every error AND every MISSING_FIELD_* warning:',
  '  • Fill `description` on every endpoint.',
  '  • Add at least one `tag` per endpoint.',
  '  • Add `description` to every parameter.',
  '  • Add `description` to every response status code.',
  'Use `jetic_update_endpoint` to fill gaps. Call `jetic_verify_model` again after each batch.',
  'Gate: DO NOT advance to Phase 4 until jetic_get_session_phase returns phase=4 (modelIsValid AND allFieldsFilled both true).',
  '',
  '━━ PHASE 4 — SIMULATE ━━',
  'STOP. Ask the user: "What simulation or workflow do you want to build or test?"',
  'Wait for their explicit answer. Then follow these sub-steps IN ORDER:',
  '',
  'STEP 4a — SCAFFOLD',
  '  Call `jetic_scaffold_workflow` with the ORDERED list of endpoints the user wants to exercise.',
  '  It reads model.json and returns `draftSteps` with:',
  '    • body derived from requestBody.fields (faker-mapped by type / format / field name)',
  '    • inject derived from securitySchemes.obtainedFrom (token producer → consumer chain)',
  '    • capture derived from endpoint.produces',
  '    • captureInput for required fields that later steps will reuse',
  '  Review draftSteps. Fix any `missingFields` entries before proceeding.',
  '',
  'STEP 4b — HUMAN INPUT PROTOCOL',
  '  Use {{human:key}} ONLY when the value is truly unknowable before runtime:',
  '    • One-time secrets: OTP codes, 2FA tokens, CAPTCHA answers',
  '    • Real credentials that must be typed at execution time',
  '  NEVER use {{human:key}} for things faker can generate (emails, names, UUIDs, passwords).',
  '  The scaffold tool already handles faker mapping — only override to {{human:key}} when a',
  '  field appears in missingFields AND genuinely requires interactive user input.',
  '',
  'STEP 4c — CONDITIONS (branching / skipping steps)',
  '  Add `condition` to skip a step when a memory value does not match:',
  '    { "condition": { "if": "{{workflow:userRole}}", "equals": "admin" } }',
  '  Operators: equals, notEquals, contains, exists (bool), greaterThan, lessThan, in (string[]).',
  '  Skipped steps count as passed — the workflow continues.',
  '  Pair with onFailure:"continue" for negative/branching flows.',
  '',
  'STEP 4d — FAILURE MODES & RETRY',
  '  onFailure (per step):',
  '    • "abort" (default) — stop the workflow on first failure',
  '    • "continue" — log the failure and proceed (captures are skipped for that step)',
  '  continueOnStatus (per step): extra codes treated as pass, e.g. [404] or [409].',
  '  retry (per step OR workflow-level global default):',
  '    • { "times": 3, "delayMs": 1000 } — retries up to 3× with 1 s between each attempt',
  '    • Per-step retry overrides the workflow-level default. Keep times ≤ 5.',
  '',
  'STEP 4e — VALIDATE (dry run, no save)',
  '  jetic_validate_workflow { "definition": { "name": "...", "steps": [...] } }',
  '  Fix all errors. Warnings are informational.',
  '',
  'STEP 4f — SAVE',
  '  jetic_create_workflow { "name": "...", "steps": [...] }',
  '',
  'STEP 4g — RUN',
  '  jetic_simulate_workflow { "workflow": "<slug>" }',
  '',
  '━━ GENERAL RULES ━━',
  'No AI-provider setup is needed: never ask for OpenRouter/OpenAI keys and never use `jetic config ai`.',
  'Mutating tools write to disk — confirm intent with the user before destructive operations (delete/overwrite).',
  'Project resolution: every tool accepts an optional `projectPath`. If omitted, falls back to JETIC_PROJECT_PATH env var, then cwd.',
  '━━ CHANGE TRACKING (jetic dev) ━━',
  'When `jetic dev` is running it watches source files and logs edits to `.jetic/changes.json`.',
  'Before rescanning: call `jetic_get_changes` — if hasChanges is true, read ONLY the listed filePaths.',
  'Update model.json for those files, then call `jetic_clear_changes` (or jetic_scan, which clears automatically).',
  '',
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

  // ── Phase gate (always call this first) ────────────────────────────────
  register(
    'jetic_get_session_phase',
    'Get session phase',
    'ALWAYS CALL THIS FIRST. Returns the current workflow phase (1=init, 2=scan, 3=verify, 4=simulate), gate conditions (modelExists, endpointsCount, modelIsValid, allFieldsFilled), and the exact nextAction the AI must take. Never skip phase gates.',
    getSessionPhaseSchema.shape,
    READ_ONLY,
    handleGetSessionPhase
  );

  // ── Phase 1: Initialize ─────────────────────────────────────────────────
  register(
    'jetic_init',
    'Initialize Jetic project',
    'PHASE 1: Scaffolds .jetic/model.json (+ workflows/, config.json) for repos that have none. Refuses to clobber an existing model (pass overwrite:true to replace). Reports whether auto-scan applies (Express+TypeScript) and what to do next.',
    initProjectSchema.shape,
    WRITES_MODEL,
    handleInitProject
  );

  // ── Phase 2: Scan ───────────────────────────────────────────────────────
  register(
    'jetic_scan',
    'Scan Express project',
    'PHASE 2 (Express+TypeScript only — requires tsconfig.json): Static AST scan that fills model.json with routes, middleware, and auth heuristics. Keyless — no AI provider involved. Default merge upserts scanned routes and keeps hand-added endpoints; overwrite replaces all endpoints. Fails with guidance for non-Express stacks (model those manually with jetic_add_endpoint). Auto-clears .jetic/changes.json after success.',
    scanProjectSchema.shape,
    WRITES_MODEL,
    handleScanProject
  );

  // ── Change tracking (jetic dev watcher) ────────────────────────────────
  register(
    'jetic_get_changes',
    'Get file change log',
    'Reads .jetic/changes.json — the lightweight change log populated by the ChangeScanner running inside `jetic dev`. Returns the list of source files edited since the last scan or jetic_clear_changes. Use this BEFORE rescanning to read only changed files instead of the full codebase.',
    getChangesSchema.shape,
    READ_ONLY,
    handleGetChanges
  );

  register(
    'jetic_clear_changes',
    'Clear file change log',
    'Clears .jetic/changes.json after the AI has finished updating model.json from the changed files. Also called automatically by jetic_scan. Call this when you have finished processing all changes returned by jetic_get_changes.',
    clearChangesSchema.shape,
    WRITES_MODEL,
    handleClearChanges
  );

  // ── Model read tools (used in all phases) ───────────────────────────────
  register(
    'jetic_read_model',
    'Read Jetic model',
    'Reads .jetic/model.json from the workspace and returns the full behavioral model or a metadata summary.',
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
    'jetic_scaffold_workflow',
    'Scaffold workflow steps from model',
    'PHASE 4a — FIRST STEP when building a workflow. Given an ordered endpoint list, reads model.json and returns ready-made `draftSteps`: body fields faker-mapped by type/format/name, inject derived from securitySchemes.obtainedFrom token-producer chains, capture from endpoint.produces, captureInput for reusable credentials. Returns missingFields (fields needing human input or manual fix) and securityChain analysis. Does NOT save. Review draftSteps, then call jetic_validate_workflow → jetic_create_workflow.',
    scaffoldWorkflowSchema.shape,
    READ_ONLY,
    handleScaffoldWorkflow
  );

  register(
    'jetic_validate_workflow',
    'Validate workflow (dry run)',
    'Deep-validates a workflow WITHOUT saving: step structure, endpoint cross-checks against model.json, full memory data-flow analysis. Now also validates condition (including condition.if template refs), onFailure, continueOnStatus, and retry fields. Accepts a saved workflow slug/name or an inline definition.',
    validateWorkflowSchema.shape,
    READ_ONLY,
    handleValidateWorkflow
  );

  register(
    'jetic_create_workflow',
    'Create workflow',
    'Creates a .jetic/workflows/<slug>.json workflow. Supports: condition (skip steps based on memory), onFailure (abort|continue), continueOnStatus (extra pass codes), retry (per-step or global default). Refuses to save on validation errors.',
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
