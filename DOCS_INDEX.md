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
| `docs/SourceTrack_GTM.md` | GTM & positioning — **owns** the canonical customer-facing hero (§1.1, mirrors `Landing.jsx`), the VOICE RULE (§1.2), the claims-gates (§5/§5.1), and the ICP (§6). Every marketing page inherits this. **Content frozen 2026-06-28**; never committed until #327. `FEATURE_MAP.md` §5 gates a **public revenue claim** on it — losing it risks an unverifiable marketing claim. Corrections log appended. | Maintained |
| `docs/marketing/website_seo_plan.md` | The locked website + SEO execution spec: sitemap (12 silos), build phases, page-by-page title/meta/schema, homepage copy playbook, screenshot system. Appendices carry the 6-competitor traffic evidence + raw keyword volumes. Defers to `docs/SourceTrack_GTM.md` for all positioning and claims. | Maintained |
| `docs/marketing/fast_acquisition_90day.md` | The manual acquisition motion for customers 1–200 (founder outreach, Reddit, FB groups). Companion to — deliberately **not** merged into — the SEO plan; different job, different cadence. | Maintained |
| `docs/marketing/demo_seed_spec.md` | Spec for the seeded **staging** demo tenant that gates every real product screenshot. Appendix covers the separate `/demo` fixture component's attribution-tab gap. Staging-only; the seed guard must stay intact. | Maintained |
| `ATTRIBUTION.md` | Attribution truthfulness contract. | Maintained |
| `SUPABASE_SCHEMA.md` | Supabase tables/RLS/verification queries. | Maintained |
| `.env.example` | Canonical env template (includes the Tinybird block since #328). | Maintained |
| `docs/post_verdict_roadmap.md` | **Build sequencing after the 2026-07-20/21 verdicts** — Tier 1 forced chain (api_keys scopes → read REST API → MCP v1), Tiers 2–4, metrics-coverage audit, positioning, held items, due proof points. Every claim carries an explicit evidence grade (VERIFIED / INFERRED / JUDGMENT / UNPROVEN) — **do not flatten them.** Also holds the §0 verification-methods note (squash merges defeat `merge-base --is-ancestor`). Distinct from `docs/paid_beta_go_no_go_master_audit.md`, which is a launch *gate*, not a roadmap. | Maintained |
| `COMMANDCODE_RUNBOOK.md` | **Operational runbook** — Production Deployment Checklist, Emergency Rollback Runbook (incl. Scenario C: webhook-decryption failures), and Observability & Monitoring procedures. Incident-response — kept live at root, **not** archived. | Maintained |

## ⚠️ Stale — trust code / `KNOWN_ISSUES` / `FEATURE_MAP` over it

| File | Why | Tier |
|---|---|---|
| `DATA_CAPTURE_SPEC.md` | Its "PostHog properties" section describes a **deleted** store, and its "not built" list claims click-IDs are unbuilt — contradicted by `KNOWN_ISSUES.md §3` (click-IDs ARE captured) and `FEATURE_MAP.md §1`. A field-by-field re-audit against `tracker.js` + `tinybird/SCOPE_v3.md` §2.6 is a separate task. **Trust `KNOWN_ISSUES` + `FEATURE_MAP` over it.** | ⚠️ Stale |

## Reference (context / navigation — not proof)

`DEV_SESSION_CHECKLIST.md` · `NEXT_SESSION_PROMPT.md` · `QA_RUNBOOK.md` · `MANUAL_QA_BACKLOG.md` · `BUG_REVIEW_LOG.md` · `CHANGELOG.md`. *(`AGENT_BRIEF.md`, `PROJECT_CONTEXT_COMPACT.md`, `DEVELOPER_CONTEXT.md`, `RULES.md` were archived 2026-07-24 → `docs/archive/2026-07/`; see the dated section below.)* *(The superseded planning/spec docs — `IMPLEMENTATION_GAP_LIST`, `IMPLEMENTATION_STATUS`, the `FIGMA_*` / `BUSINESS_DASHBOARDS_SPEC` / `ONBOARDING_FLOW_SPEC` / `COMPETITOR_PARITY` specs — were archived to `docs/archive/` in this batch; see Historical below.)*

## Session tracking

| File | Purpose | Tier |
|---|---|---|
| `SESSION_STATE.md` | Current session, branch, blockers, active work. | Maintained |

*(`SESSION_HANDOFF.md` and `SESSION_LOG.md` — the rolling session narrative — were archived 2026-07-24 → `docs/archive/2026-07/`, superseded by `NEXT_SESSION_PROMPT.md §0.5`; see the dated section below.)*

## Historical (point-in-time — not current)

- **Migration (complete):** `POSTHOG_MIGRATION_HANDOFF.md`, `POSTHOG_DECOMMISSION_SCAN.md` — the PostHog→Tinybird migration is **done** (2026-07-19); these are the record, not live guidance.
- **Session history (archived → `docs/archive/`):** `docs/archive/PROGRESS.md`, `docs/archive/DEEPSEEK.md`.
- **Point-in-time audits (archived this batch):** `docs/archive/AUDIT_PROD_READINESS_V2.md` · `docs/archive/AUDIT_S97.md` · `docs/archive/SELF_SERVE_PAID_BETA_AUDIT.md` · `docs/archive/SESSION_132_ATTRIBUTION_AUDIT.md` · `docs/archive/SESSION_132D_MARKETER_TEST_PLAN.md` · `docs/archive/SOURCETRACK_COMPETITIVE_READINESS_AUDIT.md` · `docs/archive/SOURCETRACK_PRIVACY_ANALYTICS_AND_GA4_READINESS_AUDIT.md` · `docs/archive/SOURCETRACK_SEGMENT_LAUNCH_READINESS_AUDIT.md`. *(Still at root: `PAID_BETA_SESSION_PLAN.md` — may be active, not archived.)*
- **Superseded planning / specs (archived this batch):** `docs/archive/IMPLEMENTATION_GAP_LIST.md` · `docs/archive/IMPLEMENTATION_STATUS.md` · `docs/archive/implementation_plan.md` · `docs/archive/ONBOARDING_FLOW_SPEC.md` · `docs/archive/FIGMA_DESIGN_SYSTEM.md` · `docs/archive/FIGMA_TOKEN_IMPLEMENTATION_PLAN.md` · `docs/archive/BUSINESS_DASHBOARDS_SPEC.md` · `docs/archive/COMPETITOR_PARITY.md`.

## Archives — cited by live code; DO NOT delete

| Path | Why kept |
|---|---|
| `docs/archive/qa/` | 172 frozen sprint QA reports (#324). `api/middleware/tier-check.js` cites `pageview_limit_enforcement_140G-4.md` as the rationale for live quota enforcement. |
| `tinybird/archive/` | 15 migration-planning docs (#325). 8 are cited in deployed `.pipe` descriptions + code comments (e.g. `PHASE4_4C_PLAN.md` is the evidence for the argMax null-skip in `last_touch_by_site.pipe`). |
| `docs/archive/` (root-doc batch, this PR) | 18 superseded root docs (session history + planning/spec + point-in-time audits). Verified **zero** code references — archived for provenance, **not deleted** so their history survives. Their internal cross-references stay stale by design (frozen). |

## Archived 2026-07-24 → `docs/archive/2026-07/`

Seven undated/stale root docs moved out (`git mv`, history preserved) because they were being read as current. See `docs/archive/2026-07/README.md` for the full metadata table. Live successors: `CLAUDE.md` (contract), `NEXT_SESSION_PROMPT.md` (handoff), `KNOWN_ISSUES.md`.

| File | Reason | Superseded by |
|---|---|---|
| `SESSION_HANDOFF.md` | Session narrative (2026-05-23 → 2026-07-20) | `NEXT_SESSION_PROMPT.md §0.5` |
| `SESSION_LOG.md` | Session narrative (2026-05-13 → 2026-07-19) | `NEXT_SESSION_PROMPT.md` + git log |
| `IDENTITY_DESIGN.md` | Identity design built on the **decommissioned PostHog** person model (`ph.alias()`) | current identity code + `ATTRIBUTION.md` |
| `AGENT_BRIEF.md` | Names PostHog as the live event store (PostHog-era) | `CLAUDE.md` |
| `DEVELOPER_CONTEXT.md` | "queries use PostHog HogQL API" (PostHog-era) | `CLAUDE.md` |
| `PROJECT_CONTEXT_COMPACT.md` | PostHog/HogQL overview + points at `SESSION_HANDOFF.md` | `CLAUDE.md` |
| `RULES.md` | Reading list points at a dead doc set (`system.md`/`progress.md`/`deepseek.md`) | `CLAUDE.md` |

Benign prose mentions of these names (in `NEXT_SESSION_PROMPT.md`, `COMMANDCODE_RUNBOOK.md`, `DEV_SESSION_CHECKLIST.md`, `CHANGELOG.md`, `tinybird/archive/*`) were left as-is — historical narrative, not live pointers. `AGENTS.md` and `scripts/qa-static-launch-check.mjs` were the only **live** references and were repointed in this PR.

## Maintenance rules

1. **Update docs in the same PR as the behaviour change** — a doc that lags the code is how these went stale.
2. **`KNOWN_ISSUES.md` outranks the docs; code outranks `KNOWN_ISSUES.md`.** Verify against code for anything load-bearing.
3. **A new root `*.md` needs an entry here** in the same PR.
4. **Archive, don't delete — and grep the bare filename repo-wide when you do.** Citations live in code comments, test asserts, JSON prose, and other docs, in at least three formats (the #326 lesson).
