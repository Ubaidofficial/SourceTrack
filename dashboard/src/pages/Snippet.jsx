import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { Copy, Check, Code, ExternalLink, RefreshCw, Circle, Bug, Link as LinkIcon, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

function AccordionSection({ title, icon: Icon, when, children }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-5 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors rounded-xl"
      >
        <Icon className="w-5 h-5 text-gray-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {when && <p className="text-xs text-gray-400 mt-0.5">{when}</p>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
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
  const [autoIdentify, setAutoIdentify] = useState(false)
  const [idSelector, setIdSelector] = useState('[data-trackiq-user-id]')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key, name, domain')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSite(data)
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

  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin

  function buildSnippet() {
    if (!site) return ''
    const attrs = [`src="${apiUrl}/tracker/loader.min.js"`, `data-site-key="${site.site_key}"`]
    if (autoIdentify && idSelector.trim()) {
      attrs.push(`data-user-id-selector="${idSelector.trim()}"`)
    }
    return `<script async ${attrs.join(' ')}></script>`
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
      : 'text-gray-400'

  const statusLabel = status?.status === 'verified'
    ? 'Receiving data'
    : status?.status === 'not_installed'
      ? 'Waiting for first event'
      : 'Checking...'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Install</h2>
        <p className="text-sm text-gray-500 mt-1">Add the SourceTrack Pixel to your website</p>
      </div>

      {/* Status — compact inline */}
      {site && (
        <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-200 shadow-sm">
          <Circle className={`w-2.5 h-2.5 fill-current ${statusColor}`} />
          <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
          {status?.status === 'verified' && status?.domain && (
            <span className="text-xs text-gray-400 ml-auto truncate">{status.domain}</span>
          )}
          <button
            onClick={checkStatus}
            disabled={statusLoading}
            className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {/* SourceTrack Pixel — the only required install step */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">SourceTrack Pixel</h3>
        </div>

        <p className="text-sm text-gray-600">
          For most websites, this single script is enough to start tracking traffic and attribution.
          Toggle options below to customize the pixel for your setup.
        </p>

        {/* Toggle Controls */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pixel Options</p>

          <div className="space-y-2">
            {/* Auto-identify toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <button
                  onClick={() => setAutoIdentify(!autoIdentify)}
                  className="flex items-center gap-2 text-left group"
                >
                  {autoIdentify
                    ? <ToggleRight className="w-5 h-5 text-gray-900 flex-shrink-0" />
                    : <ToggleLeft className="w-5 h-5 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                  }
                  <span className="text-sm font-medium text-gray-700">Auto-identify logged-in users</span>
                </button>
                <p className="text-xs text-gray-400 mt-0.5 ml-7">
                  Reads a user ID from a meta tag on your page after login. No custom JavaScript needed.
                </p>
              </div>
            </div>

            {autoIdentify && (
              <div className="ml-7 p-3 bg-white rounded-lg border border-gray-200 space-y-2">
                <label className="text-xs font-medium text-gray-700 block">CSS selector for user ID element</label>
                <input
                  type="text"
                  value={idSelector}
                  onChange={(e) => setIdSelector(e.target.value)}
                  placeholder="[data-trackiq-user-id]"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-gray-900"
                />
                <p className="text-xs text-gray-400">
                  Add <code className="bg-gray-100 px-1 rounded text-xs">&lt;meta data-trackiq-user-id="usr_abc123" /&gt;</code> to your logged-in page template.
                </p>
              </div>
            )}
          </div>
        </div>

        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 pl-1">
          <li>Copy the script below</li>
          <li>Paste it in the <code className="bg-gray-100 px-1 rounded text-xs">&lt;head&gt;</code> of your website</li>
          <li>Deploy — tracking starts automatically on the next page load</li>
        </ol>

        {site && (
          <div className="bg-gray-900 rounded-lg p-4 relative">
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
          <p className="text-sm text-gray-400">Complete onboarding or create a site in Settings to get your pixel.</p>
        )}

        {/* What you get immediately */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <p className="font-medium text-gray-700">What this captures automatically</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Pageviews and session activity</li>
            <li>Traffic sources — UTM params, referrers, direct visits</li>
            <li>AI platform traffic — ChatGPT, Claude, Perplexity, and others</li>
            <li>Visitor country and device type</li>
          </ul>
          <p className="text-gray-400 mt-1">
            Conversions require an additional <code className="bg-gray-200 px-1 rounded text-xs">trackiq.conversion()</code> call — see JavaScript API below.
          </p>
        </div>
      </div>

      {/* Verify Install */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Verify Installation</h3>
        <p className="text-sm text-gray-500">
          After pasting the pixel, click below to confirm events are being received.
        </p>

        <button
          onClick={handleTest}
          disabled={testLoading || !site}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
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
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
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
            className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-800 font-medium"
          >
            <Bug className="w-3.5 h-3.5" />
            See recent events in Event Logger
          </Link>
        )}
      </div>

      {/* Advanced Setup */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Advanced Setup</h3>
        <p className="text-xs text-gray-400 -mt-2 mb-3">Optional — expand a section only if you need it</p>

        <div className="space-y-3">
          <AccordionSection
            title="JavaScript API"
            icon={Code}
            when="When you need custom events, conversions, or user identification"
          >
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-gray-700">Get visitor ID</p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">window.trackiq.id()</code>
              </div>
              <div>
                <p className="font-medium text-gray-700">Identify user</p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.identify({ user_id: "usr_abc123" })'}</code>
                <p className="text-xs text-gray-400 mt-1">Call after login/signup to link browsing history to a known user</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Track custom event</p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.event("signup", { plan: "pro" })'}</code>
              </div>
              <div>
                <p className="font-medium text-gray-700">Track conversion</p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.conversion(29.99, { product: "starter" })'}</code>
                <p className="text-xs text-gray-400 mt-1">
                  Conversions appear in attribution reports and dashboard. Use <code className="bg-gray-100 px-1 rounded text-xs">conversion_type</code> to subtype (e.g. purchase, lead, trial).
                </p>
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

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">Important</p>
              <p className="text-xs mt-0.5">
                Always use a stable internal user ID (e.g. <code className="bg-amber-100 px-1 rounded text-xs">usr_abc123</code>).
                Do not use email addresses — they can change and break identity linking.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Explicit API call</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Call <code className="bg-gray-100 px-1 rounded text-xs">window.trackiq.identify()</code> immediately after login/signup.
              </p>
              <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
                {'// In your app, after successful login:\nwindow.trackiq.identify({ user_id: currentUser.id })'}
              </code>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Auto-detection (no custom JS)</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Add a hidden meta tag to your logged-in pages. The pixel reads it automatically — no code changes beyond the meta tag.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Add this to your logged-in page template (render your actual user ID):
              </p>
              <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
                {'<meta data-trackiq-user-id="usr_abc123" />'}
              </code>
              <p className="text-xs text-gray-500 mt-2">
                Then add <code className="bg-gray-100 px-1 rounded text-xs">data-user-id-selector</code> to your pixel script:
              </p>
              {site && (
                <div className="bg-gray-900 rounded-lg p-4 relative mt-1.5">
                  <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">
                    {`<script async src="${apiUrl}/tracker/loader.min.js" data-site-key="${site.site_key}" data-user-id-selector="[data-trackiq-user-id]"></script>`}
                  </pre>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`<script async src="${apiUrl}/tracker/loader.min.js" data-site-key="${site.site_key}" data-user-id-selector="[data-trackiq-user-id]"></script>`)
                      } catch (_err) { /* clipboard unavailable */ }
                    }}
                    className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">
                This is an alternative configuration of the same pixel — not a different script.
              </p>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Cross-Domain Tracking"
            icon={LinkIcon}
            when="Only if visitors move between multiple domains you own"
          >
            <p className="text-sm text-gray-600">
              Preserve attribution when a visitor moves from one tracked domain to another.
              Uses query-parameter pass-through. Both domains must have the SourceTrack Pixel installed.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this does not support</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Cross-device identity (different browser/device = different visitor)</li>
                <li>Automatic third-party checkout domains</li>
                <li>Automatic link decoration — you explicitly call <code className="bg-amber-100 px-1 rounded text-xs">getCrossDomainUrl()</code></li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Decorate outgoing links</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Call <code className="bg-gray-100 px-1 rounded text-xs">getCrossDomainUrl()</code> on URLs pointing to another tracked domain.
                </p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
                  {'var link = document.getElementById("app-link")\nlink.href = window.trackiq.getCrossDomainUrl(link.href)'}
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Form-based handoff</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add a hidden field for cross-domain form submissions:
                </p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
                  {'<input type="hidden" data-trackiq="__tq_id" name="anonymous_id" />'}
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Receiving domain (automatic)</p>
                <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Reads <code className="bg-gray-100 px-1 rounded text-xs">__tq_id</code> from URL and restores identity cookie</li>
                  <li>Reads <code className="bg-gray-100 px-1 rounded text-xs">__tq_ft</code> and restores first-touch context</li>
                  <li>Strips params from visible URL after reading</li>
                </ul>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Booking Attribution"
            icon={LinkIcon}
            when="Only if conversions happen in external booking tools like Calendly"
          >
            <p className="text-sm text-gray-600">
              Track scheduled meetings and booked calls as a differentiated conversion subtype.
              Uses a documented handoff pattern — not a native integration.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this does not support</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Native Calendly OAuth or API integration</li>
                <li>Automatic booking ingestion from third-party tools</li>
                <li>Webhook-based booking completion callbacks</li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Step 1 — Carry attribution into the booking form</p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
                  {'<input type="hidden" data-trackiq="__tq_id" name="anonymous_id" />\n<input type="hidden" data-trackiq="utm_source" name="utm_source" />'}
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Step 2 — Decorate the booking link (cross-domain)</p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
                  {'var decorated = window.trackiq.getCrossDomainUrl("https://calendly.com/your-link")'}
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Step 3 — Fire conversion on confirmation page</p>
                <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
                  {'window.trackiq.conversion(0, { conversion_type: "meeting", form_name: "Calendly" })'}
                </code>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Webhook Identity & Contact Linkage"
            icon={LinkIcon}
            when="Only if linking tracked visitors to CRM contacts via Zapier or n8n"
          >
            <p className="text-sm text-gray-600">
              Link tracked anonymous visitors to downstream CRM identities via the Identify API.
              Suitable for Zapier, n8n, or custom webhook workflows.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this does not support</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Native HubSpot, Salesforce, or CRM integration</li>
                <li>Automatic bidirectional sync</li>
                <li>Fuzzy identity matching — linkage is explicit and deterministic</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Zapier / n8n example</p>
              <p className="text-xs text-gray-500 mt-0.5">
                POST to <code className="bg-gray-100 px-1 rounded text-xs">/api/identify</code> when a new contact is created in your CRM.
              </p>
              <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
                {'POST /api/identify\nContent-Type: application/json\n\n{\n  "site_key": "your-site-key",\n  "anonymous_id": "__ti_id_from_visitor",\n  "user_id": "usr_abc123",\n  "source_system": "hubspot",\n  "external_id": "hs-contact-456",\n  "contact_email": "lead@example.com",\n  "traits": {\n    "contact_name": "Jane Doe",\n    "company": "Acme Corp"\n  }\n}'}
              </code>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Capturing the anonymous ID</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Use hidden fields in your forms. The pixel populates them automatically.
              </p>
              <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
                {'<input type="hidden" data-trackiq="anonymous_id" name="source_track_id" />'}
              </code>
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

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this does not support</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Retries, delivery history, or guaranteed delivery</li>
                <li>Multi-destination configuration (single webhook URL per deployment)</li>
                <li>Native Zapier/n8n integration — generic HTTP webhook only</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Configuration</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Set the <code className="bg-gray-100 px-1 rounded text-xs">WEBHOOK_URL</code> environment variable on your backend deployment.
                If unset, no webhooks are sent.
              </p>
              <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
                WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/your-id
              </code>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Events sent</p>
              <p className="text-xs text-gray-600 mt-0.5">
                <code className="bg-gray-100 px-1 rounded text-xs">conversion</code> (on-site) and <code className="bg-gray-100 px-1 rounded text-xs">conversion.offline</code> (API/CRM).
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

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <p className="font-medium text-xs">What this is not</p>
              <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                <li>Not cookieless — identity relies on browser storage (cookies with localStorage backup)</li>
                <li>Not a first-party subdomain — events go to the SourceTrack API domain</li>
                <li>Not ad-blocker resistant — requests to the tracking domain may be blocked</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Event flow</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Browser (pixel) → SourceTrack backend → enrichment → analytics storage
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Server-side enrichment</p>
              <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
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
