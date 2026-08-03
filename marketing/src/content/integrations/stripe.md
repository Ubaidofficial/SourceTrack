---
title: "Stripe Integration"
meta_title: "Stripe Integration — SourceTrack"
description: "Stripe webhook adapter for revenue attribution — test-mode beta."
image: "/images/integrations/stripe.svg"
categories: ["Payment Gateways"]
draft: false
---

SourceTrack ingests Stripe payment and subscription events through a **webhook adapter**. There is no
account connection step and no listing in the Stripe App Marketplace: you add a webhook endpoint in
your own Stripe dashboard, then paste the signing secret (`whsec_…`) into SourceTrack's Integrations
page.

Once configured, completed checkouts arrive as conversions with their real revenue attached and are
attributed back to the source that brought the buyer. Refunds net against the original sale rather
than leaving inflated revenue behind.

**Test-mode beta.** No production store is connected to this path yet, so it is proven by our own
test suite rather than by live revenue. If you need this part battle-tested, wait.
