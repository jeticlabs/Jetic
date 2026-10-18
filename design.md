# Jetic Design System

> **Who this is for:** any contributor — human or AI agent — who needs to style
> a page or component without breaking visual consistency.
>
> **Single rule:** if a color, radius, height, or font already exists in
> `src/app/globals.css` (or in a documented marketing component), use it. Do
> not invent a new one.
>
> **Source of truth:** `src/app/globals.css` owns the *product* theme. The
> *marketing landing* theme is owned by the components in
> `src/components/marketing-ui/`. When the two disagree, this file documents
> which one wins where — see §2.

---

## 0. TL;DR cheat sheet

| I want to… | Do this |
|---|---|
| Style a product/auth page root | `<main className="jetic-surface …">` (§6.1) |
| Secondary text | `jetic-muted` (§6.2) |
| A text input | `jetic-input` (+ `font-mono` / `pl-9`) (§6.4) |
| A primary button | `jetic-btn` (§6.5) |
| A white/inverse button | `jetic-btn-light` (§6.6) |
| A bordered container | `jetic-card` (+ `bg-[#1a1a1a]` for wells) (§6.3) |
| A badge / selected pill | `jetic-pill` + `jetic-pill-pro`/`-hobby` (§6.7) |
| A dropdown | `jetic-select` + `jetic-menu` + `jetic-menu-item` (§6.8) |
| A hairline that fills its row | `jetic-divider` (§6.2) |
| Style the **marketing landing** | Use the palette in §7 — *not* `jetic-*` |
| Style a **marketing subpage / docs** | Use the zinc placeholder style in §8 |
| Reach the brand mark | `JeticIcon` (static) or `JeticAnimatedIcon` (animated) (§10) |

---

## 1. The three visual worlds

The codebase is **not** a single theme with a light/dark flip. There are three
distinct visual languages, each with its own palette and its own "owner" file:

| World | Owner | Used by | Look |
|---|---|---|---|
| **1. Product / Auth** (dark-only) | `globals.css` `:root --jetic-*` + `@layer components` `.jetic-*` | `(auth)`, `(product)` — sign-in, sign-up, onboarding, workspace, sandbox, chat, toolbar | `#111111` surfaces, Inter, `border-white/10`, `rounded-xl`, built-in focus/disabled states |
| **2. Marketing landing** (dark-only, bespoke) | `src/components/marketing-ui/*` (+ `(marketing)/page.tsx`) | the `/` landing page | `#0a0a0a`/`black` backgrounds, **Instrument Serif** display + **Inter** body + **JetBrains Mono** captions, an accent palette (blue/violet/green/amber), hand-tuned px |
| **3. Placeholder / utility** (light + dark via `dark:`) | inline Tailwind utilities, zinc palette | marketing subpages (`features`, `pricing`, `contact`, `how-it-works`, `changelog`, `legal/*`), `docs`, `feedback/*`, `ui/*` primitives | `text-zinc-600 dark:text-zinc-400`, `border-black/[.08] dark:border-white/[.08]`, `rounded-2xl` |

**Why three?** World 1 and World 2 are both "dark" but are *not* interchangeable.
World 1 is a strict, closed token system (do not add colors). World 2 is a
hand-crafted marketing surface with a richer, one-off palette. World 3 is the
scaffold that ships with the starter and is still used by unimplemented
placeholder routes.

> **Do not cross the streams.** `jetic-*` classes assume `#111` behind them and
> must not appear inside the marketing landing. World 3 zinc utilities must not
> leak into World 1 pages (it will render dark text on `#111` in light mode —
> see §12.6).

---

## 2. File anatomy of `globals.css`

```
@import "tailwindcss";              ← Tailwind v4. Everything builds on it.
:root { --background / --foreground }   ← World-3 base (light default)
@theme inline { … }                 ← maps Tailwind tokens (font-sans, font-mono) to CSS vars
@theme { --container-8xl: 88rem }   ← declares one brand-new token
@media (prefers-color-scheme: dark) ← flips --background/--foreground ONLY
body { … }                          ← World-3 defaults (NOT product, NOT landing)
:root { --jetic-* }                 ← World-1 product tokens
@layer components { .jetic-* }      ← World-1 component classes
```

Only the first and last blocks matter for the product theme. The middle blocks
(`:root --background`, `@theme`, `prefers-color-scheme`, `body`) exist for
World 3 (placeholder pages that don't opt into any theme).

> **Note:** `--container-8xl` (§2.1) is declared but currently **unused** —
> `max-w-8xl` appears nowhere. The marketing shell uses `max-w-7xl` and the
> landing uses fixed `max-w-[1248px]` instead. See §12.

### 2.1 Tailwind v4 concepts you must know

- **`@theme inline`** — declares tokens whose values reference *other*
  variables (e.g. `--font-sans: var(--font-walsheim)`). `inline` resolves at
  usage time instead of baking a value.
- **`@theme`** (plain) — declares a brand-new token. We add exactly one:
  `--container-8xl: 88rem` (Tailwind ships up to `7xl`).
- **`@layer components`** — all `.jetic-*` classes live here. **Cascade layers
  mean Tailwind utilities always beat component classes.** So this works:

  ```tsx
  // jetic-btn sets height:45px / width:100% / font-size:15px …
  // … but utilities win, so this renders a 34px-wide-auto button:
  <a className="jetic-btn flex h-[34px] w-auto items-center rounded-[10px] px-[14px] text-[13.5px]">
  ```

  This is exactly what `not-found.tsx:83` does — proof the system composes.
- **Plain CSS, no `@apply`.** Every `.jetic-*` class is hand-written (exact px).
  Keep that convention: greppable and framework-version-proof.

---

## 3. Font plumbing

Fonts are defined once in `src/app/fonts.ts`:

| Font | Loader | Variable | Loaded via |
|---|---|---|---|
| **Inter** | `next/font/google` | `--font-inter` | applied on `<html>` ✅ |
| **Geist Mono** | `next/font/google` (in `layout.tsx`) | `--font-geist-mono` | applied on `<html>` ✅ |
| **GT-Walsheim** | `next/font/local` | `--font-walsheim` | **not applied** ❌ (§12.1) |
| **Instrument Serif** | Google Fonts `@import` inside `(marketing)/page.tsx` `<style>` | — | landing only |
| **JetBrains Mono** | same `@import` | — | landing captions only |

`src/app/layout.tsx:105` renders:

```tsx
<html className={`${inter.variable}  ${geistMono.variable}  flex flex-col antialiased`}>
```

`walsheim.variable` is **absent**, so `--font-walsheim` is undefined. Both
`@theme --font-sans` and `body font-family` reference it → they silently fall
back to `system-ui`. Only `Navbar.tsx` (a legacy component **not** used by the
landing) still calls `walsheim.className`.

### Font-by-world cheat sheet

| World | Body / UI | Display / headings | Mono |
|---|---|---|---|
| Product / Auth | **Inter** (via `jetic-surface`, or `inter.className` on the shell) | Inter | `--font-geist-mono` (`font-mono`) |
| Marketing landing | **Inter** (`font-['Inter',system-ui,sans-serif]` on each section) | **Instrument Serif** (`font-['Instrument_Serif',Georgia,serif]`) | **JetBrains Mono** (`font-['JetBrains_Mono',ui-monospace,monospace]`) |
| Placeholder | inherited Walsheim→system-ui fallback | same | `--font-geist-mono` |

> The landing section components each re-declare `font-['Inter',…]` on their
> root because the landing is fully self-contained (§7).

---

## 4. Product tokens (`:root --jetic-*`)

| Token | Value | Meaning — use for |
|---|---|---|
| `--jetic-bg` | `#111111` | Page background (via `jetic-surface`, never raw) |
| `--jetic-well` | `#1e1e1e` | Inputs, select triggers, hover washes, user bubbles |
| `--jetic-recess` | `#1a1a1a` | Sunken wells: menus, disabled buttons, panels, `kbd`, tabs |
| `--jetic-button` | `#222222` | Default button fill; menu-item hover/selected; hobby pill |
| `--jetic-button-hover` | `#2c2c2c` | Button hover |
| `--jetic-muted` | `#8a8a8a` | Secondary text, placeholders, labels |
| `--jetic-faint` | `#555555` | Disabled button text |
| `--jetic-emphasis` | `#ededed` | Emphasized secondary text (names, values, menu items) |
| `--jetic-ring` | `#4a4a4a` | Hairline separators, `/` breadcrumb slash, unselected radio rings |

Plus the **border convention** (not a token, used literally everywhere):
**`border-white/10`**, brightening to **`border-white/20`** on hover /
focus-within.

### Banned values (World 1 only)

These are leftovers from earlier iterations. If you see one on a *product*
page, replace it with the token on its right. (They are fine in Worlds 2 & 3.)

| Banned | Replace with |
|---|---|
| `#0a0a0a`, `#0d0d0d`, `#050505`, `#0b0b0b`, `#101010`, `#141414` surfaces | `--jetic-bg` / `--jetic-well` / `--jetic-recess` |
| `#1f1f1f`, `#262626`, `#2a2a2a`, `#2e2e2e` borders | `border-white/10` |
| `#3a3a3a` borders/separators | `--jetic-ring` (`#4a4a4a`) |
| `#a1a1a1`, `#9a9aa0`, `#8a8a8f`, `#c9c9ce`, `#6b6b72` text | `--jetic-muted` |
| `#e5e5e5`, `#e5e5e8` emphasis text | `--jetic-emphasis` (`#ededed`) |
| `#6b6b6b` disabled text | `--jetic-faint` (`#555555`) |
| `#0068d6`, `#1b2d4d`/`#4c9dff`, `#3b9eff`, `#5b8cff…` blues | White-pill selected pattern (§6.7) |
| `rounded-md` / `rounded-lg` on product surfaces/controls | `rounded-xl` (12px) |
| Per-page `bg-[#111111] text-white antialiased` + `inter.className` | `jetic-surface` |

> The Sidebar (`components/ui/Sidebar/Sidebar.tsx`) is the **biggest remaining
> offender**: it hand-rolls `#0a0a0a`, `#0d0d0d`, `#141414`, `#666`, `#888`,
> `#a1a1a1`, etc. It should be migrated onto `--jetic-*` on its next touch.
> See §12.5.

---

## 5. Color / radius / motion conventions

| Concern | Rule |
|---|---|
| **Surfaces** | `#111` page → `#1a1a1a` recess → `#1e1e1e` well. Never another gray. |
| **Selection language** | **White pill = active/premium/selected.** Tabs, pills, toggles, "Plan" mode, bullet dots. **Never blue** in World 1. |
| **Borders** | `border-white/10`; hover/focus `border-white/20`. |
| **Radius** | Surfaces/controls `12px` (`rounded-xl`); pills `9999px`; menu rows `8px`; marketing composer `28px`; marketing cards `16–18px`. Nothing else. |
| **Focus** | Every interactive element keeps a visible ring: `focus-visible:ring-2 focus-visible:ring-white/30` (or the class's built-in one). Never `outline-none` without a replacement. |
| **Disabled** | A *state*, not opacity: `#1a1a1a` bg + `#555` text (`jetic-btn:disabled` does this). Don't use `opacity-60`. |
| **Motion** | All animations respect `prefers-reduced-motion` (§11). |

---

## 6. Product class catalog (World 1)

### 6.1 `jetic-surface` — page root for every product/auth page

```tsx
<main className="jetic-surface flex min-h-screen items-center justify-center px-4">
```
Sets `#111` bg, white text, Inter, antialiasing. **Carries no sizing/padding/
flex** — always pair with layout utilities.

### 6.2 `jetic-muted` · `jetic-divider`

```tsx
<span className="jetic-muted block">Set up your first Jetic team</span>
<div className="flex items-center gap-3">            {/* the OR separator */}
  <div className="jetic-divider" />
  <span className="jetic-muted text-xs">OR</span>
  <div className="jetic-divider" />
</div>
```
`jetic-divider` = 1px hairline, `flex: 1 1 0%` (fills its flex row).

### 6.3 `jetic-card` — bordered container (radius + border + clipping only)

```tsx
<div className="jetic-card">…radio rows…</div>
<div className="jetic-card bg-[#1a1a1a]">…accordion…</div>
<div className="jetic-card w-full max-w-[690px] bg-[#0a0a0a] p-8">…panel…</div>
```
**No background of its own** — add `bg-[#1a1a1a]` for recessed wells, leave
transparent for grouped rows. Inner dividers use `border-t border-white/10`.

### 6.4 `jetic-input` — text/email inputs (45px × 12px radius)

```tsx
<input className="jetic-input" … />
<input className="jetic-input font-mono" … />       {/* build cmds / env vars */}
<input className="jetic-input pl-9 font-mono" … />    {/* with a leading icon */}
```
Placeholder color, borderless, and the `:focus` ring are built in. Layer size
(`mt-2`), `font-mono`, and `pl-*` utilities on top.

### 6.5 `jetic-btn` — primary action (45px, full-width, `#222` → `#2c2c2c`)

```tsx
<button className="jetic-btn mt-5" disabled={!canContinue}>Continue</button>
<button className="jetic-btn flex items-center justify-center gap-2 text-[13px]">
```
Hover, disabled, and `focus-visible` states are built in — never re-implement
them inline. Width defaults to `100%`; for inline use, override with
`w-auto` + `inline-flex` (as `not-found.tsx` does).

### 6.6 `jetic-btn-light` — inverse action (white fill, black text)

```tsx
<button className="jetic-btn-light flex items-center justify-center gap-2.5">
  <GoogleIcon /> Continue with Google
</button>
```
Google sign-in, send buttons, primary marketing CTAs. Same contract as
`jetic-btn` (hover `.9` opacity, focus ring built in).

### 6.7 `jetic-pill` + `jetic-pill-pro` / `jetic-pill-hobby`

```tsx
<span className={`jetic-pill ${isPro ? "jetic-pill-pro" : "jetic-pill-hobby"}`}>
  {option.badge}
</span>
```
`pro` = white pill/black text. `hobby` = `#222`/`#ededed`. **This is the
selection language** — also governs active tabs, the avatar dot, and toggles
like Plan mode. Never use blue for "selected".

### 6.8 `jetic-select` / `jetic-menu` / `jetic-menu-item` — custom dropdowns

```tsx
<button className="jetic-select" aria-haspopup="listbox" aria-expanded={open}>…</button>
<ul className="jetic-menu absolute left-0 right-0 top-[49px] z-20" role="listbox">
  <li role="option" aria-selected={…}>
    <button className="jetic-menu-item">…</button>
  </li>
</ul>
```
Selected state is driven by **`aria-selected="true"` in CSS** — no conditional
classes needed on items. Position (`absolute`, `top-*`, `z-*`) stays inline
because it depends on trigger height (`45px + 4px gap = top-[49px]`).

---

## 7. Marketing landing (World 2)

**Owner:** `src/components/marketing-ui/*` + `src/app/(marketing)/page.tsx`.
These components are self-contained: each re-declares
`font-['Inter',system-ui,sans-serif] text-white antialiased` on its root and
uses a bespoke palette. **They do not use `jetic-*` classes.**

### 7.1 Page shell & composition

`(marketing)/page.tsx` is the orchestrator (server component):

```
ScrollProgress  (fixed white top bar)
CursorsLayer    (4 collaborator cursors, absolutely positioned)
└ centered column (max-w via mx-auto) ─ MarketingNavbar · Hero · FigureShowcase · PromptBox · FooterLinks
PlatformSection (#platform-section)
PricingSection  (#pricing)
CtaSection      (#cta)
SiteFooter
```

Root div: `bg-[#0a0a0a] font-['Inter',system-ui,sans-serif] text-white antialiased`.
The page injects one `<style>` block that `@import`s the landing fonts and
defines `hp-blink` + `cursor-drift` keyframes (with a reduced-motion kill).

> **Important:** the `(marketing)/layout.tsx` wrapper is `min-h-screen` (not
> `h-full`). This was a deliberate fix: an `h-full` wrapper created a nested
> scroller that starved `window.scrollY`, which broke `ScrollProgress`, the
> navbar's scrolled state, **and** cursor travel. Keep it `min-h-screen`.
> The layout also draws the vertical guides: a `max-w-7xl` column with
> `border-x border-black/[.08] dark:border-white/[.08]`.

### 7.2 Component palette reference

| Component | Key styling |
|---|---|
| `marketing-navbar.tsx` | `fixed inset-x-0 top-0 z-50 h-[76px]`; transparent → `border-b border-white/[0.07] backdrop-blur-md` after `scrollY > 24`; brand `text-[16px] font-bold`; "Sign up" = white pill (`bg-white text-[#0a0a0a]`); "Log in" = `text-white/70`; paired spacer `<div className="h-[76px]" />` |
| `hero.tsx` | `h1` = **Instrument Serif** `text-[60px] tracking-[-0.045em] text-white`; sub = `text-[#b4b4ba] text-[16.5px] leading-[25.5px]` |
| `figure-showcase.tsx` | `DitherVeil` image (`/node.png`, floyd, duotone) in a `h-[20vh]` band; caption `JetBrains Mono text-[10px] tracking-[0.18em] text-white/40`; dot pager (`bg-white` active / `bg-white/30`) |
| `prompt-box.tsx` | `rounded-[28px] border-white/[0.13] bg-white/[0.012] h-[140px]`; typewriter placeholder `text-white/45` + blinking caret; primary `bg-white text-[#0a0a0a] h-[36px] rounded-[10px]`; "Blank simulation" ghost `text-white/55` |
| `footer-links.tsx` | `text-[12.5px] text-white/45`; links `text-white/70 underline decoration-white/35` |
| `platform-section.tsx` (`#platform-section`) | `bg-black`; heading `text-[22px] font-semibold tracking-[-0.03em]`; bento grid `gap-px bg-white/[0.12] border border-white/[0.12] rounded-[16px]`, cells `bg-black`; card label `text-[11.5px] text-white`; accents: `#0099ff`, `#7c6cf0`, `#3b82f6`, `#22c55e`/`#4ade80`, `#ef4444`, `#60a5fa`, `#a78bfa`, `#f472b6`, `#d97706` |
| `pricing-section.tsx` (`#pricing`) | `bg-black`; heading `text-[40px] sm:text-[48px] font-semibold tracking-[-0.035em]` (Inter); yearly toggle = white pill `w-[34px] h-[20px]`; plan cards in a `gap-px bg-white/[0.12] rounded-[18px]` grid, cells `bg-black p-6`; field box `h-[34px] rounded-[7px] border-white/[0.14] bg-white/[0.03]`; feature check `text-white/40`; CTA primary `bg-white text-black rounded-[7px]`, secondary `bg-white/[0.13]` |
| `cta-section.tsx` (`#cta`) | `bg-[#0a0a0a]`; headline **Instrument Serif** `text-[52px] md:text-[60px]`; body `text-[#a1a1a8]`; button `bg-[#fafafa] text-[#0a0a0a] h-[42px] rounded-[12px]`; hosts the `CrystalizedBall` (preset `plasma`, `#4462f4`) |
| `site-footer.tsx` | brand `text-[14px] text-white`; tagline `text-white/40` with `#c08a6b` ("prompt") + `#6f8fd8` ("API tests") accents; dotted wordmark `text-[84px]` (`dotText` radial-gradient in `(marketing)/constants.ts`); bottom bar `JetBrains Mono text-[10px] uppercase tracking-[0.18em] text-white/40`, `border-t border-white/[0.08]` |
| `scroll-progress.tsx` | `fixed inset-x-0 top-0 z-[10000] h-[3px]`; inner bar `bg-white origin-left`, driven by `scaleX(scrollTop / scrollable)` |
| `cursors-layer.tsx` | `absolute inset-0 z-20 hidden lg:block pointer-events-none`; 4 cursors (colors `#16a34a`, `#ea580c`, `#3b82f6`, `#d97706`); idle `cursor-drift`, scroll-travel to platform cards, pricing "Pick this" ring, CTA lineup rings. Entirely effect-driven (SSR-safe) |

### 7.3 The cursor layer contract (if you touch the landing)

`CursorsLayer` measures DOM anchors **by id**:

- `#platform-section` → children of `:scope > div > .grid` are the cards,
  in DOM order (see the `CARD` map at the top of the file).
- `#pricing` → first `.grid`'s children are the plan cards; `PRO = 2` is the
  "Pro" card; its last `<button>` is the ring target.
- `#cta` → first `<a>` is the "Start for free" button all cursors line up on.

Keep those ids/structures stable or the tour breaks (it `console.warn`s and
idles if `#platform-section` is missing). The layer only activates at `lg`
and honors `prefers-reduced-motion` (it parks cursors in place).

---

## 8. Placeholder / utility world (World 3)

Applies to marketing subpages, `docs`, `feedback/*`, and the `ui/*` primitives.
These routes are **scaffolding** and consistently use the zinc light/dark style.
They live inside `(marketing)/layout.tsx`'s bordered column (max-w-7xl).

| Element | Class |
|---|---|
| Section heading | `text-3xl font-semibold tracking-tight` |
| Body copy | `text-zinc-600 dark:text-zinc-400` (or `text-sm leading-6 …`) |
| Card | `rounded-2xl border border-black/[.08] p-5 dark:border-white/[.08]` |
| Dashed empty box | `rounded-2xl border border-dashed border-black/[.12] dark:border-white/[.12]` |

**Files:** `(marketing)/features|pricing|how-it-works|changelog|contact|legal/*`,
`docs/[[...slug]]/page.tsx`, `components/feedback/{empty,error,loading}-state.tsx`.

`ui/*` primitives (a **third** button style, distinct from `jetic-btn`):

| Primitive | Style | Used by |
|---|---|---|
| `ui/button.tsx` | `rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black` (variants: primary/secondary/ghost) | `features/agent/*` |
| `ui/input.tsx` | `rounded-xl border-black/[.08] … focus:border-black/30 dark:border-white/[.15]` | — |
| `ui/dialog.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `skeleton.tsx`, `noise-background.tsx` | shadcn-style, zinc | `features/agent`, `ui/Navbar` |
| `ui/Navbar/Navbar.tsx` | zinc + `walsheim.className` + `NoiseBackground` (remote noise img) | **legacy — not used by the landing** |

> Do **not** reach for `ui/button.tsx` on a product page. Product pages use
> `jetic-btn` / `jetic-btn-light`. If you need a generic primitive inside a
> feature module, you may use it — but keep it out of World 1 routes.

---

## 9. Icons

| Component | File | Notes |
|---|---|---|
| `JeticIcon` (`{ size }`) | `components/jetic-icon.tsx` | static filled-white brand mark, viewBox `14×21` (height = `size × 1.5`) |
| `JeticAnimatedIcon` (`{ size, loop, sheen, className }`) | `components/jetic-animated-icon.tsx` | animated loader; takes colour from `currentColor`; `loop=false` plays the intro once; reduced-motion aware |
| Inline SVG icon helpers | defined per-file (`Svg`, `Arrow`, `ChevronDown`, …) | product/marketing components hand-roll 24×24 stroke icons rather than importing an icon set |
| `lucide-react` | dependency | used in `toolbar.tsx` (`Check`, `ChevronsUpDown`, `Plus`) and `code-slot.tsx` (`Check`) |

---

## 10. Consumer map (verified)

| Surface | Route / file | Classes / palette used |
|---|---|---|
| Sign-in | `(auth)/sign-in/page.tsx` | surface, btn-light, divider, muted, input, btn, CodeSlots |
| Sign-up | `(auth)/sign-up/page.tsx` | same as sign-in + `Link` to `/sign-in` |
| Onboarding | `(product)/app/onboarding/page.tsx` | surface, card, pill + pro/hobby, muted, input, btn |
| Workspace (import) | `workspace/[workspaceId]/page.tsx` | surface, card, muted, btn (+ inline `#1a1a1a` wells) — **has dead code, §12.4** |
| Sandbox (new) | `.../sandbox/[sandboxId]/page.tsx` | surface, card, select, menu, menu-item, pill-hobby, muted, input, btn |
| Chat | `.../chat/page.tsx` | `jetic-muted`, Kbd; inline `#1e1e1e`/`#1a1a1a` wells for bubbles/composer |
| Toolbar | `components/ui/Toolbar/toolbar.tsx` | `jetic-menu`, `jetic-menu-item`, `jetic-muted` + inline `#0a0a0a`/`#1e1e1e` |
| Sidebar | `components/ui/Sidebar/Sidebar.tsx` | **not yet migrated** (hand-rolled grays) — §12.5 |
| Marketing landing | `(marketing)/page.tsx` + `marketing-ui/*` | World 2 palette (§7) |
| Marketing subpages | `(marketing)/{features,pricing,how-it-works,changelog,contact,legal/*}` | World 3 zinc placeholders |
| Docs | `docs/[[...slug]]/page.tsx` | World 3 zinc |

---

## 11. Verification & build gotchas

```powershell
pnpm exec tsc --noEmit   # types
pnpm lint                # 0 errors (unused-import warnings tolerated — fix yours)
pnpm build               # must be green; validates types + prerendering
```

⚠️ **Build/lock gotcha:** if `pnpm dev` is running, `pnpm build` fails with
`ENOTEMPTY … rmdir '.next/…'` — the dev server holds `.next` file locks. Stop
the Next node processes first, wait a few seconds for handles to release, then
rebuild. Never delete `.next` while dev is running.

⚠️ **Next 16 / Cache Components gotcha:** dynamic-segment routes must *consume*
their `params` (`await params` inside a `<Suspense>` boundary) or provide
`generateStaticParams`, or the build fails with *"encountered uncached or
runtime data in `generateMetadata()`"*. See the workspace/sandbox layouts and
`docs/[[...slug]]` for the working pattern.

⚠️ **`export const instant = false`** on the authenticated shells
(`(product)/app/layout.tsx` and the workspace/sandbox layouts) opts those
request-bound routes out of instant navigation. Intentional.

⚠️ **Reduced motion:** every animation (cursor drift, typewriter, dot waves,
`hp-blink`, Jetic loader) must be disabled or frozen under
`prefers-reduced-motion: reduce`.

---

## 12. Known issues / TODO (fix or decide)

1. **`walsheim.variable` is not applied.** `layout.tsx` imports `walsheim` but
   only `inter.variable` + `geistMono.variable` reach `<html>`. Effect: `body`
   and `font-sans` fall back to `system-ui`; the `walsheim` import is unused.
   The landing doesn't use Walsheim at all (it uses Instrument Serif + Inter +
   JetBrains Mono). Decide: either re-add `walsheim.variable` to `<html>`, or
   **retire Walsheim** — point `--font-sans`/`body` at `--font-inter`, delete
   the `localFont` definition, and migrate `ui/Navbar` off `walsheim.className`.
2. **`--container-8xl` is unused.** Either use `max-w-8xl` for the marketing
   shell or drop the token.
3. **`not-found.tsx` has dead code.** `DotGrid` is defined but never rendered;
   `MarketingNavbar` and `Image` are imported but unused. It *does* correctly
   use `inter.className` + `jetic-surface` + `jetic-btn-light`/`jetic-btn`.
4. **`workspace/[workspaceId]/page.tsx` has dead code and stale copy.** Unused
   icons (`UserPlus`, `Plus`, `Refresh`), unused `CHIPS`, and unused handlers
   (`handleSubmit`, `pickChip`, `resetPrompt`). Its template cards say
   *"Deploy an agent in a minute on Vercel"* / *"using Jev"* — vendor names that
   violate `jetic.md`'s no-vendor rule. The default export is misnamed
   `DashboardPage`.
5. **Sidebar is unmigrated.** `ui/Sidebar/Sidebar.tsx` hand-rolls
   `#0a0a0a`, `#0d0d0d`, `#141414`, `#222`, `#333`, `#555`, `#666`, `#888`,
   `#a1a1a1`. Migrate to `--jetic-*` / `jetic-menu-item` on its next touch.
6. **Placeholder product pages used World 3 on a `#111` shell.** `settings`,
   `environments`, `simulations`, `simulations/[id]`, `repositories` render
   `text-2xl` + `text-zinc-600 dark:text-zinc-400` inside the dark product
   layout — in light mode that is dark-on-dark. Give them `jetic-surface`
   (or wrap content) and `jetic-muted` when they become real.
7. **Broken/placeholder links.** `(product)/app/page.tsx` redirects to
   `/app/dashboard`, which **does not exist** (no such route in the build).
   `lib/constants.ts` `ROUTES.workspace` uses `/app/workspaces/:id` (plural)
   but the route is `/app/workspace/:id` (singular); the simulations page links
   the plural path too. `FOOTER_LINK` points `Privacy`/`Terms` at `/privacy`
   and `/terms` (real routes are `/legal/privacy`, `/legal/terms`) and `Blog`
   at a non-existent `/blog`.
8. **Auth is stubbed.** `verifyCode()` in both `sign-in` and `sign-up` always
   returns `true`; "Continue with Google" is a `console.log`. `contact` shows
   `hello@example.com`. Replace before launch.
9. **Layout class typos.** `(product)/app/layout.tsx:13`, the workspace layout,
   and the sandbox layout all contain `text=[13px]` — invalid (should be
   `text-[13px]`), so it does nothing.
10. **Pre-existing lint errors** in `components/code-slot.tsx` (refs during
    render at lines 126/128/132/133/247; `setState` in effect at line 348).
    Unrelated to the design system but they keep `pnpm lint` red.
11. **`ui/Navbar` is legacy** and unused by the landing; it pulls a remote
    noise image (`assets.aceternity.com`). Consider deleting it.
12. **`prompt-composer` default footer is off-brand** ("check a KiCad design",
    "browse Circuit World"). The landing overrides `footerItems`, so it isn't
    shown there — but update the default or the next consumer will inherit it.

---

## 13. Contribution rules (decision tree, in order)

1. **Which world?** Product/auth → World 1 (`jetic-*`). Landing → World 2
   (§7 palette). Subpage/docs/placeholder/feature → World 3 (zinc).
2. **A token/class exists?** Use it (`jetic-muted`, `border-white/10`,
   `bg-[#1e1e1e]`, `jetic-input`, …). Stop here in ~90% of cases.
3. **Neither exists, World 1?** Generalize: would a second feature use it? If
   yes, add a `.jetic-*` class to `globals.css` (12px radius, `white/10`
   borders, built-in focus + disabled). If no, a Tailwind arbitrary value is
   acceptable — prefer an existing token's value.
4. **New gray or blue in World 1?** No. See §4 banned table.
5. **Copy:** product voice is "simulate / approve / run / reviewable history".
   No vendor names (Vercel, Jev, Inky), no lorem copy, no `#` dead links.

### Non-negotiables

- Product pages are **dark-only**; no `dark:` variants on `.jetic-*` consumers.
- Every interactive element keeps a visible focus ring.
- Disabled is a `:disabled` state, never `opacity`.
- Fonts: **Inter** for product UI, **Instrument Serif** only for landing
  display, **JetBrains Mono** only for landing captions/mono.
- Radius scale: 12px controls, 9999px pills, 8px menu rows, 28px marketing
  composer, 16–18px marketing cards. Nothing else.
- Respect `prefers-reduced-motion` for anything that moves.
