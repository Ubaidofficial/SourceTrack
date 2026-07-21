import Stripe from 'stripe'
import { Router } from 'express'
import NodeCache from 'node-cache'
import { getSupabase } from '../lib/supabase.js'
import { normalizePlan, getPvLimit } from '../lib/plan-features.js'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey, requireSiteMembership, clearSiteCache, clearSiteCacheForKeys } from '../middleware/auth.js'
import { updateSiteSubscription, recordUnresolvedSite, subscriptionIdFrom } from '../lib/billing-subscription-update.js'

// Exported so tests can stub the Stripe client (constructEvent / subscriptions)
// on the exact instance the webhook handler uses.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
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
// Early Bird Annual (Founder) maps to 'growth' entitlements — sold as Growth-level
// ("locked forever, Growth features"), billed annually at the founding price.
export function getPriceMap() {
  const map = {}
  if (process.env.STRIPE_PRICE_ID_STARTER)          map[process.env.STRIPE_PRICE_ID_STARTER]          = 'starter'
  if (process.env.STRIPE_PRICE_ID_GROWTH)           map[process.env.STRIPE_PRICE_ID_GROWTH]           = 'growth'
  if (process.env.STRIPE_PRICE_ID_SCALE)            map[process.env.STRIPE_PRICE_ID_SCALE]            = 'scale'
  if (process.env.STRIPE_PRICE_ID_BUSINESS)         map[process.env.STRIPE_PRICE_ID_BUSINESS]         = 'scale'
  if (process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID) map[process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID] = 'growth'

  // Legacy env vars — preserved for backward compatibility
  if (process.env.STRIPE_PRICE_ID_PRO)    map[process.env.STRIPE_PRICE_ID_PRO]    = 'growth'
  if (process.env.STRIPE_PRICE_ID_AGENCY) map[process.env.STRIPE_PRICE_ID_AGENCY] = 'scale'
  if (process.env.STRIPE_PRICE_ID)        map[process.env.STRIPE_PRICE_ID]        = 'growth'

  return map
}

// Resolves the Stripe price ID for a checkout plan key.
// Returns { priceId, plan, error, status } — error/status non-null means fail.
// early_bird_annual never falls back to the legacy STRIPE_PRICE_ID; charging
// the wrong price (monthly growth) is worse than a clear failure message.
export function resolveCheckoutPrice(rawPlan) {
  const VALID_PLAN_KEYS = ['starter', 'growth', 'scale', 'pro', 'business', 'agency', 'early_bird_annual']
  if (!rawPlan || !VALID_PLAN_KEYS.includes(rawPlan)) {
    return { priceId: null, plan: null, error: `Invalid plan: ${rawPlan}`, status: 400 }
  }
  const plan = rawPlan === 'early_bird_annual' ? 'early_bird_annual' : normalizePlan(rawPlan)
  const PRICE_MAP = {
    starter:           process.env.STRIPE_PRICE_ID_STARTER,
    growth:            process.env.STRIPE_PRICE_ID_GROWTH  || process.env.STRIPE_PRICE_ID_PRO,
    scale:             process.env.STRIPE_PRICE_ID_SCALE   || process.env.STRIPE_PRICE_ID_BUSINESS || process.env.STRIPE_PRICE_ID_AGENCY,
    early_bird_annual: process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID,
  }
  const priceId = plan === 'early_bird_annual'
    ? PRICE_MAP['early_bird_annual']
    : (PRICE_MAP[plan] || process.env.STRIPE_PRICE_ID)
  if (!priceId) {
    return {
      priceId: null,
      plan,
      error: plan === 'early_bird_annual'
        ? 'Early bird annual checkout is not yet configured. Email support@sourcetrack.ai to claim your founding price.'
        : `No price configured for plan: ${plan}`,
      status: 500
    }
  }
  return { priceId, plan, error: null, status: null }
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

async function invalidateCacheByCustomerId(customerId, sb) {
  if (!customerId) return
  try {
    const { data: sites, error } = await sb
      .from('sites')
      .select('id, site_key, domain')
      .eq('stripe_customer_id', customerId)

    if (error || !sites || sites.length === 0) return
    const siteKeys = sites.map(s => s.site_key).filter(Boolean)
    const count = clearSiteCacheForKeys(siteKeys)
    console.log(`billing cache invalidated for affected staging/production site row count: ${count}`)
  } catch (err) {
    console.error('[billing cache] failed to invalidate by customerId:', err.message)
  }
}

async function invalidateCacheBySiteId(siteId, sb) {
  if (!siteId) return
  try {
    const { data: site, error } = await sb
      .from('sites')
      .select('id, site_key, domain')
      .eq('id', siteId)
      .maybeSingle()

    if (error || !site || !site.site_key) return
    const cleared = clearSiteCache(site.site_key)
    if (cleared) {
      console.log('billing cache invalidated for affected staging/production site row count: 1')
    }
  } catch (err) {
    console.error('[billing cache] failed to invalidate by siteId:', err.message)
  }
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
  // event regardless of retry — skip an event we've already PROCESSED. The
  // claim is committed only after the DB write succeeds (see below), so a
  // failed first attempt does NOT poison the retry: Stripe re-delivers the
  // same event.id and we re-attempt instead of returning a false duplicate.
  if (event.id && _seenStripeEvents.get(event.id)) {
    console.log(`[billing] duplicate Stripe event ${event.id} (${event.type}) — skipping`)
    return res.json({ received: true, duplicate: true })
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

        const { error } = await sb.from('sites').update({
          plan,
          pv_limit: pvLimit,
          stripe_customer_id: customerId,
          stripe_subscription_id: subId || null,
        }).eq('id', siteId)

        if (error) {
          console.error('[billing] failed to update subscription state:', error.message)
          throw error
        }

        await invalidateCacheBySiteId(siteId, sb)

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

        // KI-44: .select()-backed zero-row detection + stripe_subscription_id fallback.
        // Throws when both keys miss -> existing catch -> 500 -> Stripe retries.
        const result = await updateSiteSubscription(sb, {
          patch: { plan, pv_limit: pvLimit, stripe_subscription_id: sub.id },
          customerId,
          subscriptionId: subscriptionIdFrom(sub.id),
          eventType: event.type,
          eventId: event.id,
        })

        await invalidateCacheByCustomerId(customerId, sb)
        if (result.outcome === 'recovered') {
          // Matched by subscription id, so the customer-id cache sweep above missed it.
          for (const id of result.siteIds) await invalidateCacheBySiteId(id, sb)
        }

        console.log(`[billing] subscription updated — customer ${customerId} → plan ${plan} (${status})`)
        break
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const customerId = event.data.object.customer
        // event.data.object IS the subscription here, so its own id is the fallback key.
        const result = await updateSiteSubscription(sb, {
          patch: { plan: 'inactive', pv_limit: 0 },
          customerId,
          subscriptionId: subscriptionIdFrom(event.data.object.id),
          eventType: event.type,
          eventId: event.id,
        })

        await invalidateCacheByCustomerId(customerId, sb)
        if (result.outcome === 'recovered') {
          for (const id of result.siteIds) await invalidateCacheBySiteId(id, sb)
        }
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
          if (!site) {
            // KI-44: this branch previously fell through with NO log at all — a renewal
            // for a customer we cannot resolve looked identical to a no-op. Recorded, not
            // thrown: nothing was attempted, so there is no failed write to retry into.
            await recordUnresolvedSite(sb, {
              eventType: event.type,
              eventId: event.id,
              customerId,
              subscriptionId: subscriptionIdFrom(invoice.subscription),
              note: 'renewal payment succeeded but getSiteByCustomerId returned no site',
            })
          } else if (site.plan === 'inactive') {
            // Re-fetch sub to get current plan + price metadata
            const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, expand: ['data.items.data.price'] })
            const price = subs.data[0]?.items?.data?.[0]?.price
            const plan = planFromPriceId(price?.id)
            const pvLimit = pvLimitFromPrice(price, plan)
            const result = await updateSiteSubscription(sb, {
              patch: { plan, pv_limit: pvLimit },
              customerId,
              subscriptionId: subscriptionIdFrom(invoice.subscription),
              eventType: event.type,
              eventId: event.id,
            })

            await invalidateCacheByCustomerId(customerId, sb)
            if (result.outcome === 'recovered') {
              for (const id of result.siteIds) await invalidateCacheBySiteId(id, sb)
            }
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
          const result = await updateSiteSubscription(sb, {
            patch: { plan: 'inactive', pv_limit: 0 },
            customerId,
            subscriptionId: subscriptionIdFrom(event.data.object.subscription),
            eventType: event.type,
            eventId: event.id,
          })

          await invalidateCacheByCustomerId(customerId, sb)
          if (result.outcome === 'recovered') {
            for (const id of result.siteIds) await invalidateCacheBySiteId(id, sb)
          }
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

    // Commit the idempotency claim ONLY after the handler (incl. DB write)
    // succeeded. On a thrown error we fall through to the catch without
    // claiming, so Stripe's retry of the same event.id is re-processed.
    if (event.id) _seenStripeEvents.set(event.id, true)

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[billing webhook] processing error:', err.message)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}

// Server-owned allowlisted frontend/dashboard origins for redirect validation
export function getRedirectAllowlist(includeEnvUrls = true) {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const list = [
    'https://www.sourcetrack.ai',
    'https://sourcetrack.ai',
    'https://app.sourcetrack.ai',
    'http://localhost:5173',
    'http://localhost:8080',
    ...envOrigins
  ]

  if (includeEnvUrls) {
    if (process.env.FRONTEND_URL) list.push(process.env.FRONTEND_URL.trim())
    if (process.env.DASHBOARD_URL) list.push(process.env.DASHBOARD_URL.trim())
  }

  const origins = new Set()
  for (const item of list) {
    try {
      let urlStr = item
      if (!urlStr.includes('://')) {
        urlStr = `https://${urlStr}`
      }
      const url = new URL(urlStr)
      const origin = url.origin.toLowerCase()
      origins.add(origin)

      // HTTP can also be allowed for localhost / 127.0.0.1 dev defaults
      const hostname = url.hostname.toLowerCase()
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        origins.add(origin.replace(/^https:/i, 'http:'))
      }
    } catch {
      // Ignore invalid config
    }
  }
  return Array.from(origins)
}

export function isValidRedirectUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false
  try {
    const url = new URL(urlStr)
    const allowed = getRedirectAllowlist()
    return allowed.includes(url.origin.toLowerCase())
  } catch {
    return false
  }
}

export function getDefaultBillingReturnUrl() {
  const fallback = 'https://app.sourcetrack.ai'
  const raw = process.env.DASHBOARD_URL || process.env.FRONTEND_URL || fallback

  try {
    const normalized = raw.includes('://') ? raw : `https://${raw}`
    const url = new URL(normalized)

    const strictAllowed = getRedirectAllowlist(false)
    if (strictAllowed.includes(url.origin.toLowerCase())) {
      return `${url.origin}/billing`
    }
  } catch {}

  return `${fallback}/billing`
}

// ── Routes ────────────────────────────────────────────────────────────────────
const router = Router()

/**
 * POST /api/billing/create-checkout
 * Body: { plan: 'starter'|'growth'|'scale'|'early_bird_annual', successUrl, cancelUrl }
 * Auth: requireUserAuth middleware sets req.user; site resolved from user.
 */
router.post('/create-checkout', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const { plan: rawPlan = 'growth', successUrl, cancelUrl, site_key, accepted_terms } = req.body

    // Validate plan key and resolve price ID — fail fast on invalid/unconfigured plan
    const priceResolution = resolveCheckoutPrice(rawPlan)
    if (priceResolution.status === 400) {
      return res.status(400).json({ success: false, data: null, error: priceResolution.error })
    }

    if (accepted_terms !== true) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Terms and Privacy acknowledgement is required before checkout.'
      })
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ success: false, data: null, error: 'successUrl and cancelUrl are required' })
    }

    if (!isValidRedirectUrl(successUrl)) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid successUrl redirect target' })
    }

    if (!isValidRedirectUrl(cancelUrl)) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid cancelUrl redirect target' })
    }

    // Resolve site — prefer req.site (set by middleware), fallback to site_key lookup
    let site = req.site
    if (!site && site_key) site = await getSiteByKey(site_key)
    if (!site) return res.status(401).json({ success: false, data: null, error: 'Site not found' })

    // Fail if price ID is missing (e.g. early_bird_annual not yet configured in env)
    if (!priceResolution.priceId) {
      return res.status(priceResolution.status).json({ success: false, data: null, error: priceResolution.error })
    }
    const { plan, priceId } = priceResolution

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
router.post('/portal', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    let site = req.site
    if (!site && req.body?.site_key) site = await getSiteByKey(req.body.site_key)
    if (!site) return res.status(401).json({ success: false, data: null, error: 'Site not found' })

    if (!site.stripe_customer_id) {
      return res.status(400).json({ success: false, data: null, error: 'No Stripe customer — subscribe first' })
    }

    let returnUrl = req.body?.returnUrl || req.headers.origin
    if (!returnUrl || !isValidRedirectUrl(returnUrl)) {
      returnUrl = getDefaultBillingReturnUrl()
    }

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
router.get('/status', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
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
          starter:           process.env.STRIPE_PRICE_ID_STARTER  || null,
          growth:            process.env.STRIPE_PRICE_ID_GROWTH   || process.env.STRIPE_PRICE_ID_PRO    || null,
          scale:             process.env.STRIPE_PRICE_ID_SCALE    || process.env.STRIPE_PRICE_ID_BUSINESS || process.env.STRIPE_PRICE_ID_AGENCY || null,
          early_bird_annual: process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID || null,
        }
      },
      error: null
    })
  } catch (err) {
    console.error('[billing] status error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch billing status' })
  }
})

/**
 * Read the current calendar-month usage row for a site from site_usage_monthly —
 * the service-role-only table the ingestion limiter increments via
 * claim_site_pageview_usage / claim_site_conversion_usage. Returns zeros when no
 * row exists yet for the month.
 *
 * The month key is UTC YYYY-MM, IDENTICAL to the limiter's p_month
 * (api/lib/pageview-limits.js:36-39 — getUTCFullYear / getUTCMonth+1 padded), so
 * the number shown to the user matches exactly what the limiter enforces on.
 *
 * Plain SELECT — never the claim_* RPCs (those increment, wrong for display).
 */
export async function getCurrentMonthUsage(siteId) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const monthStr = `${year}-${month}`

  const { data, error } = await getSupabase()
    .from('site_usage_monthly')
    .select('pageview_count, conversion_count')
    .eq('site_id', siteId)
    .eq('month', monthStr)
    .maybeSingle()

  if (error) throw error

  return {
    month: monthStr,
    pageview_count: data?.pageview_count ?? 0,
    conversion_count: data?.conversion_count ?? 0
  }
}

/**
 * GET /api/billing/usage?site_key=...
 * Current-month usage counters for the site, read from site_usage_monthly via
 * the service_role backend (the table is RLS deny-all, so it must NOT be read
 * client-direct). Mirrors the auth pattern of GET /status.
 */
router.get('/usage', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const site = req.site
    if (!site) return res.status(401).json({ success: false, data: null, error: 'Unauthorized' })

    const usage = await getCurrentMonthUsage(site.id)
    return res.status(200).json({ success: true, data: usage, error: null })
  } catch (err) {
    console.error('[billing] usage error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch usage' })
  }
})

export { router as billingRouter }
