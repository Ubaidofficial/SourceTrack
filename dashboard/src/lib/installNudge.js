// Install-guide nudge: map a detected site platform to the matching install guide card.
//
// The detection itself is NOT new — api/lib/platform-detector.js has shipped for a while
// (SSRF-guarded server-side fetch of the customer's own homepage, classifying against
// shopify / wordpress / wix / squarespace / webflow tokens), and the onboarding page already
// calls it via GET /install/detect-platform. It just threw the `platform` field away and used
// only `script_detected` / `gtm_present`. This is the missing half.
//
// ADVISORY ONLY. Nothing here selects an install method, changes a step, or blocks progress.
// The worst case is that no card is highlighted and onboarding looks exactly as it does today.

// The guide cards, lifted out of Onboarding.jsx so the detector→guide mapping lives beside the
// list it maps INTO and cannot drift from it.
//
// `platformKey` is the value api/lib/platform-detector.js reports. null means "this guide
// exists but the detector has no signal for it" — Framer and GTM are reachable by hand and
// must never be auto-suggested, because we cannot tell.
export const INSTALL_GUIDES = [
  { label: 'WordPress', desc: 'Plugin / theme header', to: '/docs/platforms/wordpress', platformKey: 'wordpress' },
  { label: 'Shopify', desc: 'Theme + checkout', to: '/docs/platforms/shopify', platformKey: 'shopify' },
  { label: 'Webflow', desc: 'Site-wide custom code', to: '/docs/platforms/webflow', platformKey: 'webflow' },
  { label: 'Framer', desc: 'Site settings → custom code', to: '/docs/platforms/framer', platformKey: null },
  { label: 'Google Tag Manager', desc: 'Custom HTML tag', to: '/docs/platforms/google-tag-manager', platformKey: null }
]

// Platforms the detector CAN report but we have no guide for. Listed explicitly so the
// no-suggestion outcome is a recorded decision rather than an accidental lookup miss — if a
// Wix or Squarespace guide is ever written, it gets a platformKey above and starts working.
export const DETECTED_WITHOUT_GUIDE = ['wix', 'squarespace']

// Verdicts that carry no usable signal. 'custom' means the fetch SUCCEEDED and matched no
// known platform — a real answer, but not one that points at a guide.
const NO_SIGNAL_PLATFORMS = new Set(['', 'unknown', 'custom'])

/**
 * Pick the guide to highlight for a detection result, or null for "say nothing".
 *
 * Deliberately biased toward null. A wrong nudge is worse than no nudge: it sends someone
 * to the Shopify guide for their WordPress site, and they trust it because we said it.
 * Every uncertain case resolves to null.
 *
 * @param {object|null} detection - the /install/detect-platform payload
 * @returns {object|null} the matching INSTALL_GUIDES entry, or null
 */
export function suggestedGuideFor (detection) {
  if (!detection || typeof detection !== 'object') return null

  // error:true means the fetch never produced evidence (bad domain, timeout, SSRF-rejected,
  // non-200). Absence of evidence is not evidence of a platform — §6.
  if (detection.error === true) return null

  const platform = String(detection.platform || '').trim().toLowerCase()
  if (NO_SIGNAL_PLATFORMS.has(platform)) return null

  // 'low' is what the detector reports for custom/unknown/error. Requiring medium-or-better is
  // belt-and-braces against a future low-confidence platform verdict becoming a confident nudge.
  const confidence = String(detection.confidence || '').trim().toLowerCase()
  if (confidence !== 'high' && confidence !== 'medium') return null

  // An unrecognised platform string (a detector that learns a new one before this list does)
  // finds no match and correctly says nothing.
  return INSTALL_GUIDES.find(g => g.platformKey === platform) || null
}
