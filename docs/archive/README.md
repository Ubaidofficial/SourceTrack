# docs/archive

**Archived 2026-07-20.** Frozen per-session QA reports and migration-planning docs, retained for provenance. **Not maintained.**

## qa/ — sprint QA reports
172 per-session QA reports dated 2026-06-12 → 2026-06-22, from one sprint. Moved here (via `git mv`, so `git log --follow` still shows their full history) to keep repo-wide greps clean. They are historical evidence, not living docs — paths and claims inside them reflect the codebase at the time they were written.

Some are still cited by live code for the *rationale* behind a decision, e.g. `api/middleware/tier-check.js` → `docs/archive/qa/pageview_limit_enforcement_140G-4.md` (the audit behind quota enforcement). Those citations were updated to this path when the folder moved; do not delete the cited files.

> Note: some archived docs cross-reference each other by the old `docs/qa/…` path. Those internal links are stale (the folder moved) but left as-is — this is frozen provenance, not maintained content.

## Root-doc batch (2026-07, this PR)
19 superseded root documents moved here via `git mv` (history preserved): session history (`PROGRESS.md`, `DEEPSEEK.md`), superseded planning/spec docs (`COMMANDCODE_RUNBOOK.md`, `IMPLEMENTATION_GAP_LIST.md`, `IMPLEMENTATION_STATUS.md`, `implementation_plan.md`, `ONBOARDING_FLOW_SPEC.md`, `FIGMA_DESIGN_SYSTEM.md`, `FIGMA_TOKEN_IMPLEMENTATION_PLAN.md`, `BUSINESS_DASHBOARDS_SPEC.md`, `COMPETITOR_PARITY.md`), and point-in-time audits (`AUDIT_PROD_READINESS_V2.md`, `AUDIT_S97.md`, `SELF_SERVE_PAID_BETA_AUDIT.md`, `SESSION_132_ATTRIBUTION_AUDIT.md`, `SESSION_132D_MARKETER_TEST_PLAN.md`, and the three `SOURCETRACK_*_AUDIT.md`).

**Archived, not deleted** — they carry real history/rationale, and `git log --follow` preserves it. They are superseded by `FEATURE_MAP.md` + `KNOWN_ISSUES.md` (verify against those, or code, not these). They had **zero** code references; live-doc citations of them were repointed to `docs/archive/…` when they moved. Their own internal cross-references stay stale by design (frozen).
