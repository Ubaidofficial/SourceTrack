# QA Report — SEO Homepage Copy & Metadata Refresh

## Routes / Files Audited
- `dashboard/src/pages/Landing.jsx` (Homepage component file)
- `dashboard/src/components/MarketingInteractiveDemo.jsx`
- `dashboard/src/lib/marketingDemoData.js`

## Metadata Changes Made
- **Title**: Refreshed to prioritize target SEO keyword clusters (`Simple Revenue Attribution Software`).
  - *Before*: `SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies`
  - *After*: `SourceTrack — Simple Revenue Attribution Software`
- **Description**: Refreshed to be descriptive, clean, and fit within search snippet limits without keyword stuffing.
  - *Before*: `SourceTrack helps SaaS, lead-gen, and agency teams track which sources, campaigns, AI referrals, and customer journeys turn into conversions and revenue. Multi-touch attribution with a lightweight install.`
  - *After*: `SourceTrack is simple revenue attribution software for founders, marketers, ecommerce stores, agencies, and lead-gen teams. See which campaigns, AI referrals, and customer journeys create revenue.`
- **OG Title**:
  - *Before*: `SourceTrack — Know which sources actually create revenue`
  - *After*: `SourceTrack — Simple Revenue Attribution Software`

## Copy Changes Made
1.  **Hero Section**:
    - **H1 Title**:
      - *Before/After*: `Know which sources actually create revenue.` (Kept premium and founder-friendly, avoiding keyword stuffing).
    - **Hero Kicker**:
      - *Before*: `Revenue attribution for modern marketing teams`
      - *After*: `Simple revenue attribution software`
    - **Hero Subtitle**:
      - *Before*: Subtitle focused on ad-network self-reporting bias and "paying customer" journeys.
      - *After*: Subtitle rewritten to state: `"SourceTrack is simple revenue attribution software for founders, marketers, ecommerce stores, agencies, and lead-gen teams. See which campaigns, AI referrals, search terms, forms, bookings, and customer journeys turn into leads and revenue — without a heavy analytics stack."`
2.  **Platform Section**:
    - *Before*: H2: `One workspace for source, journey, conversion, and revenue clarity.`
    - *After*: H2: `Revenue clarity without the BI bloat.`
    - *Before*: P: `"SourceTrack captures every visitor touchpoint, connects the full customer journey, and attributes revenue back to the channels that actually created it — not just the last click."`
    - *After*: P: `"SourceTrack is founder-friendly attribution software that connects the entire visitor timeline. Get campaign-to-cash visibility and see which channels actually create revenue — not just clicks."`
3.  **Feature Cards**:
    - *Before*: Wording referenced "15 AI platforms" and detailed report-builder setup from blank canvas.
    - *After*: Wording rewritten to focus on `attribution engine` establishing a `source of truth for revenue`, `AI-aware attribution` identifying ChatGPT/Claude traffic, and `No BI bloat` for custom simple widgets.
4.  **How It Works**:
    - *Before*: `"Works on any website, Shopify store, or Webflow site."`
    - *After*: `"Paste our lightweight JavaScript snippet directly or deploy via Google Tag Manager. Works on custom sites, Webflow, Framer, and Shopify themes when installed via snippet or Google Tag Manager."`
5.  **Comparative Table**:
    - *Before*: Referenced `AI referral tracking (15 platforms)`
    - *After*: Softened to `AI referral tracking (ChatGPT/Claude)`
6.  **Use Cases**:
    - *Before*: Ecommerce card mentioned "landing page purchase attribution"; Agency card mentioned "client-safe report exports".
    - *After*: Ecommerce card softened to "custom script purchase attribution"; Agency card softened to "dashboard templates" to prevent implying guest invite dashboard portals are fully ready.

## Truth-Gate Checks
- **Shopify Gate**: Verified. Copy now references installing the lightweight JavaScript snippet or custom script setups. No native Shopify App Store plugin claims are present.
- **Stripe Gate**: Verified. Stripe integrations are explicitly framed as "Stripe Webhook recipes (Developer Beta)" to prevent implying native/automatic production app synchronization.
- **CRM Sync Gate**: Verified. CRM integrations are represented as tracking code snippet hidden fields and pipeline events rather than native bidirectional database-level CRM syncs.
- **AI Prompt Gate**: Verified. AI referral tracking is marketed as domain referrer recognition (ChatGPT, Claude, Gemini, Perplexity) rather than private user prompt details.
- **Agency/Client Portal Gate**: Verified. Agency use case copy changed from "client-safe report exports" to "dashboard templates" to avoid implying fully complete client workspaces/permission portals until they are ready.

## CTA / Link Checks
- **Primary CTA**: Mapped to `/signup`.
- **Secondary CTA**: Mapped to `/product`.
- **Public Navigation Links**: Verified that Product, AI Tracking, Pricing, Demo, Docs, Login, and Signup links resolve to active and valid routes.

## Deployed Staging/Production Route Checked

Baseline deployed route checks were performed before this SEO-2 copy change was deployed:
- Staging URL: https://sourcetrack-dashboard-staging.up.railway.app
- Production URLs: https://sourcetrack.ai, https://www.sourcetrack.ai, and https://app.sourcetrack.ai

These checks verified current deployed route health, console/network cleanliness, and official-domain behavior only. The SEO-2 updated copy/metadata still requires deployed staging verification after commit/push/CI/deploy.

## Post-deploy verification required

After this change is committed, pushed, CI green, and deployed to staging, verify:
- homepage title/meta reflect the SEO-2 changes
- hero/subhero render correctly
- CTAs still route correctly
- no console/network errors
- no broken public routes


## Before / After Copy Summary
- **Positioning**: SourceTrack now explicitly markets itself as "simple revenue attribution software for founders, marketers, ecommerce stores, agencies, and lead-gen teams that want to see where revenue actually comes from."
- **Key Terms Injected**: `revenue clarity`, `campaign-to-cash visibility`, `founder-friendly attribution`, `no BI bloat`, `source of truth for revenue`, and `AI-aware attribution`.

## Validation Output
- **`git status`**: Shows `Landing.jsx` modified and `seo_homepage_copy_metadata_2026-06-16.md` created.
- **`npm run qa:env-safety`**: Passed.
- **`npm run qa:static`**: Passed.

## Deployment crash audit

### Crash source
- Environment: staging
- Service: sourcetrack-health
- Commit: bff7832
- Build/runtime: runtime health-agent crash after deploy (FIXED)
- Failing command: node api/jobs/health-agent.js
- First real error: None (previously: supabase — Invalid API key)
- Exit code: 0 (previously: 1)

### Root cause
The staging `sourcetrack-health` service had an invalid/malformed Supabase service key environment variable. This has been resolved by rotating the staging Supabase service role key and re-applying it. Exact secret values are intentionally omitted. The latest deployment (`b5babe06-e169-4029-b76b-d04e3e25a805`) succeeded with status `SUCCESS` and exited cleanly with code 0.

### Is SEO-2 responsible?
NO

### Evidence
SEO-2 is staged locally only and has not been pushed. The crashed deployment was triggered by commit `bff7832`, which was SEO-1 documentation-only work. The health check crash has been resolved by rotating and updating the staging environment variables on Railway.

### Follow-up required
- The staging Supabase service role key was rotated and re-applied to all affected Railway staging services. Exact values were intentionally omitted.
- Staging `sourcetrack-health` deployment status is now `SUCCESS` (deployment `b5babe06-e169-4029-b76b-d04e3e25a805` succeeded and exited cleanly with code 0).
- The `nightly_job` check continues to show no recent job runs in the `job_runs` table. This is a separate scheduling/telemetry issue and will be tracked as a follow-up blocker/session.
