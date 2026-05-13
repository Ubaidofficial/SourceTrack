# Dashboard Feature Gap — SourceTrack vs Figma and Benchmarks

Status: updated from dashboard, onboarding, All Leads, Campaigns, Journey modal, typography, color, grid, and spacing screenshots.

Important:
- Figma presence means design-required.
- Code/app implementation must be verified before claiming support.
- Do not claim competitor parity without verified capture, storage, UI, QA, and docs.

## Known current SourceTrack context from prior inspection

Previously confirmed or discussed:
- generic dashboard/reporting surface
- Report Builder
- saved reports
- Event Logger/debugger
- attribution reports
- UTM/ref/source/via capture
- AI source detection
- Supabase for users/sites/config
- PostHog for event analytics

Not confirmed in actual app:
- separate business-specific dashboards
- Figma-level onboarding parity
- full All Leads + Journey modal
- full Campaigns/ad performance page
- ad spend/cost ingestion
- MRR/subscription analytics
- CRM sync / mark-qualified workflows

## Figma-only or unverified major gaps

### 1. Business-specific dashboards

Figma includes:
- Revenue / General
- E-commerce
- Lead Generation
- SaaS

Current app is not confirmed to have these variants. Treat as missing/unverified.

Required:
- business type stored from onboarding
- dashboard selected by business type
- real-data cards where data exists
- empty states where data does not exist

### 2. Business-specific KPI rows

Revenue / General:
- Revenue
- Top Channel
- Conversion
- CPC
- ROAS/ROI

E-commerce:
- Total Revenue
- Revenue Growth
- AI Revenue
- AOV
- Best ROAS

Lead Gen:
- Total Leads
- Lead Growth
- AI Leads
- Qualified / Qualified Leads
- Best CPL

SaaS:
- Revenue
- MRR
- AI Revenue
- Trial → Paid
- Best CAC

Likely current support:
- revenue, conversions, leads, source/channel, AI source may be partly supported.

Unverified/missing data:
- CPC
- ROAS
- CPL
- CAC
- MRR
- trial-to-paid
- AOV
- qualified lead status
- ad spend
- net profit
- payback period

### 3. AI attribution widgets

Figma includes:
- Leads From AI Search
- AI Shopping Attribution
- AI Search Lead Attribution
- AI Revenue / AI source attribution implied

Current app has AI detection/reporting concepts, but these exact widgets are unverified.

Required:
- AI source grouping
- AI leads
- AI revenue
- AI purchases/orders
- AI qualified leads
- business-specific AI widgets

### 4. Source attribution widgets

Figma includes:
- Revenue Source Attribution
- Lead Source Attribution
- Leads Quality
- Best Performing Channel
- Channel Health Summary
- Channel Performance Details
- Orders by Channels

Current app likely has source/channel reporting through Report Builder, but exact dashboard widgets are unverified.

Required:
- reusable source/channel attribution card
- business-specific columns
- source logos/icons
- sortable columns
- period comparison

### 5. Recent Leads and Journey

All Leads page in Figma:
- First Touch filter
- All Source filter
- date filter
- More Filter
- Export
- Recent Leads table
- View Journey links
- pagination

Journey modal in Figma:
- lead summary
- last location
- conversion value
- device
- touchpoints
- journey duration
- first touch
- current event type
- activity timeline
- expandable event details
- Sync To CRM
- Export
- Mark as Qualified

Current app Event Logger is not enough to claim this CRM-style journey modal.

### 6. Campaigns page

Figma Campaigns page includes:
- Total Conversion
- Total Revenue
- Ad Spend
- Avg ROAS
- Avg. Cost Per Lead
- campaign list
- active/expired toggles
- budget
- amount spent
- conversions
- ROAS
- purchases
- net profit
- filters: date, source, attribution model, more filter
- pagination

Missing/unverified:
- campaign/ad data model
- spend ingestion
- budget
- ROAS
- CPL
- net profit
- active/expired campaign state

### 7. Onboarding flow

Figma onboarding includes:
- Create Account
- Connect Domain
- business type selection
- Install Script
- GTM vs Standard Installation
- GTM instructions with copy-code block
- Customize conversions
- Run Verification
- Success state
- Watch Video CTA

Current onboarding implementation may have columns/state from prior work, but Figma parity is unverified.

### 8. Report Builder styling

Figma does not show Report Builder.

Decision:
- keep Report Builder
- restyle using Figma card/table/filter system
- do not remove existing analytics/reporting features

## Competitor benchmark gaps

### DataFast

Public docs show:
- UTM tracking fields
- campaign analytics API fields including utm fields, ref/source/via, visitors, revenue
- revenue attribution/payment provider documentation
- Meta ads attribution documentation

SourceTrack should not claim DataFast parity until:
- campaign API/export parity is verified
- revenue attribution is verified end-to-end
- payment-provider attribution is verified
- ad attribution is verified

### Cometly

Public pages position Cometly around:
- marketing attribution
- ad performance
- ROI proof
- conversion sync
- multi-touch attribution
- customer journey visibility
- ad campaign optimization

SourceTrack should not claim Cometly parity until:
- ad spend/campaign/adset/ad IDs are supported
- conversion sync exists
- multi-touch beyond current supported models is verified
- journey view is productized
- offline/CRM events are verified

### Usermaven

Public pages position Usermaven around:
- full customer journey
- marketing attribution
- product analytics
- ecommerce analytics and attribution
- customer journey from first touch to purchase/retention

SourceTrack should not claim Usermaven parity until:
- product analytics events are productized
- ecommerce dashboards are real-data backed
- retention/lifecycle analytics exist
- journey view is complete

## Recommended implementation sequence

1. Commit Figma docs.
2. Verify current code page-by-page against this gap file.
3. Implement/persist business type from onboarding.
4. Create dashboard config layer by business type.
5. Build shared dashboard components:
   - KPI row
   - table card
   - chart card
   - empty state
   - export/filter controls
6. Build real-data cards first:
   - revenue
   - conversions
   - leads
   - source/channel attribution
   - AI source attribution
7. Build empty-state/future cards for unsupported metrics.
8. Build All Leads + Journey modal.
9. Build Campaigns only after ad/campaign spend model is defined.
10. Restyle Report Builder to Figma system.

## Do-not-overclaim list

Do not claim support for:
- business-specific dashboards
- full Cometly parity
- full DataFast parity
- full Usermaven parity
- ad spend attribution
- conversion sync
- MRR/CAC/ROAS/CPL/payback
- CRM sync
- universal AI traffic detection

unless code, data, and QA confirm it.
