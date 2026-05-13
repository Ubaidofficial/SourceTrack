# Project Context Compact

## Product

SourceTrack / TrackIQ is a lightweight attribution and analytics platform for website tracking, UTM/ref/source/via attribution, AI referral/source analysis, conversions, reports, leads, campaigns, and dashboards.

## Stack

- Node/Express API in `api/`
- Vite React dashboard in `dashboard/`
- Tracker in `tracker/`
- Supabase for auth/sites/config/saved reports/schema-backed app data
- PostHog/HogQL for event analytics and attribution queries

## Read Order for Future Agents

1. `RULES.md`
2. `AGENT_BRIEF.md`
3. `PROJECT_CONTEXT_COMPACT.md` (this file)
4. `SESSION_HANDOFF.md`
5. `KNOWN_ISSUES.md`
6. `DOCS_INDEX.md`

Then read task-specific docs from `DOCS_INDEX.md`.

## Current Product Primitives

- **Tracker/pixel** — `tracker/tracker.js` + `tracker/loader.js`. Captures UTM/ref/source/via params, first-touch, pageviews, conversions, identify calls. Minified files must be rebuilt if source changes (`npm run build:tracker`).
- **Attribution routes** — `api/routes/attribution.js` + `api/lib/attribution-engine.js`. Supports first_touch, last_touch, first_touch_non_direct, last_touch_non_direct, ai_platforms models. Flexible reports with group_by, metric, filters, time granularity, attribution windows.
- **Report Builder** — `dashboard/src/pages/ReportBuilder.jsx`. Presets, guided 7-step workflow, save/load/duplicate/delete reports, channel/source quick filters, CSV export. Saved reports persisted to Supabase.
- **Event Logger** — `dashboard/src/pages/EventDebugger.jsx`. Debug incoming events, inspect raw properties, verify UTMs/ref/source/via/first-touch fields, data quality panel.
- **Saved reports** — Backend in `api/routes/saved-reports.js`, Supabase `saved_reports` table. User/site scoped, full CRUD, scoped DELETE by id/user_id/site_id.
- **Dashboard cards** — Fixed 9-card grid in `dashboard/src/pages/Dashboard.jsx`. No drag-and-drop, no widget rendering loop. Add-to-Dashboard button is disabled.
- **Onboarding** — `dashboard/src/pages/Onboarding.jsx`. Implementation status must be verified against code before claiming Figma parity.
- **AI source detection** — `api/middleware/ai-platform.js`. Detects ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek, You.com AI, Phind, Kagi from referrer. Undercounts when AI tools strip referrers.
- **Supabase schema** — Migration-driven. `supabase/schema.sql` may be stale; trust migrations and live DB verification.
- **Manual QA backlog** — All pending in `MANUAL_QA_BACKLOG.md`. No manual browser QA has been claimed as passed.

## Design Direction

- **Font**: Switzer (Regular, Medium, Semi-Bold, Bold)
- **Colors**: Primary lime `#CCF03F`, Black `#1F2323`, Gray `#7D8090`, Secondary green `#00AA57`, Warning orange `#FF8800`, Danger red `#E54545`
- **Grid**: 1320px desktop, 12 columns (88px each), 24px gutters, 4px spacing system
- **UI**: Dense analytics card/table layout, fixed sidebar, top search/action bar, light/dark dashboard variants
- **Business dashboards**: Revenue/General, E-commerce, Lead Gen, SaaS (design-confirmed, implementation-unverified)
- **Report Builder** styling guidance: use same Figma card/table/filter/button language even though no Report Builder Figma screen exists

## Business Dashboard Plan

Four dashboard variants are design-required but implementation-unverified:

- **Revenue/General** — Revenue, Top Channel, Conversion, CPC, ROAS KPI row
- **E-commerce** — Total Revenue, Revenue Growth, AI Revenue, AOV, Best ROAS KPI row
- **Lead Generation** — Total Leads, Lead Growth, AI Leads, Qualified, Best CPL KPI row
- **SaaS** — Revenue, MRR, AI Revenue, Trial→Paid, Best CAC KPI row

Business type mapped from onboarding selection. Only render real-data widgets when backing data exists. Do not show fake ROAS/CAC/CPL/MRR/payback as real metrics.

## Onboarding Plan

5-step flow as designed (implementation-unverified):

1. Create Account
2. Connect Domain — domain input + business type selection (eCommerce/SaaS/LeadGen)
3. Install Script — GTM vs Standard install paths
4. Customize — conversion event configuration
5. Run Verification — verification prompt + success state

## Known Gaps

- Business-specific dashboards not confirmed live in code
- Figma dashboard UI not fully implemented
- AI dashboard widgets not confirmed live
- All Leads journey modal not confirmed live against Figma
- Campaigns page not confirmed live against Figma
- Ad click IDs (`gclid`, `fbclid`, etc.) not captured
- Ad spend/campaign/ad-set/ad-ID reporting not implemented
- Full paid platform parity (Cometly/DataFast/Usermaven) not confirmed
- Manual QA pending in `MANUAL_QA_BACKLOG.md`

## Standard Checks

```bash
cd "$HOME/Desktop/trackiq"
node --check api/index.js
node --check api/routes/track.js
node --check api/routes/conversion.js
node --check api/routes/attribution.js
node --check api/lib/attribution-engine.js

cd "$HOME/Desktop/trackiq/dashboard"
npm run build
```

If tracker source changed:
```bash
cd "$HOME/Desktop/trackiq"
npm run build:tracker
```

## Guardrails

- Make surgical changes only
- Verify in code before claiming implemented
- Do not treat `PROGRESS.md` or `DEEPSEEK.md` as proof of current implementation
- Do not destructively compact archives
- Do not claim full DataFast/Cometly/Usermaven parity unless verified in code, data, and QA
- Manual QA remains pending unless actually performed in the running app
