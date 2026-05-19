import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { Router } from 'express'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
})

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch }, realtime: { transport: WebSocket } }
  )
}

async function getSiteBySiteKey(siteKey) {
  const { data, error } = await getSupabase()
    .from('sites')
    .select('id, owner_id, plan, stripe_customer_id')
    .eq('site_key', siteKey)
    .single()

  if (error || !data) return null
  return data
}

export async function billingWebhookHandler(req, res) {
  try {
    const sig = req.headers['stripe-signature']
    if (!sig) {
      return res.status(400).json({ success: false, data: null, error: 'Missing stripe-signature' })
    }

    let event
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (_err) {
      console.error(_err)
      return res.status(400).json({ success: false, data: null, error: 'Invalid webhook signature' })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const siteId = session.client_reference_id
      const customerId = session.customer
      const subscriptionId = session.subscription

      if (siteId && customerId) {
        const updateData = { plan: 'pro', stripe_customer_id: customerId }
        await getSupabase().from('sites').update(updateData).eq('id', siteId)
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const customerId = subscription.customer

      if (customerId) {
        await getSupabase()
          .from('sites')
          .update({ plan: 'inactive' })
          .eq('stripe_customer_id', customerId)
      }
    }

    return res.status(200).json({ received: true })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Webhook processing failed' })
  }
}

const router = Router()

router.post('/create-checkout', async (req, res) => {
  try {
    const siteKey = req.body?.site_key
    if (!siteKey) {
      return res.status(401).json({ success: false, data: null, error: 'Missing site_key' })
    }

    const site = await getSiteBySiteKey(siteKey)
    if (!site) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid site_key' })
    }

    const { successUrl, cancelUrl } = req.body
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ success: false, data: null, error: 'successUrl and cancelUrl are required' })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: site.id,
      customer: site.stripe_customer_id || undefined
    })

    return res.status(200).json({
      success: true,
      data: { url: session.url },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Checkout creation failed' })
  }
})

router.get('/portal', async (req, res) => {
  try {
    const siteKey = req.query?.site_key
    if (!siteKey) {
      return res.status(401).json({ success: false, data: null, error: 'Missing site_key' })
    }

    const site = await getSiteBySiteKey(siteKey)
    if (!site) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid site_key' })
    }

    if (!site.stripe_customer_id) {
      return res.status(400).json({ success: false, data: null, error: 'No Stripe customer found' })
    }

    const returnUrl = req.query.return_url || req.headers.origin || ''
    const session = await stripe.billingPortal.sessions.create({
      customer: site.stripe_customer_id,
      return_url: returnUrl
    })

    return res.status(200).json({
      success: true,
      data: { url: session.url },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Portal creation failed' })
  }
})

export { router as billingRouter }
