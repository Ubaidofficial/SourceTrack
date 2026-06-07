import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { Copy, Check, Code, ExternalLink, RefreshCw, Circle, Bug, Link as LinkIcon, ChevronDown, ChevronRight, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

function AccordionSection({ title, icon: Icon, when, children }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-5 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-[#252929] transition-colors rounded-xl"
      >
        <Icon className="w-5 h-5 text-st-gray dark:text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-st-black">{title}</span>
          {when && <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">{when}</p>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-st-gray dark:text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-st-gray dark:text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0 border-t border-gray-100">
          <div className="pt-4 space-y-4">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Snippet() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [proxyDomain, setProxyDomain] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase.from('sites').select('site_key, name, domain, cookieless_mode, cross_domain_domains, cross_domain_cookie_domain').limit(1)
      if (member?.company_id) {
        query.eq('company_id', member.company_id)
      } else {
        query.eq('owner_id', user.id)
      }
      const { data } = await query.maybeSingle()
      setSite(data)
      if (data?.site_key) {
        try {
          const proxyData = await fetchApi(`/integrations/proxy-domain?site_key=${data.site_key}`)
          if (proxyData && proxyData.status === 'active') {
            setProxyDomain(proxyData.domain)
          }
        } catch (err) {
          console.error('Failed to load proxy configuration in snippet:', err)
        }
      }
    }
    load()
  }, [user])

  const checkStatus = useCallback(async () => {
    if (!site) return
    setStatusLoading(true)
    try {
      const params = new URLSearchParams({ site_key: site.site_key })
      const data = await fetchApi(`/install/status?${params}`)
      setStatus(data)
    } catch (_err) {
      setStatus({ status: 'error' })
    } finally {
      setStatusLoading(false)
    }
  }, [site])

  useEffect(() => {
    if (site) checkStatus()
  }, [site, checkStatus])

  const trackerBaseUrl = (import.meta.env.VITE_TRACKER_BASE_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

  function buildSnippet() {
    if (!site) return ''
    const trackerFile = site.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'
    const scriptSrc = proxyDomain ? `https://${proxyDomain}/${trackerFile}` : `${trackerBaseUrl}/tracker/${trackerFile}`
    let attrs = ` async src="${scriptSrc}" data-site-key="${site.site_key}"`
    if (site.cross_domain_domains && site.cross_domain_domains.length > 0) {
      attrs += ` data-cross-domains="${site.cross_domain_domains.join(',')}"`
    }
    if (site.cross_domain_cookie_domain) {
      attrs += ` data-cookie-domain="${site.cross_domain_cookie_domain}"`
    }
    return `<script${attrs}></script>`
  }

  const snippet = buildSnippet()

  const handleCopy = async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      /* clipboard unavailable */
    }
  }

  const handleTest = async () => {
    if (!site) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const params = new URLSearchParams({ site_key: site.site_key })
      const data = await fetchApi(`/install/status?${params}`)
      if (data.status === 'verified') {
        setTestResult({ ok: true, message: 'Install verified. Events are being received.', domain: data.domain })
      } else {
        setTestResult({ ok: false, message: 'No events received yet. Paste the snippet and visit your site.' })
      }
    } catch (_err) {
      setTestResult({ ok: false, message: 'Could not reach the server. Check your connection.' })
    } finally {
      setTestLoading(false)
    }
  }

  const statusColor = status?.status === 'verified'
    ? 'text-green-500'
    : status?.status === 'not_installed'
      ? 'text-amber-500'
      : 'text-st-gray'

  const statusLabel = status?.status === 'verified'
    ? 'Receiving data'
    : status?.status === 'not_installed'
      ? 'Waiting for first event'
      : 'Checking...'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-st-black">Install</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Add the SourceTrack Pixel to your website</p>
      </div>

      {/* Status — compact inline */}
      {site && (
        <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#1A1D1D] rounded-lg border border-gray-200 dark:border-[#333838] shadow-sm">
          <Circle className={`w-2.5 h-2.5 fill-current ${statusColor}`} />
          <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
          {status?.status === 'verified' && status?.domain && (
            <span className="text-xs text-st-gray dark:text-gray-400 ml-auto truncate">{status.domain}</span>
          )}
          <button
            onClick={checkStatus}
            disabled={statusLoading}
            className="ml-auto flex items-center gap-1 text-xs text-st-gray dark:text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {/* SourceTrack Pixel — the only required install step */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#333838] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-st-black">SourceTrack Pixel</h3>
        </div>

        <p className="text-sm text-gray-600">
          For most websites, this single script is enough to start tracking traffic and attribution.
          No configuration needed — tracking starts automatically on page load.
        </p>


        <ol className="list-decimal list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1 pl-1">
          <li>Copy the script below</li>
          <li>Paste it in the <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">&lt;head&gt;</code> of your website</li>
          <li>Deploy — tracking starts automatically on the next page load</li>
        </ol>

        {site && (
          <div className="bg-st-black rounded-lg p-4 relative">
            <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap pr-12">{snippet}</pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        {!site && (
          <p className="text-sm text-st-gray">Complete onboarding or create a site in Settings to get your pixel.</p>
        )}

        {/* What you get immediately */}
        <div className="bg-gray-50 dark:bg-[#111414] rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <p className="font-medium text-gray-700">What this captures automatically</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Pageviews and session activity</li>
            <li>Traffic sources — UTM params, referrers, direct visits</li>
            <li>ref/source/via URL params as attribution fallbacks</li>
            <li>AI platform traffic — ChatGPT, Claude, Perplexity, and others</li>
            <li>Visitor country and device type</li>
          </ul>
          <p className="text-st-gray dark:text-gray-400 mt-1">
            Conversions require an additional <code className="bg-gray-200 px-1 rounded text-xs">sourcetrack.conversion()</code> call — see JavaScript API below.
          </p>
        </div>

        {/* Client-side Exclusions helper copy */}
        <div className="bg-gray-50 dark:bg-[#111414] rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300 space-y-2">
          <p className="font-medium text-gray-700">Client-Side Path Exclusions (Optional)</p>
          <p className="text-xs">
            To prevent the tracker from sending events on specific client paths, add the <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded text-xs">data-exclude</code> attribute:
          </p>
          <div className="bg-st-black rounded p-3 relative">
            <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">{`<script async src="${trackerBaseUrl}/tracker/${site?.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'}"\n  data-site-key="${site?.site_key || 'YOUR_SITE_KEY'}"\n  data-exclude="/admin/*, /staging/*">\n</script>`}</pre>
          </div>
          <p className="text-[10px] text-st-gray dark:text-gray-400 mt-1">
            Supports comma-separated patterns with trailing wildcards <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded text-[10px]">*</code>. For absolute server-side suppression, use the Settings page.
          </p>
        </div>
      </div>

      {/* Privacy policy reminder — required disclosure for GDPR / CCPA */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex gap-3">
        <div className="text-amber-600 dark:text-amber-400 text-lg leading-none">⚠</div>
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <strong>Update your privacy policy before deploying.</strong> SourceTrack is cookieless and
          does not fingerprint, but you still collect IP-derived country, UTM parameters, and an
          anonymous identifier — required disclosures under GDPR (EU), CCPA (California), and the
          UK PECR. The tracker honors <code className="text-xs">navigator.doNotTrack</code> and
          Global Privacy Control automatically, but a privacy notice is still your responsibility.
        </div>
      </div>

      {/* Verify Install */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#333838] p-6 space-y-4">
        <h3 className="font-semibold text-st-black">Verify Installation</h3>
        <p className="text-sm text-st-gray">
          After pasting the pixel, click below to confirm events are being received.
        </p>

        <button
          onClick={handleTest}
          disabled={testLoading || !site}
          className="px-4 py-2 bg-st-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
        >
          {testLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <ExternalLink className="w-4 h-4" />
              Check Now
            </>
          )}
        </button>

        {testResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            testResult.ok
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 border border-green-200'
              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 border border-amber-200'
          }`}>
            <p>{testResult.message}</p>
            {testResult.domain && (
              <p className="text-xs mt-1 opacity-75">Domain: {testResult.domain}</p>
            )}
          </div>
        )}

        {status?.status === 'verified' && (
          <Link
            to="/debugger"
            className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-gray-200 hover:text-gray-800 font-medium"
          >
            <Bug className="w-3.5 h-3.5" />
            See recent events in Event Logger
          </Link>
        )}
      </div>

      {/* Step 2: Identify Users (Required for LTV) */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#333838] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-st-black">Step 2: Identify Users After Login</h3>
        </div>

        <p className="text-sm text-gray-600">
          Call this once after a user signs up or logs in. Required for LTV attribution to work.
          Without identify(), recurring revenue cannot be attributed to the original ad source.
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">JavaScript — after signup</p>
            <div className="bg-st-black rounded-lg p-4 relative mt-1.5">
              <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap pr-12">{`// Call once after user signs up or logs in
sourcetrack.identify({
  email: 'user@example.com',    // required for LTV
  name: 'Jane Smith',           // optional
  plan: 'trial'                 // optional
})`}</pre>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`// Call once after user signs up or logs in\nsourcetrack.identify({\n  email: 'user@example.com',    // required for LTV\n  name: 'Jane Smith',           // optional\n  plan: 'trial'                 // optional\n})`)
                  } catch (_err) { /* clipboard unavailable */ }
                }}
                className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">React example</p>
            <div className="bg-st-black rounded-lg p-4 relative mt-1.5">
              <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap pr-12">{`// In your auth context or useEffect after login
useEffect(() => {
  if (user) {
    window.sourcetrack?.identify({
      email: user.email,
      name: user.name,
      plan: user.subscription_plan
    })
  }
}, [user])`}</pre>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`// In your auth context or useEffect after login\nuseEffect(() => {\n  if (user) {\n    window.sourcetrack?.identify({\n      email: user.email,\n      name: user.name,\n      plan: user.subscription_plan\n    })\n  }\n}, [user])`)
                  } catch (_err) { /* clipboard unavailable */ }
                }}
                className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: Track Recurring Revenue (Stripe Subscriptions) */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#333838] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-st-black">Step 3: Forward Stripe Webhooks (For Recurring Revenue)</h3>
        </div>

        <p className="text-sm text-gray-600">
          For SaaS subscriptions, forward Stripe invoice.paid events to SourceTrack.
          This attributes every recurring payment to the original ad source — showing true LTV, not just first payment.
        </p>

        <div>
          <p className="text-sm font-medium text-gray-700">Node.js Stripe webhook handler</p>
          <div className="bg-st-black rounded-lg p-4 relative mt-1.5">
            <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap pr-12">{`// In your Stripe webhook handler
app.post('/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object
    const customer = await stripe.customers.retrieve(invoice.customer)

    await fetch('https://api.srctk.com/api/conversion/offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_key: 'YOUR_SITE_KEY',
        user_id: customer.email,           // must match identify() email
        conversion_value: invoice.amount_paid / 100,
        conversion_type: 'recurring_payment',
        // Store first touch source in Stripe metadata at signup:
        first_touch_source: customer.metadata?.st_first_touch_source || 'direct'
      })
    })
  }
  res.json({ received: true })
})`}</pre>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`// In your Stripe webhook handler\napp.post('/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {\n  const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)\n\n  if (event.type === 'invoice.paid') {\n    const invoice = event.data.object\n    const customer = await stripe.customers.retrieve(invoice.customer)\n\n    await fetch('https://api.srctk.com/api/conversion/offline', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({\n        site_key: 'YOUR_SITE_KEY',\n        user_id: customer.email,           // must match identify() email\n        conversion_value: invoice.amount_paid / 100,\n        conversion_type: 'recurring_payment',\n        // Store first touch source in Stripe metadata at signup:\n        first_touch_source: customer.metadata?.st_first_touch_source || 'direct'\n      })\n    })\n  }\n  res.json({ received: true })\n})`)
                } catch (_err) { /* clipboard unavailable */ }
              }}
              className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium text-xs">Important: Store first touch source in Stripe</p>
          <p className="text-xs mt-0.5">
            Store the visitor's first touch source in Stripe customer metadata at signup time by passing it from your backend. Example:
          </p>
          <div className="bg-amber-100 dark:bg-amber-900/30 rounded p-2 mt-1.5">
            <pre className="text-xs whitespace-pre-wrap text-amber-900 dark:text-amber-200">{`await stripe.customers.create({
  email: user.email,
  metadata: {
    st_first_touch_source: req.body.first_touch_source || 'direct',
    st_first_touch_medium: req.body.first_touch_medium || 'none'
  }
})`}</pre>
          </div>
        </div>
      </div>

      {/* Why this matters */}
      <div className="bg-lime-50 dark:bg-lime-900/10 border border-lime-200 dark:border-lime-800 rounded-xl p-5 space-y-2">
        <h3 className="text-sm font-semibold text-st-black">Why this matters</h3>
        <ul className="text-sm text-st-black space-y-1.5">
          <li><strong>Without identify():</strong> LTV shows $0 for all customers.</li>
          <li><strong>Without Stripe webhooks:</strong> LTV shows only first payment, not recurring revenue.</li>
          <li><strong>With both:</strong> SourceTrack shows true attributed LTV across every renewal.</li>
        </ul>
      </div>

      {/* Advanced Setup */}
      <div>
        <h3 className="text-sm font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-3">Advanced Setup</h3>
        <p className="text-xs text-st-gray dark:text-gray-400 -mt-2 mb-3">Optional — expand a section only if you need it</p>

        <div className="space-y-3">
          <AccordionSection
            title="JavaScript API"
            icon={Code}
            when="When you need custom events, conversions, or user identification"
          >
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-gray-700">Identify user</p>
                <code className="block bg-gray-100 dark:bg-[#252929] px-3 py-1.5 rounded text-xs mt-1">{'window.sourcetrack.identify("user_123", { email: "customer@example.com" })'}</code>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-1">Call after login/signup to link browsing history to a known user</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Track custom event</p>
                <code className="block bg-gray-100 dark:bg-[#252929] px-3 py-1.5 rounded text-xs mt-1">{'window.sourcetrack.track("signup", { plan: "pro" })'}</code>
              </div>
              <div>
                <p className="font-medium text-gray-700">Track conversion</p>
                <code className="block bg-gray-100 dark:bg-[#252929] px-3 py-1.5 rounded text-xs mt-1">{'window.sourcetrack.conversion({ value: 29.99, type: "purchase" })'}</code>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-1">
                  Conversions appear in attribution reports and dashboard. Use <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">type</code> to subtype (e.g. purchase, lead, trial).
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Consent management</p>
                <code className="block bg-gray-100 dark:bg-[#252929] px-3 py-1.5 rounded text-xs mt-1">{'window.sourcetrack.consent(true)  // grant\nwindow.sourcetrack.optOut()        // stop tracking\nwindow.sourcetrack.optIn()         // resume tracking\nwindow.sourcetrack.hasConsent()    // check status'}</code>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Identity Stitching"
            icon={LinkIcon}
            when="When you need to connect anonymous visitors to known users after login"
          >
            <p className="text-sm text-gray-600">
              Merges a visitor's anonymous browsing history with their known profile after they log in or sign up.
              This gives you a complete journey view — from first anonymous visit through to conversion as a known user.
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">Important</p>
              <p className="text-xs mt-0.5">
                Always use a stable internal user ID (e.g. <code className="bg-amber-100 px-1 rounded text-xs">usr_abc123</code>).
                Do not use email addresses — they can change and break identity linking.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Explicit API call</p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                Call <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">window.sourcetrack.identify()</code> immediately after login/signup.
              </p>
              <code className="block bg-gray-100 dark:bg-[#252929] px-3 py-1.5 rounded text-xs mt-1.5">
                {'// In your app, after successful login:\nwindow.sourcetrack.identify(currentUser.id, { email: currentUser.email })'}
              </code>
            </div>
          </AccordionSection>


          <div className="bg-gray-50 dark:bg-[#111414] rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300">
            <p className="font-medium text-gray-700 dark:text-gray-200">Cross-domain & booking attribution</p>
            <p className="mt-1">
              Cross-domain handoff helpers are not available in the current tracker.
              Use <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">sourcetrack.identify()</code> after login
              or <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">sourcetrack.conversion()</code> with <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">order_id</code> for attribution across domains.
            </p>
          </div>


          <AccordionSection
            title="Webhook Identity & Contact Linkage"
            icon={LinkIcon}
            when="Only if linking tracked visitors to CRM contacts via Zapier or n8n"
          >
            <p className="text-sm text-gray-600">
              Link tracked anonymous visitors to downstream CRM identities via the Identify API.
              Suitable for Zapier, n8n, or custom webhook workflows.
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this does not support</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Native HubSpot, Salesforce, or CRM platform sync</li>
                <li>Automatic bidirectional sync</li>
                <li>Fuzzy identity matching — linkage is explicit and deterministic</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Zapier / n8n example</p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                POST to <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">/api/identify</code> when a new contact is created in your CRM.
              </p>
              <code className="block bg-gray-100 dark:bg-[#252929] px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
                {'POST /api/identify\nContent-Type: application/json\n\n{\n  "site_key": "your-site-key",\n  "anonymous_id": "__ti_id_from_visitor",\n  "user_id": "usr_abc123",\n  "source_system": "hubspot",\n  "external_id": "hs-contact-456",\n  "contact_email": "lead@example.com",\n  "traits": {\n    "contact_name": "Jane Doe",\n    "company": "Acme Corp"\n  }\n}'}
              </code>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Capturing the anonymous ID</p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                The anonymous ID is included in every event payload SourceTrack receives.
                Pass it from your form submission flow or event logs to the identify call above.
              </p>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Outbound Webhooks"
            icon={LinkIcon}
            when="Only if sending conversion events to external systems via webhook"
          >
            <p className="text-sm text-gray-600">
              SourceTrack can POST conversion events to an external webhook URL.
              Consume these in Zapier, n8n, or any HTTP endpoint.
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this does not support</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Retries, delivery history, or guaranteed delivery</li>
                <li>Multi-destination configuration (single webhook URL per deployment)</li>
                <li>Native Zapier/n8n integration — generic HTTP webhook only</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Configuration</p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                Set the <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">WEBHOOK_URL</code> environment variable on your backend deployment.
                If unset, no webhooks are sent.
              </p>
              <code className="block bg-gray-100 dark:bg-[#252929] px-3 py-1.5 rounded text-xs mt-1.5">
                WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/your-id
              </code>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Events sent</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">conversion</code> (on-site) and <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">conversion.offline</code> (API/CRM).
                Best-effort delivery, 5 second timeout, fire-and-forget.
              </p>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Architecture: How events flow"
            icon={LinkIcon}
            when="Technical reference — not needed for standard setup"
          >
            <p className="text-sm text-gray-600">
              All tracked events are routed through SourceTrack's backend before reaching analytics storage.
              Server-side enrichment (geo, device, AI detection, UTM normalization) happens during ingestion.
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this is not</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Supports standard storage-based tracking (localStorage/sessionStorage) and Cookieless Mode (zero browser storage, server-derived daily-rotating visitor IDs).</li>
                <li>Not a first-party subdomain — events go to the SourceTrack API domain</li>
                <li>Not ad-blocker resistant — requests to the tracking domain may be blocked</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Event flow</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                Browser (pixel) → SourceTrack backend → enrichment → analytics storage
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Server-side enrichment</p>
              <ul className="text-xs text-gray-600 dark:text-gray-300 mt-1 space-y-0.5 list-disc list-inside">
                <li>IP → country detection</li>
                <li>User-Agent → device type (desktop, mobile, tablet)</li>
                <li>Referrer → AI platform detection (ChatGPT, Claude, Perplexity, etc.)</li>
                <li>UTM normalization (trim + lowercase)</li>
              </ul>
            </div>
          </AccordionSection>
        </div>
      </div>
    </div>
  )
}
