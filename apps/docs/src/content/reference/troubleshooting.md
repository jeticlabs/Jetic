# Troubleshooting & FAQ ❓

Common pitfalls with exact error strings and fixes.

---

## 🖥️ Dashboard Shows Stale UI After `jetic dev`

**Symptom:** Human dialog never appears / `human_input_required` event not firing.

**Cause:** You ran `pnpm --filter @jetic/dashboard run build` but `jetic dev` serves `apps/cli/dist/dashboard` (a copy). Until `pnpm --filter jetic-cli run build` copies it, UI is stale. Or you're running global `jetic` (published 0.1.x, no human feature).

**Fix:**
```bash
Get-Process node | Stop-Process -Force   # kill stale dev
cd your-backend
node C:\path\to\jetic\apps\cli\dist\index.js dev --port 8787
# Hard-refresh: Ctrl+Shift+R  — check orange `human` badge on step
```

Log will now show `↳ human {{human:otp}} ← saved human memory (ready)` vs `◉ will ask for {{human:otp}} when reached`.

---

## 🔍 `jetic_scan` Finds 0 Endpoints

Check: `express` in `package.json` + `tsconfig.json` exists + routes under `src/` with `app.use` / `router.METHOD`.

---

## 🤖 AI Workflow Generation Fails

Missing `config.ai` — run `jetic config ai` or use MCP path (no key needed).

---

## 🔄 Changes.json Never Clears

After `jetic_get_changes` patch, call `jetic_clear_changes` — or `Clear Changes` button in `/changes`.

---

## 📦 Global Install vs Workspace Dev

| Command | Serves |
|---|---|
| `jetic dev` (global) | Published dashboard (may be old) |
| `node apps/cli/dist/index.js dev` (workspace) | Fresh build |

---

## 🖼️ Troubleshooting Flowchart Placeholder

![Troubleshooting flowchart — stale UI → human dialog → backend hang decision tree](/screenshots/step2.PNG)
*Click image to enlarge — Decision tree for the 4 common failure modes.*
