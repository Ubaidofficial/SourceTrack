# Docs Index

Trust tier per doc. **Precedence when sources conflict:** code → `KNOWN_ISSUES.md` → the doc. `KNOWN_ISSUES.md` outranks every other doc; **code outranks `KNOWN_ISSUES.md`.**

- **Authoritative** — verified against current code; safe to act on.
- **Maintained** — kept current, but verify a load-bearing claim against code.
- **Reference** — context/navigation; not proof a feature exists.
- **Historical** — point-in-time; do not treat as current.

## Authoritative

| File | Purpose | Tier |
|---|---|---|
| `KNOWN_ISSUES.md` | Verified bugs/gaps. **Outranks every other doc.** | Authoritative |
| `SYSTEM.md` | Backend contract — Tinybird read contract, pipe conventions, two Stripe webhooks, cookie spec, HTTP codes. (Rewritten 2026-07 — PostHog gone.) | Authoritative |
| `ARCHITECTURE.md` | Codebase map — routes (39), middleware, jobs/crons, data stores, pages. | Authoritative |
| `tinybird/SCOPE_v3.md` | Typed-column reference §2.6 for pipe SQL. **Not archived — stays in place.** | Authoritative |
| `CLAUDE.md` / `AGENTS.md` | Standing agent contract — safety limits, data-truth, pipe SQL rules, verification principles. | Authoritative |

## Maintained

| File | Purpose | Tier |
|---|---|---|
| `README.md` | Product overview, env vars, data residency, crons. | Maintained |
| `FEATURE_MAP.md` | What actually ships. ⚠️ **Can drift — its own §21 lesson ("verify against current code, not any inventory doc, including this one") applies to itself.** Corrected 2026-07 (funnels reframed as a dormant entitlement, not "sold"; §21 orphan-file receipts marked resolved with PR numbers). | Maintained |
| `docs/SourceTrack_GTM.md` | GTM & positioning. **Content frozen 2026-06-28**; never committed until #327. `FEATURE_MAP.md` §5 gates a **public revenue claim** on it — losing it risks an unverifiable marketing claim. Corrections log appended. | Maintained |
| `ATTRIBUTION.md` | Attribution truthfulness contract. | Maintained |
| `SUPABASE_SCHEMA.md` | Supabase tables/RLS/verification queries. | Maintained |
| `.env.example` | Canonical env template (includes the Tinybird block since #328). | Maintained |
| `IDENTITY_DESIGN.md` | Identity-stitching architecture. | Maintained |

## ⚠️ Stale — trust code / `KNOWN_ISSUES` / `FEATURE_MAP` over it

| File | Why | Tier |
|---|---|---|
| `DATA_CAPTURE_SPEC.md` | Its "PostHog properties" section describes a **deleted** store, and its "not built" list claims click-IDs are unbuilt — contradicted by `KNOWN_ISSUES.md §3` (click-IDs ARE captured) and `FEATURE_MAP.md §1`. A field-by-field re-audit against `tracker.js` + `tinybird/SCOPE_v3.md` §2.6 is a separate task. **Trust `KNOWN_ISSUES` + `FEATURE_MAP` over it.** | ⚠️ Stale |

## Reference (context / navigation — not proof)

`AGENT_BRIEF.md` · `PROJECT_CONTEXT_COMPACT.md` · `DEVELOPER_CONTEXT.md` · `RULES.md` · `DEV_SESSION_CHECKLIST.md` · `NEXT_SESSION_PROMPT.md` · `COMMANDCODE_RUNBOOK.md` · `QA_RUNBOOK.md` · `MANUAL_QA_BACKLOG.md` · `BUG_REVIEW_LOG.md` · `IMPLEMENTATION_GAP_LIST.md` · `IMPLEMENTATION_STATUS.md` · `CHANGELOG.md` — plus design/spec docs (verify implementation in code before claiming): `FIGMA_DESIGN_SYSTEM.md` · `FIGMA_TOKEN_IMPLEMENTATION_PLAN.md` · `BUSINESS_DASHBOARDS_SPEC.md` · `ONBOARDING_FLOW_SPEC.md` · `COMPETITOR_PARITY.md`.

## Session tracking

| File | Purpose | Tier |
|---|---|---|
| `SESSION_STATE.md` | Current session, branch, blockers, active work. | Maintained |
| `SESSION_HANDOFF.md` | Last completed work + carried-forward items. | Maintained |
| `SESSION_LOG.md` | Running one-line log of sessions 75+. Append-only. | Maintained |

## Historical (point-in-time — not current)

- **Migration (complete):** `POSTHOG_MIGRATION_HANDOFF.md`, `POSTHOG_DECOMMISSION_SCAN.md` — the PostHog→Tinybird migration is **done** (2026-07-19); these are the record, not live guidance.
- **Session history:** `PROGRESS.md`, `DEEPSEEK.md`.
- **Point-in-time audits / plans:** `AUDIT_PROD_READINESS_V2.md` · `AUDIT_S97.md` · `PAID_BETA_SESSION_PLAN.md` · `SELF_SERVE_PAID_BETA_AUDIT.md` · `SESSION_132_ATTRIBUTION_AUDIT.md` · `SESSION_132D_MARKETER_TEST_PLAN.md` · `SOURCETRACK_COMPETITIVE_READINESS_AUDIT.md` · `SOURCETRACK_PRIVACY_ANALYTICS_AND_GA4_READINESS_AUDIT.md` · `SOURCETRACK_SEGMENT_LAUNCH_READINESS_AUDIT.md` · `implementation_plan.md`.

## Archives — cited by live code; DO NOT delete

| Path | Why kept |
|---|---|
| `docs/archive/qa/` | 172 frozen sprint QA reports (#324). `api/middleware/tier-check.js` cites `pageview_limit_enforcement_140G-4.md` as the rationale for live quota enforcement. |
| `tinybird/archive/` | 15 migration-planning docs (#325). 8 are cited in deployed `.pipe` descriptions + code comments (e.g. `PHASE4_4C_PLAN.md` is the evidence for the argMax null-skip in `last_touch_by_site.pipe`). |

## Maintenance rules

1. **Update docs in the same PR as the behaviour change** — a doc that lags the code is how these went stale.
2. **`KNOWN_ISSUES.md` outranks the docs; code outranks `KNOWN_ISSUES.md`.** Verify against code for anything load-bearing.
3. **A new root `*.md` needs an entry here** in the same PR.
4. **Archive, don't delete — and grep the bare filename repo-wide when you do.** Citations live in code comments, test asserts, JSON prose, and other docs, in at least three formats (the #326 lesson).
