Session: 124B
Last Completed: Completed Session 124B — Railway-Aware IP Resolver Route Migration. Integrated resolves across track.js, conversion.js, and tracker-id.js. Implemented ST_IP_RESOLVER_MODE=railway that filters out internal/private container IPs and extracts the first public IP from the sanitized XFF chain. Expanded scripts/qa-ip-resolver.mjs with tests for isPublicIp, railway mode resolving, and static source code checks.
Next Task: Implement layered rate limiting (Session 124C) using resolved client IP and site key controls.
Roadmap Queue:
- Session 124C: Layered Rate-Limit Implementation
- Session 125A: Managed First-Party Proxy MVP
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. Without this variable, migrated ingestion routes will fall back to connection-mode IPs and may use Railway internal 100.64.x.x addresses for geo, CAPI, and cookieless identity.
