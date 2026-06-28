// Resolve the CAPI event_id (the cross-system dedup id) for one conversion.
//
// Why this matters: a merchant often runs a browser pixel AND server-side CAPI.
// If both emit the SAME event_id, Meta/TikTok dedup the two into one conversion;
// without it the conversion is counted twice (inflated numbers, corrupted
// optimization). The merchant's pixel and this server must agree on the value.
//
// Priority:
//   1. client-supplied event_id — the merchant sets the same value on their pixel
//      (fbq eventID) and on the conversion call → true browser↔server dedup.
//   2. deterministic order-based id `${siteId}:${orderId}:${type}` — stable across
//      retries; dedups if the pixel uses the same scheme.
//   3. null — anonymous conversion with no shared key (not deduped; status quo).
export function resolveCapiEventId(body, siteId, conversionType) {
  const client = typeof body?.event_id === 'string'
    ? body.event_id.trim().slice(0, 200).replace(/[^A-Za-z0-9:._-]/g, '')
    : ''
  if (client) return client

  const orderId = body?.order_id || body?.orderId || null
  if (orderId) return `${siteId}:${orderId}:${conversionType || 'conversion'}`

  return null
}
