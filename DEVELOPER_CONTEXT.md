# SourceTrack Developer Context

Welcome to SourceTrack (also referred to as TrackIQ). This document serves as a developer-only/internal reference guide to quickly onboard developers and AI agents, align on project status, and outline strict implementation scope rules.

---

## 1. Product Positioning & Scope

### What SourceTrack Is
SourceTrack is a **simple, lightweight source-to-revenue attribution and analytics platform**. It tracks traffic, UTM parameters, ref/source/via parameters, referrers, and AI searches from its own website pixel and parses them to attributes. Key features include:
- **Lightweight Tracker Script** (`tracker/tracker.js`): Persists visitor UUIDs (`__tq_id`), extracts UTM parameters and click IDs (`gclid`, `fbclid`, etc.), auto-detects organic/referring search channels, captures form-leads, and emits events to `/api/track` and `/api/conversion`.
- **Throttled Telemetry metadata update** in track/conversion API routes: Writes last active timestamps and lightweight onboarding details directly to the Supabase database.
- **Attribution Explainer**: A chronological timeline view on the dashboard showing the exact touchpoints that led to a specific conversion, visualizing how attribution credits were assigned.
- **AI Referral Normalization**: A custom classifier mapping organic traffic from 22 known AI engines (ChatGPT, Gemini, Perplexity, DeepSeek, etc.) into a consolidated "AI Search" channel.
- **Saved Reports & Report Builder**: Simple custom groupings (device, campaign, source) and presets (e.g., Revenue by Channel).

### What SourceTrack Is NOT
- **A GA4 replacement suite**: We do not track page scroll depth, bounce rates, session replays, heatmaps, or complex behavioral funnels.
- **A BI custom dashboard manager**: We do not support complex custom dashboard widgets or custom multi-touch weights (e.g., custom U-shape weights inputs). Multi-touch models are hardcoded on PostgreSQL database calculations.
- **An Ecommerce automated ROAS suite**: We do not have automated Meta/Google Ads spend sync or direct Shopify app integrations yet.

### Core Truth & Metrics Positioning
- **DO NOT** claim 90%+ attribution accuracy, cookieless cross-device tracking, or autonomous campaign bidding systems.
- Position the product honestly: a lightweight script connecting UTMs and AI search referrals to conversion revenue.

---

## 2. Production Domain Context
- **Vite React Dashboard**: `https://app.sourcetrack.ai`
- **Backend API Ingestion**: `https://api.srctk.com`
- **Development environment**:
  - Local API: `http://localhost:3000`
  - Local Dashboard: `http://localhost:5173`
  - Local Test Site: `http://localhost:8080/sourcetrack-test.html`

---

## 3. Tech Stack

- **Backend**: Node/Express API (`/api`). Database reads/writes use Supabase JS client. Event tracking queries use PostHog HogQL API.
- **Frontend**: Vite React SPA (`/dashboard`), styled with vanilla CSS.
- **Tracker**: Core pixel and form submission hook in `/tracker/tracker.js`.
- **Database**: Supabase PostgreSQL. Tables: `sites`, `companies`, `company_members`, `saved_reports`, `dashboard_widgets`, `data_quality_reports`, `data_quality_alerts`.

---

## 4. Current Roadmap (Paid Beta Goal)

We are finalizing features blocking our self-serve **Paid Beta launch**. The primary focus is establishing the **Attribution and Tracking Trust Chain**:

1. **Verify Ingestion**: Ensure self-serve script verification is fast and robust (Completed in Session 102.1).
2. **Monitor Health**: Notify customers automatically when pixel telemetry goes silent (Next: Session 102.2).
3. **Establish Trust**: Expose deduplicated conversions on the UI to prevent double-counting suspicions (Session 102.3).
4. **Scale Usability**: Enable agency clients to switch between multiple sites easily (Session 102.4).
5. **Enforce Tier Gates**: Restrict premium multi-touch models and CSV exports for free-tier users (Session 102.5).

---

## 5. Session History & Current State

### Recently Completed Sessions
- **Session 102.1**: Snippet Installation Verification Assistant
  - Replaced slow/flaky HogQL polling with a direct check against Supabase telemetry columns (`sites.last_seen_at` and `sites.onboarding_state`).
  - Added a non-blocking, 5-minute throttled metadata updater to `/api/track` and `/api/conversion`.
  - Added frontend support in `Onboarding.jsx` for rendering specific statuses (`wrong_domain`, `wrong_site_key`, `api_failed`).
- **Session 101.6**: Dashboard Optional Data Fallback Polish
  - Prevented HTTP 500s when database tables for campaign costs/CAC queries are missing or offline.
  - Implemented client-side fallbacks displaying "Unavailable" markers on Avg CAC tiles and attribution columns.
- **Session 101.5**: SEO, Sitemap, Robots, and Footer Solutions Cleanup
  - Disallowed auth callback paths in `robots.txt` and added `<meta name="robots" content="noindex" />`.
  - Created public `sitemap.xml` mapping canonical marketing routes.
  - Patched footer links to prevent broken redirects.

---

## 6. Strict Scope Rules

> [!IMPORTANT]
> AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
> No AI-agent may commit or push before raw diff review and explicit user approval.

- **Surgical changes only**: Touch only the files relevant to the active session. Do not clean up adjacent formatting or rewrite files you are not asked to edit.
- **No speculative features**: Do not write code for features planned in future sessions (e.g., do not add site switcher drop-downs during the health alerts session).
- **Verify before committing**: Run global syntax verification (`node --check`) and compilation builds (`npm run build`) before declaring a session complete.
- **Tracker updates**: If modifying `tracker/tracker.js`, you must run `npm run build:tracker` to compile `tracker/tracker.min.js`.
- **Do not commit secrets**: Ensure `.env` is ignored and no local developer keys are stored in source files.
