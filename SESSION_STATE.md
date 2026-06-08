Session: 128D-A
Last Completed: Removed AI Analytics from sidebar; added lightweight AI Sources tab to Analytics; resolved ClickHouse browser_name dimension and conversion_type filter bugs; and added AI preset templates to Report Builder.
Next Task: Visual browser/QA validation of Report Builder and Analytics tabs.
Roadmap Queue:
- Phase B (Report Builder two-panel UI)
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
