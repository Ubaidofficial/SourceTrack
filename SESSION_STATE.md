Session: 133G — Data Deletion / Privacy Basics
Last Completed: Audited and addressed data deletion and GDPR gaps. Restructured account deletion logic to prevent data loss in shared workspaces, prevented orphaning shared workspaces by admins, expanded visitor erasure to wipe `site_identity_links` records, created a privacy and data deletion map, and updated copy in settings, README, and developer docs to align with real capabilities.
Next Task: Alignment on Phase C planning / dashboard widgets (not executed yet).
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
