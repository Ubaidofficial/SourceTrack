# SEO & Content Architecture Backlog

**Core Positioning:** *"Know which sources actually make you money."*

This backlog defines the future public website information architecture, content structure, and SEO strategy for SourceTrack. It takes inspiration from mature SaaS platforms (like Leadfeeder, Usermaven, Cometly, Attributer, DataFast, Piqo) but remains simpler, attribution-focused, and truthful to our current capabilities.

---

## 1. Website Information Architecture
The site architecture should be flat, easily crawlable, and cleanly siloed by intent:
- **Product** (Features & capabilities)
- **Use Cases** (Problems solved)
- **Solutions** (Audiences served)
- **Compare** (Alternatives & competitors)
- **Resources** (Guides, Tools, Docs)
- **Trust** (Legal, Security, Support)

---

## 2. Product Pages
Focus on the core capabilities of the tracking script and attribution backend.

* `/product/attribution`
* `/product/lightweight-analytics`
* `/product/ai-referral-tracking`
* `/product/campaign-attribution`
* `/product/seo-revenue-attribution`
* `/product/journey-attribution`
* `/product/report-builder`

---

## 3. Use-Case Pages
Focus on the specific operational pain points of our target users.

* `/use-cases/lead-source-tracking`
* `/use-cases/form-attribution`
* `/use-cases/booking-attribution`
* `/use-cases/utm-tracking`
* `/use-cases/ai-referral-tracking`
* `/use-cases/seo-revenue-attribution`
* `/use-cases/stripe-revenue-attribution`
* `/use-cases/shopify-webhook-attribution`
* `/use-cases/agency-client-attribution`
* `/use-cases/founder-marketing-dashboard`

---

## 4. Audience Solution Pages
Tailor the value proposition ("Know what makes you money") to specific personas.

* `/solutions/founders`
* `/solutions/marketers`
* `/solutions/agencies`
* `/solutions/saas`
* `/solutions/ecommerce`
* `/solutions/content-seo`
* `/solutions/cmos`

---

## 5. Comparison Pages
Bottom-of-funnel capture for competitor searches. Highlight our lightweight, attribution-first, privacy-conscious approach.

* `/compare/google-analytics-alternative`
* `/compare/leadfeeder-alternative`
* `/compare/usermaven-alternative`
* `/compare/cometly-alternative`
* `/compare/attributer-alternative`
* `/compare/datafast-alternative`
* `/compare/posthog-alternative-for-attribution`

---

## 6. Guides/Playbooks
Top and middle-of-funnel educational content explaining *how* to solve attribution problems, heavily featuring SourceTrack workflows.

* `/guides/lead-source-tracking`
* `/guides/utm-tracking`
* `/guides/form-attribution`
* `/guides/ai-referral-tracking`
* `/guides/seo-revenue-attribution`
* `/guides/stripe-attribution`
* `/guides/shopify-webhook-attribution`
* `/guides/campaign-attribution`
* `/guides/marketing-attribution-for-founders`
* `/guides/agency-attribution-reporting`

---

## 7. Free Tools
Lead-generation and high-utility SEO assets that drive inbound links and direct usage.

* `/tools/utm-builder`
* `/tools/lead-source-checklist`
* `/tools/attribution-readiness-checklist`
* `/tools/roas-cpl-calculator`
* `/tools/revenue-per-visitor-calculator`
* `/tools/ai-referral-checker`

---

## 8. Docs/Setup Pages
Technical documentation demonstrating ease of setup and integration depth.

* `/docs/install`
* `/docs/install/google-tag-manager`
* `/docs/install/webflow`
* `/docs/install/wordpress`
* `/docs/install/shopify-manual`
* `/docs/forms`
* `/docs/bookings`
* `/docs/utm-parameters`
* `/docs/conversions`
* `/docs/manual-conversion-api`
* `/docs/stripe`
* `/docs/shopify-webhook`
* `/docs/google-search-console`
* `/docs/privacy-and-consent`
* `/docs/cookieless-tracking`
* `/docs/troubleshooting`
* `/docs/source-definitions`
* `/docs/attribution-models`

---

## 9. Trust/Legal/Support Pages
Required pages for credibility, compliance transparency, and operations.

* `/security`
* `/privacy`
* `/terms`
* `/cookies`
* `/data-processing`
* `/status`
* `/contact`
* `/support`
* `/changelog`
* `/product-updates`

---

## 10. Internal Linking Clusters
Establish topical authority by cross-linking related pages.
- **The B2B Attribution Cluster:** Connect `/solutions/saas` ↔ `/use-cases/form-attribution` ↔ `/guides/lead-source-tracking`.
- **The eCommerce Cluster:** Connect `/solutions/ecommerce` ↔ `/use-cases/shopify-webhook-attribution` ↔ `/guides/stripe-attribution`.
- **The Alternative/Compare Cluster:** Link from product pages directly to comparisons (e.g., "Looking for a simpler GA4? See the comparison").

---

## 11. Do-Not-Build-Yet List
Strictly out-of-scope for the current paid beta phase. **Do not create content promising these features:**

* company reveal / IP enrichment
* prospect database
* target account lists
* CRM account intelligence
* browser extension
* display ad campaign management
* AI lead scoring
* automated sales workflows
* audience builder
* enrichment APIs
* sales-intelligence suite
* native Salesforce integration
* production HubSpot sync
* production Google Ads/Meta native sync
* agency white-label public reporting

---

## 12. Priority Order
Suggested order of execution for content rollout:
1. **Trust/Legal/Support** (Required for basic operational launch)
2. **Docs/Setup Pages** (Required for beta user onboarding)
3. **Product Pages** (Core platform description)
4. **Use-Case Pages** (Problem-specific landing pages)
5. **Audience Solution Pages** (Persona alignment)
6. **Comparisons** (Capture high-intent competitor traffic)
7. **Free Tools & Guides** (Long-term top-of-funnel acquisition)

---

## Communication & Claims Constraints
**The following hard rules apply to all copy written for these pages:**
* **DO NOT** claim SOC 2 certification.
* **DO NOT** claim to be "GDPR compliant" (use safer wording like *privacy-conscious*, *consent-aware*, *PII-minimized*).
* **DO NOT** claim to be a "native Shopify app" (refer to it as a *manual Shopify webhook recipe* or integration).
* **DO NOT** claim to be a "native Stripe app" (refer to the webhook adapter).
* **DO NOT** claim automatic Google Ads/Meta sync unless it is explicitly production-verified.
* **DO NOT** claim "exact AI prompt attribution" (use *AI referral detection*).
* **DO NOT** claim "exact keyword-to-customer attribution" (use *Search Console query visibility*).

---

## 13. Lead Intelligence / AI Enrichment Stance
SourceTrack should not copy Leadfeeder-style AI enrichment, company reveal, IP enrichment, contact enrichment, or sales-intelligence workflows before paid beta.

**Product Rule:**
Any future lead-quality feature must use first-party SourceTrack data only unless there is a separately approved privacy, legal, vendor, accuracy, and pricing review.

**Allowed Future Direction:**
* First-party lead quality insights
* Journey summaries
* Source quality explanations
* Campaign quality notes
* Conversion-path summaries
* Simple qualification signals based only on captured SourceTrack data

**Not Allowed Before Paid Beta:**
* company reveal / IP enrichment
* contact enrichment
* ICP database
* prospect database
* technographic enrichment
* firmographic enrichment
* AI lead scoring
* browser extension
* sales outreach automation
* CRM sales-intelligence workflows

**Safe wording:**
* "See which sources bring qualified leads."

**Unsafe wording:**
* "Reveal anonymous companies."
* "Enrich every lead with contact data."
* "Score leads automatically with AI."
* "Identify your ideal customer profiles automatically."
