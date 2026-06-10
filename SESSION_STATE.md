Session: 132C Identity Stitching + user_id Attribution Fallback
Last Completed: Implemented durable identity link mapping table and ingestion-layer resolution. Synchronously resolves single-ID offline/server events to their linked anonymous_id to allow downstream attribution joins to work correctly without HogQL changes. Softened developer docs overclaims.
Next Task: Re-run the attribution audit (target overall ≥90/100) to confirm ingestion-layer stitching resolves outstanding attribution trust gaps. Move to Phase C (Dashboard saved widget cards).
Roadmap Queue:
- Re-audit attribution trust score (target ≥90/100)
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
