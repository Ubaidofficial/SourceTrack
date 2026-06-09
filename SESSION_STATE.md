Session: 128G Polish (Beginner-Friendly Docs Readability + Accuracy Audit + Public Site Consistency)
Last Completed: Verified and restructured User Docs (/docs/*) and Developer Docs (/developers/*) using structured templates, key terms definitions, and exact parameter specifications. Standardized terms (source-to-revenue attribution, conversions) and corrected overclaims across the public site (landing, pricing, solution pages, footer). Fixed blank page Docs rendering bug. Cleaned trailing whitespace. Verified all syntax, production builds, and static QA checks pass.
Next Task: Ready for user signoff.
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
