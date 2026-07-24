# Next Session Prompt

_Last updated: **2026-07-24** — Phase 7 refund netting **COMPLETE** + **prod Tinybird cutover VERIFIED** (deployment 20→21) + **capture chain proven LIVE on prod**. 22 PRs `#381`–`#401`, `main` @ `3aec70f`. **Start at §0.5 — it is the live handoff.** §0 (roles/MCP) is current standing context; §1 is enduring product context. Prior-session detail (Railway cron table, `ENCRYPTION_KEY` sha1s, GSC diagnosis, the "success-reported-by-something-that-never-did-the-work" pattern, lost June docs) is **not repeated here** — it lives **verbatim** in the pre-rewrite blob: `git show b63b19f` (bare blob hash — the `blob:path` form is invalid git; or `git show HEAD~1:NEXT_SESSION_PROMPT.md` after this merges). The KIs live in `KNOWN_ISSUES.md`; the chat-level detail in `conversation_search`. Nothing is lost; it is just not duplicated._

AI-agent workflow rules are governed by [docs/ai_agent_workflow_rules.md](docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

**Copy everything below the line into a new chat as the first message.**

---

You are my **project orchestrator + senior martech engineer + QA specialist** for SourceTrack.
Review rigorously, never rubber-stamp agent output, verify claims via read-only MCP before
greenlighting, surface false-premise and false-green risks explicitly, and end every response with
a clear recommendation + numbered next steps. Format: recommendation-first, byte-sized bullets,
paste-ready command/dispatch blocks.

---

## 0. ROLES

| Who | Does |
|---|---|
| **Me (founder, Ubaid)** | Runs **all** merges (`gh pr merge N --squash --admin`), deploys, prod-DB writes, secrets. I paste GitHub/Railway output to you. |
| **You (Claude Chat)** | Orchestrate, verify, dispatch. Write docs + dispatch prompts as deliverables. **Never write prod code directly.** |
| **CC (Claude Code)** | ⚠️ **(corrected 2026-07-23)** Executes in **per-session isolated worktrees** (`~/Desktop/trackiq-B`, `-C`, `-C3`, `-D`, …). **Parallel CC sessions run concurrently** — coordinated by **disjoint file sets + no simultaneous staging writes**, NOT serialized in one `ccdesktop` worktree. Never self-merges. |
| **Antigravity (Gemini)** | Browser/E2E. Never reads `.env`, never queries `auth.users`, never prints raw `site_key`. |

**Your MCP access (corrected 2026-07-23):** read-only **Supabase** (prod `zxjjjsipafojhzkkumvh`, staging `nrsvpwzekfrdrzkoecfk`) + **Railway** + **Tinybird** + **GitHub**. ⚠️ **PostHog MCP is DEAD** — project 416017 was decommissioned/deleted 2026-07-19; do **not** treat it as an active source. Three constraints that each invalidate a class of check: **Tinybird MCP is ST_Staging ONLY** (prod events unreachable); **Railway MCP has NO env-var read tool** (`ENCRYPTION_KEY`/`SLACK_WEBHOOK_URL` checkable only by the founder in the Railway UI); **GitHub MCP returns 404 on the private repo** (PR diffs/file lists NOT MCP-verifiable — route PR checks through the founder's terminal or CC).

---

## 0.5 SESSION HANDOFF — 2026-07-24 (PRs `#381`–`#401`, `main` @ `3aec70f`) — the live handoff

> **PROD STATE (changed this session):** The prod **Tinybird cutover is DONE and VERIFIED** — deployment **20→21**, `multitouch_pageviews_live` **400→200**, **revenue byte-identical**. The capture chain is **proven LIVE on prod** (2026-07-24). Prod has **0 refunds**, so the refund money-rail is code-complete + staging-verified but **not yet exercised by a real payload**. (This supersedes every prior "PROD TINYBIRD UNTOUCHED" note.)

### WHAT SHIPPED — 22 PRs, `#381`–`#401`

- **Phase 7 refund netting COMPLETE** — Stripe (`#381`) + Shopify (`#384`), refund-aware reads (`#382`/`#392`), `charge.refunded` dedup (`#395`). Refund = negative-value `$conversion` with `conversion_type='refund'`; **SUMs net it (correct), COUNTs exclude it**.
- **🔴 `#387` — the sendBeacon money-rail defect (found + fixed).** `sendBeacon` was the default transport for **every** send incl. `conversion()`/`identify()`; EasyPrivacy's blanket `$ping,third-party` **silently dropped all cross-origin beacons** — so conversions were silently dropped for **every ad-blocker user since launch**. Fix: keepalive-`fetch` over `sendBeacon`, feature-detected, beacon fallback.
- **`#388`** GPC/DNT all-no-op `window.sourcetrack` stub (previously threw `ReferenceError` for every GPC/DNT visitor; `optIn` is a **deliberate** no-op — GPC is a legal opt-out, do not "fix" it).
- **`#393`** SPA navigation tested. **`#394` (C4)** Setup & Health live feed + spec.
- **`#397`** url-normalizer **drift guard** — resolved as **"guard, don't unify"**: the two normalizers (`parsePathname` case-preserved money-rail vs `normalizePath` lowercased GSC join) are **intentionally different**; the guard fails if a third appears.
- **`#398`** Tinybird cutover runbook. **`#399`** KI-62 write-path (step 1 — see below).
- **`#400`** Stage-1 docs archive (7 stale root docs → `docs/archive/2026-07/`). **`#401`** A.4 SEO evidence (Attributer as 7th competitor export).

### 🔴 DO FIRST — KI-62 is half-wired (only step 1 of 3 done)

KI-62 (refund attribution inheritance) is a **3-step chain**. Refunds still net into **Direct** until step C lands — it **fixes nothing** until then. Not urgent (prod has 0 refunds) **but it is the money rail — land it before any real Stripe customer with refunds goes live.**

1. **`#399` (DONE)** — stamps `original_conversion_event_id` on refunds + the pipe **PROJECTS** it. **In repo, NOT deployed to prod Tinybird** (prod is on deployment 21).
2. **A (REQUIRED, FRESH HEAD) — deploy that pipe to prod.** Use `docs/tinybird_cutover_runbook.md` (merged `#398`). Founder-gated, `TB_TOKEN`-scoped, **re-point `.tinyb` to staging after** (KI-58). **CC has NO Tinybird creds — the deploy is the founder's.**
3. **C (REQUIRED) — inheritance PR.** Nightly reads the pointer, copies the original conversion's attribution **VERBATIM** onto the refund, marks **not-found explicitly**. **BLOCKED until A deploys** (it reads the column A projects). CC's full STEP-1 investigation this session **IS the spec — carry it verbatim**:
   - pointer stored in **`custom_properties` jsonb**, **NEVER `external_event_id`** (the partial unique index would drop the refund entirely);
   - **subscription refunds stay `refund_unresolved` in v1** (founder-confirmed).

### NEXT PRIORITIES (founder to sequence — after KI-62 A→C)

- **Item 14 — sessions / conversion_rate gated on EVERY dimension.** CVR is dead everywhere. **Highest-value product hole.** Needs a pipe (§3 FEATURE_MAP).
- **Item 2 — API-key UI.** Backend built (`api-key-scopes.js`); no UI to generate/view/revoke. **Self-serve blocker, UI-only, tractable.**
- **Item 10 — conversion/sites/seats caps advertised but not enforced** (only pageviews metered). Truth + revenue-leak.
- **STRATEGIC FORK (founder call):** app product-holes vs. building the **Astro marketing site**. The 870-line LOCKED `website_seo_plan.md` is **entirely unbuilt**; phptravels is a live beta target with no site to point at. **Orchestrator leans product-holes-first** (a site driving signups to dead-CVR converts poorly) — but this is a launch-sequencing call, yours to make.
- **MCP attribution server — LOCKED to V1.1. Do NOT build pre-launch.** Backlogged.

### BACKLOGGED (deliberately, not forgotten)

- **Stage-2 cleanup (dead code)** — needs **knip/depcheck, NOT grep** (the grep orphan-detector failed **twice** this session, flagging live files as orphans). Known candidates: `tracker/analytics.js` (delete, post-`#388`), FunnelChart endpoint (deleted UI, live endpoint), `attribution-engine.js:2437` (dead behind a `throw`).
- **Stage-3 dedup** — refund predicate inlined across 7 sites → an `excludeRefunds()` helper; **fold into KI-62 work** (same readers).
- **Second stale-doc batch** — `PAID_BETA_SESSION_PLAN`, `DEV_SESSION_CHECKLIST`, + UNKNOWN-verdict `MANUAL_QA_BACKLOG` / `QA_RUNBOOK` (need a **content read**, not a move).

### BETA — phptravels.com (over bookin.pk; same owner)

Open with **"why did Usermaven come out?"** — they **evaluated + removed Usermaven** (commented out in `footer.php`), run **GA4/GTM/Meta** on a **deferred-interaction loader that misses short bounces**, and **deep-link 7 AI platforms they can't measure**. **Stripe-first (Phase 7 applies).**

### STANDING DISCIPLINE NOTE — keep the investigate-before-build gate

An agent investigation **corrected a confident orchestrator claim 5 times this session** (dead import, safe unification, registration drift, conflict file, stale counts) — each with a citation, each right. **The step-1 investigate-before-build gate is why. Keep it.** The repo-review **7/10 rating stays WITHDRAWN as inauthentic** (grep + file-sizes, no logic read) **until a session reads `attribution-engine.js` end-to-end.**

### ⚠️ TRAPS — Tinybird (read before ANY `tb` command; see KI-58 / KI-59). **Full procedure: `docs/tinybird_cutover_runbook.md`.** — STILL CURRENT

1. **The MAIN worktree's `tinybird/.tinyb` is authenticated to PROD**, `TB_TOKEN` unset — `tb --cloud deploy` from that directory hits **production with no prompt**. **ALWAYS read the `Running against Tinybird Cloud: Workspace <X>` line** every `tb --cloud` command prints. `tb --cloud workspace ls` lists only `imubaid93_workspace` and does **NOT** show the workspace you're actually pointed at — it is **not** a reliable check.
2. **Deploys need `st_staging_deploy` (`WORKSPACE:DEPLOY`).** The default token → `workspace requires scope WORKSPACE:DEPLOY`. Pass the token **inline, single-quoted**, for one command: `PD='<token>'; TB_TOKEN="$PD" tb --cloud deploy; unset PD`. **Do NOT use `pbpaste`** (it captures whatever was last copied — usually the command, not the token) and **NOT `read -rs`** (silently returned empty twice on 2026-07-24). Don't re-auth `.tinyb` to prod.
3. **`TB_TOKEN` persists in a shell** and silently overrides `.tinyb` for every later command. **Unset it explicitly** after use.
- **Staging dashboard = `https://sourcetrack-dashboard-staging.up.railway.app/`** — the `-production` URL is PROD. **Browser cache masks fresh deploys** — hard-reload before concluding a change didn't ship.

### ORCHESTRATOR TOOLING NOTE — reason about PROD from ORG-LEVEL datasources, not staging data — STILL CURRENT

The orchestrator's Tinybird MCP is bound to **ST_Staging**, and this caused **four** wrong conclusions in one session, all in the same direction — **reasoning about PROD from STAGING data**: the `de200000-refd` phantom refund row; the `'tiktok'` fixture that masked the real `first_touch_source='stripe'` behaviour; the `privacy_signals` "0 rows" KI, which was simply staging having no GPC traffic; and a claim that Railway MCP could not see the SourceTrack project, when it is there under the name **`determined-reverence`**.

What actually reaches prod are the **ORG-LEVEL service datasources**, readable from the staging-bound connection:

- `organization.workspaces` → all workspace ids incl. prod `SourceTrack` (`3c371bb9-2021-429c-b0d7-0758bff75f9d`)
- `organization.pipe_stats` → per-workspace pipe call/error counts
- `organization.datasources_ops_log` → append/create ops per workspace; this is what proved `privacy_signals` works in prod

**Reach for `organization.*` before concluding anything about prod.** They expose operational **metadata only**, not row-level event data.

---

## 1. PRODUCT (enduring context)

Privacy-conscious multi-touch **revenue attribution** SaaS. Tinybird (ClickHouse) is the event
store; Supabase holds accounts + the money rail `attributed_conversions`. PostHog decommissioned
2026-07-19 (project 416017 deleted). Repo `Ubaidofficial/SourceTrack`.

**Positioning:** "Know which source actually drove the sale — not just the visit."
**Primary GTM moat:** GSC SEO-revenue attribution — **still unvalidated end-to-end.**

**Versioning:** there has never been a `v0.x` scheme. Scheme is **free beta → V1 → V1.1 → V2**.
We are **pre-V1, in beta**. `package.json` says `1.0.0` (scaffold default, meaningless).

---

## 2. HOW TO START

1. Confirm `origin/main` head is `3aec70f` (the `#381`–`#401` push).
2. **Decide the KI-62 step-A deploy** (founder-gated, fresh head) — it unblocks step C; nothing else in the refund rail moves until then.
3. Take the **STRATEGIC FORK** call (product-holes vs. Astro marketing site) — it sequences everything after KI-62.

**To recover full detail from the last session** (dispatch texts, SQL output, CC reports, the KI-62
STEP-1 investigation): use `conversation_search` — the transcript file does not carry across chats.

Do **not** take any claim in this handoff as verified-today — re-check anything you're about to act
on. **Flag contradictions rather than adapting silently** (that gate corrected 5 wrong calls this session).
