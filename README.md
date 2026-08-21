![alt text](image.png)

# Jetic

**AI-Native API Behavior Testing**

Jetic is a programmable developer platform that automatically understands, models, and tests an application's API behavior directly from its source code. Instead of requiring developers to manually write API tests or configure endpoints, Jetic statically analyzes the codebase, discovers the API structure and constraints, builds a live behavioral graph, and (eventually) uses that graph to automatically generate and execute test suites.

## Features (v0.1.0 MVP)

- **Source Code Discovery**: Uses `ts-morph` to deeply inspect TypeScript/Node.js/Express projects without running them.
- **Nested Router Resolution**: Correctly resolves deep router prefixes (e.g. mapping `app.use('/api/orders', ordersRouter)` to `router.get('/:id')`).
- **Behavioral Modeling**: Outputs a versioned `.jetic/model.json` schema that maps discovered HTTP methods, paths, and exact source provenance (file and line number) for every endpoint.
- **CLI Utilities**: A fast, thin command-line interface that brings API intelligence directly to your terminal.

## Architecture & Monorepo Structure

Jetic is organized as a `pnpm` monorepo using TypeScript, divided into the following packages:

- **`apps/cli`**: The main `jetic` Commander executable.
- **`packages/core`**: Core configuration, error handling, and filesystem abstractions.
- **`packages/model`**: The strongly-typed `BehavioralModel` schema.
- **`packages/scanner`**: The static analysis engine (`ExpressScanner`, AST path resolution, normalizer).
- **`examples/express-shop`**: An intentionally complex Express application fixture for automated testing.

## Getting Started

### Installation & Build

```bash
# Clone the repository
# Make sure you have pnpm installed (npm install -g pnpm)

pnpm install
pnpm build
```

### Running the Example

The fastest way to understand Jetic is to run it against the included `express-shop` example.

```bash
cd examples/express-shop

# Set Apikey for openrounter

SET OPENROUTER_API_KEY="API_KEY"

# Initialize the Jetic configuration
node ../../apps/cli/dist/index.js init

# Scan the project and build the Behavioral Model
node ../../apps/cli/dist/index.js scan

# Inspect the discovered endpoints
node ../../apps/cli/dist/index.js inspect

# Inspect a specific endpoint in detail to see source provenance
node ../../apps/cli/dist/index.js inspect endpoint GET /api/orders/:id

# Simulate all endpoints against the live server (ensure the server is running)
node ../../apps/cli/dist/index.js simulate endpoint --all

# Simulate a specific endpoint with verbose output
node ../../apps/cli/dist/index.js simulate endpoint GET /api/orders/:id --verbose

# Generate + execute (uses AI)
node ../../apps/cli/dist/index.js simulate workflow
# Custom goal
node ../../apps/cli/dist/index.js simulate workflow --goal "Admin creates exam, student enrolls, completes, gets results"
# Use specific environment
node ../../apps/cli/dist/index.js simulate workflow --env staging
# Only generate the workflow.json, don't execute
node ../../apps/cli/dist/index.js simulate workflow --generate-only
# Use an existing workflow.json (skip AI generation)
node ../../apps/cli/dist/index.js simulate workflow --workflow .jetic/workflow.json
# Clear memory before run
node ../../apps/cli/dist/index.js simulate workflow --clear-memory


```




## How It Works

1. **AST Extraction**: When you run `jetic scan`, the `ExpressScanner` uses the project's `tsconfig.json` to parse the Abstract Syntax Tree (AST) of your backend.
2. **Path Resolution**: It detects `app.use` middleware and standalone `Router` definitions, seamlessly connecting prefix strings to actual route handlers.
3. **Normalization**: The raw routing data is flattened and verified.
4. **Behavioral Model**: The data is exported into a versioned JSON format (`.jetic/model.json`) that can be consumed by other tools (like the upcoming test generator).

## Next Steps / Roadmap

- **`jetic test`**: Use the populated Behavioral Model to synthesize smart requests, automatically evaluating boundary values, authorization errors, and missing parameters.
- **Constraint Discovery**: Extract logic conditions (`quantity > 0`, role assertions) directly from if-statements in the handler code.
- **Workflow Inference**: Automatically determine the relationship between operations (e.g. recognizing that `POST /orders` depends on the JWT from `POST /login`).

## License

ISC
