// Marketing-site form submissions — validation + persistence.
//
// Storage is the load-bearing fix: both public forms previously discarded input
// entirely (action="#"). Everything here exists so that a submission either
// LANDS IN THE DATABASE or the caller is told it failed. There is no third
// outcome — in particular, a notification-email failure must never be reported
// to the visitor as success, and must never suppress a successful write.
//
// Pure + dependency-injected (supabase, notify) so the behavior is testable
// without a database or an outbound email, matching the volunteered-identity
// helper's shape.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const SUBMISSION_KINDS = ['contact', 'newsletter']

// Field caps. Generous enough for a real message, bounded so a public
// unauthenticated endpoint cannot be used to write unbounded rows.
const CAPS = { email: 254, name: 120, phone: 40, subject: 200, message: 5000 }

function clean(value, cap) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, cap)
  return trimmed.length ? trimmed : null
}

/**
 * Validate + normalize a raw submission body.
 * @returns {{ ok: true, row: object } | { ok: false, error: string }}
 */
export function buildSubmission(body = {}) {
  const kind = typeof body.kind === 'string' ? body.kind.trim().toLowerCase() : ''
  if (!SUBMISSION_KINDS.includes(kind)) {
    return { ok: false, error: 'kind must be "contact" or "newsletter"' }
  }

  const email = clean(body.email, CAPS.email)?.toLowerCase() || null
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'A valid email is required' }
  }

  // Newsletter is email-only by design — the blog form collects nothing else, and
  // silently accepting contact-shaped extras there would store fields no form can
  // actually produce.
  if (kind === 'newsletter') {
    return { ok: true, row: { kind, email, name: null, phone: null, subject: null, message: null } }
  }

  const name = clean(body.name, CAPS.name)
  const message = clean(body.message, CAPS.message)
  if (!name) return { ok: false, error: 'Name is required' }
  if (!message) return { ok: false, error: 'Message is required' }

  return {
    ok: true,
    row: { kind, email, name, phone: clean(body.phone, CAPS.phone), subject: clean(body.subject, CAPS.subject), message }
  }
}

/**
 * Persist a validated row. Returns { stored: true } only when the insert
 * genuinely succeeded — a DB error is surfaced, never swallowed into a success.
 * @returns {Promise<{ stored: boolean, error?: string }>}
 */
export async function storeSubmission(row, { supabase }) {
  const { error } = await supabase.from('marketing_submissions').insert(row)
  if (error) {
    // Log the reason (no PII — kind only), surface failure to the caller.
    console.error(`[marketing-submissions] insert FAILED kind="${row.kind}": ${error.message}`)
    return { stored: false, error: error.message }
  }
  return { stored: true }
}

/**
 * Fire-and-forget notification via Resend (already wired for weekly reports —
 * same plain fetch + RESEND_API_KEY, no new dependency). Deliberately NOT
 * awaited by the caller's success path: storage is the fix, email is a
 * convenience, and a Resend outage must not turn a stored submission into a
 * visitor-facing error. Never throws.
 */
export async function notifySubmission(row, {
  fetchImpl = fetch,
  to = process.env.MARKETING_NOTIFY_EMAIL,
  // Injected rather than read inline so tests never have to assign a literal to
  // an API-key-named variable (scripts/check-secret-safety.js flags that shape).
  apiKey = process.env.RESEND_API_KEY
} = {}) {
  const recipient = to || 'support@sourcetrack.ai'
  if (!apiKey) return { sent: false, reason: 'no_api_key' }

  try {
    const isContact = row.kind === 'contact'
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SourceTrack <notifications@sourcetrack.ai>',
        to: recipient,
        reply_to: row.email,
        subject: isContact
          ? `Contact form: ${row.subject || row.name}`
          : 'New newsletter subscriber',
        text: isContact
          ? `Name: ${row.name}\nEmail: ${row.email}\nPhone: ${row.phone || '—'}\nSubject: ${row.subject || '—'}\n\n${row.message}`
          : `Email: ${row.email}`
      })
    })
    if (!res.ok) {
      console.error(`[marketing-submissions] Resend notify failed: HTTP ${res.status}`)
      return { sent: false, reason: `http_${res.status}` }
    }
    return { sent: true }
  } catch (err) {
    console.error(`[marketing-submissions] Resend notify threw: ${err?.message || err}`)
    return { sent: false, reason: 'threw' }
  }
}
