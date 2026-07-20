# Business Dashboard Variants — Figma Spec

Status: design-confirmed from screenshots. Implementation status must be verified in code before claiming live support.

## Confirmed business dashboards in design

- Revenue / General
- E-commerce
- Lead Generation
- SaaS

The app should not claim these are implemented unless there is verified code, data, and QA.

## Shared shell

All dashboard variants use:
- SourceTrack sidebar
- top search/action bar
- date buttons: Last 24 hours, Last 7 days, Last 30 days
- Export button
- Key Performance Metrics card
- Recent Leads table
- card grid below

## Revenue / General dashboard

KPI row:
- Revenue
- Top Channel
- Conversion
- CPC
- ROAS/ROI

Widgets:
- Recent Leads
- Revenue chart
- Leads From AI Search
- Best Performing Channel
- Revenue by Channels
- Channel Health Summary
- Top Pages by Leads
- Recent Leads compact card
- Leads by Campaign
- Attribution Models
- Channel Performance Details
- Conversions By Search Terms
- Payback Period / Months to Profit

## E-commerce dashboard

KPI row:
- Total Revenue
- Revenue Growth
- AI Revenue
- AOV
- Best ROAS

Widgets:
- Recent Leads
- Revenue Source Attribution
- Purchase chart
- Conversion Events
- Landing Page Performance
- AI Shopping Attribution
- Search Terms Performance
- Orders by Channels
- Channel States

Primary implied metrics:
- revenue
- purchases/orders
- AOV
- ROAS
- conversion rate
- AI revenue
- landing page revenue
- channel/source revenue
- search-term revenue

## Lead Generation dashboard

KPI row:
- Total Leads
- Lead Growth
- AI Leads
- Qualified / Qualified Leads
- Best CPL

Widgets:
- Recent Leads
- Lead Source Attribution
- Leads Quality
- Leads chart
- Conversion Events
- Landing Page Performance
- AI Search Lead Attribution
- Search Terms Performance

Primary implied metrics:
- leads
- lead growth
- AI leads
- qualified leads
- CPL
- SQL %
- contact form conversions
- booked demos
- lead-form submissions
- landing page lead performance

## SaaS dashboard

KPI row:
- Revenue
- MRR
- AI Revenue
- Trial → Paid
- Best CAC

Widgets:
- Recent Leads
- Revenue Source Attribution
- Free Trial chart
- Conversion Events
- Landing Page Performance
- Revenue Payback Analysis
- Search Terms Performance
- Landing Page Performance by source/trials/revenue

Primary implied metrics:
- revenue
- MRR
- AI revenue
- trial-to-paid rate
- CAC
- free trials
- booked demos
- lead forms
- payback months
- landing page trial/revenue performance

## Business type mapping from onboarding

| Onboarding choice | Dashboard variant |
|---|---|
| eCommerce | E-commerce |
| Saas | SaaS |
| LeadGen/Others | Lead Generation |

Revenue / General can be a default dashboard if product-approved.

## Widget matrix

| Widget | Revenue / General | E-commerce | Lead Gen | SaaS |
|---|---:|---:|---:|---:|
| Recent Leads | Yes | Yes | Yes | Yes |
| Source attribution | Yes | Yes | Yes | Yes |
| AI attribution | AI Search | AI Shopping | AI Search Lead | AI Revenue implied |
| Main trend chart | Revenue | Purchase | Leads | Free Trial |
| Conversion Events | Sometimes | Yes | Yes | Yes |
| Landing Page Performance | Yes | Yes | Yes | Yes |
| Search Terms Performance | Yes | Yes | Yes | Yes |
| Channel Health | Yes | No | No | No |
| Attribution Models | Yes | No | No | No |
| Payback Analysis | Yes | No | No | Yes |
| Orders by Channels | No | Yes | No | No |
| Leads Quality | No | No | Yes | No |

## Implementation requirements

To implement these correctly:
- persist business type per site/workspace
- create dashboard config per business type
- only render real-data widgets when backing data exists
- provide empty states for missing data
- do not show fake ROAS/CAC/CPL/MRR/payback as real metrics
- verify queries and manual QA before claiming complete
