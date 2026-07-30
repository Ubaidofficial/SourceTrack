# SourceTrack — Session Handoff

**Date:** 2026-07-30 · **Main:** `5c03200` (post-#515) · **Every claim below verified at that ref**

> Replaces the 2026-07-29 edition (state at `53dc418`, post-#491). That file's open items are
> carried forward or closed below — nothing is silently dropped.
>
> **Scope of this file:** current state only. Two other files are **not** superseded and must not
> be overwritten:
> - [`../SESSION_HANDOFF_2026-07-26.md`](../SESSION_HANDOFF_2026-07-26.md) — point-in-time snapshot
>   at post-#424, holds the deep prioritized backlog.
> - `SESSION_STATE.md` — **retired 2026-07-23**, frozen historical record. Do not append.
>
> **One correction to the 07-26 file's Tinybird record, made here rather than there:** it records
> `Tinybird prod: deployment #25`. The founder reports a **#27** this session, to **ST_Staging**.
> That is recorded in this file (see *Tinybird* below) and is **not independently verified** — read
> that section before quoting a deployment number.

---

## What shipped — 20 PRs, all merged and confirmed present on `main`

Each row's merge SHA was checked with `git merge-base --is-ancestor <sha> origin/main`, not from the
PR list. **#512 is CLOSED, not merged** — correctly reversed, see below.

| PR | Merge SHA | What |
|---|---|---|
| #475 | `f67b5a2` | SEO: every canonical signal points at `www` — the apex host does not serve |
| #496 | `6512fb9` | `/api/diag/ai-test` behind an env gate, **attacker-controlled headers HTML-escaped** |
| #497 | `1487929` | AI Visibility: crawler detection, `crawler_hits` model, Agents/Pages report |
| #498 | `efd2744` | CAPI: GA4 Measurement Protocol + TikTok Events API senders |
| #499 | `bf47383` | Marketing contact + newsletter forms actually store submissions |
| #500 | `d8d1ec6` | Deleted the unreachable `/about` and `/features` pages |
| #501 | `8ebd169` | Marketing UI/UX audit vs design.md + the greenlit before/after auto-cycle |
| #502 | `6ce7a41` | Funnels: stop silently reporting a truncated funnel as a complete one |
| #503 | `8eb353d` | MCP v1 diagnostic tools behind `read:analytics` — first enforcement of that scope |
| #504 | `735b7ca` | Public roadmap page, two items verified down to Building |
| #505 | `4aaa3b9` | Marketing footer links for Roadmap + Comparisons (Status deliberately omitted) |
| #506 | `2456db6` | MCP volume-only leads + campaign tools (counts, **no revenue**) |
| #507 | `615af4e` | Dashboard: attribution coverage animates in as a ring from the real fetched value |
| #508 | `35f830d` | `/pricing` shipped three fabricated plans at prices that do not exist — removed |
| #509 | `3b22310` | design.md §35.3 — the 2026-07-30 competitive pattern-validation pass |
| #510 | `1fb566e` | "Direct Rescue" before/after homepage section (fixture only) |
| #511 | `f966455` | Free trial 14 → 28 days, in all four sources of truth |
| #513 | `d80ca76` | Docs migration batch 1 — index, quickstart, install, troubleshooting |
| #514 | `1754559` | CAPI: LinkedIn made configurable; Microsoft deliberately held |
| #515 | `5c03200` | Docs migration batch 2 — the 7 platform pages, canonicals repointed, 301s added |

**#512 — `fix(seo): disallow /docs and /developers on the app domain` — CLOSED, never merged.**
Correctly reversed: a `robots.txt` `Disallow` would have blocked the crawl Google needs in order to
*see* the `noindex`, so it would have preserved already-indexed app-domain doc URLs rather than
removing them. `dashboard/server.mjs` already sends `X-Robots-Tag: noindex, nofollow` on every
app-host path except `/login` and `/signup`, which is the mechanism that actually de-indexes.

## Founder-gated work — done

**Shopify Level 1 protected-customer-data access selected** for `sourcetrack-shpfy-app`. Dev-store
testing is unblocked. **App Store submission review is a separate, later gate and has not been
done.** The choice is recorded in code with its rationale (`shopify.app.toml:8-28`): scope is
`read_orders` **only**, and `read_customers` is deliberately *not* requested — asking for it would
pull the app into Shopify's **Level 2** protected-customer-data tier, which the conversion payload
does not need. Orders are protected customer data even at totals-only, so Level 1 is still required.

## Tinybird — read this before quoting a deployment number

**Founder-reported:** the `crawler_hits` datasource and 2 crawler pipes were deployed live to
**ST_Staging**, deployment **#27**.

**What was independently verified this session, and it is only the negative half:**

- The Tinybird MCP available this session is bound to the **PROD** workspace, **not** ST_Staging.
  Proven, not assumed: the workspace holds 3 `site_id`s, and **2 of the 3 resolve in the PROD
  Supabase project** (`zxjjjsipafojhzkkumvh`) as real customer domains, while **0 of the 3** resolve
  in staging (`nrsvpwzekfrdrzkoecfk`).
- In that PROD workspace: **`crawler_hits` does not exist** (3 datasources only — `events`,
  `events_by_visitor`, `privacy_signals`) and **no crawler endpoint exists** (0 of 435 endpoints
  match `crawler`).

So: **prod does not have the crawler model** — verified. **Staging having it is founder-reported and
unverifiable from this session**, because the only Tinybird credential available points at prod.
This matches the standing hazard that the Tinybird MCP is token-bound and has switched workspaces
before; identify the workspace by `site_id` before trusting any Tinybird query.

**Stale claim left in the repo, deliberately not edited:** `tinybird/pipes/crawler_agents.pipe:16`
and `crawler_pages.pipe:19` still say `NOT YET DEPLOYED`. If the staging deploy happened, both are
now wrong — but the accurate replacement ("deployed to ST_Staging, absent from prod") is exactly the
half I could not verify, and swapping one unverified claim for another is not an improvement. Fix
these once someone reads the ST_Staging workspace directly.

## New repo — `Ubaidofficial/sourcetrack-shpfy-app`

A **native Shopify app**, and a **separate deployable** from the API / dashboard / marketing repos.
Full detail lives in `FEATURE_MAP.md` §29; the load-bearing facts:

- **PUBLIC repo** (the main `SourceTrack` repo is private). No secret may ever land in it.
- Created 2026-07-30. 3 commits: the `@shopify/app` CLI scaffold, then PR **#1** and PR **#2**, both
  merged. React Router + JS, Prisma, own CI (`lint` → `test` → `build` on Node 22).
- **PR #1** — `orders/paid` → SourceTrack `$conversion`. Reports under `provider = 'shopify'`,
  **byte-identical to `api/routes/shopify-webhook.js`**, which is what makes it share the manual
  rail's idempotency namespace `(site_key, provider, key_type, key_value)` rather than opening a
  second one that would double-count the same order.
- **PR #2** — the stored merchant site key is encrypted at rest with **AES-256-GCM** under
  **`SOURCETRACK_CONFIG_ENCRYPTION_KEY`** — deliberately **distinct** from the main API's
  `ENCRYPTION_KEY`, and the code says so at `app/crypto.server.js:13`.
- **Not deployed anywhere.** Only a `Dockerfile` is committed — no `railway.json`, `fly.toml`,
  `render.yaml` or `vercel.json`. Local dev only.

## NOT verified end-to-end — the one real gap in tonight's Shopify work

**A real Shopify test order has never been observed landing as a `$conversion`.** The webhook code,
the crypto, the dedupe namespace and the unit tests are all in place; the end-to-end path is not
proven.

Local dev testing was blocked by **Cloudflare's `trycloudflare.com` quick-tunnel service failing DNS
resolution across three separate fresh tunnel hostnames in a row** — an external infrastructure
failure, not a code problem. Retry next session; this is item 1 in `NEXT_SESSION_PROMPT.md`.

## Docs migration — batches 1 and 2 done, 3 and 4 open

The marketing Astro site (`marketing/`) now owns `/docs`. Batch 1 (#513) ported index, quickstart,
install, troubleshooting. Batch 2 (#515) ported the 7 platform pages **and** fixed the real bug
underneath them: all 7 dashboard docs pages declared a canonical of
`www.sourcetrack.ai/docs/platforms/<slug>`, **and that path 404s on www** (verified: 404 on www, 200
on app). All 7 canonicals were repointed and 301s added in `dashboard/server.mjs`.

`google-tag-manager → gtm` is the one slug that is not a straight prefix drop, so the redirect map is
explicit rather than a prefix strip.

**Left standing on purpose:** the in-app `/docs/platforms/*` routes and the in-app links to them
(`Setup.jsx`, `installNudge.js`, `docsManifest.js`, `Onboarding.jsx`). An in-app click still renders
locally; only a hard navigation redirects. Nothing is dead either way. Retiring them is batch 4.

## Carried forward from the 07-29 handoff

| Item | Status now |
|---|---|
| `className` → `class` (#492) | **Closed** — merged as `1624be8`, plus CI gates so it cannot recur |
| Pricing page contradictions | **Partly closed** — #508 removed the three fabricated plans; #511 set the trial to 28 days in all four sources of truth. The Founder Annual decision is settled ($99/yr, 25 spots) |
| Docs restructure "dispatched, not reported back" | **Closed** — that was the docs migration; batches 1–2 landed as #513/#515 |
| `st.lime-dark` `#C5E838` (9 uses, dark mode only) | **Still open** — derived from the *old* accent; design.md §3.3 specifies `#C8F000` with `#B8DD00` hover and has no "softer dark lime". Needs a decision + a dark-mode screenshot |
| `/analytics` + `/leads` hierarchy | **Still open** — §2.4's dominance rule was applied to the Overview strip only. A scope question, not a defect |
| Typography site-wide | **Still open** — ≈80% of weight declarations on main app screens are `semibold`/`bold`; 96 arbitrary font sizes sit below the smallest spec token (incl. `text-[9px]`, `text-[8px]`). Larger than one dispatch |

## Verification capability — unchanged and still worth restating

**"CC has no browser tool" is not accurate.** CC drives headless Chrome over CDP — real screenshots,
computed styles, device-metric overrides. The real limitation is narrower: **CC has no authenticated
session for `app.sourcetrack.ai`.** Protected routes redirect to `/login` and per CLAUDE.md §0 CC
stops there rather than seeking credentials.

- **Public / built surfaces** (marketing site, built `dist` HTML, isolated component renders) — CC
  verifies these directly.
- **Authenticated app screens** — Antigravity, or a founder-provided session. The only class CC
  genuinely cannot reach.

## Two stale in-code claims found while verifying this handoff

Neither is edited here — this is a docs pass, and both are code:

1. **`api/lib/tinybird-read.js:143`** warns `"…falling back to HogQL."` There **is no HogQL
   fallback** — PostHog is fully decommissioned and a `null` read fails **closed** (CLAUDE.md §5).
   The message would mislead whoever next reads that log line during an incident.
2. **The two `crawler_*.pipe` `NOT YET DEPLOYED` comments** — see *Tinybird* above.
