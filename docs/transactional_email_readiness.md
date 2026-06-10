# SourceTrack Transactional Email Readiness Map

> [!IMPORTANT]
> **OPERATIONAL DISCLAIMER:** This document maps the transactional email capability, configuration requirements, and deliverability policies of the SourceTrack platform. No real emails are sent during local verification, and production Resend API keys must not be hardcoded or checked into repository files.

---

## 1. Email Classification & Inventory

To ensure operational clarity and regulatory compliance, we categorize our email traffic into distinct boundaries:

| Email Category | Description | Delivery Provider | Opt-Out Requirement |
| :--- | :--- | :--- | :--- |
| **Usage Threshold Alerts** (Transactional / Product-Critical) | Real-time warnings triggered when a site consumes 50%, 80%, or 100% of its monthly pageview limit. Critical for account status transparency. | SourceTrack (via Resend) | **Transactional:** Legally exempt from unsubscribe requirements. |
| **Stripe Billing Emails** (Operational / Billing) | Invoices, payment receipts, subscription confirmations, renewal notices, and charge failure alerts. | Stripe (Direct) | **Transactional:** Managed directly through Stripe Dashboard templates. |
| **Attribution Digests** (Report digests / Notifications) | Weekly or monthly attribution summary reports showing metrics (revenue, conversions, UTMs, top channels). | SourceTrack (via Resend) | **Optional Notification:** Requires opt-out/suppression-list checks. |
| **Marketing Emails** (Promotions / Newsletters) | Promotional pitches, product updates, newsletters. | *Not Implemented* | **Marketing:** Unsubscribe mandatory. Must NOT be sent from transactional channels or cron jobs. |

---

## 2. Mail Ingest & Sender Configuration

All emails sent by the application are dispatched by cron scripts invoking the Resend REST API POST endpoint (`https://api.resend.com/emails`) authenticated with `RESEND_API_KEY`.

- **Sending Jobs & Hardcoded Addresses:**
  - **Attribution digests:** Sent by `api/jobs/email-reports.js` using hardcoded sender address `SourceTrack <reports@sourcetrack.ai>`.
  - **Usage alerts:** Sent by `api/jobs/usage-threshold-emails.js` using hardcoded sender address `SourceTrack <usage@sourcetrack.ai>`.
- **Support & Reply-To Warning:**
  - The API calls do not specify a separate `reply_to` header, meaning visitor replies will fall back to the sending addresses (`reports@sourcetrack.ai` or `usage@sourcetrack.ai`). Operators must ensure these mailboxes route to a unified inbox (e.g. `support@sourcetrack.ai` or `hello@sourcetrack.ai`) to prevent silent client message drops.

---

## 3. Deliverability Checklist (DNS Verification)

Emails will fail spam-prevention audits or be rejected outright by Resend if the sender domain is not properly verified. Operators must check these records in the Resend Dashboard:

- [ ] **Resend Domain Verification:** Verify `sourcetrack.ai` inside the Resend admin panel to obtain the required DNS verification parameters.
- [ ] **SPF (Sender Policy Framework):** Add/update the domain's TXT record to authorize Resend's servers to send on behalf of `sourcetrack.ai` (e.g. `v=spf1 include:amazonses.com ~all` or as provided by Resend).
- [ ] **DKIM (DomainKeys Identified Mail):** Publish the CNAME keys provided by Resend to enable cryptographic verification of email signatures.
- [ ] **DMARC (Domain-based Message Authentication, Reporting, and Conformance):** Maintain a protective DMARC TXT record (e.g., `_dmarc.sourcetrack.ai` with policy `v=DMARC1; p=quarantine;` or `p=reject;`) to protect the domain from spoofing.

> [!WARNING]
> Deliverability status cannot be verified programmatically by the application. Operators must verify domain deliverability status directly within the Resend console before enabling production mail delivery.

---

## 4. Deduplication & Opt-Out Gaps

### Usage Alerts Deduplication
Usage alerts are strictly deduped. The `usage-threshold-emails.js` cron job checks the database table `usage_email_log` for entries matching `(site_id, month, threshold)`. A warning email is sent only once per threshold per month, preventing duplicate alerts to the customer.

### Report Digest Opt-Out Gap
- **Report Digest Suppression:** The weekly/monthly attribution reports contain a link pointing to `mailto:hello@sourcetrack.ai?subject=Unsubscribe`. However:
  > [!CAUTION]
  > There is currently no automated unsubscribe or suppression-list handling for report digests. Do not enable recurring report digests broadly until an opt-out/suppression mechanism exists or an operator-managed suppression process is documented.

---

## 5. Operator Triage & Logging

- **Job Status Logging:** Cron jobs log execution metadata to `job_runs` (`job_name`, `status`, `details`, `ran_at`). If emails fail to send, the status is set to `warning`, and details record the error counts.
- **Console Warnings:** Detailed connection errors or Resend status alerts are printed to `console.error` in standard logs.
- **Bounces & Delivery Failures:** Because Resend acts asynchronously, bounces, spam reports, or delivery failures will not be caught in application-level HTTP logs. Operators must monitor the Resend Dashboard analytics to identify bouncing addresses and customer delivery errors.
