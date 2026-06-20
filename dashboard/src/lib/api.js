import { supabase } from './supabase'
import { isSupportPreviewActive } from '../utils/supportPreview'

const normalizeBaseUrl = (value) => String(value || '').replace(/\/+$/, '')

const API_ORIGIN = normalizeBaseUrl(import.meta.env.VITE_API_URL || '')
const API_BASE = `${API_ORIGIN}/api`

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}


function normalizeFetchOptions(options = {}) {
  const next = { ...options }
  const headers = { ...(next.headers || {}) }

  if (
    next.body &&
    typeof next.body === 'object' &&
    !(next.body instanceof FormData) &&
    !(next.body instanceof Blob)
  ) {
    next.body = JSON.stringify(next.body)
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }

  next.headers = headers
  return next
}

export async function fetchApi(path, options = {}) {
  const url = `${API_BASE}${path}`
  const normalizedOptions = normalizeFetchOptions(options)
  const { headers: extraHeaders, ...rest } = normalizedOptions
  const authHeaders = await getAuthHeaders()
  const previewHeaders = isSupportPreviewActive() ? { 'X-Sourcetrack-Support-Preview': 'true' } : {}

  const res = await fetch(url, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...previewHeaders, ...extraHeaders }
  })

  if (res.status === 402) {
    const alreadyOnBilling = window.location.pathname === '/billing'
    if (!options.skipBillingRedirect && !alreadyOnBilling) {
      window.location.href = '/billing'
    }
    const err = new Error('Subscription required')
    err.status = 402
    throw err
  }

  const data = await res.json()

  if (!res.ok || !data.success) {
    const err = new Error(data.error || `Request failed with status ${res.status}`)
    err.status = res.status
    throw err
  }

  return data.data !== undefined ? data.data : data
}

export async function getAttribution(siteKey, model, dateFrom, dateTo) {
  const params = new URLSearchParams({ site_key: siteKey, model, date_from: dateFrom, date_to: dateTo })
  return fetchApi(`/attribution?${params}`)
}

export async function getJourney(siteKey, visitorId) {
  const params = new URLSearchParams({ site_key: siteKey })
  return fetchApi(`/journey/${visitorId}?${params}`)
}

export async function createCheckout(siteKey, successUrl, cancelUrl, planKey = 'growth', acceptedTerms = false) {
  return fetchApi('/billing/create-checkout', {
    method: 'POST',
    body: { site_key: siteKey, successUrl, cancelUrl, plan: planKey, accepted_terms: acceptedTerms }
  })
}

export async function getBillingPortal(siteKey, returnUrl) {
  return fetchApi('/billing/portal', {
    method: 'POST',
    body: { site_key: siteKey, returnUrl }
  })
}

export async function getBillingStatus(siteKey) {
  const params = new URLSearchParams({ site_key: siteKey })
  return fetchApi(`/billing/status?${params}`)
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
