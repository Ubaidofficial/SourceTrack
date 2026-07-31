# Why your attribution numbers never match

If you run GA4, Meta Ads, TikTok Ads, Shopify and SourceTrack side by side, they will report
different numbers for the same week. Not slightly different — sometimes 2–3× apart on the same
campaign.

None of them is lying. They are answering different questions, and this page is the short version
of what each one is actually measuring, so you can tell a real tracking problem from normal
disagreement.

**The one-line version:** every platform decides for itself *which touch gets the credit*, *how far
back it is willing to look*, and *whether two visits were the same person*. Change any one of those
three and the number changes.

---

## 1. They credit different touches

A customer sees an Instagram ad, searches your brand on Google a week later, then buys from an
email link. One sale, three touches. Who gets the credit?

| Platform | Default answer |
|---|---|
| Meta Ads | Meta's own ad, if it was involved at all |
| TikTok Ads | TikTok's own ad, if it was involved at all |
| GA4 | Data-driven, distributed across touches Google observed |
| Shopify | Whatever referred the visit that converted |
| SourceTrack | Whichever model you pick — 9 are available |

Every ad platform counts conversions **it can claim**. That is not dishonest, but it does mean
Meta and TikTok can each report the same sale, and adding their numbers together double-counts.

SourceTrack does not pick for you. First Touch, Last Touch, First/Last Non-Direct, Linear, Time
Decay, U-Shaped, W-Shaped and the rest are lenses on **one recorded journey** — switching models
re-splits the same conversions rather than fetching a different dataset. That's why two SourceTrack
reports can disagree with each other too, and why the model name matters when comparing anything.

## 2. They look back over different windows

A conversion is only attributed if the platform still remembers the click.

- Ad platforms use their own click and view windows, configurable per account.
- **View-through** attribution is the big one: some platforms credit an ad that was *displayed*
  and never clicked. SourceTrack cannot see an impression nobody clicked, so an ad platform
  crediting view-throughs will always report more conversions than we do.
- SourceTrack uses your configured attribution window (default 30 days, max 90).

If your window is 30 days and a platform's is 7, a sale from a click on day 10 appears in one and
not the other. Neither is wrong.

## 3. They disagree about who the visitor is

- **Ad platforms** use their own logged-in identity across devices. Someone who clicks on their
  phone and buys on a laptop is one person to Meta.
- **SourceTrack is cookieless and first-party.** We do not fingerprint and we set no cookies, which
  is the point — but it means a phone-then-laptop journey is two visitors to us unless something
  links them, such as an `identify()` call carrying the same user id.
- **Shopify** reports on the session that checked out.

This is a deliberate trade. Cross-device stitching by fingerprinting would raise our match rate and
break the privacy model SourceTrack exists for.

## 4. Some differences are just plumbing

Worth ruling out before assuming a model difference:

- **Ad blockers and tracking prevention** stop client-side scripts. Server-side conversions
  (Stripe, Shopify webhooks, the offline API) still land, so revenue can look right while
  pageviews look low.
- **Timezones.** Report boundaries differ; a late-night sale can land on different days.
- **Refunds.** SourceTrack nets refunds against the original source — see
  [Refund tracking](./refund_tracking.md). A platform that ignores refunds shows a higher number
  that is not more accurate.
- **Currency.** Shopify's `total_price` is in your **shop** currency, not what an international
  customer paid at checkout. A CA$1,057 order in a USD store is recorded as roughly $753 — correct,
  and not what the buyer saw.

---

## What to do about it

**Pick one system as your source of truth for a given decision**, and use the others for what they
are uniquely good at. Ad platforms are the right tool for optimising inside their own auction.
They are the wrong tool for deciding how to split budget *across* channels, because each one is
structurally incentivised to claim the sale.

**Compare like for like before concluding anything is broken.** Same date range, same timezone,
same attribution model, same window. Most reported "mismatches" close substantially once those
four line up.

**Investigate when the gap is directional, not just large.** A stable 20% difference is normal. A
number that drops to zero, or a source that suddenly becomes 100% Direct, is a tracking problem —
start with [Troubleshooting](/docs/troubleshooting).

---

*If a number here does not match what you see in the product, trust the product and tell us — this
page is an explanation, not a specification.*
