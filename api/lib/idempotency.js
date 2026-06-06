import { getSupabase } from './supabase.js'

/**
 * Attempts to atomically claim idempotency keys for a given site and provider.
 * If any of the keys already exist, the database function rolls back and returns false,
 * which this helper translates to { success: false, duplicate: true }.
 *
 * @param {string} siteKey - Plaintext identifier of the site (site_key)
 * @param {string} provider - Provider name (e.g. 'stripe', 'shopify')
 * @param {Array<{key_type: string, key_value: string}>} keys - Array of key type and values to check
 * @returns {Promise<{success: boolean, duplicate: boolean, error?: string}>}
 */
export async function claimIdempotencyKeys(siteKey, provider, keys) {
  if (!siteKey || !provider || !Array.isArray(keys) || keys.length === 0) {
    return { success: false, duplicate: false, error: 'Invalid arguments' }
  }

  // Filter out any entries with empty/null/undefined key_value or key_type to avoid DB constraint failures
  const validKeys = keys.filter(k => k && k.key_type && k.key_value && k.key_type.trim() && k.key_value.trim())
  if (validKeys.length === 0) {
    // If no valid keys to check, we succeed (nothing is duplicate)
    return { success: true, duplicate: false }
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('claim_revenue_idempotency_keys', {
      p_site_key: siteKey,
      p_provider: provider,
      p_keys: validKeys
    })

    if (error) {
      console.error('[idempotency] RPC error:', error.message)
      return { success: false, duplicate: false, error: error.message }
    }

    if (data === true) {
      return { success: true, duplicate: false }
    } else {
      return { success: false, duplicate: true }
    }
  } catch (err) {
    console.error('[idempotency] Failed to claim keys:', err)
    return { success: false, duplicate: false, error: err.message }
  }
}

/**
 * Log a revenue ingestion event in the audit table.
 *
 * @param {string} siteKey - Plaintext identifier of the site (site_key)
 * @param {string} provider - Ingestion provider ('stripe', 'shopify', 'payments_api')
 * @param {object} eventDetails
 * @param {string} [eventDetails.providerEventId]
 * @param {string} [eventDetails.orderId]
 * @param {number} [eventDetails.value]
 * @param {string} [eventDetails.currency]
 * @param {'success'|'duplicate'|'error'} eventDetails.status
 * @param {string} [eventDetails.errorMessage]
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logIngestionEvent(siteKey, provider, eventDetails) {
  const { providerEventId, orderId, value, currency, status, errorMessage } = eventDetails

  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('revenue_ingestion_events')
      .insert({
        site_key: siteKey,
        provider,
        provider_event_id: providerEventId || null,
        order_id: orderId || null,
        value: value !== undefined && value !== null ? parseFloat(value) : null,
        currency: currency || null,
        status,
        error_message: errorMessage || null
      })

    if (error) {
      console.error('[idempotency] Failed to log ingestion event:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('[idempotency] Failed to log ingestion event error:', err)
    return { success: false, error: err.message }
  }
}
