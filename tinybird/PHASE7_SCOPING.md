# Phase 7 — Refunds / GDPR-Tinybird / Quarantine-Alarm SCOPING — PLAN ONLY, NO CODE

> **Status:** DRAFT for founder review. Uncommitted, no PR. Verified at HEAD `9f7f3f3` (branch `claude/tinybird-phase1-events-schema`, post-#91/#92/#93/#94/#95/#96) — every present/absent claim below is grep/read evidence from THIS HEAD, not the prior handoff.

---

## ITEM 1 — Refund handler (money-rail)

### Verdict: VERIFIED-ABSENT as a producer — with VERIFIED-PRESENT adapter groundwork the plan must honor

- Producer: `grep -rniE "refund|charge\.refunded|refund\.created" api/` → **zero hits in any route/lib/job**. The webhook's event gate ([stripe-webhook.js:219-224](../api/routes/stripe-webhook.js)) routes `SUBSCRIPTION_EVENTS` + `checkout.session.completed` and returns `{ignored: true}` 200 for everything else — every Stripe refund event is dropped today. No negative `conversion_value` is emitted anywhere in `api/`.
- Groundwork (NOT in the stale handoff): the adapter already **locks the refund contract in committed tests**:
  - [normalize.test.js:39-44](../tinybird/adapter/__tests__/normalize.test.js) — "a refund stays a signed negative conversion" (signed-sum nets, §9-conformant).
  - [derive-event-id.test.js:80-94](../tinybird/adapter/__tests__/derive-event-id.test.js) — the **stamped-refund contract**: a refund MUST arrive with its own explicit `event_id`; an UNSTAMPED refund that only reuses `order_id` **collides with the original purchase and is dedup-dropped** (documented hazard, test-locked). `deriveEventId` has no refund-awareness by design.

### Traced attach point (the real path a refund producer joins)

`POST /:site_key` checkout path, in order: signature verify → idempotency claim ([:283-295](../api/routes/stripe-webhook.js): `claimIdempotencyKeys(siteKey,'stripe',[provider_event_id, order_id, payment_id])`, with the existing claim/rollback-on-failure pattern) → identity resolve → plan-limit → `ph.capture({event:'$conversion'})` → `dualWriteEvent(...)` ([:399-412](../api/routes/stripe-webhook.js)) → `logIngestionEvent`.

### Plan

1. **Event choice (open Q1):** prefer `refund.created` over `charge.refunded` — 1:1 with refund objects, carries its own `re_…` id (clean idempotency key + partial refunds arrive as separate refund objects). Add it to the gate as a third branch.
2. **Emit a compensating `$conversion`**: `conversion_value = -(refund.amount/100)`, `conversion_type: 'refund'`, currency from the refund, `occurred_at` from `event.created`. Same property bag shape as the purchase path.
3. **Stamping (non-negotiable, test-locked):** set an explicit distinct event id (e.g. `conversion_event_id`/`event_id` = the `re_…` refund id, or `${originalOrderId}:refund:${re_id}`) so `deriveEventId` resolves the stamp — NEVER pass only the original `order_id` (collision → silent dedup-drop of the refund; that is exactly the hazard the committed test guards).
4. **Idempotency:** its own key set — `provider_event_id = event.id`, plus `refund_id = re_…` — through the same `claimIdempotencyKeys` path (per-site, per-provider). Follow the file's existing claim→write→rollback-on-failure ordering exactly.
5. **Identity:** resolve `distinctId` the same way the purchase path does (charge → payment_intent / customer → `resolveWebhookAnonymousId`). Fallback when unresolvable: `webhook_customer_id` bag, anonymous distinct id — same as purchases.
6. **Dual-write:** the identical `ph.capture` + `dualWriteEvent` pair. Tinybird signed-sum MVs then net correctly with zero aggregate-side changes (§9).
7. **⚠️ Known downstream interactions to decide BEFORE build (not after):**
   - **[nightly-attribution.js:559](../api/jobs/nightly-attribution.js)** (`processConversion`): `if (convValue < 0 …) { skip }` — the Supabase `attributed_conversions` rail will **ignore** refunds. Tinybird nets; Supabase doesn't. Decide: extend nightly to net refunds into the Supabase rail, or explicitly declare refunds Tinybird-only for now (and label any Supabase-sourced revenue accordingly — §6 truth rules).
   - **Plan quota:** should a refund consume `claimConversionUsage`? (Recommend: no.)
   - **PostHog-read dashboards:** verify no live revenue query filters `conversion_value > 0` before assuming HogQL sums net.
8. **Money-rail bar:** this is a WRITE-PATH addition → per standing rule it needs write-path validation (staging Stripe test refund fired end-to-end, both stores inspected row-level), not just "aggregates look right." Founder-gated execution; the Phase-9 harness gains a refund fixture only after the producer exists.

**Open questions (founder):** Q1 event type (`refund.created` recommended); Q2 partial-refund semantics (multiple compensating events per order — confirm); Q3 the nightly/Supabase netting decision (7a); Q4 quota treatment; Q5 historical refunds backfill or forward-only.

---

## ITEM 2 — GDPR erasure, Tinybird leg (launch gate; destructive)

### Verdict: PARTIAL — PostHog + Supabase erasure VERIFIED-PRESENT; Tinybird leg VERIFIED-ABSENT

- Present: [gdpr.js](../api/routes/gdpr.js) has `DELETE /api/gdpr/visitor` and `DELETE /api/gdpr/account`. Traced (pasted in the scoping session): Supabase deletes (`attributed_conversions` by `site_id + anonymous_id`, identity links both by anonymous_id and resolved user_ids) + `deletePostHogPerson()` (:45-69 — Persons REST, `?delete_events=true`, best-effort/never-blocks). Per-site retention purge is app-side and tenant-scoped ([retention-purge.js](../api/lib/retention-purge.js)) — already §10-conformant.
- Absent: `grep -c "tinybird\|delete_condition" api/routes/gdpr.js` → **0**. Any events dual-written to Tinybird (pageviews + conversions, all producers wired as of Phase 2c) have **no erasure path**.

### Plan

1. **New adapter module** (e.g. `tinybird/adapter/erase.js`): `POST {TINYBIRD_HOST}/v0/datasources/{ds}/delete` with `delete_condition = site_id = '<site_id>' AND (distinct_id = '<anon>' OR visitor_id = '<anon>' OR anonymous_id = '<anon>')` — all three identity columns, since `normalize.js` can resolve them differently for merged identities.
2. **⚠️ MV coverage:** a delete on `events` does NOT propagate to materialized targets. `events_by_visitor` needs its own delete with the same condition. Enumerate every datasource holding subject rows (today: `events`, `events_by_visitor`; plus the auto-created `events_quarantine`, which can hold subject rows that failed validation — include or explicitly exempt with reasoning).
3. **Token:** the delete API is **ADMIN/data-ops scope** — a founder-held token (`TINYBIRD_ADMIN_TOKEN` env on Railway, never in repo, never the append/read tokens). The module hard-fails to no-op with a loud log when unset.
4. **Destructive gating:** before each delete, run a COUNT with the identical condition via the SQL API and log it (dry-run evidence); then issue the delete; Tinybird's delete is an **async job** — record the job id, and poll or persist for follow-up. Audited twice: Tinybird's own ops log + an app-side erasure log.
5. **Wiring:** called from both gdpr.js routes after the PostHog leg. Posture decision (open Q3): the PostHog leg is silent-best-effort; for a launch-gate GDPR flow, recommend at minimum durable failure recording (an `erasure_log` row → **DDL → migration file only, founder applies**, §8) so a failed Tinybird delete is retryable and provable, not silently swallowed.

**Open questions (founder):** Q1 admin-token provisioning (staging + prod) and storage; Q2 exact datasource list to cover (incl. quarantine yes/no); Q3 best-effort vs durable-retry posture (+ the `erasure_log` migration); Q4 acceptable async-completion SLA (GDPR allows up to 30 days — polling vs fire-and-record); Q5 staging first, then prod, with a founder-run test erasure of a synthetic visitor as the gate.

---

## ITEM 3 — Conversion-quarantine alarm (observability)

### Verdict: VERIFIED-ABSENT in repo code — but the quarantine BUCKET itself is a Tinybird built-in, so the gap is detection, not plumbing

- `grep -rn "quarantine" api/ tinybird/ --include=*.js|*.mjs|*.datasource|*.pipe` → **zero code hits** (docs only).
- Tinybird auto-quarantines schema-invalid rows into `events_quarantine` per datasource — nothing to create. But **nothing reads it**:
  - [transport.js](../tinybird/adapter/transport.js) ignores the Events API response body — `grep "quarantined\|successful_rows" tinybird/adapter/*.js` → zero. The API returns `{successful_rows, quarantined_rows}` per POST; today a quarantined conversion is 100% silent at write time.
  - [health-agent.js](../api/jobs/health-agent.js) (229 lines) checks: supabase, posthog (ping), api_health, nightly_job, sites_count, data_flow, conversions, deepseek, env_vars, agent_memory — **no Tinybird check of any kind**. (Note: §11's "repoint health-agent off PostHog" framing is stale — the agent is mostly Supabase-backed already.)

### Plan (two detection layers)

1. **Layer A — write-time (cheap, immediate):** `transport.js` parses the Events API response and, when `quarantined_rows > 0`, logs a rate-limited WARN (existing log-sampler) + includes the count. This touches the adapter's response handling only (no change to what is sent) — still flag it as write-path-adjacent for review under the money-rail bar.
2. **Layer B — authoritative poll:** a new health-agent check querying `SELECT event_type, count() FROM events_quarantine WHERE insertion_date > {last_check}` via the SQL API. Alert policy per §11: any quarantined `$conversion` → **CRITICAL (silent revenue loss)**; any other rows → WARN. Optionally extend to `datasources_ops_log` for append-error rates later; `pipe_stats_rt`/vCPU-spend alerts are §11 items but a separate batch — not smuggled in here.
3. **Dependencies:** a token able to read `events_quarantine` (verify at build whether the existing workspace read token can, or admin is required — open Q1); an alert channel (health-agent's existing output path / `SLACK_WEBHOOK_URL` — confirm which is live); a cadence (piggyback health-agent's existing schedule).

**Open questions (founder):** Q1 token scope for quarantine reads; Q2 alert channel + threshold sign-off (any-conversion=CRITICAL proposed); Q3 whether Layer A may land now (adapter response-handling touch) or both layers wait for one observability batch; Q4 retention of quarantine rows (Tinybird default) vs the GDPR item-2 interaction.

---

## Honesty ledger vs the prior handoff

| Handoff claim | Reality at 9f7f3f3 |
|---|---|
| "refund handler not started" | Producer: correct. BUT adapter contract (signed negative + stamped-id dedup boundary) is already committed and test-locked — the plan builds on it rather than designing from zero. |
| "GDPR Tinybird erasure not started" | Correct for the Tinybird leg (0 refs). A full PostHog+Supabase erasure flow EXISTS and is the attach point. |
| "quarantine alarm not started" | Correct — and additionally: the write path ignores `quarantined_rows` in API responses, and health-agent is Supabase-centric (spec §11's "off PostHog" framing is stale). |
