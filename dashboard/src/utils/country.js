// Country display helpers. Extracted VERBATIM from Analytics.jsx (which is now the second
// consumer, not the owner) so Leads renders locations the same way the Analytics page already
// does — one implementation, no drift. Both are pure and offline: no network, no lookup table.

// Emoji flag from an ISO-3166 alpha-2 code (regional indicators). NO network.
export function flagEmoji(code) {
  if (!code || !/^[a-zA-Z]{2}$/.test(code)) return null
  const cp = [...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...cp)
}

// Country NAME from an ISO code via Intl.DisplayNames (built-in, NO network).
const REGION_NAMES = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()
export function countryName(code) {
  if (!code || code === 'Unknown') return 'Unknown'
  try { return (REGION_NAMES && REGION_NAMES.of(String(code).toUpperCase())) || code } catch { return code }
}
