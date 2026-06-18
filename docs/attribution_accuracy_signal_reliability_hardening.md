# Attribution Accuracy + Signal Reliability Hardening

**Status:** BACKLOG — Pre-paid-beta. Not started. Do not implement until explicitly requested.  
**Added:** 2026-06-18 (Session 140Z-G3)  
**Release gate:** Blocks paid beta until audit is completed **or** operator explicitly defers with documented rationale.

---

## Why This Matters

SourceTrack competes with DataFast, Cometly, and Plurio on attribution reliability. Before charging customers, we must be honest about what the signal chain can and cannot do, and we must close the obvious signal loss gaps that degrade the product's core promise.

**We must not overclaim.** No copy may assert "100% accurate", "perfect attribution", "ad-block-proof", or "guaranteed attribution". The goal is maximum practical accuracy with honest documentation about limits.

---

## Scope

### 1. Audit Current Tracking Architecture

Audit each signal path for correctness, completeness, and loss risk:

| Signal Path | What to Audit |
|-------------|---------------|
| Browser script pageview tracking | UTM capture, referrer capture, session continuity, first-touch persistence |
| Custom tracking domain / reverse proxy | Setup docs, DNS config correctness, event routing verification |
| Manual Conversion API / server-side events | Endpoint correctness, visitor ID linking, attribution chain completeness |
| Stripe webhook revenue attribution | visitor_id / user_id matching, timing, idempotency, delayed event handling |
| Manual Shopify webhook recipe | Accuracy of the documented recipe, order ID dedupe, visitor linkage |
| Form / booking conversions | Field capture, submission detection, anonymous vs known visitor handling |
| UTM capture and persistence | localStorage persistence, cross-page carry, overwrite rules |
| Referrer capture | Normalization, stripping, AI referral detection accuracy |
| AI referral detection | Platform list completeness, false positives, referrer ambiguity |
| GSC / search query association | Matching logic, estimated vs actual revenue labeling |
| Identity stitching | user_id / email / anonymous_id linkage, stitching timing, gap cases |
| Attribution job timing | Nightly job window, delayed event handling, recalculation triggers |

---

### 2. Identify Signal Loss Points

Document and assess each loss vector:

| Loss Vector | Expected Impact | Mitigation Path |
|-------------|-----------------|-----------------|
| Ad blockers | Pageview/conversion events dropped in browser | First-party proxy domain |
| Cookie / localStorage restrictions | UTM persistence fails | Server-side attribution fallback |
| Safari / ITP | Referrer stripped; localStorage cleared in 7 days | Server-side events; shorter attribution windows |
| Cross-domain flows | Session / visitor ID breaks across domains | Cross-domain ID passing docs |
| Checkout redirects | Conversion fires on a different domain than entry | Server-side conversion API |
| Missing UTMs | Source attributed to Direct even when paid | UTM best-practice docs |
| Direct traffic overwriting prior source | First-touch lost on return visits | Attribution model choice docs |
| Bot / internal traffic | Inflated metrics | Bot UA filter audit; internal exclusion docs |
| Duplicate conversion events | Revenue double-counted | Dedupe key audit across order_id / idempotency |
| Webhook retries | Stripe/Shopify events processed multiple times | Idempotency key verification |
| Delayed Stripe / Shopify events | Conversion attributed hours/days late | Attribution window docs |
| Anonymous-to-known stitching failures | Revenue orphaned from source | Stitching fallback audit |

---

### 3. Improve Where Practical

Prioritized improvements — implement only when this item is formally scoped:

- First-party custom tracking domain / reverse proxy setup guide
- Server-side Conversion API documentation and integration examples
- Stronger UTM persistence (first-touch locked server-side if possible)
- Safer direct-traffic attribution rules (do not overwrite prior non-direct source on return visits within window)
- Dedupe keys for conversions / orders / payments (order_id, transaction_id)
- Better identity stitching fallbacks (cookie fallback, server-side identify)
- "Confidence / source quality" indicators — only if backed by real logic, never cosmetic
- First-event and install verification improvements
- Internal traffic exclusion (IP allowlist, `?st_internal=1` param, or similar)
- Bot filtering and obvious noise reduction

---

### 4. QA Tests to Add

Each test must use real or seeded data — no mocked attribution math:

| Test Scenario |
|---------------|
| UTM → visit → conversion: source attributed correctly |
| Referrer → visit → conversion: referrer source attributed correctly |
| AI referral → visit → conversion: AI source attributed and labeled correctly |
| Direct return visit does not overwrite original non-direct source (within attribution window) |
| Stripe webhook attribution with existing visitor / user ID linkage |
| Manual Conversion API attribution with anonymous and known visitor |
| Duplicate webhook / conversion event dedupe (same order_id submitted twice) |
| Custom tracking domain / proxy: event captured and attributed correctly |
| Cross-domain visitor continuity (if supported) |

---

### 5. Docs and Customer-Facing Copy to Produce

| Document | Purpose |
|----------|---------|
| "How SourceTrack improves attribution reliability" | Honest explanation of signal quality approach |
| "What SourceTrack can and cannot know" | Honest limits doc — no overclaims |
| "How to get the most accurate attribution" | Customer best-practice guide |
| "Use a custom tracking domain" | Setup guide for proxy / first-party domain |
| "Send server-side conversions" | Conversion API integration docs |
| "Use UTMs consistently" | UTM hygiene guide |
| "Connect Stripe / manual Shopify recipe" | Revenue attribution setup guide |
| "Exclude your own visits" | Internal traffic exclusion guide |

---

## Approved Customer-Facing Wording

These phrases are acceptable:

- "Improve attribution reliability"
- "Recover more conversion signal"
- "Use first-party tracking and server-side conversions"
- "Understand which sources most likely created customers"
- "Privacy-conscious attribution"
- "Built to reduce missing or misattributed conversions"

---

## Forbidden Wording — Hard Block

These phrases must **never** appear in customer-facing copy, marketing, or documentation:

| Forbidden Phrase | Reason |
|-----------------|--------|
| "101% accurate" | Numerically impossible marketing claim |
| "100% accurate" | No attribution system achieves this |
| "perfect attribution" | No attribution system achieves this |
| "ad-block-proof" | First-party proxy reduces loss; it does not eliminate it |
| "guaranteed attribution" | No guarantee is possible |
| "exact keyword-to-customer attribution" | GSC data is sampled and estimated |
| "exact AI prompt attribution" | Referrer is a domain; prompt content is never available |
| "native Shopify app" | Unless a Shopify app is actually built and listed |
| "native Stripe app" | Unless a Stripe app is actually built and listed |

---

## Release Gate Status

Paid beta is **NOT READY** until this item is:
- Completed (audit done, critical gaps addressed, docs produced), **or**
- Explicitly deferred by the operator with documented rationale added to `docs/release_checklist_gate.md`.

Do not implement any part of this spec until explicitly asked. Record work in a new session doc when started.
