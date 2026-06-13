# SourceTrack Paid Beta Legal & Policy Readiness

> [!IMPORTANT]
> **DISCLAIMER:** This document outlines the technical design, data boundaries, and policy postures of SourceTrack. **This is not legal advice** and is not a substitute for professional legal review. SourceTrack is currently in a private beta phase.

---

## 1. Regulatory Compliance & Disclaimer

- **No Compliance Claims:** SourceTrack does not claim, warrant, or guarantee compliance with GDPR, CCPA/CPRA, ePrivacy Directive, or any other regional privacy regulations.
- **Beta Policy Drafts:** The existing Privacy Policy (`/privacy`) and Terms of Service (`/terms`) served by the dashboard are temporary beta drafts meant for initial transparency and testing. They are not final, lawyer-reviewed policies.
- **Lawyer Review Required:** A formal legal review of all terms, privacy policies, and data processing workflows is strictly required before the public launch of the platform.

---

## 2. Customer Responsibilities

- **Consent & Legal Basis:** Customers installing the SourceTrack script are solely responsible for establishing the legal basis for tracking their visitors, configuring cookie/consent banners, and maintaining compliance with laws applicable to their target jurisdictions.
- **ePrivacy Caveat (Cookieless Mode):** While Cookieless Mode avoids writing browser cookies or `localStorage` keys, reading client headers (e.g., User-Agent, IP address) to generate visitor hashes may still require disclosure or explicit consent in certain jurisdictions (such as under the EU ePrivacy Directive's definition of accessing information on terminal equipment). Customers must evaluate their own legal requirements for using cookieless tracking.

---

## 3. Data Collection Spec

SourceTrack collects website telemetry submitted by client-side scripts and server-side webhooks/APIs, including:
- Pageviews, referrer URLs, and target paths.
- Campaign parameters (UTM tags, click identifiers like GCLID).
- AI discovery referrers (e.g., ChatGPT, Claude, Gemini, Perplexity).
- Conversion events (purchases, signups, custom events).
- **IP Address Handling:** Raw IP address handling must be verified against the current ingestion and analytics providers. Do not claim ClickHouse storage behavior because SourceTrack does not currently use ClickHouse as the production event warehouse.

---

## 4. Sub-Processor Boundaries

- **PostHog Telemetry (Best-Effort):** PostHog acts as our external event ingestion backend. Visitor data erasure requests invoke the PostHog REST API with `delete_events=true` to delete corresponding person profiles and their events. This is performed on a best-effort basis (non-blocking). Account or site deletions in SourceTrack do *not* automatically trigger bulk historical event purges in PostHog.
- **Stripe Billing Records (Retained):** Legally required Stripe billing profiles, payment logs, invoices, and subscription records are maintained indefinitely by Stripe for tax, accounting, and legal audit purposes. They are completely decoupled from visitor erasure and account deletion requests.

---

## 5. Deletion & Retention Mechanics

- **Nightly Retention Purge:** Supabase database attribution records (`attributed_conversions`) older than the site's configured `data_retention_days` are purged automatically each night.
- **Visitor Erasure:** Erasing a visitor permanently deletes their `attributed_conversions` and site-specific `site_identity_links` from Supabase immediately, and sends a best-effort delete request to PostHog.
- **Account Deletion:** If a user is the sole member of a company workspace, account deletion cascades through SourceTrack app database records for sites, member associations, and database attribution records. Historical raw analytics events already sent to PostHog are not bulk-erased by account deletion and require separate retention/purge handling. Stripe billing records are handled separately. In shared workspaces, the sites remain active and only the deleting user's membership and auth profile are removed. Sole administrators of shared workspaces are blocked from deletion until ownership is transferred.

---

## 6. Pre-Public-Launch Gaps (P0/P1)

- **[P0] B2B Data Processing Agreement (DPA):** B2B customers serving EU visitors must sign a DPA with SourceTrack. SourceTrack must also ensure its agreements with external sub-processors (PostHog, Stripe) are aligned with these B2B commitments.
- **[P1] Custom Terms & Policy Finalization:** Drafting and adopting formal Terms of Service, Privacy Policies, and Acceptable Use policies that have been audited and signed off by a qualified attorney.
- **[P1] Ingestion IP Verification Audit:** Performing a technical validation to confirm exactly where raw IP addresses are held or discarded at every stage of the ingestion telemetry flow.
