import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { Copy, Check, Code, ExternalLink, RefreshCw, Circle, Bug, Link as LinkIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Snippet() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)

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
  const snippet = site
    ? `<script async src="${apiUrl}/tracker/loader.min.js" data-site-key="${site.site_key}"></script>`
    : ''

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
        setTestResult({ ok: true, message: 'Install verified! Events are flowing.', domain: data.domain })
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
    ? 'Verified'
    : status?.status === 'not_installed'
      ? 'Waiting for first event'
      : 'Checking...'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Install</h2>
        <p className="text-sm text-gray-500 mt-1">Add SourceTrack to your website in 30 seconds</p>
      </div>

      {/* Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Install Status</h3>
          <button
            onClick={checkStatus}
            disabled={statusLoading}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Circle className={`w-3 h-3 fill-current ${statusColor}`} />
          <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
        </div>

        {status?.status === 'verified' && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400">Last event</p>
              <p className="text-sm text-gray-700">{new Date(status.last_event).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Domain</p>
              <p className="text-sm text-gray-700 truncate">{status.domain || '—'}</p>
            </div>
            <div className="col-span-2">
              <Link
                to="/debugger"
                className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-800 font-medium"
              >
                <Bug className="w-3.5 h-3.5" />
                See recent events in Debugger
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Snippet */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Install Snippet</h3>
        </div>

        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 pl-1">
          <li>Copy the snippet below</li>
          <li>Paste it in the <code className="bg-gray-100 px-1 rounded text-xs">&lt;head&gt;</code> of your website</li>
          <li>Deploy and visit your site — the tracker activates automatically</li>
        </ol>

        {site && (
          <div className="bg-gray-900 rounded-lg p-4 relative">
            <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        {!site && (
          <p className="text-sm text-gray-400">Create a site first in Settings to get your snippet.</p>
        )}
      </div>

      {/* Test Install */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Test Install</h3>
        <p className="text-sm text-gray-500">
          After pasting the snippet, click below to verify events are being received.
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
      </div>

      {/* API Reference */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
        <h3 className="font-semibold text-gray-900">JavaScript API</h3>
        <p className="text-xs text-gray-400">Available after the tracker loads. Use in your own scripts.</p>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-gray-700">Get visitor ID</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">window.trackiq.id()</code>
          </div>
          <div>
            <p className="font-medium text-gray-700">Identify user (explicit)</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.identify({ user_id: "usr_abc123" })'}</code>
            <p className="text-xs text-gray-400 mt-1">Provide a stable internal user ID after login or signup</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">Track custom event</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.event("signup", { plan: "pro" })'}</code>
          </div>
          <div>
            <p className="font-medium text-gray-700">Track conversion</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.conversion(29.99, { product: "starter" })'}</code>
          </div>
        </div>
      </div>

      {/* Cross-Domain Tracking v1 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Cross-Domain Tracking v1</h3>
        </div>

        <p className="text-sm text-gray-600">
          Preserve attribution when a visitor moves from one tracked domain to another within your setup.
          Uses query-parameter pass-through — simple, explicit, and documentable. Both domains must have the SourceTrack snippet installed.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">What this does not support</p>
          <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
            <li>Cross-device identity (different browser/device = different visitor)</li>
            <li>Automatic third-party checkout domains</li>
            <li>Subdomain-wide cookies without explicit setup on both ends</li>
            <li>Automatic link decoration — you explicitly call <code className="bg-amber-100 px-1 rounded text-xs">getCrossDomainUrl()</code></li>
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Decorate outgoing links</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Call <code className="bg-gray-100 px-1 rounded text-xs">getCrossDomainUrl()</code> on the URL before setting it on links or forms pointing to another tracked domain.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
              {'// Before setting a link href to app.example.com:\nvar link = document.getElementById("app-link")\nlink.href = window.trackiq.getCrossDomainUrl(link.href)'}
            </code>
            <p className="text-xs text-gray-400 mt-1">
              This appends <code className="bg-gray-100 px-1 rounded text-xs">?__tq_id=...</code> and <code className="bg-gray-100 px-1 rounded text-xs">?__tq_ft=...</code> with the current anonymous ID and first-touch source/medium/campaign.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Form-based cross-domain handoff</p>
            <p className="text-xs text-gray-500 mt-0.5">
              If the receiving domain reads the form submission and renders the tracker, add a hidden field:
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
              {'<input type="hidden" data-trackiq="__tq_id" name="anonymous_id" />'}
            </code>
            <p className="text-xs text-gray-400 mt-1">
              The tracker will populate it with the current anonymous ID on page load.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">What the receiving domain does automatically</p>
            <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
              <li>Reads <code className="bg-gray-100 px-1 rounded text-xs">__tq_id</code> from URL and restores the cookie if not already present</li>
              <li>Reads <code className="bg-gray-100 px-1 rounded text-xs">__tq_ft</code> from URL and restores first-touch context if not already present</li>
              <li>Strips <code className="bg-gray-100 px-1 rounded text-xs">__tq_*</code> params from the visible URL after reading</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Booking Attribution v1 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Booking Attribution v1</h3>
        </div>

        <p className="text-sm text-gray-600">
          Track scheduled meetings and booked calls as a differentiated conversion subtype. Compatible with Calendly-style booking flows — uses a documented handoff pattern, not a native integration.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">What this does not support</p>
          <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
            <li>Native Calendly OAuth or API integration</li>
            <li>Automatic booking ingestion from third-party systems</li>
            <li>Webhook-based booking completion callbacks</li>
            <li>Full booking platform coverage beyond documented manual wiring</li>
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Step 1 — Carry attribution into the booking form</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Add hidden fields to your form so SourceTrack context survives the handoff. The tracker populates these automatically.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
              {'<!-- Add to your booking form (e.g., Calendly embed pre-fill): -->\n<input type="hidden" data-trackiq="__tq_id" name="anonymous_id" />\n<input type="hidden" data-trackiq="utm_source" name="utm_source" />'}
            </code>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Step 2 — Decorate the booking link (cross-domain)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              If your booking tool runs on a different domain, decorate the link before navigation. Both domains must have the SourceTrack snippet installed.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
              {'// Before opening Calendly popup or navigating to booking page:\nvar bookingUrl = "https://calendly.com/your-link"\nvar decorated = window.trackiq.getCrossDomainUrl(bookingUrl)\n// Use decorated in your link or iframe src'}
            </code>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Step 3 — Fire booking conversion on confirmation</p>
            <p className="text-xs text-gray-500 mt-0.5">
              On your confirmation/thank-you page (after booking is completed), fire a conversion with the meeting or booking subtype.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
              {'// On booking confirmation page:\nwindow.trackiq.conversion(0, { conversion_type: "meeting", form_name: "Calendly" })\n// Or use "booking" type:\nwindow.trackiq.conversion(0, { conversion_type: "booking", form_name: "Calendly" })'}
            </code>
            <p className="text-xs text-gray-400 mt-1">
              The booking will appear as a distinguished conversion subtype in your Dashboard Conversion Events card and attribution reports.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">How it works under the hood</p>
            <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
              <li>Hidden fields carry your anonymous ID + UTM context into the booking form</li>
              <li>Cross-domain params (<code className="bg-gray-100 px-1 rounded text-xs">__tq_id</code>) preserve identity if the booking tool is on a different domain</li>
              <li>Confirmation-page conversion fires <code className="bg-gray-100 px-1 rounded text-xs">$conversion</code> with <code className="bg-gray-100 px-1 rounded text-xs">conversion_type</code> and optional <code className="bg-gray-100 px-1 rounded text-xs">form_name</code></li>
              <li>Attribution context (source/medium/campaign) flows through the entire journey</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Webhook Identity & Contact Linkage v1 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Webhook Identity & Contact Linkage v1</h3>
        </div>

        <p className="text-sm text-gray-600">
          Link tracked anonymous visitors to downstream CRM/contact identities via the Identify API. Suitable for Zapier, n8n, or custom webhook workflows.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">What this does not support</p>
          <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
            <li>Native HubSpot, Salesforce, or CRM integration</li>
            <li>Automatic bidirectional sync</li>
            <li>Fuzzy or "smart" identity matching — linkage is explicit and deterministic</li>
            <li>Email-only identity resolution — email is set as a person property, not an identity key</li>
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Zapier / n8n example payload</p>
            <p className="text-xs text-gray-500 mt-0.5">
              POST to <code className="bg-gray-100 px-1 rounded text-xs">/api/identify</code> when a new contact is created in your CRM.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
              {'POST /api/identify\nContent-Type: application/json\n\n{\n  "site_key": "your-site-key",\n  "anonymous_id": "__ti_id_from_visitor",\n  "user_id": "usr_abc123",\n  "source_system": "hubspot",\n  "external_id": "hs-contact-456",\n  "contact_email": "lead@example.com",\n  "traits": {\n    "contact_name": "Jane Doe",\n    "crm_stage": "lead",\n    "company": "Acme Corp"\n  }\n}'}
            </code>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">How linkage works</p>
            <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
              <li><code className="bg-gray-100 px-1 rounded text-xs">user_id</code> + <code className="bg-gray-100 px-1 rounded text-xs">anonymous_id</code> trigger identity stitching (<code className="bg-gray-100 px-1 rounded text-xs">ph.alias()</code>) — the anonymous browser history merges into the identified person</li>
              <li><code className="bg-gray-100 px-1 rounded text-xs">source_system</code> and <code className="bg-gray-100 px-1 rounded text-xs">external_id</code> are stored as person properties — use these to correlate with your CRM</li>
              <li><code className="bg-gray-100 px-1 rounded text-xs">contact_email</code> is stored as a person property — not used for identity resolution</li>
              <li>All <code className="bg-gray-100 px-1 rounded text-xs">traits</code> keys become PostHog person properties via $set</li>
              <li>Linkage is deterministic — no fuzzy matching or automatic deduplication across identifiers</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Getting the anonymous_id into your CRM</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Use hidden fields in your forms to capture the visitor's anonymous ID. The tracker populates these automatically.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
              {'<input type="hidden" data-trackiq="anonymous_id" name="source_track_id" />'}
            </code>
            <p className="text-xs text-gray-400 mt-1">
              When the form is submitted, the anonymous ID flows to your CRM. Use it in the identify call to link the tracked visitor to the CRM contact.
            </p>
          </div>
        </div>
      </div>

      {/* Outbound Webhooks v1 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Outbound Webhooks v1</h3>
        </div>

        <p className="text-sm text-gray-600">
          SourceTrack can POST conversion events to an external webhook URL. Consume these in Zapier, n8n, or any HTTP endpoint for real-time automation.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">What this does not support</p>
          <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
            <li>Retries, delivery history, signatures, or guaranteed delivery</li>
            <li>Multi-destination configuration (single webhook URL per deployment)</li>
            <li>Native Zapier/n8n integration — this is a generic HTTP webhook they can consume</li>
            <li>Broad event coverage — only conversion events are sent in v1</li>
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Configuration</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Set the <code className="bg-gray-100 px-1 rounded text-xs">WEBHOOK_URL</code> environment variable on your backend deployment.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
              WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/your-id
            </code>
            <p className="text-xs text-gray-400 mt-1">
              If unset, no webhooks are sent — tracking works normally without it.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Events sent</p>
            <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
              <li><code className="bg-gray-100 px-1 rounded text-xs">conversion</code> — on-site conversions (POST /api/conversion)</li>
              <li><code className="bg-gray-100 px-1 rounded text-xs">conversion.offline</code> — offline/CRM-stage conversions (POST /api/conversion/offline)</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Example payload (Zapier/n8n compatible)</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5 whitespace-pre-wrap">
              {'{\n  "event_id": "uuid",\n  "event_type": "conversion",\n  "occurred_at": "2025-01-15T10:30:00Z",\n  "source": "sourcetrack",\n  "data": {\n    "site_id": "...",\n    "anonymous_id": "...",\n    "conversion_type": "lead",\n    "conversion_value": 100,\n    "form_name": "Contact Form",\n    "ingestion_method": "offline",\n    "external_id": "sf-abc-123"\n  }\n}'}
            </code>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Delivery model</p>
            <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
              <li>Best-effort synchronous POST (5 second timeout)</li>
              <li>Fire-and-forget — webhook failure does not affect tracking</li>
              <li>No retries, no delivery history, no signatures in v1</li>
              <li>Data includes only verified, non-PII fields from the conversion event</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Identity Stitching */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Identity Stitching</h3>
        </div>

        <p className="text-sm text-gray-600">
          Identity stitching merges a visitor's anonymous browsing history with their known profile after they log in or sign up.
          This gives you a complete journey view across sessions — from first anonymous visit through to conversion as a known user.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">Important</p>
          <p className="text-xs mt-0.5">
            Always use a stable internal user ID (e.g. <code className="bg-amber-100 px-1 rounded text-xs">usr_abc123</code>).
            Do not use email addresses — they can change and break identity linking.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Option 1 — Explicit API call</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Call <code className="bg-gray-100 px-1 rounded text-xs">window.trackiq.identify()</code> immediately after login/signup.
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
              {'// In your app, after successful login:\nwindow.trackiq.identify({ user_id: currentUser.id })'}
            </code>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Option 2 — Auto-detection (no custom JS)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Add a hidden element with your user ID and configure the snippet to read it automatically.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              1. Add this to your logged-in page template (render your actual user ID):
            </p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1.5">
              {'<meta data-trackiq-user-id="usr_abc123" />'}
            </code>
            <p className="text-xs text-gray-500 mt-2">
              2. Update the snippet to tell the tracker where to find it:
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
          </div>
        </div>
      </div>

      {/* Architecture: Server-Routed Ingestion */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Architecture: Server-Routed Ingestion</h3>
        </div>

        <p className="text-sm text-gray-600">
          All tracked events (pageviews, conversions, identify calls) are routed through SourceTrack's backend before reaching PostHog. This is how event enrichment works today — IP-based geo detection, device type parsing, and AI platform identification all happen server-side.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">What this does not mean</p>
          <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
            <li>Not cookieless — identity relies on browser storage (cookies with localStorage backup for same-domain continuity). Clearing all site data still resets the anonymous ID.</li>
            <li>Not a first-party subdomain — events go to the SourceTrack API domain, not a customer-owned subdomain</li>
            <li>Not ad-blocker resistant — requests to the tracking domain may still be blocked by ad blockers</li>
            <li>Not a replacement for client-side tracking — the tracker still runs in the browser and sends events via HTTP</li>
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">How events flow</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Browser (tracker.js) → POST to SourceTrack backend → Server-side enrichment → PostHog
            </p>
            <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
              <li>Pageviews and custom events: <code className="bg-gray-100 px-1 rounded text-xs">POST /api/track</code></li>
              <li>On-site conversions: <code className="bg-gray-100 px-1 rounded text-xs">POST /api/conversion</code></li>
              <li>Identity calls: <code className="bg-gray-100 px-1 rounded text-xs">POST /api/identify</code></li>
              <li>Offline/CRM conversions: <code className="bg-gray-100 px-1 rounded text-xs">POST /api/conversion/offline</code></li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Server-side enrichment</p>
            <ul className="text-xs text-gray-600 mt-1 space-y-0.5 list-disc list-inside">
              <li>IP → country detection (via geoip-lite)</li>
              <li>User-Agent → device type (desktop, mobile, tablet)</li>
              <li>Referrer → AI platform detection (ChatGPT, Claude, Perplexity, etc.)</li>
              <li>UTM normalization (trim + lowercase)</li>
              <li>Server timestamp added to every event</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">How this is labeled in data</p>
            <p className="text-xs text-gray-600 mt-0.5">
              On-site events (pageviews, browser conversions) are tagged with <code className="bg-gray-100 px-1 rounded text-xs">ingestion_method: 'server_routed'</code> in PostHog properties.
              Offline/CRM conversions use <code className="bg-gray-100 px-1 rounded text-xs">ingestion_method: 'offline'</code>.
              These markers let you distinguish event origins in queries and reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
