What "run without error + live, expandable, curl-like view" actually requires
1. Decouple run lifetime from the MCP call (the root cause of everything we hit). simulate currently blocks and returns one giant blob; a real suite takes ~11 min, so it always trips the transport timeout, and the caller gets nothing. It must return { runId } immediately and run as a job. This alone fixes "runs without error."

2. A read API for progress — jetic_get_run(runId). Returns incremental state: steps: [{ index, name, status, passed, startedAt, durationMs }]. The agent polls; the TUI subscribes. MCP progress notifications are nice but client support is spotty, so poll-able state is the reliable primitive.

3. Per-step payload persisted at completion — and it's ~80% there already. The trace_*.json we found already stores injected, requestBody, captured, status, durationMs. To reach "like curl" it just needs the missing half:

resolvedUrl, requestHeaders (incl. the actual Bearer), requestBody,
responseStatus, responseHeaders, responseBody (truncated), timing
Then each step renders exactly like curl -v:

> POST /api/auth/login  (http://localhost:4000)
> content-type: application/json
> { "user_email": "…" }
< 200 OK  (356 ms)
< { "data": { "accessToken": "…" } }
  captured workflow:accessToken = data.accessToken
4. Fix the two mechanics that make the output misleading (both confirmed still broken):

Preflight the baseUrl → distinct "ECONNREFUSED / DB down" diagnostic instead of 79 bogus fetch failed.
Deep-resolve templates (arrays/objects), so the view shows the real payload, not literal {{workflow:reference}}.
Feasibility / effort
runId + job + get_run: small, high impact. This is mostly refactoring the existing simulator loop.
Full per-step request/response capture: small — the trace schema just needs response headers/body added.
TUI/HTML live view with expandable steps: medium; a tree/accordion over the trace. The .jetic/traces/ file is already a near-perfect data source for an HTML report you could also open after the run.
HTTP/SSE live stream: optional polish; polling gets you 90%.
My verdict
"Run without error": yes, achievable now — it's 90% a job-model/timeout fix, not a hard technical problem.
"I (the agent) can see each step as it runs": yes — via runId + get_run polling; today I'm reduced to watching memory.json mtimes, which is absurd.
"User expands each step like curl": yes — the trace already holds request side; add response side and render it. This is the feature that would make the tool feel trustworthy instead of a black box that returns a 50 KB blob that gets truncated.
