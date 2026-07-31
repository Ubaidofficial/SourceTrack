# Refund tracking

When a customer is refunded, the revenue SourceTrack attributed to the source that won them should
come back off that source. This page covers how that works, what it looks like in your reports, and
the one case where a refund cannot be attributed.

Both rails are supported: **Stripe** and **Shopify**.

---

## How a refund is recorded

A refund is not a deletion. It is ingested as a **compensating conversion with a negative value**,
carrying the same visitor identity as the original purchase. Revenue is a signed sum, so a $100
sale and a later $100 refund net to zero on the source that earned it.

Recording it as a negative rather than deleting the original is deliberate:

- the original sale **did** happen, and deleting it would rewrite history
- conversion **counts** stay honest — a refunded order is still an order that was placed
- partial refunds work with no special case: refund $30 of a $100 order and the source keeps $70

**A refund never decrements your conversion count.** Only revenue nets. A source showing 10
conversions and $700 after a $300 refund is correct.

## Setup

### Stripe

Subscribe to `refund.created` on your existing SourceTrack Stripe webhook. See
[Stripe (Manual)](/docs/platforms/stripe).

### Shopify

Subscribe to `refunds/create` on your existing SourceTrack Shopify webhook, alongside the
`orders/paid` topic you already send. See [Shopify (Manual)](/docs/platforms/shopify).

The Shopify rail matches the refund to the original order by order id, then inherits that order's
visitor so the refund lands on the same journey the purchase did.

## What gets inherited — and what deliberately does not

A refund inherits **only the original purchase's visitor identity**. It does **not** copy the
original's traffic source, campaign or UTM tags.

That looks like a gap and is actually the careful part. Stamping a specific acquiring source onto
the refund by itself would fabricate negative revenue against a channel on an event that channel
never earned. Instead the refund carries the same neutral provider stamp the order did, and your
attribution model re-derives the credit from the visitor's real touchpoints — so the negative lands
where the positive did, by the same logic, rather than by a guess.

## When a refund cannot be matched: `refund_unresolved`

Sometimes the original purchase cannot be found. The usual causes:

- a Stripe refund with no `payment_intent` to join on (some subscription-mode refunds)
- a refund for an order placed before SourceTrack was installed
- an order whose events have since been erased under a data-deletion request

In that case the refund is marked **`refund_unresolved`** rather than being dropped or guessed at.

**What that means for your numbers:** the refund still reduces total revenue, because the negative
value is recorded. It is not attributed to a specific source, because we do not know which source
earned the original sale.

**It is never assigned to Direct.** Bucketing an unknown into Direct would quietly understate a
real channel's performance, and Direct is where unknowns already accumulate — the one place a
wrong guess is hardest to notice. An unresolved refund is labelled unresolved.

If you see unresolved refunds you did not expect, the most common cause is a missing `orders/paid`
or `checkout.session.completed` subscription — the refund arrived but the purchase never did.

## Timing

Refunds are processed when the webhook arrives. Source-level netting appears in your reports after
the nightly attribution run, so a refund taken today is reflected in attributed revenue tomorrow.
Total revenue reflects it immediately.

---

*Related: [Why your attribution numbers never match](./attribution_mismatch.md) — refund handling is
one of the reasons a platform that ignores refunds reports a higher number than SourceTrack.*
