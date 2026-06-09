Session: 128G (Fix Blank Docs Page + Lightweight Docs Center)
Last Completed: Split monolithic Docs page into a modular lightweight docs center (/docs for user docs and /developers for developer docs). Integrated shared docs components, updated App.jsx routing, compatibility redirects, header, footer, Settings.jsx and PublicIntegrations.jsx links, and updated sitemap.xml. Verified all builds and QA static checks pass.
Next Task: Stage and commit the refactored documentation changes.
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
