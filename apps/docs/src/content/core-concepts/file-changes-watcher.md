# File Changes Watcher (`changes.json`) 🔄

Jetic features a zero-dependency, lightweight source file change observer that runs continuously when `jetic dev` is active.

---

## 📄 Artifact Format (`.jetic/changes.json`)

```json
{
  "version": 1,
  "watchedSince": "2026-09-18T10:00:00.000Z",
  "projectRoot": "C:/projects/my-express-api",
  "changes": [
    {
      "filePath": "src/routes/user.routes.ts",
      "absolutePath": "C:/projects/my-express-api/src/routes/user.routes.ts",
      "changedAt": "2026-09-18T14:20:00.000Z",
      "eventType": "change"
    }
  ]
}
```

---

## ⚡ How It Works

1. **Zero Git Overhead**: Operates directly on filesystem file modification events without relying on Git commits or status.
2. **Real-time SSE Stream**: `jetic dev` exposes a Server-Sent Events endpoint (`/api/changes/stream`) that instantly pushes file updates to Jetic Studio UI (`/changes`) without manual browser reloads.
3. **Delta AI Re-Indexing**: Exposes `jetic_get_changes` and `jetic_clear_changes` tools to AI IDEs via `jetic mcp`. When code is edited, the AI agent reads only modified file paths from `.jetic/changes.json` and updates `.jetic/model.json` incrementally instead of re-reading the entire codebase!
