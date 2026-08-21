C:\Users\USER\Desktop\Jetic\examples\Backend>node ../../apps/cli/dist/index.js simulate workflow --workflow .jetic/workflow.json

   Jetic Workflow
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Model: Backend • 72 endpoints

  ✓ Loaded workflow: Admin creates workspace, invites a teacher, creates exam, classes, subject and logs out  (C:\Users\USER\Desktop\Jetic\examples\Backend\.jetic\workflow.json)

  🌍 Environment: local  http://localhost:4000


   Jetic Workflow Runner
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Admin creates workspace, invites a teacher, creates exam, classes, subject and logs out

  7 steps
  ┌─ POST /api/workspaces/setup  Admin creates a workspace
  ├─ POST /api/auth/login  Admin Logs in
  ├─ POST /api/invites  Admin invites a teacher to the workspace
  ├─ POST /api/exams  Admin creates an exam
  ├─ POST /api/classes  Admin creates a class
  ├─ POST /api/subjects  Admin creates a subject
  └─ POST /api/auth/logout  Admin logs out

  🚀 Executing workflow steps...

  ✓ 1/7  POST /api/workspaces/setup  201  9581ms
  ✓ Step 1/7  POST   /api/workspaces/setup  201  9581ms
  │   Admin creates a workspace

  ✓ 2/7  POST /api/auth/login  200  8503ms
  ✓ Step 2/7  POST   /api/auth/login  200  8503ms
  │   Admin Logs in
  │   💾 captured workflow:accessToken ← data.accessToken
  │   💾 captured workflow:refreshToken ← data.refreshToken

  ✗ 3/7  POST /api/invites  401  11ms
  ✗ Step 3/7  POST   /api/invites  401  11ms
  │   Admin invites a teacher to the workspace
  │   Response: {"success":false,"message":"Access token required"}

  ✗ 4/7  POST /api/exams  401  11ms
  ✗ Step 4/7  POST   /api/exams  401  11ms
  │   Admin creates an exam
  │   Response: {"success":false,"message":"Access token required"}

  ✗ 5/7  POST /api/classes  401  9ms
  ✗ Step 5/7  POST   /api/classes  401  9ms
  │   Admin creates a class
  │   Response: {"success":false,"message":"Access token required"}

  ✗ 6/7  POST /api/subjects  401  6ms
  ✗ Step 6/7  POST   /api/subjects  401  6ms
  │   Admin creates a subject
  │   Response: {"success":false,"message":"Access token required"}

  ✗ 7/7  POST /api/auth/logout  401  6ms
  ✗ Step 7/7  POST   /api/auth/logout  401  6ms
  │   Admin logs out
  │   Response: {"success":false,"message":"Access token required"}

  ⚠ Auth step failed — stopping workflow to prevent cascading failures.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ Workflow Failed  18.23s

  2 passed  │  5 failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  💾 Jetic Memory  (captured during run)
    workflow:accessToken = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmOTk3...
    workflow:refreshToken = 7c15867418ea112bad4f06dd97324e2b5c3ca983b9e3e6f88ce2b12b3...


C:\Users\USER\Desktop\Jetic\examples\Backend>