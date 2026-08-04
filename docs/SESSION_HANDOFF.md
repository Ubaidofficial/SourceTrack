# SourceTrack — Session Handoff

**Date:** 2026-07-29 · **Main:** `53dc418` (post-#491) · **Verified at that ref**

> **Newer state exists.** For launch-readiness as of 2026-08-04 (`main` `c00957b9`) read
> [`../SESSION_HANDOFF_2026-08-04.md`](../SESSION_HANDOFF_2026-08-04.md) first. This file is
> current only up to `53dc418`; it is not superseded wholesale — the marketing-site and Tinybird
> sections below are still the record — but anything about open PRs, issues, or deployed commits
> here is six days stale.

> This file previously described a Supabase `createClient` / Railway fix and "T8 pricing tier
> enforcement" as the next task, pointing at `~/Desktop/trackiq/api/index.js`. That was long
> stale and is replaced wholesale.
>
> **Scope of this file:** current state only. The deep prioritized backlog still lives in
> [`../SESSION_HANDOFF_2026-07-26.md`](../SESSION_HANDOFF_2026-07-26.md) (351 lines, a
> point-in-time snapshot at post-#424) — that file is **not** superseded and must not be
> overwritten; it holds the last verified Tinybird deployment record.

---

## Marketing site — de-templated, live on its own service

The Astro marketing site is live and serving both the apex and `www`. Verified by request at
the ref above, not assumed:

| Host | Status | Serving |
|---|---|---|
| `www.sourcetrack.ai` | 200 | Astro build (`/_astro/` assets) |
| `sourcetrack.ai` | 200 | Astro build (`/_astro/` assets) |
| `app.sourcetrack.ai` | 200 | dashboard SPA (`/assets/index-*`) — **unaffected** |

Railway service name reported as `sourcetrack-marketing`. **Not independently verified** — the
Railway MCP returned `Unauthorized` this session, and per CLAUDE.md §0 no credential path was
attempted. The domain/build evidence above *is* verified; the service name is founder-reported.

The de-templating ran across #479–#488: PowerAI branding and fake proof removed, the template's
purple palette retired for the lime accent, every stock/AI image of a person pulled, and the
AI-referral stat corrected to the number the shipped tracker actually supports.

## Dashboard — merged this session

| PR | State | What |
|---|---|---|
| #486 | merged | data-driven Overview KPIs, on-chart event markers, richer Journey panel |
| #489 | merged | marker caption fixed — "Showing 0 of 1" contradicted the marker it sat next to |
| #490 | merged | a failed traffic read no longer tells customers to install the tracker |
| #491 | merged | accent unified to `#C8F000`; data-driven KPI hierarchy (design.md §2.4) |

**#491 detail worth carrying forward:** the accent migration covered **71 hardcoded instances
across 21 files**, of which **22 were the `rgba(204,240,63,…)` decimal form** that a hex grep
cannot see — including the Overview's own source bars and every area-chart fill in
`limeAreaGradient.js`. A hex-only sweep would have shipped a half-migrated accent.

## `className` → `class` — PR #492, open

- **Coded and committed** as 30 Astro pages + `tsconfig.json` + one destructuring-defaults fix
  (32 files, +305/−280).
- The exposure was **not** that it was uncommitted — it was committed but **local-only: never
  pushed, no PR**, sitting in `trackiq-clsfix`, a worktree with prior branch-switch collisions
  (§13). It is now rebased onto current main (it was 7 behind) and pushed as **#492**.
- **Statically verified clean:** across all 50 built HTML files, with inline `<script>`/`<style>`
  excluded — **0** `className=` / `htmlFor=` / `onClick=` / `strokeWidth=` / `fillRule=` /
  `tabIndex=` in markup; **0** unresolved expressions; **0** `attr={…}` unrendered props; **0**
  self-closing non-void tags.
- One caveat that is **not** a regression: 18 `class=""` on `index.html`, all from
  `Integration.tsx`'s `shouldSpin ? "…" : ""` ternary. That is a React island; this PR touches
  no `.tsx`. Building `origin/main` produces the same 18.
- **NOT browser-verified.** Static analysis proves the attribute name is gone; it does not prove
  the styling renders. That needs a real browser pass on the built pages.

## Verification capability — correcting a claim in circulation

**"CC has no browser tool" is not accurate**, and it is worth fixing here because it misroutes
work. CC drove headless Chrome over CDP throughout this session — real screenshots, computed
styles, `Emulation.setDeviceMetricsOverride` for true 390/1440 viewports, `naturalWidth`
broken-image detection. That is how the marketing regressions in #480/#481 and the KPI size step
in #491 were verified.

The real limitation is narrower: **CC has no authenticated session for `app.sourcetrack.ai`.**
`/dashboard`, `/analytics` and `/leads` sit behind `ProtectedRoute` and redirect to `/login`;
per §0 CC stops there rather than seeking credentials.

So the routing rule is:

- **Public/built surfaces** (marketing site, built `dist` HTML, isolated component renders) —
  CC can and does verify these in a real browser.
- **Authenticated app screens** — Antigravity, or a founder-provided session. This is the only
  class CC genuinely cannot reach.

## Still open

- **`st.lime-dark` `#C5E838`** (9 uses, dark mode only) — derived from the *old* accent, now a
  stale pairing. design.md §3.3 specifies the same `#C8F000` in dark mode with `#B8DD00` hover;
  there is no "softer dark lime" in the spec at all. Needs a decision plus a dark-mode screenshot.
- **`/analytics` + `/leads` hierarchy** — §2.4's dominance rule was applied to the Overview strip
  only. Whether these two screens have a comparable "headline metric" is an open scope question,
  not a known defect.
- **Pricing page contradictions** — blocked on a real Stripe check and the Founder Annual plan
  decision.
- **Docs restructure** — dispatched, not reported back.
- **Typography, site-wide** — from the Phase 0 audit: ≈80% of weight declarations on the main app
  screens are `semibold`/`bold`, and 96 arbitrary font sizes sit below the smallest spec token
  (including `text-[9px]` and `text-[8px]`). Real, deliberately out of scope so far, and larger
  than a single dispatch.

## Tinybird migration — zero movement this session

Nothing in this session touched Tinybird. The authoritative status is **unchanged** and lives in:

- [`../SESSION_HANDOFF_2026-07-26.md`](../SESSION_HANDOFF_2026-07-26.md) — `Tinybird prod:
  deployment #25` (line 2), and the per-deploy record `#24 (#416 pipes) · #25 (#422 pipes)`.
- `KNOWN_ISSUES.md` — the nightly runs Tinybird-sole with fail-closed reads (B3, #308–#311).

**Do not overwrite those entries from this file.** They are still accurate; this section exists
only to record that no movement occurred, not to restate them.
