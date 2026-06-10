Session: 132A Attribution Trust Surface Fixes
Last Completed: Fixed the four highest-priority attribution trust surfaces called out in SESSION_132_ATTRIBUTION_AUDIT.md. (P0-1) Cookieless tracker now logs a console.warn and the Settings cookieless card shows an amber callout when fallback IDs may fire; DocsTroubleshooting has a new #cookieless section. (P0-2) Marketing copy across Landing, Pricing, Product, Attribution, Demo, Signup, CompareGA4, SolutionSaaS, SolutionEcommerce now says "9 attribution models" instead of "8" to match the engine's ALLOWED_MODELS set; Dashboard pinned report cards now surface the API's _notice when multi-touch models return empty (ReportBuilder already did). (P0-3) Attribution model badges added to Dashboard pinned report cards, ReportBuilder preview header, and Campaigns header (which is fixed to last_touch). (P1-1) New shared DirectInfo helper renders a small "i" tooltip next to any Direct / Direct&nbsp;/&nbsp;None / unknown row in Dashboard top channels + referrers, Dashboard pinned report-card rows, ReportBuilder sparse + table rows, and Campaigns channel column — explaining what direct means without writing a docs trip. No engine math changed. All static and build checks pass.
Next Task: Ready for user review of Session 132A. Re-run the attribution audit (target overall ≥90/100) and tackle remaining P1 items (same-domain referrer stripping, sessionization on UTM change, st_ft_ts payload, NodeCache replacement, SPA pushState debounce) in Session 132B.
Roadmap Queue:
- Session 132B (remaining P1s from the audit)
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
