Session: 128G (Fix Blank Docs Page + Lightweight Docs Center)
Last Completed: Applied hotfix to dashboard/src/pages/Docs.jsx to replace undefined React <H4> tags with standard HTML <h4> tags, resolving the live blank docs crash. Ran static QA and built frontend successfully.
Next Task: Commit hotfix, then proceed with the modular docs center refactor (routing split, sidebar layout, and platform pages).
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
