const API_BASE = '/api'

export async function fetchApi(path, options = {}) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  })

  if (res.status === 402) {
    window.location.href = '/onboarding?upgrade=true'
    throw new Error('Subscription required')
  }

  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new Error(data.error || `Request failed with status ${res.status}`)
  }

  return data.data
}

export async function getAttribution(siteKey, model, dateFrom, dateTo) {
  const params = new URLSearchParams({ site_key: siteKey, model, date_from: dateFrom, date_to: dateTo })
  return fetchApi(`/attribution?${params}`)
}

export async function getJourney(siteKey, visitorId) {
  const params = new URLSearchParams({ site_key: siteKey })
  return fetchApi(`/journey/${visitorId}?${params}`)
}

export async function createCheckout(siteKey, successUrl, cancelUrl) {
  return fetchApi('/billing/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ site_key: siteKey, successUrl, cancelUrl })
  })
}

export async function getBillingPortal(siteKey, returnUrl) {
  const params = new URLSearchParams({ site_key: siteKey, return_url: returnUrl })
  return fetchApi(`/billing/portal?${params}`)
}

export async function getLatestEvents(siteKey) {
  const params = new URLSearchParams({ site_key: siteKey })
  return fetchApi(`/events/latest?${params}`)
}

export async function getEventHealth(siteKey) {
  const params = new URLSearchParams({ site_key: siteKey })
  return fetchApi(`/events/health?${params}`)
}

export async function getEdgeCases(siteKey) {
  const params = new URLSearchParams({ site_key: siteKey })
  return fetchApi(`/events/edge-cases?${params}`)
}
