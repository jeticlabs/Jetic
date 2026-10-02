# Jetic CLI — Full Product Description

**Jetic is a code-aware, agentic API behavior testing toolkit for Node.js and modern application frameworks.**

At its core, Jetic gives a developer a local runtime that can:

```text
understand the application
        ↓
discover the API
        ↓
build an API model
        ↓
define realistic workflows
        ↓
execute those workflows
        ↓
observe traces and behavior
        ↓
detect changes
        ↓
run specialized agents
        ↓
report behavioral regressions
```

The important distinction is that Jetic is **not just an API client**, **not just an OpenAPI generator**, and **not just an AI testing agent**.

Its architecture is:

```text
Jetic CLI
   │
   ├── Scanner
   │     └── Framework adapters
   │
   ├── Model
   │
   ├── Workflows
   │
   ├── Tools
   │
   ├── Agents
   │
   ├── Simulation engine
   │
   ├── Runtime
   │
   ├── MCP server
   │
   └── Dashboard
```

---

# 1. The main idea

A traditional API testing tool thinks like this:

```text
POST /login
GET /profile
POST /users
```

Jetic thinks like this:

```text
User registration
    ↓
Email verification
    ↓
Login
    ↓
Token captured
    ↓
Create project
    ↓
Invite another user
    ↓
Invitation email
    ↓
Accept invitation
    ↓
Access project
    ↓
Logout
```

So Jetic models **application behavior**, not just individual HTTP requests.

Its core promise is:

> **Test the behavior of your API as an application, not just individual requests.**

---

# 2. What gets installed

A developer can install the CLI:

```bash
npm install -D @jetic/cli
```

Then:

```bash
npx jetic init
```

or, once globally installed:

```bash
jetic init
```

The CLI is the user's entry point into the entire Jetic runtime.

---

# 3. What `jetic init` creates

A newly initialized project can look like:

```text
my-api/
│
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   └── schemas/
│
├── package.json
├── tsconfig.json
├── .env
├── .gitignore
│
├── jetic.config.json
├── jetic.tools.ts
│
└── .jetic/
    │
    ├── model/
    │   ├── api.yaml
    │   ├── paths/
    │   ├── schemas/
    │   └── security/
    │
    ├── workflows/
    │
    ├── agents/
    │
    ├── environments/
    │
    ├── activity/
    │
    ├── index/
    │
    ├── runs/
    │
    ├── reports/
    │
    └── cache/
```

The important design rule is:

```text
Human/source configuration
    ↓
jetic.config.json
jetic.tools.ts
.jetic/model/
.jetic/workflows/
.jetic/agents/
.jetic/environments/

Generated state
    ↓
.jetic/cache/
.jetic/index/
.jetic/runs/
.jetic/reports/
.jetic/activity/
```

The source-oriented Jetic files are Git-native.

Generated state is disposable.

---

# 4. `jetic.config.json`

This is the root configuration file.

Example:

```json
{
  "$schema": "https://jetic.dev/schema/config.json",

  "project": {
    "name": "my-api"
  },

  "source": {
    "root": ".",
    "include": [
      "src/**/*.{ts,tsx,js,jsx}"
    ],
    "exclude": [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".next/**",
      "coverage/**"
    ]
  },

  "scanner": {
    "adapter": "auto",
    "incremental": true,
    "watch": true
  },

  "model": {
    "directory": ".jetic/model"
  },

  "workflows": {
    "directory": ".jetic/workflows"
  },

  "agents": {
    "directory": ".jetic/agents"
  },

  "tools": {
    "entry": "./jetic.tools.ts"
  },

  "environments": {
    "directory": ".jetic/environments",
    "default": "local"
  },

  "runtime": {
    "baseUrl": "http://localhost:3000"
  }
}
```

A user should be able to start with almost nothing:

```json
{
  "$schema": "https://jetic.dev/schema/config.json",
  "project": {
    "name": "my-api"
  }
}
```

Jetic auto-detects the framework, package manager, source tree, routes, schemas, middleware, and other information.

---

# 5. The CLI command hierarchy

The CLI should be designed around a small set of major concepts.

```text
jetic
├── init
├── dev
├── scan
├── model
├── workflow
├── test
├── simulate
├── agent
├── tool
├── adapter
├── run
├── activity
├── report
├── mcp
├── config
└── doctor
```

---

# 6. `jetic init`

Initializes Jetic in an existing project.

```bash
jetic init
```

It should:

```text
✓ detect package.json
✓ detect TypeScript
✓ detect framework
✓ detect source directory
✓ detect package manager
✓ detect existing API specification
✓ create jetic.config.json
✓ create .jetic/
✓ register detected adapter
```

For example:

```text
Jetic

Detecting project...

✓ Node.js
✓ TypeScript
✓ Express
✓ package.json
✓ src/
✓ 24 route definitions detected

Jetic project initialized.

Next:

  jetic scan
  jetic dev
```

---

# 7. `jetic scan`

This is the deterministic project analysis command.

```bash
jetic scan
```

Conceptually:

```text
Project
   ↓
File discovery
   ↓
Framework detection
   ↓
Adapter
   ↓
AST analysis
   ↓
Symbol resolution
   ↓
Dependency graph
   ↓
Route discovery
   ↓
Schema discovery
   ↓
Middleware/auth discovery
   ↓
Jetic IR
   ↓
Model
```

Example output:

```text
JETIC SCAN

Project       my-api
Framework     Express
Adapter       @jetic/adapter-express

Analyzing...

✓ 318 source files
✓ 27 endpoints
✓ 14 schemas
✓ 8 middleware
✓ 3 authentication mechanisms
✓ 11 services
✓ 42 dependencies

Model generated.

27 endpoints
14 schemas
3 security boundaries

Scan completed in 4.2s
```

The scanner should primarily be **static analysis**, not an LLM.

AI only becomes involved when static analysis cannot confidently determine something.

---

# 8. Scanner architecture

Jetic itself provides the scanner engine.

```text
@jetic/scanner-core
        │
        ├── AST engine
        ├── symbol graph
        ├── dependency graph
        ├── module resolution
        ├── incremental cache
        ├── Jetic IR
        └── validation
                 │
                 ▼
          @jetic/scanner-sdk
                 │
                 ▼
        Framework adapters
```

The adapter teaches Jetic how a framework works.

For example:

```text
@jetic/adapter-express
@jetic/adapter-nextjs
@jetic/adapter-fastify
@jetic/adapter-nestjs
@jetic/adapter-hono
```

---

# 9. Adapter model

An adapter is a real TypeScript project.

Example:

```text
adapter-fastify/
├── src/
│   ├── index.ts
│   ├── detector.ts
│   ├── routes.ts
│   ├── schemas.ts
│   ├── middleware.ts
│   ├── auth.ts
│   └── analyzer.ts
│
├── fixtures/
│   ├── basic/
│   ├── nested-routes/
│   └── complex/
│
├── tests/
├── examples/
├── jetic.adapter.yaml
├── package.json
└── README.md
```

The developer uses:

```ts
import { defineAdapter } from "@jetic/scanner-sdk";

export default defineAdapter({
  id: "fastify",

  name: "Fastify",

  detect(ctx) {
    return ctx.dependencies.has("fastify");
  },

  scan(ctx) {
    // framework-specific static analysis

    return {
      endpoints: [],
      schemas: [],
      middleware: []
    };
  }
});
```

---

# 10. Jetic IR

Adapters should **not** invent their own output format.

Every adapter produces the same intermediate representation:

```text
Express
Next.js
Fastify
Nest
Hono
custom framework
      ↓
   Jetic IR
```

An endpoint might conceptually look like:

```ts
type JeticEndpoint = {
  id: string;

  method: HttpMethod;

  path: string;

  operationId?: string;

  source: {
    file: string;
    line?: number;
    symbol?: string;
  };

  request?: {
    params?: Schema;
    query?: Schema;
    headers?: Schema;
    body?: Schema;
  };

  responses?: ResponseDefinition[];

  middleware?: string[];

  authentication?: AuthenticationInfo;

  authorization?: AuthorizationInfo;

  confidence: number;

  evidence: Evidence[];
};
```

The IR is the canonical internal representation.

YAML is simply one human-facing representation of that information.

---

# 11. Why evidence matters

Jetic should not pretend to know something that static analysis doesn't prove.

Instead of:

```text
GET /users/:id is secure
```

Jetic can say:

```text
authentication:
  detected: true

evidence:
  file: src/middleware/auth.ts
  symbol: authenticate
  reason: JWT verification middleware
```

And:

```text
authorization:
  status: unknown
```

That uncertainty can later be investigated by an AI agent.

---

# 12. Incremental scanning

Jetic should not rescan the entire project after every edit.

It maintains hashes and dependency relationships.

```text
User changes:

src/middleware/auth.ts
       ↓
file hash changed
       ↓
affected symbols
       ↓
affected routes
       ↓
affected workflows
       ↓
only relevant analysis runs
```

So `jetic dev` can continuously update the model.

---

# 13. `jetic dev`

This is the primary development mode.

```bash
jetic dev
```

It starts the local Jetic runtime.

Conceptually:

```text
JETIC RUNTIME
│
├── File watcher
├── Scanner
├── Adapter runtime
├── Model engine
├── Workflow engine
├── Tool runtime
├── Agent runtime
├── Event bus
├── MCP server
└── Dashboard
```

For example:

```text
Jetic

✓ Scanner ready
✓ Express adapter loaded
✓ Model loaded
✓ 27 endpoints
✓ 8 workflows
✓ 3 agents
✓ 6 tools

Dashboard:
http://localhost:8877

MCP:
ready
```

---

# 14. The dashboard

The CLI runs the local runtime, while the dashboard provides a visual interface.

Conceptually:

```text
JETIC

Overview
Models
Workflows
Simulations
Tools
Agents

────────────

Activity
Runs
Reports

────────────

Settings
```

The dashboard is not the core product.

It is the visual interface to the Jetic runtime.

The CLI remains the fundamental developer interface.

---

# 15. Live model synchronization

While `jetic dev` runs:

```text
Developer edits source
        ↓
File watcher
        ↓
Incremental scanner
        ↓
Adapter
        ↓
Jetic IR
        ↓
Model diff
```

Jetic might detect:

```text
NEW ENDPOINT

POST /payments/refund

Source:
src/routes/payments.ts:84

[Review]
[Add to Model]
[Ignore]
```

Or:

```text
API MODEL CHANGE

POST /login

Added:
twoFactorCode: string

Affected workflows:
3
```

---

# 16. `.jetic/model`

The model represents **what the application exposes**.

Example:

```text
.jetic/model/
├── api.yaml
├── paths/
│   ├── auth.yaml
│   ├── users.yaml
│   ├── projects.yaml
│   └── payments.yaml
├── schemas/
│   ├── User.yaml
│   ├── UserCreate.yaml
│   ├── Project.yaml
│   └── Error.yaml
└── security/
    ├── authentication.yaml
    └── authorization.yaml
```

`api.yaml` acts as the root index:

```yaml
version: "1"

name: My API

paths:
  - ./paths/auth.yaml
  - ./paths/users.yaml
  - ./paths/projects.yaml

schemas:
  - ./schemas/User.yaml
  - ./schemas/Project.yaml
```

---

# 17. Model vs workflow

This distinction is fundamental.

### Model

Answers:

> What exists?

For example:

```text
POST /login
GET /profile
POST /projects
```

### Workflow

Answers:

> What happens?

For example:

```text
login
 ↓
capture token
 ↓
create project
 ↓
invite user
 ↓
wait for email
 ↓
verify invitation
 ↓
access project
```

Jetic therefore keeps these separate.

---

# 18. `jetic model`

Useful commands:

```bash
jetic model
jetic model list
jetic model inspect
jetic model sync
jetic model diff
jetic model validate
```

Examples:

```bash
jetic model list
```

could output:

```text
27 endpoints
14 schemas
8 middleware
3 auth mechanisms
```

And:

```bash
jetic model diff
```

might show:

```diff
POST /login
+ body.twoFactorCode: string

POST /users
~ response User → UserWithProfile
```

---

# 19. AI IDE mutation of the model

This is where Jetic's MCP becomes important.

An AI IDE should not have to manually understand your YAML structure.

It can call:

```text
jetic_add_endpoint
jetic_update_endpoint
jetic_remove_endpoint
```

For example:

```json
{
  "method": "POST",
  "path": "/payments/refund",
  "operationId": "refundPayment"
}
```

Jetic handles:

```text
correct YAML file
references
schema connections
validation
formatting
duplicate detection
model updates
```

The IDE gets a diff back.

The YAML remains the Git-native source of truth.

---

# 20. Workflows

Workflows describe behavior.

Example:

```yaml
version: "1"

id: user-login

name: User Login

steps:

  - id: login

    request:
      endpoint: auth.login

      body:
        email: "{{user.email}}"
        password: "{{user.password}}"

    capture:
      token:
        from: response.body.accessToken

  - id: profile

    request:
      endpoint: users.profile

      headers:
        Authorization: "Bearer {{token}}"

    assert:
      status:
        equals: 200
```

---

# 21. Workflow capabilities

A workflow can eventually contain:

```text
ACTION
REQUEST
CAPTURE
MEMORY
CONDITION
ASSERT
WAIT
LOOP
PARALLEL
RETRY
EVENT
ERROR HANDLER
```

For example:

```text
POST /login
   ↓
capture token
   ↓
MEMORY[token]
   ↓
WAIT FOR EMAIL
   ↓
capture OTP
   ↓
GENERATE TOTP
   ↓
GET /profile
   ↓
ASSERT status = 200
```

This is one of the biggest differences between Jetic and a collection of isolated API requests.

---

# 22. `jetic workflow`

Commands:

```bash
jetic workflow list
jetic workflow validate
jetic workflow run <id>
jetic workflow inspect <id>
```

Example:

```bash
jetic workflow run user-login
```

Output:

```text
WORKFLOW: user-login

✓ POST /login
  200 OK
  token captured

✓ WAIT FOR EMAIL
  OTP received

✓ GENERATE TOTP
  generated

✓ GET /profile
  200 OK

Workflow passed.
Duration: 1.82s
```

---

# 23. Tools

Tools are executable capabilities.

Example project:

```text
tools/
├── create-test-user.ts
├── seed-user.ts
├── send-test-email.ts
└── create-wallet.ts
```

Registered through:

```text
jetic.tools.ts
```

Example:

```ts
import { defineTool } from "@jetic/sdk";
import { z } from "zod";

const createTestUser = defineTool({
  name: "create_test_user",

  description: "Create a test user",

  input: z.object({
    email: z.string().email()
  }),

  output: z.object({
    id: z.string(),
    email: z.string()
  }),

  async execute(input, ctx) {
    // application-specific logic
  }
});

export const tools = [
  createTestUser
];
```

---

# 24. Tool vs workflow vs agent

These three should remain separate.

```text
Tool
= capability

Workflow
= predefined behavior

Agent
= reasoning / decision-making actor
```

Example:

```text
Tool:
create_test_user()

Workflow:
login → create project → invite user

Agent:
decide which workflows to run
and investigate what failed
```

---

# 25. Agents

Agents are specialized Jetic workers.

They can be:

```text
deterministic
hybrid
LLM-powered
```

Some do not need AI.

For example:

```text
Model Watcher
Dependency Analyzer
Workflow Impact Analyzer
Regression Runner
```

can be deterministic.

More reasoning-heavy agents:

```text
Security Agent
Scenario Agent
Investigator
Fix Agent
Report Agent
```

can use an LLM.

---

# 26. Agent definitions

Example:

```yaml
version: "1"

id: regression

name: Regression Agent

description: >
  Identify behavioral regressions caused by
  source or API changes.

triggers:
  - manual
  - model.changed
  - pull_request.opened

tools:
  - get_model
  - get_changed_endpoints
  - list_workflows
  - run_workflow
  - get_trace

permissions:
  model: read
  workflows: read
  execution: execute
  source: read
```

---

# 27. Agent runtime

Jetic provides its own agent runtime.

Conceptually:

```text
Agent definition
      ↓
Agent context
      ↓
LLM
      ↓
tool call
      ↓
Jetic tool
      ↓
result
      ↓
LLM
      ↓
tool call
      ↓
...
      ↓
final result
```

You do not need to make the AI IDE instantiate the agent itself.

---

# 28. Agent SDK

Eventually:

```text
@jetic/agent-sdk
```

can allow developers to create custom agents.

For example:

```ts
import { defineAgent } from "@jetic/agent-sdk";

export default defineAgent({
  id: "api-security",

  description: "Analyze API authorization behavior",

  tools: [
    "get_model",
    "get_source",
    "run_workflow",
    "get_trace"
  ],

  async run(ctx) {
    // agent logic
  }
});
```

---

# 29. AI IDE integration

Jetic should expose an MCP server.

```bash
jetic mcp
```

Or:

```bash
jetic dev
```

can automatically start it.

The AI IDE then connects to Jetic.

The IDE can access:

```text
model
workflows
agents
runs
reports
activity
traces
```

and actions:

```text
scan
add endpoint
update model
run workflow
run simulation
run agent
```

---

# 30. MCP tools

A sensible MCP surface is:

```text
READ

jetic_get_model
jetic_list_endpoints
jetic_get_endpoint
jetic_list_workflows
jetic_get_workflow
jetic_list_agents
jetic_get_report
jetic_get_activity
jetic_get_trace
```

Mutation:

```text
jetic_add_endpoint
jetic_update_endpoint
jetic_remove_endpoint

jetic_add_workflow
jetic_update_workflow
jetic_remove_workflow

jetic_apply
```

Execution:

```text
jetic_scan
jetic_sync_model
jetic_run_workflow
jetic_run_simulation
jetic_run_agent
```

Results:

```text
jetic_get_run
jetic_get_agent_run
jetic_get_report
```

---

# 31. Why semantic MCP tools are better than YAML generation

You want the AI IDE to say:

```text
jetic_add_endpoint({
  method: "POST",
  path: "/payments/refund"
})
```

rather than:

```text
"Generate this YAML."
```

Jetic then owns:

```text
file placement
format
references
validation
IDs
schema connections
consistency
```

So the architecture becomes:

```text
AI IDE
   ↓
MCP
   ↓
Jetic semantic API
   ↓
Jetic model engine
   ↓
YAML
```

YAML remains editable by humans.

---

# 32. Agents through MCP

An AI IDE can call:

```text
jetic_run_agent
```

with:

```json
{
  "agent": "regression",
  "input": {
    "reason": "Authentication middleware changed"
  }
}
```

Jetic returns a run ID:

```json
{
  "status": "queued",
  "runId": "agent_run_123"
}
```

The IDE can then inspect:

```text
jetic_get_agent_run
```

Eventually:

```json
{
  "status": "completed",
  "summary": "1 behavioral regression detected"
}
```

This lets the IDE use Jetic's specialized intelligence without implementing the Jetic agent itself.

---

# 33. Simulation

Simulation is where Jetic runs behavior at scale.

```bash
jetic simulate
```

or:

```bash
jetic simulate user-registration
```

Conceptually:

```text
Workflow
    ↓
generate data
    ↓
create N actors
    ↓
execute behavior
    ↓
collect traces
    ↓
analyze results
```

For example:

```text
500 simulated users

User 1 → registration → verification → login
User 2 → registration → verification → login
...
User 500
```

This can use tools such as Faker.

---

# 34. Dynamic data

Tools and workflows allow:

```text
{{user.email}}
{{token}}
{{otp}}
{{project.id}}
{{random.uuid}}
```

Jetic maintains runtime memory:

```text
MEMORY
├── token
├── otp
├── user
├── project
└── invitation
```

This makes multi-step testing possible.

---

# 35. Conditions

Conditions are first-class workflow logic.

For example:

```yaml
condition:
  all:
    - field: response.status
      operator: equals
      value: 200

    - field: response.body.active
      operator: equals
      value: true
```

Supported logical operations can include:

```text
equals
not_equals
greater_than
less_than
exists
not_exists
is_empty
is_not_empty
contains
not_contains
starts_with
ends_with
```

With:

```text
AND
OR
```

groups.

---

# 36. Trace system

Every workflow/run should generate a trace.

Example:

```text
RUN abc123

POST /login
├── request
├── response 200
└── capture token

WAIT FOR EMAIL
├── mailbox checked
├── OTP found
└── capture otp

GENERATE TOTP
└── generated

GET /profile
├── Authorization: Bearer ...
└── response 200
```

Traces are critical to agents.

The security/investigator agent should be able to inspect them rather than simply guessing.

---

# 37. Activity system

Jetic maintains an activity stream:

```text
NEW ENDPOINT
POST /payments/refund

MODEL CHANGE
POST /login
+ twoFactorCode

ENDPOINT REMOVED
DELETE /projects/:id

SCHEMA CHANGE
User.email
string → optional string
```

This allows Jetic to determine:

```text
what changed
what is affected
what should run
```

---

# 38. `jetic activity`

Possible commands:

```bash
jetic activity
jetic activity list
jetic activity inspect <id>
jetic activity accept <id>
jetic activity ignore <id>
```

The dashboard can expose the same system.

---

# 39. `jetic test`

This is the simple entry point:

```bash
jetic test
```

It runs configured Jetic tests/workflows.

Example:

```text
JETIC TEST

Running 12 workflows...

✓ user-login
✓ registration
✓ create-project
✓ invite-user
✓ password-reset
✓ logout

✗ user-access-control

11 passed
1 failed
```

---

# 40. Behavioral regression

This is where Jetic becomes particularly useful.

Imagine a PR changes:

```text
src/middleware/auth.ts
```

Jetic understands:

```text
changed middleware
      ↓
affected endpoints
      ↓
affected workflows
```

Instead of blindly running everything:

```text
1,000 workflows
```

it might determine:

```text
12 workflows affected
```

and run those first.

---

# 41. `jetic run`

A general command can exist underneath the specialized commands.

```bash
jetic run <thing>
```

For example:

```bash
jetic run workflow user-login
jetic run agent regression
jetic run simulation checkout
```

This becomes the generic execution interface.

---

# 42. `jetic adapter`

Adapter management:

```bash
jetic adapter list
jetic adapter inspect express
jetic adapter install @acme/jetic-adapter-foo
jetic adapter test
```

Example:

```text
JETIC ADAPTERS

✓ express
✓ nextjs
✓ fastify
✓ nestjs
✓ hono

Community:
✓ @acme/jetic-adapter-foo
```

---

# 43. Custom adapters

A developer can write:

```text
@acme/jetic-adapter-company-framework
```

using:

```text
@jetic/scanner-sdk
```

It returns Jetic IR.

Local use:

```bash
npm install @acme/jetic-adapter-company-framework
```

Cloud execution is different: arbitrary adapter code should execute inside an isolated scanner worker, not on Jetic's main backend.

---

# 44. Adapter Test Mode

Eventually your web platform can let adapter authors test an adapter.

Flow:

```text
Connect GitHub repository
        ↓
Select adapter
        ↓
Select test project
        ↓
Run scanner
        ↓
Inspect:
  endpoints
  schemas
  middleware
  authentication
  warnings
  confidence
        ↓
Validate Jetic IR
```

This is useful for community adapters.

---

# 45. Security model for adapters

Local:

```text
developer machine
    ↓
adapter runs as normal Node process
```

Cloud:

```text
Jetic control plane
    ↓
scanner worker
    ↓
adapter
```

The scanner worker should have:

```text
temporary filesystem
CPU limit
memory limit
timeout
process limit
restricted/no network
no database credentials
no GitHub OAuth token
no application secrets
no cloud credentials
no Docker socket
```

After execution:

```text
worker destroyed
```

Only the result survives.

---

# 46. GitHub scanning

When the cloud platform receives a GitHub scan:

```text
GitHub repository
      ↓
specific commit
      ↓
temporary scanner worker
      ↓
repository snapshot
      ↓
adapter
      ↓
Jetic IR
      ↓
results
      ↓
worker destroyed
```

You don't need to permanently store the source repository merely to scan it.

The scan should be tied to:

```text
repository
branch
commit SHA
adapter version
Jetic version
```

so that the scan is reproducible.

---

# 47. `jetic doctor`

This should become one of the most useful commands.

```bash
jetic doctor
```

Checks:

```text
Node version
package manager
Jetic version
config validity
adapter installation
source paths
model validity
workflow validity
tool loading
environment
MCP
runtime ports
permissions
```

Example:

```text
JETIC DOCTOR

✓ Node.js 22
✓ jetic.config.json
✓ Express adapter
✓ Scanner SDK
✓ Model valid
✓ 8 workflows valid
✓ 6 tools loaded
✓ MCP ready
✓ Port 8877 available

No problems found.
```

---

# 48. `jetic config`

Useful commands:

```bash
jetic config
jetic config validate
jetic config get scanner.adapter
```

This makes debugging easier.

---

# 49. `jetic report`

Reports can be:

```bash
jetic report list
jetic report inspect <id>
jetic report open <id>
```

Eventually formats:

```text
JSON
HTML
Markdown
SARIF
```

SARIF would be particularly useful for GitHub security/code scanning integrations.

---

# 50. CI

Jetic should also work without the dashboard.

For example:

```bash
jetic scan
jetic test
```

in CI.

Or:

```bash
jetic test --ci
```

Output:

```text
JETIC CI

12 workflows
11 passed
1 failed

Behavioral regression detected.

Exit code: 1
```

That makes it usable in GitHub Actions, GitLab CI, etc.

---

# 51. GitHub PR flow

Eventually:

```text
Developer opens PR
       ↓
Jetic detects changed files
       ↓
scan diff
       ↓
identify affected model
       ↓
identify affected workflows
       ↓
run workflows
       ↓
investigate failures
       ↓
report
```

Example:

```text
JETIC REVIEW

✓ API model updated
✓ 12 affected workflows identified
✓ 12 workflows executed

11 passed
1 failed

Behavioral regression detected

GET /users/:id
User A accessed User B resource

Trace available
```

The initial implementation should prioritize **concrete behavioral evidence** rather than trying to make speculative AI security claims.

---

# 52. Local vs cloud

This is an important boundary.

## Local Jetic

```text
@jetic/cli
@jetic/runtime
scanner
adapters
workflows
tools
agents
MCP
dashboard
```

The user's machine owns everything.

## Jetic Cloud

```text
GitHub integration
team workspaces
persistent runs
PR checks
scheduled execution
collaboration
historical reports
cloud agent execution
organization management
```

The cloud should act primarily as a **control plane and orchestration platform**, while the CLI remains the local developer runtime.

---

# 53. Recommended package architecture

Your repository could eventually be:

```text
packages/
│
├── cli/
│
├── runtime/
│
├── scanner-core/
├── scanner-sdk/
├── ir/
│
├── workflow-engine/
├── workflow-sdk/
│
├── tool-runtime/
├── sdk/
│
├── agent-runtime/
├── agent-sdk/
│
├── mcp-server/
│
├── config/
├── model/
├── parser/
├── event-bus/
│
└── adapters/
    ├── express/
    ├── nextjs/
    ├── fastify/
    ├── nestjs/
    └── hono/
```

Conceptually:

```text
                    @jetic/cli
                        │
                    @jetic/runtime
                        │
       ┌────────────────┼────────────────┐
       ↓                ↓                ↓
    Scanner          Workflow          Agent
       │              Engine           Runtime
       ↓                │                │
    Adapter             │                │
       │                ↓                ↓
       └───────────── Jetic IR ──────────┘
                        │
                        ↓
                     MCP
                        │
                        ↓
                    AI IDE
```

---

# 54. The event bus

Internally, Jetic should be event-driven.

Events such as:

```text
project.scanned
model.updated
endpoint.added
endpoint.removed
workflow.changed
workflow.started
workflow.completed
workflow.failed
agent.started
agent.completed
simulation.completed
```

Example:

```text
model.updated
      ↓
Workflow Impact Agent
      ↓
workflows.affected
      ↓
Regression Agent
      ↓
run.completed
      ↓
Report Agent
```

This means agents don't have to be manually chained together everywhere.

---

# 55. Memory

Jetic can have runtime memory for values such as:

```text
token
otp
user ID
project ID
invitation ID
session ID
```

But distinguish:

```text
Workflow memory
Agent memory
Project state
Secrets
```

Secrets must not be mixed into ordinary logs or model context.

---

# 56. Environment

The same workflow can run against:

```text
local
staging
CI
```

through:

```text
.jetic/environments/
├── local.yaml
├── staging.yaml
└── ci.yaml
```

Usage:

```bash
jetic test --env local
jetic test --env staging
```

---

# 57. The project lifecycle

The intended developer workflow is approximately:

```text
npm install @jetic/cli
        ↓
jetic init
        ↓
jetic scan
        ↓
review model
        ↓
define workflows
        ↓
define tools
        ↓
jetic dev
        ↓
edit application
        ↓
Jetic detects changes
        ↓
model/activity updates
        ↓
run workflows
        ↓
agents investigate
        ↓
inspect reports
```

---

# 58. The AI development lifecycle

Eventually it becomes:

```text
Developer
   ↓
AI IDE
   ↓
write/change application code
   ↓
Jetic MCP
   ↓
Jetic understands change
   ↓
affected model/workflows
   ↓
Jetic agents
   ↓
behavioral execution
   ↓
traces
   ↓
evidence
   ↓
AI IDE
   ↓
developer
```

So Jetic becomes part of the **AI coding feedback loop**.

---

# 59. What Jetic is not

It helps to keep the product boundary clear.

Jetic is not primarily:

```text
Postman clone
Swagger UI clone
OpenAPI generator
AI chatbot
generic browser testing framework
LLM wrapper
load-testing-only tool
```

It is:

> **A code-aware system for modeling, executing, and reasoning about API behavior.**

---

# 60. The four central primitives

Everything in Jetic should revolve around four objects:

```text
MODEL
What exists.

WORKFLOW
What happens.

TOOL
What can be done.

AGENT
What can reason and decide.
```

Then:

```text
ADAPTER
How Jetic understands a framework.

RUNTIME
Where everything executes.

MCP
How external AI systems control Jetic.

IR
The canonical internal representation.
```

---

# 61. The simplest mental model for users

A developer should be able to understand Jetic as:

```text
jetic scan
```

> Understand my application.

```text
jetic dev
```

> Keep understanding it while I develop.

```text
jetic workflow run ...
```

> Perform this realistic application behavior.

```text
jetic test
```

> Validate the application's behavior.

```text
jetic agent run ...
```

> Investigate/reason about something.

```text
jetic simulate
```

> Run the behavior at scale.

```text
jetic mcp
```

> Let an AI coding environment control Jetic.

---

# 62. The full Jetic stack

The overall architecture becomes:

```text
                              AI IDE
                                │
                              MCP
                                │
                    ┌───────────▼───────────┐
                    │      JETIC MCP        │
                    └───────────┬───────────┘
                                │
                         JETIC RUNTIME
                                │
        ┌───────────────────────┼──────────────────────┐
        │                       │                      │
        ▼                       ▼                      ▼
     Scanner                Workflows               Agents
        │                       │                      │
     Adapter                  Tools                   LLM
        │                       │                      │
        └───────────────┬───────┴──────────────────────┘
                        │
                     Jetic IR
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
            Model              Knowledge
                                  Graph
              │                   │
              └─────────┬─────────┘
                        │
               Activity / Runs
                        │
                  Reports / Traces
```

And the **CLI is the front door**:

```text
jetic init
jetic scan
jetic dev
jetic model
jetic workflow
jetic test
jetic simulate
jetic agent
jetic adapter
jetic report
jetic mcp
jetic doctor
```

---

# 63. Recommended MVP

I would **not build every piece above before releasing**.

The first serious Jetic CLI should be:

```text
@jetic/cli
@jetic/runtime
@jetic/scanner-core
@jetic/scanner-sdk
@jetic/ir
@jetic/workflow-engine
@jetic/sdk
@jetic/mcp-server
```

with:

```text
Express adapter
Next.js adapter
Fastify adapter
```

and these commands:

```bash
jetic init
jetic scan
jetic dev
jetic model
jetic workflow list
jetic workflow run
jetic test
jetic agent run
jetic mcp
jetic doctor
```

The first agents should be:

```text
Model Watcher
Workflow Impact
Regression
```

Then:

```text
Security
Investigator
Scenario
Fix
PR
```

later.

That gives you a coherent product rather than a CLI that tries to be an entire autonomous software company on day one.

---

## Jetic in one architecture diagram

```text
                       ┌───────────────────────┐
                       │       AI IDE          │
                       │ Cursor / Claude Code  │
                       │ VS Code / etc.        │
                       └───────────┬───────────┘
                                   │
                                  MCP
                                   │
                       ┌───────────▼───────────┐
                       │     JETIC MCP         │
                       └───────────┬───────────┘
                                   │
                         ┌─────────▼─────────┐
                         │   JETIC RUNTIME   │
                         └─────────┬─────────┘
                                   │
       ┌───────────────────────────┼─────────────────────────┐
       │                           │                         │
       ▼                           ▼                         ▼
   SCANNER                    WORKFLOW ENGINE           AGENT RUNTIME
       │                           │                         │
       ▼                           ▼                         ▼
   ADAPTERS                      TOOLS                      LLM
       │                           │                         │
       └───────────────────────────┼─────────────────────────┘
                                   ▼
                                JETIC IR
                                   │
                       ┌───────────┴───────────┐
                       ▼                       ▼
                     MODEL                 KNOWLEDGE GRAPH
                       │                       │
                       └──────────┬────────────┘
                                  ▼
                       ACTIVITY / RUNS / TRACES
                                  │
                                  ▼
                            REPORTS / CI
```

The strongest part of this architecture is that **the same Jetic runtime serves the CLI, dashboard, MCP, CI, and eventually the cloud**. The CLI is not a thin wrapper around a web service; it is the local developer runtime, while MCP gives AI IDEs a semantic interface into that runtime. That makes the scanner SDK, adapter ecosystem, workflows, tools, and agents reusable across the entire Jetic platform.
