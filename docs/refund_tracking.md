# Refund tracking

When a customer is refunded, the money has to come back out of your revenue — but **not** out of the
source that won them. Refunds are recorded on their own line, **Unattributed refunds**, and the
acquiring source's revenue is left exactly as it was. This page covers why, what it looks like in
your reports, and how a refund is matched to the purchase it reverses.

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

The Shopify rail matches the refund to the original order by order id, so the refund is linked to
the purchase it reverses.

## Why a refund is not subtracted from the source that won the sale

A refund is **never** debited against the acquiring source. It carries no traffic source, campaign
or UTM tags of its own, and it does not borrow the original purchase's.

This is deliberate, and it is the part most likely to look wrong at first glance. The refund itself
is a **certain fact** — the money came back, on a known date, for a known amount. Which channel
should absorb it is **not** a fact: it depends on the attribution model you have selected, and that
model's answer for the original sale was already an estimate. Subtracting from that same channel
takes one estimate and turns it into a second, equal-and-opposite estimate. If the original credit
went to the wrong channel, you now have a wrong credit *and* a wrong debit — the error doubles
rather than cancelling out.

So SourceTrack keeps the certain part and stops there. Your total revenue nets exactly, on the
refund's own date. The per-source numbers keep reporting what each source actually earned, and the
reversal sits on its own line where you can see it.

**What this means when you read a report:** revenue by source shows gross revenue per source, and
**Unattributed refunds** shows the reversals. The two together reconcile to your net total. If you
want net-of-refunds per source, that is a judgement call about which model to trust — it is not a
number we will assert for you.

## When a refund cannot even be matched: `refund_unresolved`

Sometimes the original purchase cannot be found. The usual causes:

- a Stripe refund with no `payment_intent` to join on (some subscription-mode refunds)
- a refund for an order placed before SourceTrack was installed
- an order whose events have since been erased under a data-deletion request

In that case the refund is marked **`refund_unresolved`** rather than being dropped or guessed at.
A matched refund is marked `unattributed` instead. The two are kept apart on purpose: `unresolved`
means we could not identify the original purchase at all — a real gap, and one worth investigating —
while `unattributed` means we know exactly which purchase it reverses and are deliberately not
debiting its source. Both land on the same **Unattributed refunds** line in your reports; only the
underlying reason differs.

**What that means for your numbers:** the refund still reduces total revenue, because the negative
value is recorded. It is not attributed to a specific source — for a matched refund because we
choose not to, and for an unmatched one because we could not even if we wanted to.

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
