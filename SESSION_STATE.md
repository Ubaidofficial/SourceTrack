Session: 133J — Docs Truth Audit
Last Completed: Standardized tracker snippet paths across solution, setup, and help pages to canonical root paths. Updated Stripe env var `STRIPE_PRICE_ID_SCALE` as primary. Softened compliance language to "privacy-conscious" in developer docs. Added lightweight frontend gating for Google Search Console (GSC) connection card. Created `docs/docs_truth_audit.md` tracking all audit findings and corrected files.
Next Task: Paid-beta launch readiness validation and production promotion.
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
