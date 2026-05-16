import { createClient } from '@supabase/supabase-js'
// TODO: Add attribution window support
// - Add columns: first_touch_source_7d, first_touch_source_30d, etc.
// - Modify touchpoints query to calculate for each window
// - Update API to read from windowed columns based on attribution_window param

import dotenv from 'dotenv'
dotenv.config()

import { createClient as _createClient } from '@supabase/supabase-js'
const _supabase = _createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

async function _slackAlert(emoji, heading, detail) {
  if (!SLACK_WEBHOOK_URL) return console.log(`[ALERT] ${emoji} ${heading}: ${detail}`)
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `${emoji} *${heading}*\n${detail}` })
  })
}

async function _writeJobRun({ status, conversions_processed, error_message, duration_ms }) {
  await _supabase.from('job_runs').insert({
    job_name: 'nightly-attribution',
    status,
    conversions_processed: conversions_processed ?? 0,
    error_message: error_message ?? null,
    duration_ms: duration_ms ?? 0,
    ran_at: new Date().toISOString()
  })
}

let _processed = 0
const _t0 = Date.now()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID
const POSTHOG_HOST = process.env.POSTHOG_HOST

async function main() {
  const startTime = Date.now()
  log('Starting nightly attribution job')
  
  if (!POSTHOG_PERSONAL_API_KEY || !POSTHOG_PROJECT_ID || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logError('Missing required environment variables')
    throw new Error("Missing required environment variables")
  }
  
  try {
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('id, site_key')
    
    if (sitesError) {
      logError('Failed to fetch sites', sitesError)
      throw new Error("Failed to fetch sites")
    }
    
    if (!sites || sites.length === 0) {
      log('No sites found')
      return
    }
    
    log(`Found ${sites.length} sites to process`)
    
    let totalProcessed = 0
    let totalFailed = 0
    
    for (const site of sites) {
      try {
        const result = await processSite(site)
        totalProcessed += result.processed
        totalFailed += result.failed
        await sleep(500)
      } catch (error) {
        logWarn(`Site ${site.site_key} failed: ${error.message}`)
        totalFailed++
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    log(`Completed: ${totalProcessed} conversions processed, ${totalFailed} failed, ${duration}s`)
    _processed = totalProcessed
    return
    
  } catch (error) {
    logError('Critical failure', error)
    throw error
  }
}

async function processSite(site) {
  log(`Processing site: ${site.site_key}`)
  
  const conversionsQuery = `
    SELECT 
      uuid,
      distinct_id,
      timestamp,
      properties.conversion_type,
      properties.conversion_value
    FROM events
    WHERE event = '$conversion'
      AND properties.site_id = '${site.id}'
      AND timestamp >= now() - INTERVAL 24 HOUR
    ORDER BY timestamp DESC
    LIMIT 1000
  `
  
  let rows
  try {
    rows = await queryPostHog(conversionsQuery)
  } catch (error) {
    logWarn(`PostHog query failed for site ${site.site_key}: ${error.message}`)
    return { processed: 0, failed: 0 }
  }
  
  if (!rows || rows.length === 0) {
    log(`No conversions found for site ${site.site_key}`)
    return { processed: 0, failed: 0 }
  }
  
  let processed = 0
  let failed = 0
  
  for (const row of rows) {
    try {
      const conversion = {
        uuid: row[0],
        distinct_id: row[1],
        timestamp: row[2],
        conversion_type: row[3],
        conversion_value: row[4]
      }
      
      await processConversion(site, conversion)
      processed++
      await sleep(200)
      
    } catch (error) {
      logWarn(`Failed to process conversion ${row[0]}: ${error.message}`)
      failed++
    }
  }
  
  log(`Site ${site.site_key}: ${processed} processed, ${failed} failed`)
  return { processed, failed }
}

async function processConversion(site, conversion) {
  const convValue = parseFloat(conversion.conversion_value || 0)
  
  if (convValue < 0 || !conversion.distinct_id) {
    logWarn(`Skipping invalid conversion ${conversion.uuid}`)
    return
  }
  
  const touchpointsQuery = `
    SELECT 
      timestamp,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.referrer,
      properties.ai_source
    FROM events
    WHERE event = '$pageview'
      AND distinct_id = '${conversion.distinct_id}'
      AND properties.site_id = '${site.id}'

      AND timestamp <= toDateTime('${conversion.timestamp}')
      AND timestamp >= toDateTime('${conversion.timestamp}') - INTERVAL 90 DAY
    ORDER BY timestamp ASC
    LIMIT 500
  `
  
  let touchpointRows
  try {
    touchpointRows = await queryPostHog(touchpointsQuery)
  } catch (error) {
    logWarn(`Failed to fetch touchpoints for ${conversion.uuid}: ${error.message}`)
    touchpointRows = []
  }
  
  const touchpoints = (touchpointRows || []).map(row => ({
    timestamp: row[0],
    utm_source: row[1] || null,
    utm_medium: row[2] || null,
    utm_campaign: row[3] || null,
    referrer: row[4] || null,
    ai_source: row[5] || null,
    derived_source: row[1] || row[5] || (row[4] ? (() => { try { return new URL(row[4]).hostname.replace('www.', '') } catch (_e) { return null } })() : null) || 'direct'
  }))
  
  const attribution = calculateAttribution(touchpoints, convValue)
  
  const record = {
    site_id: site.id,
    conversion_event_id: conversion.uuid,
    distinct_id: conversion.distinct_id,
    conversion_date: new Date(conversion.timestamp).toISOString().split('T')[0],
    conversion_timestamp: conversion.timestamp,
    conversion_type: conversion.conversion_type || null,
    conversion_value: convValue,
    
    first_touch_source: attribution.first_touch?.source || attribution.first_touch?.derived_source || null,
    first_touch_medium: attribution.first_touch?.medium || null,
    first_touch_campaign: attribution.first_touch?.campaign || null,
    first_touch_timestamp: attribution.first_touch?.timestamp || null,
    
    last_touch_source: attribution.last_touch?.source || null,
    last_touch_medium: attribution.last_touch?.medium || null,
    last_touch_campaign: attribution.last_touch?.campaign || null,
    last_touch_timestamp: attribution.last_touch?.timestamp || null,
    
    linear_attribution: attribution.linear,
    touchpoint_count: touchpoints.length,
    
    processing_version: '1.0'
  }
  
  const { error } = await supabase
    .from('attributed_conversions')
    .upsert(record, { onConflict: 'site_id,conversion_event_id' })
  
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`)
  }
}

function calculateAttribution(touchpoints, conversionValue) {
  if (!touchpoints || touchpoints.length === 0) {
    return {
      first_touch: null,
      last_touch: null,
      linear: []
    }
  }
  
  const firstTouchpoint = touchpoints[0]
  const lastTouchpoint = touchpoints[touchpoints.length - 1]
  
  const fraction = 1.0 / touchpoints.length
  const linearValue = conversionValue * fraction
  
  const linear = touchpoints.map(tp => ({
    source: tp.utm_source || null,
    medium: tp.utm_medium || null,
    campaign: tp.utm_campaign || null,
    timestamp: tp.timestamp,
    fraction: parseFloat(fraction.toFixed(4)),
    attributed_value: parseFloat(linearValue.toFixed(2))
  }))
  
  return {
    first_touch: {
      source: firstTouchpoint.utm_source || null,
      medium: firstTouchpoint.utm_medium || null,
      campaign: firstTouchpoint.utm_campaign || null,
      timestamp: firstTouchpoint.timestamp
    },
    last_touch: {
      source: lastTouchpoint.utm_source || null,
      medium: lastTouchpoint.utm_medium || null,
      campaign: lastTouchpoint.utm_campaign || null,
      timestamp: lastTouchpoint.timestamp
    },
    linear: linear
  }
}

async function queryPostHog(query) {
  const host = POSTHOG_HOST.replace(/\/$/, '')
  const url = `${host}/api/projects/${POSTHOG_PROJECT_ID}/query/`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POSTHOG_PERSONAL_API_KEY}`
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query: query }
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`PostHog API error (${response.status}): ${errorText}`)
  }
  
  const data = await response.json()
  return data.results || []
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function logWarn(message) {
  console.warn(`[${new Date().toISOString()}] WARN: ${message}`)
}

function logError(message, error) {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main()
  .then(() => {
    _writeJobRun({ status: 'success', conversions_processed: _processed, duration_ms: Date.now() - _t0 })
    _slackAlert('✅', 'Attribution Job — SUCCESS', `Processed ${_processed} conversions in ${Date.now() - _t0}ms`)
  })
  .catch(err => {
    _writeJobRun({ status: 'failed', conversions_processed: _processed, error_message: err.message, duration_ms: Date.now() - _t0 })
    _slackAlert('🔴', 'Attribution Job — FAILED', err.message)
    process.exit(1)
  })
