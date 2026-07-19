# docs/archive

**Archived 2026-07-20.** Frozen per-session QA reports and migration-planning docs, retained for provenance. **Not maintained.**

## qa/ — sprint QA reports
172 per-session QA reports dated 2026-06-12 → 2026-06-22, from one sprint. Moved here (via `git mv`, so `git log --follow` still shows their full history) to keep repo-wide greps clean. They are historical evidence, not living docs — paths and claims inside them reflect the codebase at the time they were written.

Some are still cited by live code for the *rationale* behind a decision, e.g. `api/middleware/tier-check.js` → `docs/archive/qa/pageview_limit_enforcement_140G-4.md` (the audit behind quota enforcement). Those citations were updated to this path when the folder moved; do not delete the cited files.

> Note: some archived docs cross-reference each other by the old `docs/qa/…` path. Those internal links are stale (the folder moved) but left as-is — this is frozen provenance, not maintained content.
