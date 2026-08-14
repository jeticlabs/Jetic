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

# Initialize the Jetic configuration
node ../../apps/cli/dist/index.js init

# Scan the project and build the Behavioral Model
node ../../apps/cli/dist/index.js scan

# Inspect the discovered endpoints
node ../../apps/cli/dist/index.js inspect

# Inspect a specific endpoint in detail to see source provenance
node ../../apps/cli/dist/index.js inspect endpoint GET /api/orders/:id
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
