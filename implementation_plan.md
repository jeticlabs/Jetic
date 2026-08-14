# Deep Import Resolution & Enhanced Progress UI for Jetic Scanner

## Problem

The current AI analyzer in `@jetic/scanner` sends only a **tiny 10-line code snippet** from the route file to the AI — it never follows imports into controllers, services, middleware, or type files. This produces wildly inaccurate `model.json` output:

- `requestBody` lists route names (like "register", "login") instead of actual body fields (like `user_email`, `user_password`)
- `returnOutput` shows controller method names instead of actual response shapes (like `{ success, message, data: { user, accessToken, refreshToken } }`)
- `middleware` lists duplicate or phantom entries
- Endpoints bleed data from sibling endpoints in the same route file

The root cause: the AI only sees `router.post('/register', AuthController.register)` — it never sees what `AuthController.register` actually does (reads `req.body`, calls `AuthService.register`, returns `res.json(…)`), nor does it see the types (`RegisterRequest`) that define the body shape.

## Proposed Changes

### 1. New: Import Resolver Module

#### [NEW] [import-resolver.ts](file:///c:/Users/USER/Desktop/Jetic/packages/scanner/src/import-resolver.ts)

A new module that uses `ts-morph` to follow the import graph from a route file and collect all related source code. This provides the AI with the deep context it needs.

**Key capabilities:**
- Parse a route file's `import` statements to find controllers, services, middleware, and type files
- Recursively resolve imports up to a configurable depth (default: 2 levels deep)
- Read and bundle the source code of each resolved file
- Return a structured map of `{ filePath → fileContent }` for each route file
- Handle common patterns: relative imports, barrel exports (`index.ts`), alias paths
- Cap total bundled content to prevent token limit issues (~50KB max)

**Algorithm:**
```
1. Given a route file path, use ts-morph to get the SourceFile
2. Collect all ImportDeclarations from the source file
3. For each import:
   a. Resolve the module specifier to an absolute file path
   b. Read the resolved file's source code
   c. If depth < maxDepth, recursively resolve that file's imports too
4. Return Map<filePath, sourceCode> of all resolved files
```

---

### 2. Enhanced: AI Analyzer with Deep Context

#### [MODIFY] [ai-analyzer.ts](file:///c:/Users/USER/Desktop/Jetic/packages/scanner/src/ai-analyzer.ts)

Major refactor of the `analyzeHandler` method:

- **New method signature**: Accept `routeCode` + `contextFiles: Map<string, string>` instead of just a single `sourceCode` string
- **Build a rich prompt**: Concatenate the route handler code with the full source of imported controllers, services, middleware, and types — giving the AI the **complete picture** of what each endpoint does
- **Per-endpoint focus**: The prompt will instruct the AI to analyze **one specific endpoint** at a time (identified by method + path + handler name), preventing cross-contamination between endpoints
- **Better schema descriptions**: More precise zod schema descriptions to guide the AI toward extracting actual field names, types, and response shapes rather than route names

**Enhanced prompt structure:**
```
Analyze this SINGLE Express endpoint: POST /register → AuthController.register

=== Route File (auth.routes.ts) ===
<full route file>

=== Controller (auth.controller.ts) ===  
<full controller file>

=== Service (auth.service.ts) ===
<full service file>

=== Types (auth.types.ts) ===
<full types file>

=== Middleware (auth.middleware.ts) ===
<full middleware file>

Extract ONLY for POST /register:
- requestBody: actual fields from req.body/req.params/req.query (e.g., user_email: string)
- returnOutput: actual fields from res.json() response
- middleware: only middleware applied to THIS specific route
```

---

### 3. Enhanced: Express Scanner with Progress Reporting

#### [MODIFY] [express-scanner.ts](file:///c:/Users/USER/Desktop/Jetic/packages/scanner/src/express-scanner.ts)

Replace the basic spinner with a rich, real-time progress display:

**Progress phases:**
1. **Discovery phase**: `🔍 Scanning project structure...`
2. **Import resolution phase**: `📂 Resolving imports... [3 files found for auth.routes.ts]`
3. **AI analysis phase**: Per-endpoint progress bar with counter:
   ```
   🤖 Jetic AI analyzing endpoints...
   ━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░ 12/34 endpoints
   ├─ POST /register ✓
   ├─ POST /login ✓  
   ├─ GET /sessions ⏳ analyzing...
   ```
4. **Summary**: 
   ```
   ✅ Analysis complete!
   ├─ 34 endpoints discovered
   ├─ 127 request parameters extracted  
   ├─ 98 response fields mapped
   ├─ 15 middleware references resolved
   └─ 12 route files processed (47 related files resolved)
   ```

**Implementation:** 
- New `ProgressReporter` class with methods for each phase
- Uses ANSI escape codes for colors and cursor control
- Updates in-place (no scrolling spam)
- Also pass endpoint-level context (handler name, method, path) to the AI for per-endpoint analysis

---

### 4. Enhanced: Express Scanner Code Extraction

#### [MODIFY] [express-scanner.ts](file:///c:/Users/USER/Desktop/Jetic/packages/scanner/src/express-scanner.ts)

Replace the naive 10-line code extraction with the import resolver:

- Before the AI loop, resolve imports for each unique route file (deduplicated)
- Cache resolved files per route file to avoid re-resolving
- Pass full route file + context files to the AI analyzer
- Also pass the specific handler name (e.g., `AuthController.register`) so the AI focuses on the right endpoint

---

### 5. Enhanced: Route Discovery with Handler Info

#### [MODIFY] [route-discovery.ts](file:///c:/Users/USER/Desktop/Jetic/packages/scanner/src/route-discovery.ts)

Add handler extraction to `RawDiscovery`:

- Extract the handler function/reference name from the route call (e.g., `AuthController.register`)
- Extract inline middleware names from the route call arguments
- Store these on the `RawDiscovery` so the normalizer and scanner can use them

**New fields on `RawDiscovery`:**
```typescript
handlerName?: string;      // e.g., "AuthController.register"
middlewareNames?: string[]; // e.g., ["authenticateToken"]
```

---

### 6. Enhanced: Normalizer with Handler Info

#### [MODIFY] [normalizer.ts](file:///c:/Users/USER/Desktop/Jetic/packages/scanner/src/normalizer.ts)

Pass through the new handler and middleware info from `RawDiscovery` to the `Endpoint` model.

---

### 7. Updated: Model Schema

#### [MODIFY] [schema.ts](file:///c:/Users/USER/Desktop/Jetic/packages/model/src/schema.ts)

Add optional `handlerName` field to `Endpoint` so the scanner can track which handler function is associated with each endpoint.

---

### 8. Updated: Scanner Index Exports

#### [MODIFY] [index.ts](file:///c:/Users/USER/Desktop/Jetic/packages/scanner/src/index.ts)

Export the new `import-resolver` module.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/scanner/src/import-resolver.ts` | **NEW** | Deep import resolution using ts-morph |
| `packages/scanner/src/ai-analyzer.ts` | **MODIFY** | Rich context prompt with deep file resolution |
| `packages/scanner/src/express-scanner.ts` | **MODIFY** | Progress UI + import resolution integration |
| `packages/scanner/src/route-discovery.ts` | **MODIFY** | Extract handler names and middleware from routes |
| `packages/scanner/src/normalizer.ts` | **MODIFY** | Pass handler/middleware info through |
| `packages/model/src/schema.ts` | **MODIFY** | Add `handlerName` to `Endpoint` |
| `packages/scanner/src/index.ts` | **MODIFY** | Export new module |

## Expected `model.json` Output (for `POST /register`)

```json
{
  "method": "POST",
  "path": "/register",
  "handlerName": "AuthController.register",
  "source": { "file": "auth.routes.ts", "line": 7 },
  "requestBody": [
    { "name": "user_name", "in": "body", "type": "string", "required": true },
    { "name": "user_email", "in": "body", "type": "string", "required": true },
    { "name": "user_password", "in": "body", "type": "string", "required": true },
    { "name": "inviteToken", "in": "body", "type": "string", "required": true }
  ],
  "returnOutput": [
    { "name": "success", "type": "boolean" },
    { "name": "message", "type": "string" },
    { "name": "data.user", "type": "UserResponse" },
    { "name": "data.accessToken", "type": "string" },
    { "name": "data.refreshToken", "type": "string" }
  ],
  "middleware": []
}
```

> [!IMPORTANT]
> Compare this with the current broken output where `requestBody` lists route names like "register", "completeRegistration", "login" and `returnOutput` shows "AuthController.register" as a type.

## Verification Plan

### Build Check
```bash
cd packages/scanner && pnpm build
cd packages/model && pnpm build
```

### Integration Test
```bash
cd examples/Backend && npx jetic scan
```
- Verify `model.json` shows actual request body fields (e.g., `user_email`, `user_password`) not route names
- Verify return outputs show actual response shapes, not controller method references
- Verify middleware is correctly scoped per-endpoint (no duplicates/bleeding)
- Verify the progress UI displays correctly during scan
