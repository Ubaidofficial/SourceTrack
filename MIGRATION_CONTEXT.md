# MIGRATION_CONTEXT.md
**The reference ledger for the PostHog → Tinybird migration.**
Last verified: **2026-07-12** (Session 142)

> ⚠️ **`SESSION_HANDOFF.md` is a chronological journal — "what happened, when."**
> **THIS file is the reference ledger — "what is true, and what is a trap."**
> When they disagree, **this file wins**, because the journal preserves claims that were later disproved.

---

# 🔴 RULE ZERO: NEVER VERIFY BY ABSENCE

**No error is not proof of success.** On 2026-07-12, **nine** failures hid behind a green tick,
an empty response, or a silent skip:

1. Nightly wrote `status='success'` for 16 days while processing **zero** conversions
2. Tinybird pipes returned `null` → silent HogQL fallback
3. `ALTER TABLE` → *"Success. No rows returned"* — says nothing about whether it worked
4. `tb --cloud deploy --check` → *"No changes to be deployed"* — it meant *"I can't see your files"*
5. An LLM returned `severity:"ok"` and **suppressed the production Slack alert**
6. `SCHEMA_CI_ENABLED` set as a *secret* not a *variable* → the CI check silently skipped
7. `schema-drift` ran in `0s` and the run still reported ✓
8. `railway logs` returned nothing (cron services have no logs when idle)
9. A stale version number stated as fact from memory

**➡️ Require the POSITIVE signal.** `served pipe 'X' rows=N` · `count(*) = 6` ·
`grep -c "CREATE TABLE" > 20`. **Never "it didn't error."**

---

# 1. WHERE THE MIGRATION ACTUALLY IS

## ✅ WRITES — 100% cut over (2026-06-29)
- `stripe-webhook.js` — `ph.capture` removed (`03670da`)
- All 3 pageview writers — `proxy.js:124`, `track.js:406`, `pixel.js:137` ("Wave-2")
- **`git grep ph.capture` in `api/` returns NOTHING.**
- **➡️ POSTHOG IS A DEAD STORE. It receives nothing.**

## ✅ READS — CONFIRMED FLIPPED
| path | evidence |
|---|---|
| **Nightly attribution** — both legs (conversions + touchpoints) | Session 142, PRs #184/#185. `served pipe 'nightly_conversions_by_site' rows=1` + `served pipe 'pageviews_by_visitors' rows=1` |
| **`runBackfill`** | `5aa79a9` |
| **`health-agent.storeConversionCount()`** | Session 142 |
| **Sessions path** (`/api/sessions/overview`) | **Session 141** — verified on **staging** (72 sessions / 12 conversions / **$962** / 1.3 pv-per-session / avg 11s, daily series intact). ⚠️ **STAGING ONLY — prod unverified.** |

⚠️ `--reprocess` **still uses HogQL — correctly.** The pipe cannot express the site_key suffix `LIKE`.
**That is intentional. Do not "fix" it.**

## 🔴 READS — THE UNANSWERED QUESTION (THIS IS THE WHOLE MIGRATION)

**NOBODY HAS EVER ENUMERATED THE REMAINING POSTHOG READERS.**

Every `queryPostHog` / HogQL fallback path across the API routes still exists. Until each is
listed and **proven pipe-served**, PostHog cannot be switched off.
**This is the real "how close to decommission" answer, and it has never been computed.**

### Known leads to start from (from the journal — not exhaustive)
- 🔴 **`api/routes/analytics.js` → `/api/analytics/sources`** — Session **140P-MS-JOIN** describes it
  joining Supabase `pageviews` ↔ `attributed_conversions` **"(sourced from PostHog)"**.
  **Verify whether this still reads PostHog.**
- 🔴 **`findMatchingPageview`** (`analytics.js`) — the **5-second tolerant matcher** with source
  alignment. Built specifically because *"PostHog pageviews are captured with client-side/adjusted
  timestamps, whereas legacy Supabase pageviews use server-side ingestion timestamps."*
  ⚠️ **If both sides now come from Tinybird, this tolerance window's premise may no longer hold —
  or may now be masking a real bug. RE-EXAMINE IT.**
- 🔴 **`analytics.js` second-level timestamp rounding** (`Math.floor(ts/1000)`, Session 140P-RB-DIM-2)
  — added to reconcile *"PostHog's UUID-v7 ingestion milliseconds vs Supabase's `000`-ms pageview
  timestamps."* **Same question: does the premise still hold post-cutover?**
- **Known-untested paths** (Session 140P-MS-JOIN's own audit): **GSC · Reverse Proxy · Leads Journey**
- **See `core_product_audit_ci_hardening_map.md`** — it already contains a per-feature verification
  table (test existence, seed reconciliation, whether it runs in CI). **START THERE.**
- **`ai-chat.js:158`** — LLM-HogQL feature. ❌ **CUT from the migration. DO NOT PORT.**

### The brief for CC
> *`git grep` every live call site that reads PostHog/HogQL. For each, report: `file:line` · what it
> serves · whether a Tinybird pipe exists · whether that pipe is in `TINYBIRD_READ_PIPES` · and
> whether it has ever been proven pipe-served (the POSITIVE `served pipe` log line — **never** the
> absence of a fallback warning). Produce a table. **That table IS the migration's remaining scope.**
> Nobody has ever computed it.*

---

# 2. 🔴 TRAPS — READ BEFORE TOUCHING ANYTHING

### T1 — STORE-DEPENDENT IDEMPOTENCY KEY
PostHog `uuid` **≠** Tinybird `event_id`. The upsert keys on `(site_id, conversion_event_id)`, so the
**same conversion read from two stores INSERTs twice and DOUBLE-COUNTS REVENUE.**
*(This already happened once on 2026-07-12; the duplicate was found and deleted.)*
**➡️ NEVER run `--reprocess` on a site with post-cutover conversions. Use `--backfill-site`.**

### T2 — `supabase/migrations/` CANNOT REBUILD THE DATABASE
`ERROR: relation "sites" does not exist`. **There is NO `CREATE TABLE sites` migration anywhere.**
The earliest is an `ALTER` on a table nothing creates. `sites` exists only inside two live Postgres
instances. **You could not restore SourceTrack from this repo.** (PR #190)
⚠️ The baseline needs `migration repair --status applied 00000000000000` on **BOTH** DBs — `pg_dump`
emits plain `CREATE TABLE`, so without repair the next `db push` errors `relation already exists`.

### T3 — THE BAG-FIELD TRAP
`JSONExtractString` returns **`''` (empty string), NEVER NULL**, for a missing key.
**Always wrap: `count(DISTINCT nullIf(JSONExtractString(...), ''))`** to match HogQL semantics.

### T4 — SILENT 403 FALLBACK
Prod's Tinybird read token was once **single-pipe-scoped** → **13 of 14 allowlisted pipes 403'd
SILENTLY** → HogQL fallback → **every "flip" was inert.**
**➡️ Verification requires `[tinybird-read] served pipe 'X' rows=N`. Never the absence of a warning.**

### T5 — TINYBIRD DEPLOY ORDER
**Deploy the pipe FIRST, then flip the allowlist.** A flip without the deploy = silent fallback.
**`TINYBIRD_READ_ENABLED` is a LIVE RAILWAY ENV VAR, not a commit.** Code-only audits miss it —
**always check both.**

### T6 — RAILWAY "SYNC" OVERWRITES PROD FROM STAGING
82 changes across `SourceTrack-Api` (24), `Dashboard` (13), `nightly-attribution` (6). **NEVER PRESS IT.**

### T7 — NEW CRON SERVICES: START COMMAND *BEFORE* VARIABLES
With credentials and no start command, `npm start` → `node api/bootstrap.js` → **it boots a THIRD
PRODUCTION API SERVER.** With no credentials it merely crash-loops. **Config first. Variables last.**

### T8 — TWO SEPARATE STRIPE WEBHOOKS. NEVER CONFLATE.
1. **`api/routes/billing.js` → `billingWebhookHandler`** — **SourceTrack's OWN billing/entitlements.**
   Sets plan state on `sites`. In-memory NodeCache dedup. **Records no revenue.**
   ✅ LIVE endpoint verified correct: `https://api.srctk.com/api/billing/webhook`, 0% errors.
2. **`api/routes/stripe-webhook.js` → POST `/api/webhooks/stripe/:site_key`** — **customers' buyers'
   purchases**, ingested as `$conversion` for attribution. DB idempotency via
   `revenue_idempotency_keys` / `claim_revenue_idempotency_keys`.

---

# 3. LOCKED DECISIONS — do not relitigate

### Identity (LOCKED)
- **Faithful per-query identity:** each ported read uses the **EXACT** identity key its live HogQL
  query actually uses — **traced from source, never assumed.**
- `fetchPageviews`'s `PAGEVIEW_FIELDS` map aliases output `anonymous_id` → the raw `distinct_id`
  **typed column**. Only **`live.js:22`** genuinely reads the bag field `properties.anonymous_id`.
- ✅ **VERIFIED 2026-07-12:** within Tinybird, a stitched conversion's `distinct_id` **equals** the
  visitor's pageview `distinct_id`. **The join works.**

### Money-rail bar
Any **write-path** rewrite (e.g. `nightly:565` N+1) requires **byte-identical validation** — not a
"same aggregate result" shortcut.

### Revenue rail reality (verified)
- **MRR-by-source and trial→paid are NOT BUILT.**
- One-shot purchase → `$conversion` ingestion + DB idempotency **DO work** — proven E2E 2026-07-12.

### Product / positioning (LOCKED)
- 🔴 **§26 HARD GUARDRAIL:** **no LLM-narrated freeform revenue/ROAS/attribution numbers.** No fake
  recommendations or predictions. "AI summaries everywhere" is ruled out.
  *(The DeepSeek health-agent LLM deleted on 2026-07-12 was violating this — **and it had veto power
  over the production alarm.**)*
- ❌ **Privacy moat vs SourceLoop does NOT hold** — do not publish privacy-advantage claims.
  ✅ **Cometly privacy contrast IS safe** and documented.
- **AI source naming is not an exclusive moat** — but depth of classification (22 named domains,
  dedicated tab) remains differentiated.
- **CAPI is a proof-point, not a position** — do not lead with it.
- **Ruled out for V1.0:** heatmaps · session replay · two-way CRM sync.
- **AI agentic features → V1.1:** attribution MCP server · NL→Report Builder · anomaly watcher.
- ✅ **`sourcetrack.getToken()` IS BUILT** (`tracker.js:444`) **AND DOCUMENTED**
  (`Integrations.jsx:1151` Stripe / `:1281` Shopify). *(Asserted unbuilt twice on 2026-07-12 — wrong
  both times. **VERIFY, DON'T REMEMBER.**)*

---

# 4. TINYBIRD LESSONS (hard-won — do not rediscover)

- 🔴 **`tb --cloud deploy --check` is a MANDATORY pre-deploy gate.** It injects `__no_value__`
  placeholders. A read-only `tb sql` with real values **structurally cannot** catch param-declaration
  or SQL-structure errors. **`--check` caught ~15 deploy-blockers that parity testing missed.**
- **DateTime params:** `{{DateTime(param, required=True)}}` **directly — no `toDateTime()` wrapper.**
  Optional: `{{DateTime(param,'1970-01-01 00:00:00')}}`.
- **Timezone strings:** `{{String(tz,'UTC')}}` — **not** `required=True`. `__no_value__` breaks
  `toTimeZone()`.
- **Array params:** repeated query keys (`visitor_ids=X&visitor_ids=Y`). Verified against deployed pipes.
- ⚠️ **`events_latest`'s `search_filter` is NOT reliable for isolation checks** — it silently returned
  0 rows for a `distinct_id` independently confirmed to exist. **Use unfiltered queries and compare.**
- **CLI:** `tb token copy <name>` is misparsed — **copy full token values from the UI.**
  `PIPES:READ` static scope **does not exist** (JWT-only). A shared static token = `WORKSPACE:READ_ALL`.
- **`tb --cloud deploy` is project-wide and auto-promotes by default.** `tb deployment ls` = history.
- ⚠️ **Staging Tinybird UNRESOLVED:** `--check` reported *"No changes to be deployed"* while on the
  correct branch with the pipes present. **Never explained.** Prod deployment #9 succeeded, but
  **staging may not have `nightly_conversions_by_site`** → **any staging pipe/harness result is
  unverified until this is settled.**

### Parity method
**The intersection method** — match on `distinct_id`s present in **BOTH** stores = TRANSLATION-OK;
mismatch = **STOP**. Compare timestamp **intervals**, not absolutes (PostHog's +offset ingestion
correction cancels out).
🔴 **Always verify by your OWN `distinct_id`** — never by raw `count()` or `max(timestamp)`.
Synthetic `site-00…site-04` data and future-dated rows **repeatedly faked success in aggregate queries.**

---

# 5. 🔴 TOKENS REQUIRING ROTATION (cumulative)

**Prior sessions:** `st_endpoint_read` · `dual_write_append` · Tinybird **workspace admin token** ·
Tinybird **MCP connector token**

**Added 2026-07-12 (~8 exposures total):**
- **Prod Tinybird deploy token** (`4b9a2d42`, `WORKSPACE:DEPLOY`) — exposed 4×
- **Two prod Tinybird tokens leaked in plaintext by Antigravity** — **despite an explicit, bolded
  instruction not to**

⚠️ **RULE:** never paste `tb token ls` output or any token value into chat. **UI copy → straight into
the target field.** Prefer `tb login` (browser auth) over `TB_TOKEN`. Store in Keychain/1Password.
*(`pbpaste` into an exported shell variable is the reliable terminal workaround — never `read -s`,
never inline paste into a multi-line command.)*

---

# 6. LAUNCH GATES (blocking, independent of migration)

| item | status |
|---|---|
| **GDPR erasure** (`tinybird/adapter/erase.js`) | **BUILT · TESTED · ZERO CALLERS.** Plus an `events_quarantine` hole where subject data survives erasure. **LAUNCH GATE.** |
| **Quarantine alarm** (`api/lib/quarantine-alarm.js`) | **BUILT · TESTED · ZERO CALLERS.** A quarantined `$conversion` = silent revenue loss. Host exists (`sourcetrack-health`). |
| **`data-quality-check.js:299`** | `insertGlobal` is a **`console.log`-only no-op stub.** *(Layer seven of the seven that lied.)* |
| **Baseline migration** (PR #190) | The repo cannot rebuild the DB. |

---

# 7. PRE-CUTOVER REVIEW ITEMS (close before Phase 10)

- **`flexible_report:2457`** — parity diff vs live HogQL. BLOCKED, needs founder investigation.
- **SEO-revenue organic fixture gap** — no organic-referrer fixture exists; founder must seed.
- **Null → DEFAULT / Nullable-vs-DEFAULT DDL decision.**
- **Merged-identity coverage** — `visitor_id` ≠ `distinct_id`, no fixture.
- **Dual-write adapter divergence** — `browser_name='webkit'` (Tinybird) vs `None` (PostHog).
- **Retry-transport-at-boot wiring** — 429/5xx are **not retried**.
- **`README:114`** — wrong-host note. ⚠️ Prod's actual `TINYBIRD_HOST` **is** `https://api.tinybird.co`
  — **verify which is correct before "fixing" it.**
- **Static-audit `{% if %}` detection hardening** (`task_7125c321`).
- **Phase 8 tenant isolation** — runtime test genuinely PASSED (LEAK A→B = 0, B→A = 0). But the
  **static audit's "59/59 PASS" is CC-self-reported and was never independently read.**
- 🔴 **Phase 9 harness — ALL PRIOR STAGING RESULTS ARE SUSPECT.** Staging was **13 columns behind**
  on `sites` until 2026-07-12, and staging Tinybird may not have the new pipe. **Re-validate from
  scratch.** (Claimed 4/9 models pass; `last_touch` + `ai_platforms` have no harness at all.)

---

# 8. HYGIENE (real, small, non-blocking)

- 🔴 **`sourcetrack-dq` cron order is WRONG** — runs `0 0`, **BEFORE** `nightly-attribution` (`0 2`).
  **It has been checking the previous day's output every single night.**
- 🔴 **`sourcetrack-email` runs the API SERVER** — start command is `Default` → `node api/bootstrap.js`
  on a weekly cron → never exits → Railway marks it failed. **That's the 6-day red.**
  Fix: Custom Start Command `node api/jobs/email-reports.js` · Restart Policy `Never`.
- **Resend:** API key unset · `from:` uses apex `sourcetrack.ai` but **only `mail.sourcetrack.ai` is
  verified** → **change the 2 hardcoded from-addresses.** Also `techrupt.pk` has **no owner email**
  → at launch, a customer with no owner email **silently receives no reports.**
- **`sourcetrack-anomaly`** — exists in **staging only**, not prod. Has **never run**.
- **Stray `SourceTrack` service in prod** (from the cancelled Sync) — discard.
- **Stale sandbox billing webhook** (`sourcetrack.ai/...`, 100% error) — delete.
- **Remove `DEEPSEEK_API_KEY` + `AI_PROVIDER`** from `sourcetrack-health` (LLM deleted in #184).
- **Branch protection + Railway "Wait for CI"** — both **OFF**.
- **`site_key = 1`** — junk row in prod `sites`.
- **`nightly:565` N+1** — touchpoint read is per-conversion (pre-existing; now on Tinybird).
- **`dashboard/railway.json`** sets **repo-level** Railway config, conflicting with project-wide IaC
  (why the Dashboard is `ON_FAILURE` while crons are `NEVER`).
- **Docs copy fix** — tell merchants to call `sourcetrack.getToken()`, not read the raw `st_aid` cookie.

---

# 9. KEY IDENTIFIERS

```
Repo: Ubaidofficial/SourceTrack   local: /Users/ubaid/Desktop/trackiq   main: 4b6f0ef

Supabase PROD    zxjjjsipafojhzkkumvh  (EU, eu-west-1)
Supabase STAGING nrsvpwzekfrdrzkoecfk
Tinybird PROD    SourceTrack / 3c371bb9   (https://api.tinybird.co)
Tinybird STAGING ST_Staging  / 3ad4c1a8
PostHog          prod 416017 / staging 469905   — BOTH DEAD STORES

Railway "determined-reverence":  prod dc68ba7b | staging 74a58dbc
  SourceTrack-Api 4b946535 (api.srctk.com)  |  Dashboard 384ca0ac (app.sourcetrack.ai)
  nightly-attribution 4e064f4e (0 2 * * *)  |  sourcetrack-dq 9278c467 (0 0 — WRONG ORDER)
  sourcetrack-health f15924b7 (*/30)        |  sourcetrack-email 5656176f (broken start cmd)
  sourcetrack-anomaly b0ba6f2e (STAGING ONLY — never run)

PROD site techrupt.pk:  id  eb7f68c3-a2b7-4224-a8d0-56ac1e831511
                        key 473fba5e-f035-4f7c-83cf-1cb1d678ab7f
STAGING fixture "SourceTrack Demo (SaaS)":
                        id  de200000-babe-41d4-a716-446655441111
                        key de200000-babe-41d4-a716-446655440000
Stripe sandbox: acct_1TYxLLLZY0IPZEmw (staging = sk_test_ ✅)
```

---

# 10. AGENT GOVERNANCE (non-negotiable)

- **CC (Claude Code):** files/logic/git. **No Railway, no browser, no secrets, no prod-DB writes.**
  Never self-merge. 7-cmd bundle + **CI green on the exact head SHA.** Raw diff required.
  **DDL is founder-gated.**
  *(CC's judgment has been excellent — it caught the LLM alarm-veto, spotted the missing `runBackfill`
  repoint, flagged the `migration repair` requirement unprompted, and **refused to fabricate DDL it
  couldn't verify.** **Treat its pushback as signal.**)*
- **Antigravity:** browser / **read-only**. ⚠️ **Violated boundaries 3× on 2026-07-12** — leaked two
  PROD Tinybird tokens in plaintext *after an explicit instruction not to*, and wrote to the repo when
  told config-only. **Never give it secrets.**
- **Orchestrator:** planning + verification. Supabase MCP (both envs) · Tinybird MCP (staging) ·
  PostHog MCP (prod). **Agent self-reports are CLAIMS, not FACTS — verify independently.**
- **Merges:** one PR per branch · squash · **founder merges** · **wait for CI GREEN, not pending.**

---

# 11. 📋 THE PLAN TO FINISH THE MIGRATION

### PHASE A — Unblock (~1 hour)
1. **Merge #189** (supabase CLI pin `@v3` / `2.101.0` — CI green)
2. **Finish #190 (baseline):** reset prod DB password (**long, ALPHANUMERIC ONLY** — special chars
   break the URL) → `supabase db dump` → ⚠️ **verify `grep -c "CREATE TABLE" > 20`** →
   `migration repair --status applied 00000000000000` on **BOTH** DBs → `supabase db reset --local`
   clean. **Expect it to then fail on a non-idempotent historical `ALTER` — that's the check working.**
3. **Rotate all tokens** (§5)

### PHASE B — 🔴 THE ACTUAL MIGRATION
4. **ENUMERATE EVERY REMAINING POSTHOG READER** (§1, the CC brief). **Start with
   `core_product_audit_ci_hardening_map.md` and `analytics.js`.**
5. **Port / verify each** against that table.
6. **Prove each is pipe-served IN PROD** — require `served pipe 'X' rows=N`. **Never absence.** (T4)

### PHASE C — Launch gates
7. **Wire GDPR erasure** (§6) — **launch gate**
8. **Wire the quarantine alarm** (§6)
9. **Fix `data-quality-check.js:299`** (the no-op stub)

### PHASE D — Cutover
10. **Rebuild the Phase 9 validation harness** — ⚠️ **all prior staging results are void.**
11. **Decommission PostHog** — only after step 6 proves every reader is pipe-served.

---

**2026-07-12 scorecard:** a 16-day money-rail outage found and closed · seven monitoring layers made
honest · an LLM stripped of veto power over the production alarm · **$444.44 recovered** · both
databases converged · a drift check that found the missing baseline on its first run · and — **for the
first time in the product's life — proof that SourceTrack attributes a real purchase to the real
marketing source that earned it.** Zero customers affected.
