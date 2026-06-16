# Marketing Site Copy Audit

## Current positioning
- **Core Statement**: SourceTrack is positioned as "Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies." It emphasizes lightweight script installations, AI referral tracking, 9 attribution models, and a custom report builder.
- **Tone/Style**: The tone is clean and professional, focusing on a founder-and-marketer-friendly alternative to bloated enterprise analytics (like GA4 and ad platform self-reporting).
- **Positioning Alignment**: The product successfully avoids feeling like a heavy Cometly/Usermaven clone or a fake AI dashboard, but it lacks specific "campaign-to-cash" and "revenue clarity" messaging that would make it feel premium and immediately clear to non-technical founders.

## Homepage audit
- **URL Tested**: `https://sourcetrack.ai` and `https://www.sourcetrack.ai`
- **Exact Routes**: `/` (Marketing Homepage)
- **Visible Page Sections**:
  1.  **Header Navigation**: Logo, Product, Attribution, AI Tracking, Reports, Pricing, Demo, Docs, Log In, Start Free CTA.
  2.  **Hero Section**: Kicker ("Revenue attribution for modern marketing teams"), H1 ("Know which sources actually create revenue."), Subtitle, Primary CTA ("Start tracking free"), Secondary CTA ("View product").
  3.  **Hero Preview Card**: Interactive visual preview of the dashboard.
  4.  **Interactive Demo Section**: The sandbox dashboard component (`MarketingInteractiveDemo.jsx`).
  5.  **Trust Band**: Stat-based highlights (AI referral tracking, multi-touch journeys, etc.).
  6.  **Platform Features Section**: Three columns detailing Attribution Engine, AI Referral Tracking, and Report Builder.
  7.  **How It Works Section**: 4-step workflow (Install tracker, Capture source, Track conversions, Build reports).
  8.  **Measurement Flow Section**: 5-step technical sequence of visitor signal processing.
  9.  **Comparison Table Section**: Direct comparison grid between SourceTrack, GA4, and Ad Platforms.
  10. **Footer**: Navigation links, social links, privacy/terms.
- **CTA Behavior**: All marketing call-to-actions ("Start tracking free", "Start free", "Start with your business type") direct the user to `/signup`.
- **Title/Meta Tags**:
  - **Title**: `SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies`
  - **Meta Description**: `SourceTrack helps SaaS, lead-gen, and agency teams track which sources, campaigns, AI referrals, and customer journeys turn into conversions and revenue. Multi-touch attribution with a lightweight install.`
- **Console/Network Errors**: None. Verified console output is completely clean on production landing routes.
- **Homepage Feel**: Modern and clean, but the typography and spacing can feel generic in long text blocks. The copy sometimes relies too heavily on generic terms like "events" and "conversions" instead of addressing commercial terms like "pipeline", "revenue clarity", and "campaign-to-cash visibility".

## Interactive demo audit
The homepage interactive demo (`MarketingInteractiveDemo.jsx`) is functional but does not yet feel like a real premium app. Here is a breakdown of what is supported vs what is missing:

- **Supported Features**:
  - `[x]` **Clickable source rows**: Users can click rows like "ChatGPT" or "Google Ads" to update the journey details.
  - `[x]` **AI source card**: Renders steps, attributed value, and referrer details for chatbot traffic.
  - `[x]` **Lead/conversion journey panel**: Displays step nodes (e.g. `ChatGPT -> Blog Post -> Pricing -> Stripe Checkout`).
  - `[x]` **Revenue by source**: Values are displayed in the sources tables.
  - `[x]` **UTM/campaign explanation**: Mapped text dynamically explains how each source was captured.
  - `[x]` **Static fixture data only**: Read-only local state imported from `marketingDemoData.js`.
  - `[x]` **No API/auth/Supabase/PostHog imports**: Isolated code runs without database or tracking framework dependencies.
- **Missing Features / Limitations**:
  - `[ ]` **Campaign drilldown**: No campaigns tab is available. Users cannot see UTM campaign performance breakdown.
  - `[ ]` **Copy snippet simulation**: No interactive pixel setup simulation.
  - `[ ]` **Verify tracking simulation**: No interactive tracking confirmation.
  - `[ ]` **Empty/loading states**: The demo loads immediately without any skeleton or state transitions.
  - `[ ]` **Tab Organization**: Standard web-analytics tabs are shown (Sources, AI Sources, Top Pages, Country, Browser, Device) rather than attribution-specific tabs.
- **Recommended Demo Tabs**:
  - **Overview tab**: Clean charts showing combined visitor and conversion trend.
  - **Sources tab**: Referring domains, organic search, and direct channels.
  - **Campaigns tab**: Detailed UTM campaign performance (volume, conversions, ROAS).
  - **Journeys tab**: Chronological multi-touch path visualization.
  - **AI Sources tab**: Focused breakdown of LLM referrers (ChatGPT, Claude, Perplexity, Gemini).
  - **Conversions tab**: Distinct conversion events (Purchases, Lead Forms, Booked Meetings).

## Audience fit
- **Founders**: Seeking "revenue clarity" and "founder-friendly attribution" with zero setup friction.
- **Marketers**: Looking to bypass biased ad-network reporting and GA4 complexity.
- **Ecommerce Owners**: Wanting to see which ad campaigns generate purchases (but must be warned about the lack of a native Shopify app store plugin).
- **Agencies**: Seeking "client-ready dashboard exports" and multi-site views (must be managed to prevent claiming multi-client workspaces are fully ready).
- **Lead-gen Teams**: Looking for Calendly and booking form attribution.

## SEO gaps
- **No UTM Builder Landing Page**: Lacks `/utm-builder` to capture high-volume search traffic (23.9k searches/mo).
- **No Dedicated Core Target Landing Pages**: Missing target pages for `/marketing-attribution-software` (22.2k), `/revenue-attribution-software` (1.1k), and `/lead-attribution-software` (3.4k).
- **No AI Referral Landing Page**: Lacks `/ai-referral-tracking` for an emerging AI referral/search attribution cluster. This is a differentiation page, not a volume-first page.
- **No Footer Linking**: Public footer lacks direct navigation to these high-opportunity landing pages.

## Copy gaps
- **Value Realization**: The term "campaign-to-cash visibility" and "no BI bloat" are missing from the primary headings.
- **Vague Copy**: Sections like "Capture the visit" could be tightened to focus on the business benefit ("attribution stitching" and "revenue source of truth").
- **Generic Data**: The demographic tabs (Country, Browser, Device) in the demo make it feel like Google Analytics, which distracts from the core revenue attribution story.

## Overclaim/truthfulness risks
- **Shopify Integration**: The current copy says "Works on any website, Shopify store, or Webflow site." We must explicitly state that integration is manual via script snippet tags or GTM, to prevent users from expecting a one-click Shopify App Store installation.
- **Stripe & Webhook Ingestion**: Mapped as "production Stripe attribution," but Stripe attribution currently operates in developer test-mode/beta and requires webhook setup recipes. Do not overclaim production Stripe sync.
- **CRM Database Sync**: The copy implies full CRM tracking, which is currently limited to capturing UTM parameters in hidden form fields and forwarding them on submit, rather than bidirectional database-level CRM sync. Do not claim native CRM database synchronization.
- **AI Prompt Details**: We cannot access user prompts inside AI search engines (like Claude/ChatGPT) due to privacy sandbox rules; we only capture the referring domains. The copy must reflect "AI referrer domain attribution" rather than "private prompt visibility."
- **Client/Agency Dashboards**: Do not claim multi-client permissions or guest invite workflows are fully complete until the permissions layer is ready.

## Recommended homepage messaging
- **Hero H1 Option A**: `Revenue clarity without the BI bloat.`
- **Hero H1 Option B (Current refined)**: `Know which sources actually create revenue.`
- **Support Copy**: "Connect the entire customer journey from the first AI search referral to the final Stripe payment. Stop relying on biased ad-platform click reports."
- **Key Terms to Inject**: `campaign-to-cash visibility`, `founder-friendly attribution`, `source of truth for revenue`, `AI-aware attribution`.

## Recommended section structure
1.  **Hero**: Modern layout with clean screenshot/preview card.
2.  **Social Proof / Trust Band**: Focus on ease of installation and real-time capture.
3.  **Interactive Sandbox Demo**: Real-life simulation of a SaaS dashboard with Sources, Campaigns, Journeys, AI Sources, and Conversions tabs.
4.  **How it Works**: 4-step setup detailing the Javascript tracker, journey capture, conversion triggers, and custom dashboards.
5.  **Comparison Grid**: Highlight SourceTrack's simplicity and AI referral engine vs GA4's complexity and ad-network bias.
6.  **Use Cases**: SaaS, Lead Gen, Ecommerce, and Agencies.
7.  **FAQ Section**: Address truth gates (Shopify, CRM, data privacy) upfront.
8.  **CTA Footer Banner**: High-contrast block pointing to `/signup`.

## Recommended interactive demo improvements
- **Reorganize Tabs**: Replace the web-analytics categories with:
  1.  `Overview` (Daily Trend Chart)
  2.  `Sources` (Organic, Paid, Direct)
  3.  `Campaigns` (UTM Campaign names and spend/ROAS)
  4.  `Journeys` (Chronological path of visitor touchpoints)
  5.  `AI Sources` (ChatGPT, Claude, Gemini, Perplexity)
  6.  `Conversions` (Event breakdown)
  *   *Note*: Journeys — multi-touch path from first visit to conversion.
- **Interactive Journey Timeline**: When a user clicks a campaign or AI source, render a clean step-by-step visual node sequence showing the exact path the customer walked.
- **Verification Simulator**: Add an interactive script verify block where users can type a demo domain and simulate a success signal.

## Page-by-page rewrite plan
1.  **`/` (Landing)**: Update copy to use "campaign-to-cash visibility" and clean up integrations/Shopify framing.
2.  **`/product`**: Tighten copy to highlight multi-touch attribution models and remove developer jargon.
3.  **`/pricing`**: Define exact free plan limits (30 conversions, 5,000 pageviews/mo) and paid plan models clearly.
4.  **`/ai-referral-tracking`**: Explains referrer tracking domains, major AI referrers, and how ChatGPT/Claude traffic is stitched.
5.  **`/utm-builder`**: Introduce a fully interactive UTM builder page with copy snippet and custom parameters that converts traffic to signups.

## Priority implementation sessions

- **SEO-2 — Homepage Copy + Metadata Refresh**
  - Improve hero, subhero, CTAs, feature cards, audience sections, metadata, and internal links.
  - Target: marketing attribution software + revenue attribution software.
  - Keep copy premium, simple, and truthful.

- **SEO-3 — Premium Interactive Demo Upgrade**
  - Improve `MarketingInteractiveDemo.jsx` using static fixture data only.
  - Add Overview, Sources, Campaigns, Journeys, AI Sources, Conversions.
  - Add source-row clicks, campaign drilldown, journey panel, copy snippet simulation, verify tracking simulation.
  - No API calls, auth imports, Supabase, or PostHog.

- **SEO-4 — First Commercial Landing Pages**
  - `/marketing-attribution-software`
  - `/revenue-attribution-software`
  - `/lead-attribution-software`

- **SEO-5 — UTM Builder Tool Page**
  - `/utm-builder` as a real interactive tool, not thin SEO content.

- **SEO-6 — Second-Wave Pages**
  - `/conversion-tracking-software`
  - `/ecommerce-attribution`
  - `/ai-referral-tracking`
  - Defer `/client-reporting-dashboard` until agency/client features are ready.
  - Defer `/calendly-attribution` unless it becomes a strong section or docs page first.

- **SEO-7 — Calculators**
  - `/roas-calculator` and `/roi-calculator` only if built as real tools.

## Beta readiness dependency
> [!IMPORTANT]
> **Production E2E Verification constraint**: Final production-domain app E2E should be a later paid-beta gate after staging attribution, analytics data quality, report builder, and full route/button QA pass. It must use official production custom domains only:
> - `https://app.sourcetrack.ai/`
> - `https://sourcetrack.ai/`
> - `https://www.sourcetrack.ai/`
>
> Do not use Railway production URLs as production proof. Do not run broad production mutations. Use a dedicated production beta-test user/site only if explicitly approved with a cleanup plan.
