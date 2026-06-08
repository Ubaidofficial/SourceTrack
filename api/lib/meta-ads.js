const META_API_BASE = 'https://graph.facebook.com/v19.0'

// Normalize Ad Account ID by removing "act_" prefix
export function normalizeMetaAccountId(id = '') {
  const clean = String(id || '').trim().toLowerCase()
  if (clean.startsWith('act_')) {
    return clean.replace(/^act_/, '')
  }
  return clean
}

// Validates manually provided access token and ad account combination
export async function validateMetaCredentials(adAccountId, accessToken) {
  const cleanId = normalizeMetaAccountId(adAccountId)

  if (process.env.ST_MOCK_AD_PLATFORMS === 'true') {
    if (cleanId === '0000000000') {
      throw new Error('invalid_ad_account')
    }
    if (accessToken === 'invalid_token') {
      throw new Error('invalid_token')
    }
    return { name: 'Mock Meta Ad Account', currency: 'USD' }
  }

  const url = `${META_API_BASE}/act_${cleanId}?fields=name,currency&access_token=${encodeURIComponent(accessToken)}`
  const response = await fetch(url)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const code = errorData.error?.code
    const subcode = errorData.error?.error_subcode

    if (code === 190 || subcode === 463 || subcode === 467) {
      throw new Error('expired_token')
    }
    if (code === 10 || code === 200 || code === 294) {
      throw new Error('invalid_token') // or bad permissions
    }
    if (code === 100 || errorData.error?.message?.includes('act_')) {
      throw new Error('invalid_ad_account')
    }
    throw new Error('api_unavailable')
  }

  return response.json()
}

// Fetches Meta daily campaign insights
export async function fetchMetaPerformance(adAccountId, startDate, endDate, accessToken) {
  const cleanId = normalizeMetaAccountId(adAccountId)

  if (process.env.ST_MOCK_AD_PLATFORMS === 'true') {
    if (cleanId === '0000000000') {
      throw new Error('invalid_ad_account')
    }
    if (accessToken === 'invalid_token') {
      throw new Error('invalid_token')
    }
    // Return mock campaign insights rows
    return [
      {
        date_start: startDate,
        campaign_id: '3001',
        campaign_name: 'Meta Video Ad A',
        spend: '120.50',
        clicks: '95',
        impressions: '3500',
        account_currency: 'USD'
      },
      {
        date_start: startDate,
        campaign_id: '3002',
        campaign_name: 'Meta Carousel Ad B',
        spend: '85.20',
        clicks: '60',
        impressions: '2200',
        account_currency: 'USD'
      }
    ]
  }

  const params = new URLSearchParams({
    level: 'campaign',
    time_increment: '1',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    fields: 'date_start,campaign_id,campaign_name,spend,clicks,impressions,account_currency',
    access_token: accessToken,
    limit: '500' // Bounded page size limit
  })

  const url = `${META_API_BASE}/act_${cleanId}/insights?${params.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const code = errorData.error?.code

    if (code === 190) {
      throw new Error('expired_token')
    }
    if (code === 17 || code === 4 || code === 80004) {
      throw new Error('rate_limited')
    }
    if (code === 279 || errorData.error?.message?.includes('ads_read')) {
      throw new Error('missing_ads_read_permission')
    }
    throw new Error('api_unavailable')
  }

  const data = await response.json()
  return data.data || []
}
