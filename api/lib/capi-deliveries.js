// Safe writer for the capi_deliveries observability table.
// Mirrors the writeJobRun pattern: rejects unknown columns (so a typo'd/phantom
// column can't silently fail an insert) and logs a failed insert loudly instead
// of swallowing it. id/created_at are DB-defaulted and not written here.

export const CAPI_DELIVERY_COLUMNS = [
  'site_id', 'platform', 'event_ref', 'status', 'http_status', 'error_message', 'attempt'
]

export async function logCapiDelivery(supabase, row) {
  if (!row || typeof row !== 'object') {
    throw new TypeError('logCapiDelivery: row object is required')
  }
  const unknown = Object.keys(row).filter(k => CAPI_DELIVERY_COLUMNS.indexOf(k) === -1)
  if (unknown.length) {
    throw new Error(`logCapiDelivery: unknown capi_deliveries column(s): ${unknown.join(', ')}`)
  }
  const { error } = await supabase.from('capi_deliveries').insert(row)
  if (error) {
    console.error(`[capi_deliveries] insert FAILED for platform="${row.platform}" site=${row.site_id}: ${error.message}`)
  }
  return { error: error || null }
}
