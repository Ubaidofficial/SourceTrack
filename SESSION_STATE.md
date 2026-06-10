Session: 132E AI Journey Attribution Performance Hardening
Last Completed: Hardened the AI journey attribution query behavior in getAiPlatformAttributionLive by removing the site-wide pageview fallback and introducing visitor distinct ID chunking (batch size 100) and pageview pagination (page size 5000) using a LIMIT/OFFSET loop. Updated the QA script to import and test the query planning and batching helper.
Next Task: Move to Phase C (Dashboard saved widget cards).
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
