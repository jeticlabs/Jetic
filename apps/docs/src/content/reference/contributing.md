# Contributing & Development 🤝

How to extend Jetic — monorepo workflow, conventions, and release.

---

## 🛠️ Local Setup

```bash
git clone https://github.com/jeticlabs/Jetic.git
cd Jetic
pnpm install
pnpm -r run build
# Link CLI globally from workspace
cd apps/cli && pnpm link --global
```

---

## 📐 Conventions

- **Packages:** `@jetic/*` — `workspace:*` deps, `tsc` build to `dist/`
- **Apps:** `jetic-cli` (tsup single bundle), `@jetic/dashboard` (vite), `docs` (vite)
- **Styling:** Tailwind `4.1.12`, dark `bg-[#090b11]`, `zinc-800/80`, `amber-500/10`, icons `lucide-react` `strokeWidth={2}`
- **Commits:** Conventional? Use `feat:`, `fix:` — runs `oxlint` + `oxfmt`
- **Tests:** `pnpm -r run test` — `jest` in `scanner`

---

## 🚀 Release

```bash
pnpm --filter @jetic/dashboard run build
pnpm --filter jetic-cli run build   # copies dashboard
npm pack --dry-run   # check 13 files
npm publish           # from apps/cli
```

---

## 🖼️ Contribution Flow Placeholder

![Contribution flow — fork → branch → pnpm -r build → PR → publish](/screenshots/jetic_dot.png)
*Click image to enlarge — Contributor diagram.*

> See `CONTRIBUTING.md` (root) and `README.md#contributing` for full guide.
