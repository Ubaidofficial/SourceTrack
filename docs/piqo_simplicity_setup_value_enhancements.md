# Piqo-Inspired Simplicity + Setup Value Enhancements

## Purpose

Use Piqo (Traffic Source) as a simplicity and product-packaging benchmark for SourceTrack, not as an architectural template. SourceTrack remains a hosted SaaS with Supabase, PostHog, and Railway, and has stronger paid-beta readiness requirements. The goal is to learn from Piqo's user experience simplicity to accelerate the user's "aha" moment.

---

## What to learn from Piqo

1. **One-line tracker install experience**: Minimize friction to get tracking live immediately.
2. **Plain-English onboarding and setup progress**: Founder-friendly guidance that explains progress in clear milestones.
3. **Simple visitor/session/conversion mental model**: Avoid jargon; describe journeys in terms anyone can understand.
4. **Clear tracker documentation**: Explicitly explain UTMs, referrer detection, visitor ID, session ID, SPA tracking, and conversion linking.
5. **Stripe attribution setup feel**: A simple setup experience, even while maintaining webhook-based reliability.
6. **GSC/SEO insights**: Framed as "what is working / what to improve" rather than raw SEO data dumps.
7. **Demo-ready staging data and public product demo**: Fast value demonstration through high-fidelity, deterministic demo data.
8. **High-velocity dashboard**: Answer within 5 seconds: "Which sources make me money?"
9. **Minimal controls by default**: Keep the interface clean, placing advanced details behind "View details" or drawers.
10. **Founder/marketer-friendly copy**: Conversational, outcome-oriented wording.

---

## What NOT to copy

* **SQLite/self-hosted architecture**: SourceTrack scales on Supabase and PostHog.
* **Stripe polling**: Do not use polling as the primary revenue ingestion path; stick to signed webhooks.
* **Raw per-site Stripe secret storage**: Avoid storing raw credentials unless intentionally designed and secured.
* **"No limits" positioning**: SourceTrack enforces clear usage-based tiers (pageviews, conversions).
* **Self-hosted-first messaging**: Position SourceTrack as a robust, zero-maintenance SaaS.
* **Affiliate system before core readiness**: Keep focus on core attribution engine accuracy and stability.
* **Fake metrics or hardcoded demo values in production UI**: Ensure all production data is real; keep demo data clearly labeled and isolated.
* **Overclaiming attribution accuracy**: Never claim "100% accurate" or "ad-block-proof" attribution.

---

## SourceTrack roadmap enhancements

### A. Install/onboarding simplicity
* **One-line install mental model**: Keep the primary script tag as clean and short as possible.
* **Copy snippet clarity**: Add copy-to-clipboard buttons and clean formatting for the code blocks.
* **Help paths**: Provide clear, step-by-step copy-paste guides for GTM, Webflow, Shopify, Framer, and WordPress.
* **"Takes about 5 minutes" onboarding copy**: Set quick time-to-value expectations.
* **Setup doctor troubleshooting**: Translate ingestion errors or missing signals into plain-English instructions.
* **Verify later flow**: Allow founders to skip verification and browse the dashboard (with a banner) rather than blocking onboarding.

### B. Tracker/API docs clarity
* **Key concepts explained**: Clearly define `visitor_id`, `session_id`, `user_id`, and `conversion_id`.
* **UTM persistence rules**: Explain how UTMs are persisted in the browser and how direct traffic is prevented from overwriting historical sources.
* **SPA tracking**: Provide clear guidance on how SPAs (Single Page Applications) capture route changes automatically.
* **Server-side conversion API**: Document a simple curl/request snippet for sending offline/server-side conversions.
* **Custom tracking domain/proxy**: Explain how setting up a custom domain (e.g., `track.domain.com`) improves signal reliability.
* **Honesty docs**: Clarify exactly what SourceTrack can and cannot know (ITP limitations, cookie clearing, ad-blocker edge cases).

### C. Dashboard "aha" moment
* **First-screen outcomes**: Ensure the first screen immediately answers:
  * What changed?
  * Which source is working?
  * Which conversion/revenue came from where?
  * What should I do next?
* **Empty dashboard state**: Provide an immediate CTA to seed demo data or visit setup guidance when no events exist.
* **Demo/staging data readiness**: Fast toggle to view realistic, deterministic seed data.
* **Simplified components**: Keep source cards and the journey drawer streamlined.

### D. GSC/SEO attribution UX
* **Query and page visibility**: Align search engine query clicks to specific landing pages.
* **SEO revenue association**: Connect organic search landing pages directly to leads and revenue.
* **"Quick Wins / Winners / Losers" views**: Simple, actionable lists showing pages gaining or losing search visibility and revenue.
* **Honest copy**: Avoid claiming exact keyword-to-customer stitching where referrers are stripped.

### E. Stripe/revenue attribution UX
* **Signed webhook reliability**: Retain robust security and transaction guarantees.
* **Simpler setup feel**: Provide step-by-step guides with screenshots showing where to find webhook secrets in Stripe.
* **User ID stitching**: Explain how passing the Stripe `customer_id` or email links external revenue events to browser sessions.
* **Test mode clarity**: Provide a clear toggle or separated views for Stripe test mode vs. live mode.
* **No "native app" claims**: Do not suggest a native Shopify/Stripe app integration exists until it is actually built.

### F. Demo/staging readiness
* **Deterministic seed data**: Write a reproducible seeding script that populates the database with realistic journeys.
* **Public homepage demo**: Allow prospects to play with a fully loaded read-only dashboard fixture.
* **PII protection**: Ensure all seed/demo data is completely synthetic and free of real customer PII.
* **Clear demo labeling**: Add persistent, highly visible badges when viewing demo data.
* **No fake production metrics**: Do not hardcode fictitious metrics in the live customer dashboard.

### G. Do-not-build-yet list
* **Affiliate system**: Defer until core attribution engine is fully mature.
* **Self-hosting mode**: SourceTrack remains a managed SaaS.
* **Heavy BI/report builder**: Keep the Report Builder focused on key presets; avoid complex ad-hoc querying controls.
* **Unlimited/no-limits positioning**: Enforce usage caps on all tiers.
* **Stripe polling replacement**: signed webhook remains the only supported revenue ingestion path.
* **Advanced SEO suite**: Do not build general keyword trackers; only build views that connect SEO pages to revenue.

---

## Paid beta decision

### Blockers vs. Polish Split

To balance speed-to-market with the high standards of paid-beta readiness, the simplicity and setup enhancements are split:

#### Hard Pre-Paid-Beta Blockers (P0)
These items must be completed and verified before the first paying customer is onboarded:
1. **Onboarding/install simplicity**: Plain-English setup steps, copy snippet clarity, and the "verify later" dashboard exit.
2. **Tracker/API docs clarity**: Basic honesty docs, UTM persistence rules, and server-side conversion API snippets.
3. **Demo/staging data readiness**: A working toggle to populate realistic, synthetic seed data so the dashboard is not empty on day one.
4. **Dashboard aha moment clarity**: Restructuring the first-screen layout to answer core attribution questions within 5 seconds.

#### Post-Paid-Beta Polish (P1/P2)
These items are deferred to the pre-public-launch or post-public-launch backlog:
1. **Advanced GSC opportunities views**: "Winners / Losers" and "Quick Wins" organic search revenue views.
2. **Stripe setup simplification**: Interactive setup wizard or guided walkthroughs beyond the current test-mode docs.
3. **Public comparison/SEO content**: Marketing content and public product comparison pages inspired by competitor simplicity.
4. **Affiliate system**: Defer indefinitely (placed on the "Do-Not-Build" list).
