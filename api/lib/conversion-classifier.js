/**
 * Canonical conversion classifier
 *
 * THESE LISTS ARE AN ACCEPTOR, NOT AN EMITTER — the multiple spellings per concept
 * ('signup' AND 'sign_up', 'trial' AND 'free_trial' AND 'trial_start') are DELIBERATE alias
 * tolerance, not drift. Customers send whatever their stack sends, and three surfaces already
 * emit different spellings of the same concept:
 *   - dashboard/src/pages/SolutionSaaS.jsx (PUBLIC docs) tells customers to send 'trial_start'
 *   - api/lib/stripe-subscription.js emits 'trial_start' from real Stripe webhooks
 *   - dashboard/src/pages/Onboarding.jsx's picker offers 'trial'; ReportBuilder presets filter 'trial'
 * So the canonical EMITTED spelling is `trial_start`, but every alias must keep classifying
 * identically. Do NOT "normalize" by removing aliases: values are already stored in
 * attributed_conversions and live in customer integrations, so a removal silently reclassifies
 * history and breaks working installs. Add aliases; never delete them.
 */

export const LEAD_TYPES = [
  'lead_created',
  'qualified',
  'opportunity',
  'form',
  'lead',
  'signup',
  'sign_up',
  'trial',
  'free_trial',
  // Stripe customer.subscription.created with status='trialing' — explicitly "no immediate
  // revenue" (stripe-subscription.js). Also the spelling the public docs instruct. Was MISSING,
  // so every real Stripe trial start classified as 'other'.
  'trial_start',
  'meeting',
  'book_demo',
  'schedule_meeting',
  'contact_form',
  'mql'
];

/**
 * CUSTOMER-STAGE types. Read this before adding one: `customers` is a per-ROW COUNT
 * (api/routes/dashboard.js `totalCustomers++`, attribution-engine.js `customers += 1`) — it is NOT
 * deduplicated by identity the way leads are. Two consequences bound what may go in here:
 *   1. A RECURRING type would inflate the metric (a monthly subscriber -> 12 "customers"/year).
 *   2. A type whose real-world event ALSO produces another customer-type row double-counts it.
 */
export const CUSTOMER_TYPES = [
  'closed_won',
  'purchase',
  // Stripe customer.subscription.updated, trialing -> active. Fires ONCE per subscription (its
  // idempotency key is subscription_id + conversionType) and carries $0, so it adds a customer
  // without touching revenue — the money arrives separately on invoice.paid. This is the only
  // unambiguous "became a paying customer" marker for a trial, and for a trial the trial-end
  // invoice is billing_reason='subscription_cycle' -> 'renewal', which is NOT a customer type,
  // so there is no double count.
  'trial_converted',
  // Stripe invoice.paid where billing_reason != 'subscription_cycle' — the first paid invoice of a
  // subscription, i.e. a direct-to-paid acquisition. NOTE the $0 subscription-mode checkout carrier
  // ('purchase') is never written to attributed_conversions (nightly-attribution.js:461 skips it via
  // isSubscriptionCheckoutCarrier), so this does not double-count against the checkout row.
  'subscription'
];

// DELIBERATELY NOT CLASSIFIED — recorded so the decision is discoverable instead of looking like an
// oversight. Both are emitted by stripe-subscription.js and both stay 'other':
//   'renewal' — invoice.paid billing_reason='subscription_cycle'. Recurring: adding it to
//              CUSTOMER_TYPES would count one annual subscriber as 12 customers. Its revenue is
//              still counted; only the customer COUNT excludes it.
//   'churn'   — customer.subscription.deleted. A CANCELLATION. Counting it as a customer
//              acquisition would be a §6 fabrication; it is not a lead either.
// If the product ever wants these surfaced, they need their own metric, not one of these buckets.

/**
 * MID-FUNNEL ECOMMERCE INTENT — recognized by the taxonomy, deliberately NEITHER lead nor customer.
 * A cart-add has no contact details (so it is not a lead) and no payment (so it is not a customer);
 * forcing it into either bucket would corrupt that metric. These therefore still classify as
 * 'other', leaving classifyConversionType's three-value return contract UNCHANGED so no consumer's
 * branching has to change. Spellings mirror the Meta CAPI map in api/lib/conversion-sync.js, per the
 * alias-tolerance rule above.
 */
export const ECOMMERCE_INTENT_TYPES = [
  'add_to_cart',
  'addtocart',
  'add_cart'
];

/**
 * Classifies a raw conversion type string into 'lead', 'customer', or 'other'.
 * @param {string|null|undefined} type
 * @returns {'lead' | 'customer' | 'other'}
 */
export function classifyConversionType(type) {
  if (!type || typeof type !== 'string') {
    return 'other';
  }
  const normalized = type.trim().toLowerCase();
  if (LEAD_TYPES.includes(normalized)) {
    return 'lead';
  }
  if (CUSTOMER_TYPES.includes(normalized)) {
    return 'customer';
  }
  return 'other';
}
