Session: 137 — Supabase Backup/PITR Verification + Rollback Rehearsal
Last Completed: Accessed Supabase console via Management API MCP. Confirmed production project zxjjjsipafojhzkkumvh is on Free plan: daily backups are disabled, and PITR is disabled/unavailable. Confirmed that no separate staging Supabase project exists (blocking Session 135B). Railway rollback previously documented / not re-verified in this session. Appended "Session 137 Supabase Backup/PITR Verification" to docs/backup_recovery.md.
P0-3 STATUS: REMAINS OPEN — backups and PITR verified disabled in console due to Free tier plan limitation.
🚩 HEADLINE FINDING F6 (P0 staging blocker): No separate staging Supabase project exists. The local .env remains unsafe (wired to production DB zxjj…umvh). Session 135B remains BLOCKED until a staging database is created and wired.
Prior findings still open: 135 F1 stale test prices; 136 F5 local .env points at production DB; 135 F3 pv_limit metadata; 135 F4 request-body redirect URLs.
Verdict (134): CONDITIONAL GO — safe for 3–5 hand-picked single-instance beta customers once P0 conditions met.
Next Task: Operator must upgrade production Supabase to a paid plan and configure a separate staging project before Session 135B or P0-2/P0-3 can be closed.
Roadmap Queue:
- Operator: upgrade production Supabase project, enable backups & PITR, create separate staging Supabase project, and correct Stripe test prices.
- Session 135B — Full Stripe test-mode E2E checkout/webhook/portal run (P0-1 closure) [BLOCKED until staging project is confirmed]
- Billing hardening mini-session — server-side generate/allow-list checkout & portal return URLs (F4, P1)
- Session 138 — Lightweight exception monitoring / Sentry (P1)
- Session 139 — Onboarding validation hardening + email suppression (P1)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, qa:static, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
