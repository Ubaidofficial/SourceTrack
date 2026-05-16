import { createHash } from 'crypto'

function sha256(str) {
  return createHash('sha256').update(str.trim().toLowerCase()).digest('hex')
}

export async function sendMetaCAPI(site, evt) {
  if (!site.meta_pixel_id || !site.meta_capi_token) return null

  const userData = {}
  if (evt.ip_address) userData.client_ip_address = evt.ip_address
  if (evt.user_agent) userData.client_user_agent = evt.user_agent
  if (evt.email) userData.em = [sha256(evt.email)]

  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(new Date(evt.timestamp ?? Date.now()).getTime() / 1000),
      action_source: 'website',
      event_source_url: evt.page_url ?? null,
      user_data: userData,
      custom_data: { value: Number(evt.conversion_value) || 0, currency: evt.currency ?? 'USD' }
    }]
  }
  if (process.env.NODE_ENV !== 'production') body.test_event_code = process.env.META_TEST_EVENT_CODE || 'TEST12345'

  const r = await fetch(
    `https://graph.facebook.com/v19.0/${site.meta_pixel_id}/events?access_token=${site.meta_capi_token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  const result = await r.json()
  if (!r.ok) console.error('[Meta CAPI]', JSON.stringify(result))
  return result
}

export async function sendGoogleConversion(site, evt) {
  if (!site.google_ads_customer_id || !site.google_ads_developer_token || !evt.gclid) return null

  const body = {
    conversions: [{
      gclid: evt.gclid,
      conversion_action: `customers/${site.google_ads_customer_id}/conversionActions/${site.google_ads_conversion_action_id}`,
      conversion_date_time: new Date(evt.timestamp ?? Date.now()).toISOString().replace('T', ' ').replace('Z', '+00:00'),
      conversion_value: Number(evt.conversion_value) || 0,
      currency_code: evt.currency ?? 'USD',
      user_identifiers: evt.email ? [{ hashed_email: sha256(evt.email) }] : []
    }]
  }
  const r = await fetch(
    `https://googleads.googleapis.com/v16/customers/${site.google_ads_customer_id}:uploadClickConversions`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${site.google_ads_developer_token}`, 'developer-token': site.google_ads_developer_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )
  if (!r.ok) console.error('[Google Conversion] HTTP', r.status)
  return r.ok
}

export async function sendMicrosoftConversion(site, evt) {
  if (!site.microsoft_tag_id || !site.microsoft_capi_token) return null
  const r = await fetch('https://bat.bing.com/bat.svc/c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ TagId: site.microsoft_tag_id, MsclkId: evt.msclkid ?? null, Revenue: Number(evt.conversion_value) || 0, Currency: evt.currency ?? 'USD' })
  })
  if (!r.ok) console.error('[Microsoft UET] HTTP', r.status)
  return r.ok
}

export async function sendLinkedInConversion(site, evt) {
  if (!site.linkedin_partner_id || !site.linkedin_capi_token) return null
  const body = {
    conversion: `urn:lla:llaPartnerConversion:${site.linkedin_partner_id}`,
    conversionHappenedAt: new Date(evt.timestamp ?? Date.now()).getTime(),
    conversionValue: { currencyCode: evt.currency ?? 'USD', amount: String(Number(evt.conversion_value) || 0) }
  }
  if (evt.email) body.user = { userIds: [{ idType: 'SHA256_EMAIL', idValue: sha256(evt.email) }] }
  const r = await fetch('https://api.linkedin.com/v2/conversionEvents', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${site.linkedin_capi_token}`, 'LinkedIn-Version': '202406', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) console.error('[LinkedIn CAPI] HTTP', r.status)
  return r.ok
}
