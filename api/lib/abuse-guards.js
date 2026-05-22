// Anti-abuse checks for free-tier signup and site registration.
// Used by both the API (defense-in-depth) and the Signup.jsx form (UX hint).

// ── Disposable / temporary email providers ───────────────────────────────────
// Short curated list of common providers. The full list is ~10k+ domains; this
// covers the noisy 95%. For a more aggressive block, plug in
// https://github.com/disposable-email-domains/disposable-email-domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', 'mailinator.com', 'tempmail.com',
  'temp-mail.org', 'temp-mail.io', 'guerrillamail.com', 'guerrillamail.net',
  'sharklasers.com', 'grr.la', 'getnada.com', 'getairmail.com',
  'throwawaymail.com', 'yopmail.com', 'maildrop.cc', 'dispostable.com',
  'fakeinbox.com', 'fake-mail.com', 'tempinbox.com', 'mintemail.com',
  'mailnesia.com', 'emailondeck.com', 'mailcatch.com', 'spambox.us',
  'mohmal.com', 'incognitomail.org', 'tempmailer.com', 'mvrht.com',
  'mailbox.org', 'inboxbear.com', 'discard.email', 'discardmail.com',
  'trashmail.com', 'trashmail.net', 'trash-mail.com', 'trbvm.com',
  'mytemp.email', 'tempmailaddress.com', 'tempr.email', 'mt2014.com',
  'mt2015.com', 'thankyou2010.com', 'spam4.me', 'mailtemp.info',
  'getairmail.net', 'fexbox.org', 'fexbox.ru', 'mintemail.net',
  'tempmailo.com', 'minuteinbox.com', 'tempemail.com', 'tempemail.net',
])

export function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return false
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  const domain = email.slice(at + 1).toLowerCase().trim()
  return DISPOSABLE_EMAIL_DOMAINS.has(domain)
}

// ── PaaS subdomain farms ─────────────────────────────────────────────────────
// Free tier disallows sites on shared subdomain platforms. The pattern is
// abuse-prone: one bad actor can spin up unlimited subdomains on these and
// claim each as a separate free account. Custom domains required.
const PAAS_SUBDOMAIN_SUFFIXES = [
  '.vercel.app', '.netlify.app', '.netlify.com', '.webflow.io',
  '.glitch.me', '.replit.dev', '.replit.app', '.repl.co', '.repl.it',
  '.ngrok.io', '.ngrok-free.app', '.ngrok.app',
  '.herokuapp.com', '.firebaseapp.com', '.web.app',
  '.pages.dev', '.workers.dev', '.cloudfront.net',
  '.shopifypreview.com', '.myshopify.com',
  '.github.io', '.gitlab.io', '.bitbucket.io',
  '.azurewebsites.net', '.appspot.com',
  '.surge.sh', '.now.sh', '.zeit.co',
  '.ondigitalocean.app', '.fly.dev', '.up.railway.app',
  '.render.com', '.onrender.com',
  '.lovable.app',
]

// Returns the matching PaaS suffix if the domain is a subdomain of a PaaS host,
// otherwise null. Apex domains (e.g. "vercel.app" itself) are NOT blocked since
// only the platform owner controls those.
export function paasSubdomainSuffix(domain) {
  if (!domain || typeof domain !== 'string') return null
  const clean = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0]
  for (const suffix of PAAS_SUBDOMAIN_SUFFIXES) {
    // Match strict subdomain: "foo.vercel.app" matches ".vercel.app" but
    // "vercel.app" alone does not — that's the apex, allowed.
    if (clean.endsWith(suffix) && clean.length > suffix.length) return suffix
  }
  return null
}

export function isPaasSubdomain(domain) {
  return paasSubdomainSuffix(domain) !== null
}

// ── Public helpers ───────────────────────────────────────────────────────────

// Validates a free-tier site registration. Returns { ok: true } or
// { ok: false, error, message } that can be surfaced as a 4xx response.
export function validateFreeTierSite({ email, domain }) {
  if (email && isDisposableEmail(email)) {
    return {
      ok: false,
      error: 'Disposable email blocked',
      message: 'Free accounts require a non-disposable email address. Use a real work or personal email.',
    }
  }
  if (domain) {
    const suffix = paasSubdomainSuffix(domain)
    if (suffix) {
      return {
        ok: false,
        error: 'PaaS subdomain not allowed on free tier',
        message: `Free accounts can't use shared platform subdomains (${suffix}). Connect a custom domain or upgrade to a paid plan.`,
      }
    }
  }
  return { ok: true }
}
