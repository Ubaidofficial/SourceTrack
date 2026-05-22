import Stripe from 'stripe'
import { Router } from 'express'
import NodeCache from 'node-cache'
import { getSupabase } from '../lib/supabase.js'
import { normalizePlan, getPvLimit } from '../lib/plan-features.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
})

// Idempotency cache for Stripe webhook event.id — 24h covers Stripe's retry
// window with margin. Survives a single process; replicas don't share this,
// but Stripe's retry interval (4h+) makes that practically harmless.
const _seenStripeEvents = new NodeCache({ stdTTL: 86400, checkperiod: 3600 })

// ── Price → plan mapping ──────────────────────────────────────────────────────
// Populated from env vars so production and test keys both work.
// Legacy env vars STRIPE_PRICE_ID_PRO/AGENCY are still read but map to the
// new canonical names (growth/business) via normalizePlan.
function getPriceMap() {
  return {
    [process.env.STRIPE_PRICE_ID_STARTER]:  'starter',
    [process.env.STRIPE_PRICE_ID_GROWTH]:   'growth',
    [process.env.STRIPE_PRICE_ID_BUSINESS]: 'business',
    // Legacy env vars — same values mapped to canonical names
    [process.env.STRIPE_PRICE_ID_PRO]:      'growth',
    [process.env.STRIPE_PRICE_ID_AGENCY]:   'business',
    ...(process.env.STRIPE_PRICE_ID ? { [process.env.STRIPE_PRICE_ID]: 'growth' } : {}),
  }
}

// Stripe price metadata may include `pv_limit` (e.g. "50000") so a single plan
// can have multiple price tiers. Falls back to the plan's default.
function pvLimitFromPrice(price, plan) {
  const fromMeta = price?.metadata?.pv_limit
  if (fromMeta && Number.isFinite(Number(fromMeta))) return Number(fromMeta)
  return getPvLimit(plan)
}

function planFromPriceId(priceId) {
  return normalizePlan(getPriceMap()[priceId] || 'growth')
}


async function getSiteByKey(siteKey) {
  const { data, error } = await getSupabase()
    .from('sites')
    .select('id, owner_id, plan, stripe_customer_id')
    .eq('site_key', siteKey)
    .single()
  if (error || !data) return null
  return data
}

async function getSiteByCustomerId(customerId) {
  const { data } = await getSupabase()
    .from('sites')
    .select('id, plan')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return data
}

// ── Webhook handler ───────────────────────────────────────────────────────────
export async function billingWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature' })

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[billing webhook] signature error:', err.message)
    return res.status(400).json({ error: 'Invalid webhook signature' })
  }

  const sb = getSupabase()

  // Stripe retries webhooks for ~3 days on non-2xx. event.id is unique per
  // event regardless of retry — record it to skip duplicate processing.
  if (event.id) {
    const seen = _seenStripeEvents.get(event.id)
    if (seen) {
      console.log(`[billing] duplicate Stripe event ${event.id} (${event.type}) — skipping`)
      return res.json({ received: true, duplicate: true })
    }
    _seenStripeEvents.set(event.id, true)
  }

  try {
    switch (event.type) {

      // ── New subscription created via Checkout ──────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        const siteId      = session.client_reference_id
        const customerId  = session.customer
        const subId       = session.subscription

        if (!siteId || !customerId) break

        // Fetch subscription to get the price_id and determine plan + pv_limit
        let plan = 'growth'
        let pvLimit = getPvLimit(plan)
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] })
          const price = sub.items?.data?.[0]?.price
          plan = planFromPriceId(price?.id)
          pvLimit = pvLimitFromPrice(price, plan)
        }

        await sb.from('sites').update({
          plan,
          pv_limit: pvLimit,
          stripe_customer_id: customerId,
          stripe_subscription_id: subId || null,
        }).eq('id', siteId)

        console.log(`[billing] checkout complete — site ${siteId} → plan ${plan}`)
        break
      }

      // ── Subscription plan changed (upgrade / downgrade) ────────────────────
      case 'customer.subscription.updated': {
        const sub        = event.data.object
        const customerId = sub.customer
        const price      = sub.items?.data?.[0]?.price
        const status     = sub.status
        const isActive   = ['active', 'trialing'].includes(status)
        const plan       = isActive ? planFromPriceId(price?.id) : 'inactive'
        const pvLimit    = isActive ? pvLimitFromPrice(price, plan) : 0

        await sb.from('sites').update({
          plan,
          pv_limit: pvLimit,
          stripe_subscription_id: sub.id,
        }).eq('stripe_customer_id', customerId)

        console.log(`[billing] subscription updated — customer ${customerId} → plan ${plan} (${status})`)
        break
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const customerId = event.data.object.customer
        await sb.from('sites').update({ plan: 'inactive', pv_limit: 0 }).eq('stripe_customer_id', customerId)
        console.log(`[billing] subscription cancelled — customer ${customerId}`)
        break
      }

      // ── Payment succeeded (renewal) ────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object
        const customerId = invoice.customer
        if (invoice.billing_reason === 'subscription_cycle') {
          // Reactivate if somehow marked inactive
          const site = await getSiteByCustomerId(customerId)
          if (site && site.plan === 'inactive') {
            // Re-fetch sub to get current plan + price metadata
            const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, expand: ['data.items.data.price'] })
            const price = subs.data[0]?.items?.data?.[0]?.price
            const plan = planFromPriceId(price?.id)
            const pvLimit = pvLimitFromPrice(price, plan)
            await sb.from('sites').update({ plan, pv_limit: pvLimit }).eq('stripe_customer_id', customerId)
            console.log(`[billing] payment succeeded — reactivated ${customerId} → ${plan}`)
          }
        }
        break
      }

      // ── Payment failed ─────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const customerId = event.data.object.customer
        const attempt    = event.data.object.attempt_count
        // Only suspend after 3rd failed attempt — Stripe retries by default
        if (attempt >= 3) {
          await sb.from('sites').update({ plan: 'inactive', pv_limit: 0 }).eq('stripe_customer_id', customerId)
          console.warn(`[billing] payment failed x${attempt} — suspended ${customerId}`)
        } else {
          console.warn(`[billing] payment failed x${attempt} for ${customerId} — waiting for retry`)
        }
        break
      }

      default:
        // Unhandled event — not an error
        break
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[billing webhook] processing error:', err.message)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
const router = Router()

/**
 * POST /api/billing/create-checkout
 * Body: { plan: 'starter'|'growth'|'business', successUrl, cancelUrl }
 * Auth: requireUserAuth middleware sets req.user; site resolved from user.
 */
router.post('/create-checkout', async (req, res) => {
  try {
    const { plan: rawPlan = 'growth', successUrl, cancelUrl, site_key } = req.body
    const plan = normalizePlan(rawPlan)

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ success: false, data: null, error: 'successUrl and cancelUrl are required' })
    }

    // Resolve site — prefer req.site (set by middleware), fallback to site_key lookup
    let site = req.site
    if (!site && site_key) site = await getSiteByKey(site_key)
    if (!site) return res.status(401).json({ success: false, data: null, error: 'Site not found' })

    // Pick the right price ID for the requested plan (new env names + legacy fallback)
    const PRICE_MAP = {
      starter:  process.env.STRIPE_PRICE_ID_STARTER,
      growth:   process.env.STRIPE_PRICE_ID_GROWTH  || process.env.STRIPE_PRICE_ID_PRO,
      business: process.env.STRIPE_PRICE_ID_BUSINESS || process.env.STRIPE_PRICE_ID_AGENCY,
    }
    const priceId = PRICE_MAP[plan] || process.env.STRIPE_PRICE_ID
    if (!priceId) {
      return res.status(500).json({ success: false, data: null, error: `No price configured for plan: ${plan}` })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: site.id,
      customer: site.stripe_customer_id || undefined,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: site.plan === 'trial' ? 14 : undefined,
      },
    })

    return res.status(200).json({ success: true, data: { url: session.url }, error: null })
  } catch (err) {
    console.error('[billing] checkout error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Checkout creation failed' })
  }
})

/**
 * POST /api/billing/portal
 * Opens the Stripe Customer Portal for managing subscription.
 * Auth: requireUserAuth required.
 */
router.post('/portal', async (req, res) => {
  try {
    let site = req.site
    if (!site && req.body?.site_key) site = await getSiteByKey(req.body.site_key)
    if (!site) return res.status(401).json({ success: false, data: null, error: 'Site not found' })

    if (!site.stripe_customer_id) {
      return res.status(400).json({ success: false, data: null, error: 'No Stripe customer — subscribe first' })
    }

    const returnUrl = req.body?.returnUrl || req.headers.origin || 'https://sourcetrack.ai/billing'
    const session = await stripe.billingPortal.sessions.create({
      customer: site.stripe_customer_id,
      return_url: returnUrl,
    })

    return res.status(200).json({ success: true, data: { url: session.url }, error: null })
  } catch (err) {
    console.error('[billing] portal error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Portal creation failed' })
  }
})

/**
 * GET /api/billing/status
 * Returns current plan, usage, and subscription info for the authenticated site.
 */
router.get('/status', async (req, res) => {
  try {
    let site = req.site
    if (!site) return res.status(401).json({ success: false, data: null, error: 'Unauthorized' })

    let subscription = null
    if (site.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({
        customer: site.stripe_customer_id,
        limit: 1,
        status: 'all',
      })
      if (subs.data.length > 0) {
        const s = subs.data[0]
        subscription = {
          status:           s.status,
          current_period_end: s.current_period_end,
          cancel_at_period_end: s.cancel_at_period_end,
          price_id:         s.items?.data?.[0]?.price?.id,
        }
      }
    }

    const plan = normalizePlan(site.plan || 'free')
    return res.status(200).json({
      success: true,
      data: {
        plan,
        limit:      getPvLimit(plan, site.pv_limit),
        subscription,
        prices: {
          starter:  process.env.STRIPE_PRICE_ID_STARTER  || null,
          growth:   process.env.STRIPE_PRICE_ID_GROWTH   || process.env.STRIPE_PRICE_ID_PRO    || null,
          business: process.env.STRIPE_PRICE_ID_BUSINESS || process.env.STRIPE_PRICE_ID_AGENCY || null,
        }
      },
      error: null
    })
  } catch (err) {
    console.error('[billing] status error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch billing status' })
  }
})

export { router as billingRouter }
