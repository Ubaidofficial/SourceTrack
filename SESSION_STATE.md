Session: 133I — End-to-End Install QA
Last Completed: Audited and verified customer installation flow and verification boundaries. Standardized canonical public tracker URLs to the root paths `/tracker.min.js` and `/tracker.cookieless.min.js`, leaving `/tracker/*` as backwards-compatible paths. Updated onboarding, snippet generation, settings, and install documentation to use the canonical root paths, added detailed verification boundaries and domain warnings, and created `docs/install_qa_map.md`.
Next Task: Alignment on Phase C planning / dashboard widgets (not executed yet).
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
