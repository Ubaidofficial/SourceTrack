---
enable: true
title: Questions Worth Asking Before You Install Anything
subtitle: Straight answers about how the attribution works, what we collect, and what is still in beta.
badge: Frequently Asked Questions

faq_list:
  - question: Which attribution model does SourceTrack use?
    answer: >-
      Whichever one you pick. The model is a lens on the same recorded journey, not a
      different dataset. SourceTrack stores every touchpoint that led to a conversion, then
      splits the credit according to the model you select: First Touch, Last Touch, First or
      Last Touch excluding direct visits, Linear (equal credit to every touch), Time Decay
      (7-day half-life, so recent touches count more), U-Shaped (40% first, 40% last, 20%
      spread across the middle) and W-Shaped (30/30/30/10). Single-touch models answer "what
      started it" or "what closed it"; multi-touch models spread one conversion across the
      whole path, so the same sale is never counted twice. Switch models and the same
      conversions are re-split in front of you, and you can open any conversion to see the
      exact touchpoints and the arithmetic behind its credit.

  - question: What does "cookieless" actually mean for someone visiting my site?
    answer: >-
      Nothing is written to their device. The cookieless tracker sets no cookies and uses no
      localStorage or sessionStorage, so there is nothing to clear and nothing to consent to
      storing. Instead the visitor ID is derived on our server as a salted SHA-256 hash and
      handed back to the page. It rotates every 24 hours; the session ID rotates hourly. The
      raw IP address is never stored, only the salted hash, which cannot be reversed back
      into an IP. There is no device fingerprinting, no cross-site identifier, and no
      third-party storage of any kind. If the browser sends Do Not Track or Global Privacy
      Control, the script disables itself entirely rather than tracking anonymously. The
      trade-off is worth stating plainly: a visitor returning after 24 hours looks like a new
      visitor unless they identify themselves, so long consideration windows are less precise
      than a cookie-based tool would claim to be.

  - question: Is the Stripe integration ready to use?
    answer: >-
      It is built, and it is in beta. You connect it yourself by adding a webhook endpoint in
      your Stripe dashboard. This is not a one-click Stripe app, and there is no listing in
      the Stripe App Marketplace. Once connected, completed checkouts arrive as conversions
      with their real revenue attached and are attributed back to the source that brought the
      buyer, and refunds net against the original sale rather than leaving inflated revenue
      behind. Being straight about the maturity: no production store is connected to this
      path yet, so it is proven by our own test suite rather than by someone else's live
      revenue. The same is true of the Shopify webhook. If you need this part battle-tested,
      wait.

  - question: What is the status of the Search Console integration?
    answer: >-
      Also beta, and deliberately conservative about what it claims. Once you connect a
      verified Search Console property, SourceTrack pulls daily query and landing-page
      performance and lines it up against the revenue landing on those same pages. The figure
      you get per query is an estimate, matched by landing page and date range, and it is
      labelled as an estimate everywhere it appears. Google does not tell anyone which
      specific search led to which specific customer, and a tool that shows you an exact
      number there is guessing without saying so. Manual syncs are verified working; the
      automated overnight sync is the part still settling down. When it fails, the connection
      shows an error rather than quietly reporting zero.

  - question: How does SourceTrack handle GDPR?
    answer: >-
      The privacy model does most of the work: no cookies, no fingerprinting, rotating
      identifiers, and no raw IP addresses in storage. On top of that there are working
      endpoints for the three requests that actually arrive: a subject access request
      returning everything held about one visitor, an erasure request that deletes it, and a
      full workspace deletion that purges the account. Erasure reports what it actually
      removed rather than returning a generic success message. You can set your own retention
      period per site instead of inheriting ours. A Data Processing Agreement and the full
      subprocessor list are published on this site rather than available on request. What we
      do not do is claim a certification we do not hold. This describes the controls that
      exist, not a compliance guarantee for your particular setup.

  - question: What does it cost, and is there a trial?
    answer: >-
      Starter is $49/month and Growth is $79/month, plus a $99/year Founder rate for early
      adopters that stays locked at that price. Every new workspace starts on a 28-day trial
      with no credit card required. The trial is a flag on your account rather than a Stripe
      subscription, so there is nothing to cancel and nothing charges when it ends. When it
      does end, tracking stops and your data stays where it is until you either upgrade or
      delete the workspace. The volume allowance for each plan is listed on the pricing page.
---
