Yes — starting with the CLI is actually the right move for this product.

The CLI should be the open-source execution/discovery engine, while the desktop and cloud products later become interfaces around the same engine.

Your architecture can look like this:

                         YOUR ECOSYSTEM


              ┌─────────────────────────────┐
              │       Jetic CLI          │
              │          OPEN SOURCE        │
              ├─────────────────────────────┤
              │ Project Scanner             │
              │ API Discovery               │
              │ Behavioral Model             │
              │ Constraint Extraction       │
              │ Test Generation             │
              │ Test Runtime                │
              │ Results / Reports            │
              └──────────────┬──────────────┘
                             │
                ┌────────────┼─────────────┐
                │            │             │
                ▼            ▼             ▼
             Desktop       Cloud        CI/CD
             App           Platform

The important architectural decision is:

Do not build the desktop app first.

Build the engine that makes the desktop app interesting.

What the CLI should feel like

A developer installs it:

npm install -g @yourorg/cli

Then enters a backend project:

cd my-api

and:

Jetic init

Your CLI analyzes the project and creates something like:

.Jetic/
├── config.ts
├── model.json
├── tests/
└── cache/

Then:

Jetic scan

Output:

Jetic API Intelligence


Scanning project...


✓ Detected framework: Express
✓ Detected language: TypeScript
✓ Detected database: PostgreSQL
✓ Detected ORM: Prisma
✓ Detected authentication: JWT


Discovering API...


✓ 47 endpoints
✓ 12 resources
✓ 76 constraints
✓ 19 dependencies
✓ 8 state transitions
✓ 6 workflows


Behavioral model generated.


Run:
  Jetic test

That already feels very different from Postman.

Then Jetic test
Jetic test

The CLI could produce:

Jetic TEST RUN


Analyzing behavioral model...


Generated:
  Endpoint tests       218
  Workflow tests        64
  Authorization tests   31
  Boundary tests        97


────────────────────────────────────────


Running 410 tests...


✓ POST /auth/register
✓ POST /auth/login
✓ GET /users/me
✓ POST /orders
✓ GET /orders/:id
✗ DELETE /orders/:id


────────────────────────────────────────


409 passed
1 failed


FAILURE


DELETE /orders/:id


Scenario:
Authenticated user deleting another user's order


Expected:
403


Received:
200


Behavior:
Possible authorization vulnerability


Source:
src/controllers/orders.ts:87

That last part is important.

The tool isn't simply:

test failed

It says:

here is the behavior we inferred, here is what happened, and here is where it comes from.

The CLI commands I'd start with

Don't create 30 commands.

Start with maybe these:

Jetic init
Jetic scan
Jetic test
Jetic test <endpoint>
Jetic graph
Jetic report

Eventually:

Jetic watch
Jetic diff
Jetic ci
Jetic plugin
init

Creates project configuration.

Jetic init
scan

Builds/rebuilds the behavioral model.

Jetic scan
test

Runs generated tests.

Jetic test

Specific endpoint:

Jetic test POST /api/orders
graph

This one could be really cool.

Jetic graph

CLI output:

REGISTER
   │
   ▼
LOGIN
   │
   ▼
JWT
   │
   ├───────────────┐
   ▼               ▼
PROFILE          ORDERS
                   │
                   ▼
                ORDER/:ID
                   │
                   ▼
                PAYMENT

Later the desktop app renders the same graph visually.

report
Jetic report

Could generate:

.Jetic/reports/latest.html

That gives developers a beautiful HTML report without needing your cloud platform.

But here's the key: the CLI shouldn't be one giant package

I'd create a monorepo.

Something like:

Jetic/
│
├── packages/
│   │
│   ├── cli/
│   ├── core/
│   ├── scanner/
│   ├── discovery/
│   ├── behavioral-model/
│   ├── constraint-engine/
│   ├── test-planner/
│   ├── test-runtime/
│   ├── data-generator/
│   ├── reporter/
│   ├── plugin-sdk/
│   └── plugins/
│
├── examples/
│
├── docs/
│
├── .github/
│
├── package.json
└── pnpm-workspace.yaml

But there is an important nuance:

I would not necessarily create all of these repositories separately.

At the beginning, I would use one monorepo for the open-source engine.

The repositories I would have

You asked specifically what other repos you should have.

I would start with 4 repositories, not 15.

1. Jetic

This is the main open-source monorepo.

github.com/yourorg/Jetic

Contains:

apps/
  cli/


packages/
  core/
  scanner/
  discovery/
  model/
  planner/
  runtime/
  generator/
  reporter/
  plugin-sdk/

This is where nearly all early development happens.

2. Jetic-examples

This becomes extremely valuable.

github.com/yourorg/Jetic-examples

Put intentionally broken and realistic APIs here:

examples/
├── express-shop/
├── express-auth/
├── nest-orders/
├── fastify-payments/
├── prisma-api/
└── vulnerable-api/

Each example becomes a test target.

For example:

express-shop

contains:

POST /register
POST /login
GET /products
POST /cart
POST /orders
GET /orders/:id
DELETE /orders/:id

Your CI runs your own CLI against these projects.

This is extremely important because your product is a behavior-understanding engine. You need a permanent corpus of real APIs to test against.

3. Jetic-plugins

Later, when the plugin system stabilizes:

github.com/yourorg/Jetic-plugins

For official plugins:

plugins/
├── express/
├── fastify/
├── nestjs/
├── prisma/
├── graphql/
├── security/
├── fuzzing/
└── ai-agent/

But you don't need to split this out immediately.

During MVP, keep plugins in the monorepo.

Extract them when the SDK becomes stable.

4. Jetic-cloud

This should be private.

github.com/yourorg/Jetic-cloud

Later it contains:

GitHub integration
organization accounts
projects
dashboards
webhooks
scheduled runs
CI integrations
cloud execution
team collaboration

The open-source CLI can eventually authenticate to it:

Jetic login

then:

Jetic cloud connect

And:

Jetic watch

can synchronize results.

What about the desktop app?

Don't make it a separate repo immediately either.

Eventually:

Jetic-desktop

could be:

Electron/Tauri
       │
       ▼
Jetic-core

The desktop app shouldn't contain a second implementation of your intelligence.

That's a critical rule.

You don't want:

CLI → scanner A


Desktop → scanner B


Cloud → scanner C

You want:

              Core Engine
             /     |      \
           CLI  Desktop   Cloud

The CLI is the first client.

How the CLI actually works internally

This is where I'd be careful.

You don't want an architecture where every operation asks an LLM:

"Hey AI, inspect this folder."
"Hey AI, find endpoints."
"Hey AI, generate tests."
"Hey AI, determine if it passed."

That will be slow, expensive, and unpredictable.

Instead:

SOURCE
  │
  ▼
AST / Static Analysis
  │
  ▼
Deterministic Discovery
  │
  ▼
Behavioral Model
  │
  ├── endpoints
  ├── schemas
  ├── constraints
  ├── auth
  ├── dependencies
  ├── state
  └── workflows
          │
          ▼
      AI Reasoning
          │
          ▼
      Test Planner
          │
          ▼
      Runtime
          │
          ▼
       Results

AI should be one component of the engine, not the engine itself.

Example of what happens during scan

Developer runs:

Jetic scan

Your scanner sees:

router.post("/orders", auth, createOrder);

It finds:

POST /orders

Then follows createOrder:

if (quantity <= 0) {
   return res.status(400).json(...)
}

Your system derives:

quantity
  required
  number
  minimum = 1

Then it sees:

if (!user)

and the middleware:

auth

and derives:

authentication required

Then:

const product = await prisma.product.findUnique(...)

and derives a dependency:

product must exist

Now your behavioral model might contain:

{
  "endpoint": "POST /orders",
  "auth": "jwt",
  "constraints": [
    {
      "field": "quantity",
      "operator": ">=",
      "value": 1
    }
  ],
  "dependencies": [
    "authenticatedUser",
    "product"
  ]
}

The LLM can then reason over this model.

That separation is very important.

The .Jetic directory is also important

I'd give every project a local state directory:

.Jetic/
├── config.json
├── model.json
├── snapshots/
├── generated/
├── runs/
├── cache/
└── plugins/

But don't commit everything.

Probably:

.Jetic/
├── config.json
└── plugins/

in Git, while:

model
cache
runs
generated artifacts

can be ignored unless explicitly desired.

Your project could have:

.Jetic/cache
.Jetic/runs
Then the really powerful command: Jetic watch

Once the basic CLI works:

Jetic watch

It runs in development.

Developer changes:

src/orders.ts

Your system notices:

File changed


Analyzing impact...


Affected:
POST /orders
GET /orders/:id
DELETE /orders/:id


Updating behavioral model...


Running 37 affected tests...

Then:

✓ 34 passed
✗ 3 failed


Potential regression:


DELETE /orders/:id
Expected: 403
Received: 200

Now your product begins to feel autonomous.

Then Git becomes incredibly powerful

Later:

Jetic diff

could compare:

HEAD

against:

HEAD~1

and say:

Behavioral Changes Detected


POST /orders
  quantity constraint changed:
  >= 1 → >= 0


POST /payments
  new authorization dependency


GET /users/:id
  response field removed:
  email

Then:

Jetic test --changed

runs only affected tests.

That becomes very valuable in CI:

- run: npx Jetic scan
- run: npx Jetic test --changed
Your GitHub organization could therefore eventually look like
github.com/yourorg/


├── Jetic
│   └── Open-source CLI + core
│
├── Jetic-examples
│   └── Test applications
│
├── Jetic-plugins
│   └── Official plugins
│
├── Jetic-docs
│   └── Documentation
│
└── Jetic-cloud
    └── Private SaaS

But today, I'd only create:

Jetic
Jetic-examples

and maybe:

Jetic-docs

if you want the docs separated from the code.

Don't create plugins, desktop, and cloud repos prematurely. You'll spend time managing repositories instead of building the engine.

One thing I'd make open source very deliberately

The following should be open source:

CLI
scanner
API discovery
behavioral model
test planner
test runtime
plugin SDK
basic reporters
official framework plugins

That makes developers trust it with their code.

Your eventual paid layer becomes:

Cloud dashboard
GitHub/GitLab integration
team management
centralized runs
history
analytics
scheduled testing
CI orchestration
cloud execution
AI usage infrastructure
enterprise controls

So the business model becomes:

                  OPEN SOURCE
                      │
                      ▼
             Developers install CLI
                      │
                      ▼
              Developers love it
                      │
                      ▼
              Connect to Cloud
                      │
                      ▼
                TEAM PRODUCT

That's a much healthier developer-tool strategy than locking the actual testing engine behind your SaaS.

And honestly, this also gives you a very good first GitHub README story:

# Jetic


AI-native behavioral testing for APIs.


Point Jetic at your backend.


Jetic discovers your API,
understands its constraints and dependencies,
generates behavioral tests,
and runs them automatically.


No manual test collections.
No manually maintained API workflows.



That communicates the product immediately.

The next thing I'd work out is the actual CLI MVP architecture — package-by-package, command-by-command, and the exact first Jetic scan pipeline so you know what to code first rather than starting with an oversized monorepo.