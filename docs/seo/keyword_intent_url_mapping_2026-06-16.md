# Keyword Intent + URL Mapping Audit

## Data sources
- `cometly.com-organic-keywords-subdomains-all_2026-06-16_20-01-39.csv` (Cometly organic keyword profile)
- `usermaven.com-organic-keywords-subdomains-a_2026-06-16_20-02-52.csv` (Usermaven organic keyword profile)

> [!NOTE]
> **Volume Caveat**: These volumes are raw matched volumes from the uploaded Cometly/Usermaven competitor keyword exports. They are not deduplicated total market demand. Some clusters overlap, and some keywords are competitor-branded or informational.

## Method
Organic search keywords from primary attribution and analytics competitors were analyzed. Keywords were grouped into semantic clusters, filtered for search intent, commercial intent (CPC/value indicators), product relevance to SourceTrack, and product capability truthfulness.

## URL Decision Framework
URL decisions are based on:
- **Search Intent**: Targeting searchers looking for tools, solutions, or high-intent commercial content.
- **Search Volume**: Capitalizing on verified organic search demand.
- **Commercial Value**: Prioritizing terms with high CPC and clear intent to purchase/signup.
- **Product Readiness/Truth**: Selecting topics that align with what SourceTrack can truthfully deliver today.
- **Ability to Create a Genuinely Useful Page**: Focusing on functional utility or deep educational value over standard marketing fluff.
- **Avoiding Thin SEO Pages**: Ensuring every recommended URL houses a high-quality interactive tool, calculator, or dedicated product layout rather than thin SEO content.
- **Avoiding Unsupported Integration Claims**: Ensuring no pages imply native features (like a native Shopify App Store app or native database CRM sync) that we do not support.

## Keyword clusters ranked by opportunity

| Cluster | Example keywords | Raw matched volume | Intent | Commercial value | Product fit | Recommended URL | Priority | Notes |
|---|---|---:|---|---|---|---|---|---|
| **UTM Builder** | `utm builder`, `utm creator`, `campaign url builder` | 23,990 | Transactional / Tool | Very High (Lead generation hook) | 🟢 Excellent | `/utm-builder` | **HIGH** | Drives high-volume search traffic. Highly viral tool, easy to build. |
| **Marketing Attribution** | `marketing attribution`, `attribution software`, `attribution tools` | 22,240 | Commercial | Extremely High | 🟢 Excellent | `/marketing-attribution-software` | **HIGH** | Core product category term. High CPC, competitive, but essential for brand visibility. |
| **Calculators (ROAS/ROI)** | `roi calculator`, `ctr calculator`, `roas calculator` | 18,130 | Informational / Tool | High (Lead magnet / viral) | 🟡 Good (Ad marketing relevance) | `/roas-calculator`, `/roi-calculator` | **HIGH** | Excellent linkable assets and utility calculators for marketers. |
| **Agency Dashboard** | `client reporting dashboard`, `analytics for agencies`, `client reporting` | 4,960 | Commercial | Very High | 🟢 Excellent | `/client-reporting-dashboard` | **HIGH** | Agencies represent high LTV. Target agencies looking to share dashboards. |
| **Lead Attribution** | `lead sources`, `lead tracking`, `lead attribution` | 3,490 | Commercial | High | 🟢 Excellent | `/lead-attribution-software` | **HIGH** | Highly relevant for B2B/lead-gen teams using our form capture. |
| **Conversion Tracking** | `pixel tracking`, `conversion tracking`, `shopify conversion tracking` | 2,520 | Commercial | High | 🟢 Excellent | `/conversion-tracking-software` | **MEDIUM** | Focuses on our lightweight conversion tracking features. |
| **Revenue Attribution** | `revenue attribution`, `marketing revenue attribution` | 1,110 | Commercial | Very High | 🟢 Excellent (Core Focus) | `/revenue-attribution-software` | **HIGH** | Low volume but extremely targeted commercial buyers seeking revenue clarity. |
| **AI Referral Tracking** | `ai referral tracking`, `chatgpt traffic tracking`, `perplexity referral tracking`, `ai search attribution` | 100 | Informational / Emerging | High (Differentiator) | 🟢 Excellent | `/ai-referral-tracking` | **HIGH** | High product fit. Detects major AI referrers such as ChatGPT, Claude, Perplexity, and Gemini where referrer/source data is available. Strong unique value proposition. |
| **Ecommerce/Shopify** | `ecommerce attribution`, `shopify tracking` | 820 | Commercial | Very High | 🟡 Moderate (No native Shopify app) | `/ecommerce-attribution` | **MEDIUM** | Highly relevant but copy must focus on GTM/snippet install (no native app). |
| **Calendly/Booking** | `calendly tracking`, `booking attribution` | < 100 | Commercial | High | 🟢 Excellent | `/booking-attribution` | **LOW** | Niche integration topic, good for a targeted support/feature page. |

> [!IMPORTANT]
> **AI Referral Cluster Note**: Unrelated competitor-branded keywords (e.g. `maven ai`) have been removed from the AI volume calculation to prevent volume inflation. The `/ai-referral-tracking` URL will stay in the roadmap as a strong differentiation page rather than a volume-first page.

## First-wave conversion + SEO foundation
1.  **Homepage copy + metadata refresh**: Update messaging to center on revenue clarity and campaign-to-cash visibility. Update SEO tags.
2.  **Premium interactive homepage demo**: Reorganize the sandbox dashboard around high-intent attribution views (Overview, Sources, Campaigns, Journeys, AI Sources, Conversions).
3.  **`/marketing-attribution-software`**: Core product category landing page targeted at marketers and founders.
4.  **`/revenue-attribution-software`**: Mid-tail high-intent landing page focused on campaign-to-revenue tracking.
5.  **`/lead-attribution-software`**: Lead-generation specific landing page detailing form tracking, CRM pipelines, and booking attribution.
6.  **`/utm-builder`**: Interactive UTM generator tool. Direct lead generation vehicle that links to account signup.

## Deferred URLs
1.  **`/client-reporting-dashboard`** & **`/agency-attribution-software`**: Deferred until agency multi-client workspace permissions and client-invite dashboards are fully ready.
2.  **`/roas-calculator`** & **`/roi-calculator`**: Deferred. Requires standalone interactive math components. Only build if implemented as fully functioning tools.

## URLs to avoid for now
1.  **`/shopify-attribution`** or **`/shopify-tracking`**: Avoid dedicated "Shopify app" pages to prevent users from searching the Shopify App Store for an app we don't have. Frame as `/ecommerce-attribution` with GTM/snippet installation guides instead.
2.  **`/calendly-attribution`**: Avoid standalone landing page; document as a section under `/lead-attribution-software` or `/docs` to prevent thin content.

## Keyword-to-page map
- `marketing attribution`, `attribution software`, `attribution tools` ➔ `/marketing-attribution-software`
- `revenue attribution`, `marketing revenue attribution` ➔ `/revenue-attribution-software`
- `lead sources`, `lead tracking`, `lead attribution` ➔ `/lead-attribution-software`
- `utm builder`, `utm creator`, `campaign url builder` ➔ `/utm-builder`
- `ai referral tracking`, `ai source attribution` ➔ `/ai-referral-tracking`
- `ecommerce attribution` ➔ `/ecommerce-attribution`

## Internal linking plan
- **Footer Navigation**: Add direct links to `/marketing-attribution-software`, `/revenue-attribution-software`, `/lead-attribution-software`, `/ecommerce-attribution`, `/ai-referral-tracking`, and `/utm-builder`.
- **In-Content Links**:
  - Homepage (`Landing.jsx`) features section links directly to `/ai-referral-tracking` and `/marketing-attribution-software`.
  - Solutions dropdown links to `/lead-attribution-software` and `/ecommerce-attribution`.
  - `/utm-builder` features secondary CTAs linking to `/conversion-tracking-software`.

## Risks / truth gates
- **Shopify Gate**: Do **not** claim a "Shopify App Store plugin". All Shopify attribution must be described as "installed via custom script tag in Shopify Admin or Google Tag Manager."
- **CRM Sync Gate**: Do **not** claim "native Salesforce/Hubspot bidirectional database sync". Describe as "attribution stitching that captures click history and forwards attribution metadata to form fields."
- **AI Prompt Gate**: We only parse AI referrer domains (e.g. `chatgpt.com`, `claude.ai`). We **cannot** access private user prompts inside AI search engines. Frame strictly as "AI referral domain attribution."
