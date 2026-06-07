Session: 124C
Last Completed: Completed Session 124C — Layered Rate-Limit Implementation. Implemented layered rate-limiting (visitor, IP, site, global IP) across approved ingestion paths (/api/track, /api/collect, /track, /api/conversion, /api/tracker/id, /api/identify). Bounded and hashed user-controlled key parts to prevent memory leaks and protect identity privacy. Configured defaultLimit to precisely skip only these six paths. Created scripts/qa-rate-limits.mjs verification suite.
Next Task: Session 125A — Managed First-Party Proxy.
Roadmap Queue:
- Session 125A: Managed First-Party Proxy
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
