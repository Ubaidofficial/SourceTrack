import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { Copy, Check, Code, RefreshCw, ChevronDown, ChevronRight, Bug, Send, ExternalLink, Key, CheckCircle, Circle, ArrowRight, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import SetupDoctorCard from '../components/SetupDoctorCard'

export default function Snippet() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState(null)
  const handleOnVerificationSuccess = useCallback((diagnostics) => {
    setStatus({
      status: 'verified',
      last_event_name: diagnostics.tracker_install.last_event_name,
      last_seen_at: diagnostics.tracker_install.last_seen_at
    })
  }, [])
  const [statusLoading, setStatusLoading] = useState(false)
  const [proxyDomain, setProxyDomain] = useState(null)

  const [showPrivacyNotes, setShowPrivacyNotes] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [activeSub, setActiveSub] = useState(null)

  const [testConvLoading, setTestConvLoading] = useState(false)
  const [testConvResult, setTestConvResult] = useState(null)

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

  // Check URL hash for opening advanced setup directly
  useEffect(() => {
    if (window.location.hash === '#advanced') {
      setAdvancedOpen(true)
      setTimeout(() => {
        document.getElementById('advanced-section')?.scrollIntoView({ behavior: 'smooth' })
      }, 200)
    }
  }, [])

  const trackerBaseUrl = (import.meta.env.VITE_TRACKER_BASE_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

  function buildSnippet() {
    if (!site) return ''
    const trackerFile = site.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'
    const scriptSrc = proxyDomain ? `https://${proxyDomain}/${trackerFile}` : `${trackerBaseUrl}/${trackerFile}`
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
  };


  const handleTestConversion = async () => {
    if (!site) return
    setTestConvLoading(true)
    setTestConvResult(null)
    try {
      await fetchApi('/conversion', {
        method: 'POST',
        body: {
          site_key: site.site_key,
          conversion_type: 'test_conversion',
          conversion_value: 0,
          anonymous_id: `test-${Date.now()}`,
          page_url: window.location.href
        }
      })
      setTestConvResult({ ok: true })
    } catch (_err) {
      setTestConvResult({ ok: false, message: 'Failed to send test conversion. Check your connection.' })
    } finally {
      setTestConvLoading(false)
    }
  }

  const renderSubRow = (id, title, subtitle, content) => {
    const isExpanded = activeSub === id
    return (
      <div className="border-b border-gray-200 dark:border-gray-800 last:border-0 pb-3 last:pb-0 pt-3 first:pt-0">
        <button
          onClick={() => setActiveSub(isExpanded ? null : id)}
          className="w-full flex items-center justify-between text-left group"
        >
          <div className="pr-4">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{title}</h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-light mt-0.5">{subtitle}</p>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          )}
        </button>
        {isExpanded && (
          <div className="mt-3 space-y-2.5 pl-1 text-[13px] text-gray-600 dark:text-gray-300 font-light leading-relaxed">
            {content}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl pb-10">
      <div>
        <h2 className="text-2xl font-bold text-st-black dark:text-white">Install SourceTrack</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Add one script to your website and verify tracking.</p>
      </div>

      {/* Setup Checklist */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-5">
        <h3 className="text-sm font-semibold text-st-black dark:text-white mb-3">Setup checklist</h3>
        <div className="space-y-2">
          {[
            { done: true, label: 'Create your site', detail: 'Done' },
            { done: copied, label: 'Copy tracker snippet', detail: copied ? 'Copied' : 'Copy below', action: () => document.getElementById('snippet-code')?.scrollIntoView({ behavior: 'smooth' }) },
            { done: false, label: 'Install on your website', detail: 'Paste before </head>', links: true },
            { done: status?.status === 'verified', label: 'Verify first pageview', detail: status?.status === 'verified' ? `Verified — ${status.last_event_name || '$pageview'}` : 'Verify via Setup Doctor below' },
            { done: testConvResult?.ok, label: 'Send a test conversion', detail: testConvResult?.ok ? 'Test sent' : 'Use button below' },
            { done: false, label: 'View your attribution report', detail: null, href: '/dashboard' },
          ].map((step, i) => {
            const isCurrent = !step.done && (i === 0 || [true, true, copied, copied, status?.status === 'verified', testConvResult?.ok][i - 1] !== false)
            return (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex-shrink-0">
                  {step.done ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : isCurrent ? (
                    <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {step.href ? (
                      <Link to={step.href} className="font-medium text-st-black dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{step.label}</Link>
                    ) : step.action ? (
                      <button onClick={step.action} className="font-medium text-st-black dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left">{step.label}</button>
                    ) : (
                      <span className={`font-medium ${step.done ? 'text-gray-500 dark:text-gray-500' : 'text-st-black dark:text-white'}`}>{step.label}</span>
                    )}
                    {step.detail && <span className="text-gray-400 dark:text-gray-500">{step.detail}</span>}
                  </div>
                  {step.links && (
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
                      {[
                        { label: 'GTM', to: '/docs/platforms/google-tag-manager' },
                        { label: 'Webflow', to: '/docs/platforms/webflow' },
                        { label: 'WordPress', to: '/docs/platforms/wordpress' },
                        { label: 'Framer', to: '/docs/platforms/framer' },
                        { label: 'Shopify', to: '/docs/platforms/shopify' },
                      ].map(p => (
                        <Link key={p.label} to={p.to} className="text-blue-600 dark:text-blue-400 hover:underline">{p.label}</Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3-Step Guided Installation */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-6 space-y-6">        {/* Step 1 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold">1</span>
            <h3 className="font-semibold text-sm text-st-black dark:text-white">Copy your tracking script</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 pl-7">
            Add this tracking code to your website to automatically capture pageviews, sessions, and UTM traffic sources.
          </p>
          {site ? (
            <div className="pl-7">
            <div id="snippet-code" className="bg-st-black rounded-lg p-3.5 relative border border-gray-800">
                <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-12 leading-relaxed select-all">{snippet}</pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2.5 right-2.5 p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-st-gray pl-7">Loading your script key...</p>
          )}
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold">2</span>
            <h3 className="font-semibold text-sm text-st-black dark:text-white">Paste before closing head tag</h3>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 pl-7">
            Paste the copied snippet into the <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">&lt;head&gt;</code> element of your website's HTML code.
          </p>
        </div>

        {/* Step 3 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold">3</span>
            <h3 className="font-semibold text-sm text-st-black dark:text-white">Verify installation</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 pl-7">
            Open your website in a new browser tab to trigger a pageview event, then verify setup diagnostics below.
          </p>
          {site?.site_key && (
            <div className="pl-7">
              <SetupDoctorCard
                siteKey={site.site_key}
                mode="snippet"
                onVerificationSuccess={handleOnVerificationSuccess}
              />
            </div>
          )}
        </div>
      </div>

      {/* Test Conversion */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-st-black dark:text-white">Send a test conversion</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Send a $0 test conversion from this dashboard to confirm SourceTrack can receive conversion events for this site.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This does not test your website install or real attribution. To test real attribution, install the tracker on your website, visit the site, then trigger a conversion from your website.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestConversion}
            disabled={testConvLoading || !site}
            className="px-3 py-1.5 bg-st-black dark:bg-white text-white dark:text-st-black rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 hover:opacity-90"
          >
            {testConvLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Send test conversion
              </>
            )}
          </button>
        </div>
        {testConvResult && (
          <div className={`rounded-lg px-3.5 py-2.5 text-xs ${
            testConvResult.ok
              ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/35'
              : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/35'
          }`}>
            {testConvResult.ok ? (
              <div className="space-y-1.5">
                <p className="font-medium">Test conversion sent. Reports can take a few minutes to update.</p>
                <p>
                  <Link to="/developers/conversions" className="font-semibold underline hover:no-underline">Next: test real attribution from your website →</Link>
                </p>
              </div>
            ) : (
              <p className="font-medium">{testConvResult.message}</p>
            )}
          </div>
        )}
        <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p>Test conversions use type <code className="font-mono">test_conversion</code> and value <code className="font-mono">$0</code>. They may still appear in reports because there is no test-data filter yet.</p>
        </div>
      </div>

      {/* Site Key */}
      {site && (
        <div className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <h3 className="text-sm font-semibold text-st-black dark:text-white">Your Site Key</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Use this key for server-side API calls and integrations.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 dark:bg-[#252929] border border-gray-200 dark:border-[#333838] rounded-lg px-3 py-2 text-sm font-mono text-st-black dark:text-white select-all">{site.site_key}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(site.site_key).catch(() => {}) }}
              className="p-2 bg-gray-100 dark:bg-[#252929] hover:bg-gray-200 dark:hover:bg-[#333838] rounded-lg transition-colors"
              title="Copy site key"
            >
              <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      )}

      {/* Platform Docs Links */}
      <div className="bg-gray-50 dark:bg-[#161919]/60 rounded-xl border border-gray-200 dark:border-gray-800/80 p-4">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Platform install guides</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {[
            { label: 'Google Tag Manager', to: '/docs/platforms/google-tag-manager' },
            { label: 'Webflow', to: '/docs/platforms/webflow' },
            { label: 'WordPress', to: '/docs/platforms/wordpress' },
            { label: 'Framer', to: '/docs/platforms/framer' },
            { label: 'Shopify', to: '/docs/platforms/shopify' },
          ].map(p => (
            <Link key={p.label} to={p.to} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
              {p.label} <ExternalLink className="w-3 h-3" />
            </Link>
          ))}
        </div>
      </div>

      {/* Calm Privacy Reminder */}
      <div className="bg-gray-50 dark:bg-[#161919]/60 rounded-xl border border-gray-200 dark:border-gray-800/80 p-4">
        <div className="flex items-start gap-2.5">
          <span className="text-gray-500 mt-0.5 text-sm">🔒</span>
          <div className="flex-1 text-xs text-st-gray dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Privacy reminder. </span>
            SourceTrack is built with privacy-conscious features, including standard cookieless options. Update your privacy policy before production use.{' '}
            <button
              onClick={() => setShowPrivacyNotes(!showPrivacyNotes)}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline ml-1"
            >
              {showPrivacyNotes ? 'Hide notes' : 'Read privacy notes'}
            </button>
            {showPrivacyNotes && (
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed pt-2 border-t border-gray-200 dark:border-gray-800/60">
                Under GDPR, CCPA, and PECR regulations, you must disclose that you collect anonymous site metrics (referrers, UTM params, session length, and IP-derived location). While Cookieless Mode avoids writing browser cookies or localStorage keys, reading client headers (e.g., User-Agent, IP address) to generate visitor hashes may still require disclosure or explicit consent in certain jurisdictions. Customers are solely responsible for ensuring their tracking configurations comply with all regional regulations.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Setup Accordion */}
      <div id="advanced-section" className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] overflow-hidden shadow-sm">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-[#252929] transition-colors"
        >
          <div>
            <h3 className="text-sm font-semibold text-st-black dark:text-white">Advanced setup</h3>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">Optional for SaaS, ecommerce, CRM, and server-side conversions.</p>
          </div>
          {advancedOpen ? <ChevronDown className="w-4 h-4 text-st-gray" /> : <ChevronRight className="w-4 h-4 text-st-gray" />}
        </button>

        {advancedOpen && (
          <div className="border-t border-gray-200 dark:border-gray-800 p-5 space-y-3 bg-gray-50/20 dark:bg-[#151818]/10">
            {renderSubRow(
              'identify',
              'Identify users',
              'Link anonymous visitors to known user accounts after login or signup',
              <>
                <p>
                  Call <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px] font-mono">sourcetrack.identify()</code> when a user logs in or registers. This allows SourceTrack to attach user traits and compute Customer Lifetime Value (LTV).
                </p>
                <div className="bg-st-black rounded-lg p-3 relative mt-1 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`window.sourcetrack?.identify('user_123', {
  email: 'customer@example.com',
  name: 'Jane Doe'
})`}</pre>
                </div>
                <div className="bg-st-black rounded-lg p-3 relative mt-1.5 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`// React hook example
useEffect(() => {
  if (user) {
    window.sourcetrack?.identify(user.id, {
      email: user.email,
      name: user.name
    })
  }
}, [user])`}</pre>
                </div>
              </>
            )}

            {renderSubRow(
              'stripe',
              'Stripe webhooks',
              'Attribute Stripe payments and recurring revenue (LTV) to campaigns',
              <>
                <p>
                  Forward Stripe <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px] font-mono">invoice.paid</code> events to attribute recurring invoice payments to campaigns. <strong>Note:</strong> Reliable offline attribution currently requires passing the browser-generated <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px] font-mono">anonymous_id</code> in checkout/payment metadata. While <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px] font-mono">user_id</code> can be resolved to the visitor's original journey if a prior identity link exists in the database, stitching based on email alone is not supported. Passing the browser-generated <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px] font-mono">anonymous_id</code> directly in metadata remains the most reliable method. Avoid sending plaintext email as an identifier unless you have a deliberate privacy or legal basis; prefer using an internal user ID or a hashed identifier.
                </p>
                <div className="bg-st-black rounded-lg p-3 relative mt-1 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`// In your Stripe webhook handler (Node.js example)
if (event.type === 'invoice.paid') {
  const invoice = event.data.object
  const customer = await stripe.customers.retrieve(invoice.customer)
  await fetch('https://api.srctk.com/api/conversion/offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_key: '${site?.site_key || 'YOUR_SITE_KEY'}',
      anonymous_id: customer.metadata?.st_anonymous_id || null, // Map from checkout session (required for stitching)
      user_id: customer.metadata?.user_id || null,             // Match the value passed to identify()
      // Do not rely on email-only stitching in the current implementation.
      conversion_value: invoice.amount_paid / 100,
      conversion_type: 'recurring_payment',
      first_touch_source: customer.metadata?.st_first_touch_source || 'direct'
    })
  })
}`}</pre>
                </div>
              </>
            )}

            {renderSubRow(
              'offline',
              'Offline conversions',
              'Send backend events like CRM status changes, offline sales, or refunds',
              <>
                <p>
                  Send conversions directly from your server or backend database for CRM lifecycle stages or offline sales.
                </p>
                <div className="bg-st-black rounded-lg p-3 relative mt-1 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`POST https://api.srctk.com/api/conversion/offline
Content-Type: application/json

{
  "site_key": "${site?.site_key || 'YOUR_SITE_KEY'}",
  "user_id": "customer@example.com",
  "conversion_value": 49.00,
  "conversion_type": "purchase",
  "order_id": "ORD-54321"
}`}</pre>
                </div>
              </>
            )}

            {renderSubRow(
              'cross_domain',
              'Cross-domain tracking',
              'Track visitor journeys seamlessly across multiple separate domains',
              <>
                <p>
                  To link attribution across multiple domains (e.g. landing page and app domain), add the <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px] font-mono">data-cross-domains</code> attribute to your tracking snippet.
                </p>
                <div className="bg-st-black rounded-lg p-3 relative mt-1 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`<script async src="https://api.srctk.com/tracker.min.js"
        data-site-key="${site?.site_key || 'YOUR_SITE_KEY'}"
        data-cross-domains="app.yoursite.com, checkout.yoursite.com"></script>`}</pre>
                </div>
              </>
            )}

            {renderSubRow(
              'crm',
              'CRM/Zapier identity stitching',
              'Stitch anonymous visitors to contacts inside HubSpot, Salesforce, or Zapier',
              <>
                <p>
                  Link anonymous visitor sessions to CRM contact profiles by calling the identify API. Use a stable user ID or email.
                </p>
                <div className="bg-st-black rounded-lg p-3 relative mt-1 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`POST https://api.srctk.com/api/identify
Content-Type: application/json

{
  "site_key": "${site?.site_key || 'YOUR_SITE_KEY'}",
  "anonymous_id": "visitor_anonymous_id_from_cookie",
  "user_id": "crm_contact_12345",
  "contact_email": "lead@example.com"
}`}</pre>
                </div>
              </>
            )}

            {renderSubRow(
              'outbound',
              'Outbound webhooks',
              'Receive conversion event notifications in real-time on your server',
              <>
                <p>
                  Configure an outbound webhook URL to receive immediate POST payloads when a conversion event occurs. Webhooks are configured via environment variables on the backend.
                </p>
                <div className="bg-st-black rounded-lg p-3 relative mt-1 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`// Outbound Conversion Payload Example
{
  "event_type": "conversion",
  "site_key": "YOUR_SITE_KEY",
  "value": 49.00,
  "conversion_type": "purchase",
  "referrer": "google.com",
  "utm_source": "google"
}`}</pre>
                </div>
              </>
            )}

            {renderSubRow(
              'key_events',
              'Attribution key events',
              'Trigger custom events to count towards specific campaign attribution targets',
              <>
                <p>
                  Track key customer actions or milestones that do not have a cash value, such as signups, lead forms, or bookings.
                </p>
                <div className="bg-st-black rounded-lg p-3 relative mt-1 border border-gray-800">
                  <pre className="text-green-400 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap pr-8 leading-relaxed">{`window.sourcetrack?.track('lead_signup', {
  plan_tier: 'premium_trial',
  form_id: 'contact_sales_footer'
})`}</pre>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Need Help Links */}
      <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium text-gray-600 dark:text-gray-300">Need help?</span>
        <Link to="/docs/install" className="text-blue-600 dark:text-blue-400 hover:underline">Installation guide</Link>
        <Link to="/docs/troubleshooting" className="text-blue-600 dark:text-blue-400 hover:underline">Troubleshooting</Link>
        <Link to="/developers/conversions" className="text-blue-600 dark:text-blue-400 hover:underline">Conversion tracking</Link>
        <a href="mailto:support@sourcetrack.ai" className="text-blue-600 dark:text-blue-400 hover:underline">Email Support</a>
      </div>
    </div>
  )
}
