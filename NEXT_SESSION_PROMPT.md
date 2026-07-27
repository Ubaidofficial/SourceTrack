# Next Session Handoff — Status as of 2026-07-26, head 93da62d

## §0.5 Session Handoff & Done / Remaining Tasks

### Done This Session (6 PRs Merged to Main)
- **PR #425**: Entrypoint hygiene & `import.meta.url` guard on `api/jobs/email-reports.js`.
- **PR #426**: Netting unresolved refunds into a dedicated `Unattributed refunds` line in `api/routes/dashboard.js`.
- **PR #427**: Merged Onboarding Step 6 install UI card + platform detector integration in `api/routes/install.js` and `platform-detector.js`.
- **PR #428**: Raised default pageview limits in `PLAN_DEFAULT_PV_LIMIT` and aligned starter/growth feature parity in `api/lib/plan-features.js`.
- **PR #429**: Quota architecture overhaul: soft limits + hard caps (`HARD_CAP_MULTIPLIER_FREE: 3`, `HARD_CAP_MULTIPLIER_PAID: 10`) in `api/lib/pageview-limits.js` and threshold email copy updates.
- **PR #430**: Revenue preservation & non-drop conversion quota architecture (`ANOMALY_MULTIPLIER: 100`) in `api/lib/conversion-limits.js` across 9 ingestion call sites.

---

### Remaining Priority Queue

#### AGENT-DISPATCHABLE (Order Is Deliberate)
1. **GDPR Art. 15 Phantom Columns Bug (`KNOWN_ISSUES #9`)**: Fix select queries in `api/routes/gdpr.js:380` (`created_at`/`updated_at` on `lead_qualifications`) and `api/routes/gdpr.js:386` (`created_at` -> `captured_at` on `subscription_identity`). **Highest priority.**
2. **P0.3 422 Burst Investigation (`KNOWN_ISSUES #15`)**: Blocks on founder reading `saved_reports.config` jsonb for the failing site.
3. **Dashboard Lock for Over-Soft Quota State**: Implement allowlist / fail-closed rules (`/api/billing`, `/api/sites`, `/api/onboarding`, `/api/install`, `/api/gdpr`, `/api/admin` must stay accessible).
4. **Trial Duration 14 -> 28 Days**: Update in 4 locations: `auth.js:4`, `tier-check.js:39`, `analytics.js:216`, `billing.js:473` (`subscription_data.trial_period_days`).
5. **`pv_limit` Migration + Stripe Price Metadata (`KNOWN_ISSUES #1`)**: Reconcile default `pv_limit` in DB schema and Stripe price metadata to activate #428 limits.
6. **Pricing Page Copy Alignment**: Align Free column, Founder headline, and data retention split on public site.
7. **Conversion Rate ~142% Verification (`KNOWN_ISSUES #16`)**: Confirm distinct converters ÷ distinct visitors calculation logic.
8. **Email-Reports Job Hygiene**: Move `process.exit(0)` out of exported `run()` in `api/jobs/email-reports.js` and bind remaining queries.
9. **Stripe Webhook Charge.Refunded Persistence (`KNOWN_ISSUES #5`)**: Persist un-expanded `charge.refunded` events.
10. **Store-Aware Phantom Column & Test Fixture Validation (`KNOWN_ISSUES #13, #14`)**: Add schema-drift validation to test stubs.
11. **Retire Dead `/funnel` Route**: Delete unrouted `/funnel` endpoint in `api/routes/analytics.js:1032`.
12. **Bound Free-Tier Multi-Account Signups (`KNOWN_ISSUES #11`)**: Add rate-limiting / domain protection to free signups.

#### FOUNDER-ONLY
- **AI-Assistant Referrer Live Test**: Test ChatGPT, Claude, Perplexity, Gemini referrer headers via `https://httpbin.org/headers`.
- **Live Read of `saved_reports.config`**: Query `jsonb` config for site generating 422 burst to unblock #15.
- **Verify Live Stripe Restricted Key (`rk_live_`)**: Confirm write scope on Checkout Sessions and Customers.
- **Confirm Railway Cron Command for `email-reports`**: Verify entrypoint execution post-#425.
- **Free One Staging Site Slot**: Remove one site on staging account (currently at 6/5) to enable browser test of #427 onboarding UI.
- **Railway Monthly Cost Audit**: Review actual costs across Railway's 6 services.
- **Governance**: Resolve `CLAUDE.md` §9 and §13 worktree definition discrepancies.
- **Repository Cleanup**: Remove stray `FETCH_HEAD` zero-byte file and add to `.gitignore`.

---

## Production State Verbatim
- **Active Sites**: 1 site.
- **Attributed Conversions**: 5 conversions ($1,777.76 gross revenue across 3 purchases, 2 forms at $0).
- **Refunds**: 0 refunds.
- **Live Stripe Charges**: 0 charges.
- **Live Stripe Config**: COMPLETE (3 active products: Starter $49/mo, Growth $79/mo, Founder $99/yr; webhook active at `api.srctk.com/api/billing/webhook`, 0% error rate over 0 events).

---

## Competitive Context (Verified Live 2026-07-26)
- **Piqo**: Free 10k events/1 site/6mo retention. Pro $19/mo (1M events, 20 sites). Over-quota: keeps collecting, emails customer.
- **DataFast**: No free tier; 14-day trial. Starter $9/mo (10k events, 1 site), Growth $19/mo. Over-quota: keeps collecting, locks dashboard.
- **Usermaven**: Free 25k events, Pro $14/mo (100k events).
- **Strategic Position**: Do NOT compete on price or low volume. SourceTrack differentiators (multi-touch attribution, server-side CAPI, AI-source detection) target mid-market ($49 Starter / $79 Growth / $99 Founder).
- **Unit Economics & Margin**: Fixed COGS ~$150/mo. ~3.5% payment fee + USD/EUR conversion. 50% margin reached at ~6 customers @ $49/mo. Founder tier ($99/yr) serves as an acquisition instrument.
