import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  Code, Bug, Copy, Check, ShieldCheck, AlertTriangle,
  ExternalLink, Globe, Tag, ShoppingCart, BarChart3, Plug, Mail, Radio, Trash, Play, RefreshCw,
  ChevronDown, ChevronUp
} from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import StatusBadge from '../components/StatusBadge'
import MetricTile from '../components/MetricTile'
import { safeNumber, formatNumber } from '../utils/numbers'
import { hasFeature } from '../lib/planFeatures'

const FUTURE_INTEGRATIONS = [
  { key: 'google-ads', label: 'Google Ads', icon: BarChart3, desc: 'Import campaign spend and sync attribution data' },
  { key: 'facebook', label: 'Facebook Ads', icon: BarChart3, desc: 'Track Facebook campaign performance' },
  { key: 'shopify', label: 'Shopify', icon: ShoppingCart, desc: 'Pull order data and revenue tracking' },
  { key: 'google-analytics', label: 'Google Analytics', icon: Globe, desc: 'Compare SourceTrack with GA attribution' },
  { key: 'hubspot', label: 'HubSpot', icon: Tag, desc: 'Sync leads and CRM data' }
]

const IngestionActivityLog = ({ events, providerLabel }) => {
  const list = events?.data?.events || events?.events || []
  if (!list.length) {
    return (
      <div className="rounded-lg border border-gray-150 dark:border-gray-800 p-3">
        <p className="text-[11px] font-semibold text-st-gray dark:text-gray-400 mb-1">Recent webhook activity</p>
        <p className="text-[11px] text-st-gray dark:text-gray-500 font-sans">
          No {providerLabel} webhooks received yet. Refreshes every 15s while this card is open.
        </p>
      </div>
    )
  }
  const statusStyle = (s) =>
    s === 'success' ? 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950/30 border-green-200 dark:border-green-900/40' :
    s === 'duplicate' ? 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40' :
    'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/30 border-red-200 dark:border-red-900/40'
  return (
    <div className="rounded-lg border border-gray-150 dark:border-gray-800 p-3">
      <p className="text-[11px] font-semibold text-st-gray dark:text-gray-400 mb-2">Recent webhook activity</p>
      <ul className="space-y-1.5">
        {list.map(ev => (
          <li key={ev.id} className="flex items-center justify-between gap-2 text-[11px] font-sans">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusStyle(ev.status)}`}>
                {ev.status}
              </span>
              <span className="text-st-gray dark:text-gray-400 truncate" title={ev.order_id || ev.provider_event_id || ''}>
                {ev.order_id || ev.provider_event_id || '—'}
              </span>
              {ev.value !== null && ev.value !== undefined && (
                <span className="text-st-gray dark:text-gray-400 tabular-nums">
                  {ev.currency || ''} {Number(ev.value).toFixed(2)}
                </span>
              )}
            </div>
            <span className="text-st-gray dark:text-gray-500 tabular-nums whitespace-nowrap">
              {new Date(ev.created_at).toLocaleTimeString()}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-st-gray dark:text-gray-500 mt-2 font-sans">
        Last 5 events. <code className="font-mono">duplicate</code> = already processed (safe). <code className="font-mono">error</code> = check the signature secret and event format.
      </p>
    </div>
  )
}

const CollapsibleRow = ({
  icon: Icon,
  title,
  subtitle,
  status,
  badgeLabel,
  isExpanded,
  onToggle,
  children,
  actionButton
}) => {
  return (
    <div className="border-b border-gray-150 dark:border-gray-800 last:border-0 py-3.5 first:pt-0 last:pb-0">
      <div
        className={`flex items-center justify-between gap-4 ${onToggle ? 'cursor-pointer select-none' : ''}`}
        onClick={onToggle || undefined}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 bg-gray-50 dark:bg-[#1a1d1d] text-gray-500 dark:text-gray-400 rounded-lg mt-0.5 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-st-black dark:text-white flex items-center gap-2">
              {title}
            </h4>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5 line-clamp-1">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
          {status && (
            <StatusBadge
              status={status}
              label={badgeLabel || (status === 'verified' ? 'Active' : 'Pending')}
            />
          )}

          {actionButton}

          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1 hover:bg-gray-100 dark:hover:bg-[#1a1d1d] rounded-lg transition-colors text-gray-400"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && children && (
        <div className="mt-4 pl-0 md:pl-11 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

export default function Integrations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copiedPixel, setCopiedPixel] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase.from('sites').select('site_key, name, domain, plan').limit(1)
      if (member?.company_id) {
        query.eq('company_id', member.company_id)
      } else {
        query.eq('owner_id', user.id)
      }
      const { data } = await query.maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  const { data, isLoading: overviewLoading } = useQuery({
    queryKey: ['integrations-overview', site?.site_key],
    queryFn: () => fetchApi(`/integrations/overview?site_key=${site.site_key}`),
    enabled: !!site?.site_key,
    refetchInterval: 30_000
  })

  const { data: webhookData, refetch: refetchWebhook } = useQuery({
    queryKey: ['webhook-config', site?.site_key],
    queryFn: () => fetchApi(`/webhooks?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const [url, setUrl] = useState('')
  const [active, setActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uiMessage, setUiMessage] = useState('')
  const [showSecret, setShowSecret] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Stripe Webhook Sync integration state
  const { data: stripeIntegData, refetch: refetchStripeInteg, isLoading: stripeLoading } = useQuery({
    queryKey: ['stripe-integration', site?.site_key],
    queryFn: () => fetchApi(`/integrations/stripe?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const [stripeSecret, setStripeSecret] = useState('')
  const [stripeSubmitting, setStripeSubmitting] = useState(false)
  const [stripeMessage, setStripeMessage] = useState('')
  const [stripeError, setStripeError] = useState('')
  const [copiedStripeUrl, setCopiedStripeUrl] = useState(false)
  const [copiedPaymentsUrl, setCopiedPaymentsUrl] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)

  // Shopify Webhook Sync integration state
  const { data: shopifyIntegData, refetch: refetchShopifyInteg, isLoading: shopifyLoading } = useQuery({
    queryKey: ['shopify-integration', site?.site_key],
    queryFn: () => fetchApi(`/integrations/shopify?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const [shopifySecret, setShopifySecret] = useState('')
  const [shopifySubmitting, setShopifySubmitting] = useState(false)
  const [shopifyMessage, setShopifyMessage] = useState('')
  const [shopifyError, setShopifyError] = useState('')
  const [copiedShopifyUrl, setCopiedShopifyUrl] = useState(false)

  const stripeWebhookUrl = site?.site_key ? `${window.location.origin.includes('localhost') ? 'http://localhost:3000' : 'https://api.srctk.com'}/api/webhooks/stripe/${site.site_key}` : ''

  const handleCopyStripeUrl = () => {
    if (stripeWebhookUrl) {
      navigator.clipboard.writeText(stripeWebhookUrl).catch(() => {})
      setCopiedStripeUrl(true)
      setTimeout(() => setCopiedStripeUrl(false), 2000)
    }
  }

  const paymentsApiUrl = site?.site_key ? `${window.location.origin.includes('localhost') ? 'http://localhost:3000' : 'https://api.srctk.com'}/api/conversion/offline` : ''

  const handleCopyPaymentsUrl = () => {
    if (paymentsApiUrl) {
      navigator.clipboard.writeText(paymentsApiUrl).catch(() => {})
      setCopiedPaymentsUrl(true)
      setTimeout(() => setCopiedPaymentsUrl(false), 2000)
    }
  }

  const curlExample = site?.site_key
    ? `curl -X POST ${paymentsApiUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "site_key": "${site.site_key}",
    "user_id": "customer_123",
    "conversion_value": 99.00,
    "currency": "USD",
    "order_id": "ORD_98765",
    "conversion_type": "purchase"
  }'`
    : ''

  const handleCopyCurl = () => {
    if (curlExample) {
      navigator.clipboard.writeText(curlExample).catch(() => {})
      setCopiedCurl(true)
      setTimeout(() => setCopiedCurl(false), 2000)
    }
  }

  const handleSaveStripe = async (e) => {
    e.preventDefault()
    if (!site?.site_key) return
    setStripeSubmitting(true)
    setStripeMessage('')
    setStripeError('')
    try {
      const res = await fetchApi(`/integrations/stripe?site_key=${site.site_key}`, {
        method: 'POST',
        body: { secret: stripeSecret }
      })
      if (res?.configured !== undefined) {
        setStripeMessage('Stripe webhook signing secret saved successfully!')
        setStripeSecret('')
        refetchStripeInteg()
      } else {
        setStripeError('Failed to save Stripe secret')
      }
    } catch (err) {
      setStripeError(err?.message || 'Error saving Stripe secret')
    } finally {
      setStripeSubmitting(false)
    }
  }

  const handleDeleteStripe = async () => {
    if (!site?.site_key) return
    if (!window.confirm('Are you sure you want to disconnect Stripe webhook sync? This will remove the signing secret.')) return
    setStripeSubmitting(true)
    setStripeMessage('')
    setStripeError('')
    try {
      const res = await fetchApi(`/integrations/stripe?site_key=${site.site_key}`, {
        method: 'POST',
        body: { secret: '' }
      })
      if (res?.configured !== undefined) {
        setStripeMessage('Stripe webhook sync disconnected.')
        refetchStripeInteg()
      } else {
        setStripeError('Failed to disconnect Stripe')
      }
    } catch (err) {
      setStripeError(err?.message || 'Error disconnecting Stripe')
    } finally {
      setStripeSubmitting(false)
    }
  }

  const shopifyWebhookUrl = site?.site_key ? `${window.location.origin.includes('localhost') ? 'http://localhost:3000' : 'https://api.srctk.com'}/api/webhooks/shopify/${site.site_key}` : ''

  const handleCopyShopifyUrl = () => {
    if (shopifyWebhookUrl) {
      navigator.clipboard.writeText(shopifyWebhookUrl).catch(() => {})
      setCopiedShopifyUrl(true)
      setTimeout(() => setCopiedShopifyUrl(false), 2000)
    }
  }

  const handleSaveShopify = async (e) => {
    e.preventDefault()
    if (!site?.site_key) return
    setShopifySubmitting(true)
    setShopifyMessage('')
    setShopifyError('')
    try {
      const res = await fetchApi(`/integrations/shopify?site_key=${site.site_key}`, {
        method: 'POST',
        body: { secret: shopifySecret }
      })
      if (res?.configured !== undefined) {
        setShopifyMessage('Shopify webhook signing secret saved successfully!')
        setShopifySecret('')
        refetchShopifyInteg()
      } else {
        setShopifyError('Failed to save Shopify secret')
      }
    } catch (err) {
      setShopifyError(err?.message || 'Error saving Shopify secret')
    } finally {
      setShopifySubmitting(false)
    }
  }

  const handleDeleteShopify = async () => {
    if (!site?.site_key) return
    if (!window.confirm('Are you sure you want to disconnect Shopify webhook sync? This will remove the signing secret.')) return
    setShopifySubmitting(true)
    setShopifyMessage('')
    setShopifyError('')
    try {
      const res = await fetchApi(`/integrations/shopify?site_key=${site.site_key}`, {
        method: 'POST',
        body: { secret: '' }
      })
      if (res?.configured !== undefined) {
        setShopifyMessage('Shopify webhook sync disconnected.')
        refetchShopifyInteg()
      } else {
        setShopifyError('Failed to disconnect Shopify')
      }
    } catch (err) {
      setShopifyError(err?.message || 'Error disconnecting Shopify')
    } finally {
      setShopifySubmitting(false)
    }
  }

  // Ad Platforms Cost Sync integration state
  const { data: adPlatStatus, refetch: refetchAdPlatStatus, isLoading: adPlatLoading } = useQuery({
    queryKey: ['ad-platforms-status', site?.site_key],
    queryFn: () => fetchApi(`/integrations/ad-platforms/status?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const { data: adSyncHistory, refetch: refetchAdSyncHistory } = useQuery({
    queryKey: ['ad-sync-history', site?.site_key],
    queryFn: () => fetchApi(`/integrations/ad-platforms/sync-history?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const { data: proxyData } = useQuery({
    queryKey: ['proxy-domain', site?.site_key],
    queryFn: () => fetchApi(`/integrations/proxy-domain?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const adPlatformData = adPlatStatus?.data || adPlatStatus || {}
  const syncHistoryList = Array.isArray(adSyncHistory?.data) ? adSyncHistory.data : (Array.isArray(adSyncHistory) ? adSyncHistory : [])

  const proxyStatusLabel = !proxyData?.domain
    ? 'Not Configured'
    : proxyData.status === 'active'
    ? 'Active'
    : proxyData.status === 'pending_dns'
    ? 'Waiting for DNS'
    : proxyData.status === 'pending_ssl_or_routing'
    ? 'Securing Domain'
    : 'Needs Attention'

  const proxyStatusBadgeType = !proxyData?.domain
    ? 'pending'
    : proxyData.status === 'active'
    ? 'verified'
    : proxyData.status === 'error'
    ? 'error'
    : 'warning'

  const crossDomainConfigured = site?.cross_domain_domains && site.cross_domain_domains.length > 0

  const [googleCustomerId, setGoogleCustomerId] = useState('')
  const [googleLoginCustomerId, setGoogleLoginCustomerId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [metaAdAccountId, setMetaAdAccountId] = useState('')

  const [gadsSaving, setGadsSaving] = useState(false)
  const [metaConnecting, setMetaConnecting] = useState(false)
  const [syncingGads, setSyncingGads] = useState(false)
  const [syncingMeta, setSyncingMeta] = useState(false)

  const [adPlatError, setAdPlatError] = useState('')
  const [adPlatMessage, setAdPlatMessage] = useState('')

  const [showGoogleAdvanced, setShowGoogleAdvanced] = useState(false)
  const [showMetaAdvanced, setShowMetaAdvanced] = useState(false)
  const [showRecentSyncs, setShowRecentSyncs] = useState(false)

  const googleAdsConnected =
    adPlatformData.google_ads?.connected === true ||
    adPlatformData.google_ads?.status === 'connected'

  const metaAdsConnected =
    adPlatformData.meta_ads?.connected === true ||
    adPlatformData.meta_ads?.status === 'connected'

  const hasAdCost = googleAdsConnected || metaAdsConnected

  const stripeConnected =
    stripeIntegData?.connected === true ||
    stripeIntegData?.configured === true ||
    stripeIntegData?.data?.connected === true ||
    stripeIntegData?.data?.configured === true

  const shopifyConnected =
    shopifyIntegData?.connected === true ||
    shopifyIntegData?.configured === true ||
    shopifyIntegData?.data?.connected === true ||
    shopifyIntegData?.data?.configured === true

  const stripeMaskedSecret = stripeIntegData?.masked_secret || stripeIntegData?.data?.masked_secret
  const shopifyMaskedSecret = shopifyIntegData?.masked_secret || shopifyIntegData?.data?.masked_secret

  const [activeSection, setActiveSection] = useState(null)
  const [didAutoExpand, setDidAutoExpand] = useState(false)

  // Recent webhook ingestion event logs — only fetched when the relevant card is expanded
  const stripeRowOpen = activeSection === 'revenue.stripe'
  const shopifyRowOpen = activeSection === 'revenue.shopify'
  const paymentsApiRowOpen = activeSection === 'developer.payments_api'
  const { data: stripeEventsData } = useQuery({
    queryKey: ['ingestion-events-stripe', site?.site_key],
    queryFn: () => fetchApi(`/integrations/ingestion-events?site_key=${site.site_key}&provider=stripe&limit=5`),
    enabled: !!site?.site_key && stripeRowOpen,
    refetchInterval: stripeRowOpen ? 15_000 : false
  })
  const { data: shopifyEventsData } = useQuery({
    queryKey: ['ingestion-events-shopify', site?.site_key],
    queryFn: () => fetchApi(`/integrations/ingestion-events?site_key=${site.site_key}&provider=shopify&limit=5`),
    enabled: !!site?.site_key && shopifyRowOpen,
    refetchInterval: shopifyRowOpen ? 15_000 : false
  })
  const { data: paymentsApiEventsData } = useQuery({
    queryKey: ['ingestion-events-payments-api', site?.site_key],
    queryFn: () => fetchApi(`/integrations/ingestion-events?site_key=${site.site_key}&provider=payments_api&limit=5`),
    enabled: !!site?.site_key && paymentsApiRowOpen,
    refetchInterval: paymentsApiRowOpen ? 15_000 : false
  })

  // Reset auto-expansion on site changes
  useEffect(() => {
    setDidAutoExpand(false)
  }, [site?.site_key])

  useEffect(() => {
    if (didAutoExpand) return
    if (!site?.site_key) return

    // Loading guard: wait until core queries finish initial load
    if (overviewLoading || stripeLoading || shopifyLoading || adPlatLoading) return

    const isVerified = data?.install?.status === 'verified'

    if (!isVerified) {
      setActiveSection('core.tracker')
      setDidAutoExpand(true)
      return
    }

    const hasRevenue = stripeConnected || shopifyConnected
    if (!hasRevenue) {
      setActiveSection('revenue')
      setDidAutoExpand(true)
      return
    }

    if (!hasAdCost) {
      setActiveSection('ad_cost_sync')
      setDidAutoExpand(true)
      return
    }

    setActiveSection(null)
    setDidAutoExpand(true)
  }, [
    didAutoExpand,
    site?.site_key,
    overviewLoading,
    stripeLoading,
    shopifyLoading,
    adPlatLoading,
    data,
    stripeConnected,
    shopifyConnected,
    hasAdCost
  ])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_ads_connected') === 'true') {
      setAdPlatMessage('Google Ads connection authenticated successfully! Please enter your ad customer ID to complete setup.')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (params.get('google_ads_error')) {
      const err = params.get('google_ads_error')
      let msg = 'Google Ads authorization failed.'
      if (err === 'missing_refresh_token') {
        msg = 'Connection failed: Google did not return a refresh token. Please click "Connect" again and make sure you approve offline access.'
      } else if (err === 'expired_state') {
        msg = 'Connection failed: The security session expired. Please try again.'
      } else if (err === 'invalid_state') {
        msg = 'Connection failed: The state validation check failed.'
      } else if (err === 'access_denied') {
        msg = 'Connection failed: Access denied.'
      }
      setAdPlatError(msg)
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const handleConnectGoogleAds = async () => {
    setAdPlatError('')
    setAdPlatMessage('')
    try {
      const res = await fetchApi(`/integrations/ad-platforms/google/auth-url?site_key=${site.site_key}`)
      if (res?.not_configured) {
        setAdPlatError('Google Ads is not configured on this server yet. Missing client environment variables.')
      } else if (res?.url) {
        window.location.href = res.url
      } else {
        setAdPlatError('Failed to generate connection link.')
      }
    } catch (err) {
      setAdPlatError(err.message || 'Error redirecting to Google')
    }
  }

  const handleSaveGoogleAccount = async (e) => {
    e.preventDefault()
    setAdPlatError('')
    setAdPlatMessage('')
    setGadsSaving(true)
    try {
      const res = await fetchApi(`/integrations/ad-platforms/google/save-account?site_key=${site.site_key}`, {
        method: 'POST',
        body: JSON.stringify({ customer_id: googleCustomerId, login_customer_id: googleLoginCustomerId })
      })
      if (res.success) {
        setAdPlatMessage('Google Ads customer configuration saved successfully!')
        refetchAdPlatStatus()
      } else {
        setAdPlatError(res.error || 'Failed to save Google Ads account details.')
      }
    } catch (err) {
      setAdPlatError(err.message || 'Error saving Google Ads credentials')
    } finally {
      setGadsSaving(false)
    }
  }

  const handleSyncGoogleAds = async () => {
    setAdPlatError('')
    setAdPlatMessage('')
    setSyncingGads(true)
    try {
      const res = await fetchApi(`/integrations/ad-platforms/google/sync?site_key=${site.site_key}`, {
        method: 'POST'
      })
      if (res.success) {
        setAdPlatMessage('Google Ads sync task triggered in the background.')
        refetchAdPlatStatus()
        refetchAdSyncHistory()
      } else {
        setAdPlatError(res.error || 'Failed to trigger sync.')
      }
    } catch (err) {
      setAdPlatError(err.message || 'Error triggering sync')
    } finally {
      setSyncingGads(false)
    }
  }

  const handleDisconnectGoogleAds = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Ads? Your historical imported/synced spend data will remain intact.')) return
    setAdPlatError('')
    setAdPlatMessage('')
    try {
      await fetchApi(`/integrations/ad-platforms/google/disconnect?site_key=${site.site_key}`, { method: 'POST' })
      setAdPlatMessage('Google Ads credentials removed.')
      setGoogleCustomerId('')
      setGoogleLoginCustomerId('')
      refetchAdPlatStatus()
      refetchAdSyncHistory()
    } catch (err) {
      setAdPlatError(err.message || 'Failed to disconnect')
    }
  }

  const handleConnectMetaAds = async (e) => {
    e.preventDefault()
    setAdPlatError('')
    setAdPlatMessage('')
    setMetaConnecting(true)
    try {
      const res = await fetchApi(`/integrations/ad-platforms/meta/connect?site_key=${site.site_key}`, {
        method: 'POST',
        body: JSON.stringify({ access_token: metaAccessToken, ad_account_id: metaAdAccountId })
      })
      if (res.success) {
        setAdPlatMessage('Meta Ads token saved and validated successfully!')
        setMetaAccessToken('')
        setMetaAdAccountId('')
        refetchAdPlatStatus()
      } else {
        setAdPlatError(res.error || 'Failed to connect Meta.')
      }
    } catch (err) {
      setAdPlatError(err.message || 'Error connecting Meta')
    } finally {
      setMetaConnecting(false)
    }
  }

  const handleSyncMetaAds = async () => {
    setAdPlatError('')
    setAdPlatMessage('')
    setSyncingMeta(true)
    try {
      const res = await fetchApi(`/integrations/ad-platforms/meta/sync?site_key=${site.site_key}`, {
        method: 'POST'
      })
      if (res.success) {
        setAdPlatMessage('Meta Ads sync task triggered in the background.')
        refetchAdPlatStatus()
        refetchAdSyncHistory()
      } else {
        setAdPlatError(res.error || 'Failed to trigger sync.')
      }
    } catch (err) {
      setAdPlatError(err.message || 'Error triggering sync')
    } finally {
      setSyncingMeta(false)
    }
  }

  const handleDisconnectMetaAds = async () => {
    if (!window.confirm('Are you sure you want to disconnect Meta Ads? Your historical imported/synced spend data will remain intact.')) return
    setAdPlatError('')
    setAdPlatMessage('')
    try {
      await fetchApi(`/integrations/ad-platforms/meta/disconnect?site_key=${site.site_key}`, { method: 'POST' })
      setAdPlatMessage('Meta Ads credentials removed.')
      refetchAdPlatStatus()
      refetchAdSyncHistory()
    } catch (err) {
      setAdPlatError(err.message || 'Failed to disconnect')
    }
  }

  // Google Search Console integration state
  const { data: gscIntegData, refetch: refetchGscInteg } = useQuery({
    queryKey: ['gsc-integration', site?.site_key],
    queryFn: () => fetchApi(`/integrations/google-search-console/status?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const { data: gscPropertiesData } = useQuery({
    queryKey: ['gsc-properties', site?.site_key],
    queryFn: () => fetchApi(`/integrations/google-search-console/properties?site_key=${site.site_key}`),
    enabled: !!site?.site_key && !!gscIntegData?.connected && !gscIntegData?.property_url
  })

  const [selectedProperty, setSelectedProperty] = useState('')
  const [selectingProperty, setSelectingProperty] = useState(false)
  const [syncingGsc, setSyncingGsc] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [disconnectingGsc, setDisconnectingGsc] = useState(false)
  const [gscStatusMessage, setGscStatusMessage] = useState('')
  const [gscStatusError, setGscStatusError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gsc_connected') === 'true') {
      setGscStatusMessage('Successfully connected to Google Search Console! Please select your property below.')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (params.get('gsc_error')) {
      const err = params.get('gsc_error')
      let msg = 'Google Search Console connection failed.'
      if (err === 'missing_refresh_token') {
        msg = 'Connection failed: Google did not return a refresh token. Please click "Connect" again and ensure you grant offline access consent.'
      } else if (err === 'expired_state') {
        msg = 'Connection failed: The authorization session expired. Please try again.'
      } else if (err === 'invalid_state') {
        msg = 'Connection failed: The security state token was invalid.'
      } else if (err === 'access_denied') {
        msg = 'Connection failed: You are not authorized to connect GSC for this site.'
      } else if (err === 'token_exchange_failed') {
        msg = 'Connection failed: Could not exchange authorization code for Google access credentials.'
      }
      setGscStatusError(msg)
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const handleConnectGsc = async () => {
    try {
      const res = await fetchApi(`/integrations/google-search-console/auth-url?site_key=${site.site_key}`)
      if (res?.url) {
        window.location.href = res.url
      } else {
        alert('Failed to generate connection URL')
      }
    } catch (err) {
      alert(err.message || 'Error connecting to GSC')
    }
  }

  const handleSelectProperty = async (e) => {
    e.preventDefault()
    if (!selectedProperty) return
    setSelectingProperty(true)
    try {
      await fetchApi(`/integrations/google-search-console/select-property?site_key=${site.site_key}`, {
        method: 'POST',
        body: { property_url: selectedProperty }
      })
      refetchGscInteg()
    } catch (err) {
      alert(err.message || 'Failed to select property')
    } finally {
      setSelectingProperty(false)
    }
  }

  const handleSyncGsc = async () => {
    setSyncingGsc(true)
    setSyncMessage('')
    try {
      const res = await fetchApi(`/integrations/google-search-console/sync?site_key=${site.site_key}`, {
        method: 'POST',
        body: { days: 30 }
      })
      setSyncMessage(res.message || 'Sync started successfully in background.')
      refetchGscInteg()
    } catch (err) {
      alert(err.message || 'Failed to sync GSC')
    } finally {
      setSyncingGsc(false)
    }
  }

  const handleDisconnectGsc = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Search Console? All daily performance cache will be purged.')) return
    setDisconnectingGsc(true)
    try {
      await fetchApi(`/integrations/google-search-console/disconnect?site_key=${site.site_key}`, {
        method: 'POST'
      })
      refetchGscInteg()
    } catch (err) {
      alert(err.message || 'Failed to disconnect GSC')
    } finally {
      setDisconnectingGsc(false)
    }
  }

  useEffect(() => {
    if (webhookData?.webhook) {
      setUrl(webhookData.webhook.url || '')
      setActive(!!webhookData.webhook.active)
    } else {
      setUrl('')
      setActive(true)
    }
  }, [webhookData])

  const handleSaveWebhook = async (e) => {
    e.preventDefault()
    if (!site?.site_key) return
    setSubmitting(true)
    setUiMessage('')
    setShowSecret(null)
    try {
      const isEdit = !!webhookData?.webhook?.id
      const method = isEdit ? 'PATCH' : 'POST'
      const endpoint = isEdit ? `/webhooks/${webhookData.webhook.id}?site_key=${site.site_key}` : `/webhooks?site_key=${site.site_key}`
      const body = { url, active }

      const res = await fetchApi(endpoint, {
        method,
        body: JSON.stringify(body)
      })

      if (res?.webhook) {
        setUiMessage('Webhook destination saved successfully!')
        if (res.webhook.secret && method === 'POST') {
          setShowSecret(res.webhook.secret)
        }
        refetchWebhook()
      } else {
        setUiMessage(res?.error || 'Failed to save webhook')
      }
    } catch (err) {
      setUiMessage(err?.message || 'Error saving webhook destination')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteWebhook = async () => {
    if (!site?.site_key || !webhookData?.webhook?.id) return
    if (!window.confirm('Are you sure you want to delete this webhook destination? This will also purge its delivery logs.')) return
    setSubmitting(true)
    setUiMessage('')
    setShowSecret(null)
    try {
      const res = await fetchApi(`/webhooks/${webhookData.webhook.id}?site_key=${site.site_key}`, {
        method: 'DELETE'
      })
      if (res?.deleted) {
        setUiMessage('Webhook destination deleted.')
        refetchWebhook()
      } else {
        setUiMessage(res?.error || 'Failed to delete webhook')
      }
    } catch (err) {
      setUiMessage(err?.message || 'Error deleting webhook')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegenerateSecret = async () => {
    if (!site?.site_key || !webhookData?.webhook?.id) return
    if (!window.confirm('Are you sure you want to regenerate the signing secret? This will invalidate the previous secret immediately.')) return
    setSubmitting(true)
    setUiMessage('')
    setShowSecret(null)
    try {
      const res = await fetchApi(`/webhooks/${webhookData.webhook.id}/regenerate-secret?site_key=${site.site_key}`, {
        method: 'POST'
      })
      if (res?.secret) {
        setShowSecret(res.secret)
        setUiMessage('Signing secret regenerated successfully. Copy it now, it will not be shown again!')
        refetchWebhook()
      } else {
        setUiMessage(res?.error || 'Failed to regenerate secret')
      }
    } catch (err) {
      setUiMessage(err?.message || 'Error regenerating secret')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTestWebhook = async () => {
    if (!site?.site_key || !webhookData?.webhook?.id) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetchApi(`/webhooks/${webhookData.webhook.id}/test?site_key=${site.site_key}`, {
        method: 'POST'
      })
      setTestResult(res)
      refetchWebhook()
    } catch (err) {
      setTestResult({ success: false, error_message: err?.message || 'Failed to send test' })
    } finally {
      setTesting(false)
    }
  }

  // Over-reporting detection — fetch the latest data quality run and surface a
  // banner when duplicate_conversion_rate is flagged as 'warning'. Only fires
  // above the 15% threshold set by the DQ job; below that it's normal noise.
  // Over-reporting detection is paid-only. Skip the request entirely for free
  // plan (the API returns 402; no point firing a doomed fetch).
  const canSeeOverReporting = hasFeature(site?.plan, 'over_reporting_detection')
  const { data: dqLatest } = useQuery({
    queryKey: ['dq-latest', site?.site_key],
    queryFn: () => fetchApi(`/analytics/data-quality/latest?site_key=${site.site_key}`),
    enabled: !!site?.site_key && canSeeOverReporting
  })
  const dupWarning = (dqLatest?.checks || []).find(
    c => c.check_name === 'duplicate_conversion_rate' && c.status === 'warning'
  )

  const overview = data
  const installData = overview?.install
  const hygieneData = overview?.hygiene
  const alerts = overview?.alerts?.alerts || []
  const isVerified = installData?.status === 'verified'
  const issueCount = safeNumber(alerts.length, 0) + safeNumber(hygieneData?.total_issues, 0)

  const snippet = site?.site_key
    ? `<script async src="${(import.meta.env.VITE_TRACKER_BASE_URL || '').replace(/\/+$/, '') || window.location.origin}/tracker.min.js" data-site-key="${site.site_key}"></script>`
    : ''

  const handleCopy = () => {
    if (snippet) {
      navigator.clipboard.writeText(snippet).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleViewInstallGuide = () => {
    setActiveSection('core.tracker')
    requestAnimationFrame(() => {
      document.getElementById('core-tracking')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  const apiBase = window.location.origin.includes('localhost') ? 'https://api.srctk.com' : 'https://api.srctk.com'
  const pixelBase = site?.site_key ? `${apiBase}/api/pixel?site_key=${site.site_key}` : ''
  const emailPixelExample = pixelBase ? `${pixelBase}&event=email_open&uid={{USER_ID}}&campaign={{CAMPAIGN_NAME}}` : ''
  const serverPixelExample = pixelBase ? `${pixelBase}&event=pageview&uid={{USER_ID}}&url={{PAGE_URL}}` : ''
  const [emailTab, setEmailTab] = useState('pixel')

  const handleCopyPixel = (txt) => {
    if (txt) {
      navigator.clipboard.writeText(txt).catch(() => {})
      setCopiedPixel(true)
      setTimeout(() => setCopiedPixel(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white/90">Integrations</h2>
          <p className="text-sm text-st-gray mt-0.5">
            Tracking setup, verification, and data health
          </p>
        </div>
        <button onClick={() => navigate('/debugger')}
          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
          <Bug className="w-4 h-4" /> Live Events
        </button>
      </div>

      {/* Over-reporting warning — only when DQ flagged duplicate_conversion_rate */}
      {dupWarning && (
        <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
          <span className="text-orange-400 text-lg mt-0.5 leading-none">⚠</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400 mb-1">
              Possible Over-Reporting Detected
            </p>
            <p className="text-sm text-st-gray">{dupWarning.message}</p>
            <p className="text-sm text-st-gray mt-1">
              Check if you have another tracking pixel (Meta native pixel, Google
              Tag Manager, or a third-party app) also sending the same events to
              your ad platforms. Remove any duplicate sources to ensure accurate
              attribution.
            </p>
          </div>
        </div>
      )}

      {/* Free-plan upsell — surfaces the paid feature so users know it exists */}
      {!canSeeOverReporting && site?.plan && (
        <div className="flex items-start gap-3 p-4 bg-st-lime/5 border border-st-lime/20 rounded-xl">
          <span className="text-st-lime text-lg mt-0.5 leading-none">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white mb-1">
              Over-reporting detection · Starter plan
            </p>
            <p className="text-sm text-st-gray">
              Automatically flag duplicate pixel fires that inflate Meta / Google / TikTok
              conversion counts. Upgrade to keep your ad platform numbers honest.
            </p>
          </div>
          <a href="/billing" className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-st-lime text-black hover:bg-st-lime/90">
            Upgrade
          </a>
        </div>
      )}

      {/* Status Overview (Simplified status rail with proper hierarchy) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#161919]/50 border border-gray-150 dark:border-gray-800/80 rounded-xl p-4 shadow-sm">
        {/* Primary Status */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${isVerified ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-st-gray dark:text-gray-500">Tracking Status</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${isVerified ? 'bg-green-500' : 'bg-amber-500'}`}></span>
              <span className="text-sm font-bold text-st-black dark:text-white">{isVerified ? 'Active' : 'Pending Verification'}</span>
            </div>
          </div>
        </div>

        {/* Secondary Info */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-3 md:pt-0 border-t md:border-t-0 border-gray-150 dark:border-gray-800/80">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-st-gray dark:text-gray-500" />
            <div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-st-gray dark:text-gray-500">Domain</p>
              <p className="text-xs font-semibold text-st-black dark:text-white/80">{site?.domain || '—'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-3.5 h-3.5 ${alerts.length > 0 ? 'text-red-500' : 'text-green-500'}`} />
            <div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-st-gray dark:text-gray-500">Alerts</p>
              <p className="text-xs font-semibold text-st-black dark:text-white/80">
                {alerts.length > 0 ? `${alerts.length} Active` : 'No alerts'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Bug className={`w-3.5 h-3.5 ${safeNumber(hygieneData?.total_issues, 0) > 0 ? 'text-amber-500' : 'text-green-500'}`} />
            <div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-st-gray dark:text-gray-500">Data Health</p>
              <p className="text-xs font-semibold text-st-black dark:text-white/80">
                {safeNumber(hygieneData?.total_issues, 0) > 0 ? 'Needs Review' : 'Healthy'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Active State Next Step Callout */}
      {isVerified && (
        <div className="p-3 bg-st-lime/5 border border-st-lime/20 rounded-xl flex items-center gap-2 max-w-max">
          <span className="w-1.5 h-1.5 rounded-full bg-st-lime animate-pulse shrink-0"></span>
          <p className="text-xs text-white/90 font-medium">
            Next step: connect revenue or import ad costs.
          </p>
        </div>
      )}

      {/* Strong Setup Card (When Pending) */}
      {!isVerified && (
        <div className="p-6 bg-gradient-to-br from-st-black to-[#1a1d1d] dark:from-[#161919] dark:to-[#1a1d1d] border border-st-lime/30 dark:border-st-lime/20 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-st-lime/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-st-lime/10 text-st-lime text-[11px] font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-st-lime animate-pulse"></span>
                Setup Required
              </div>
              <h3 className="text-lg font-bold text-white leading-snug">
                Install tracking first
              </h3>
              <p className="text-sm text-gray-300 dark:text-gray-400 max-w-xl font-light font-sans leading-relaxed">
                SourceTrack needs the script before attribution, revenue, and costs can work.
              </p>
              <p className="text-xs text-st-gray dark:text-gray-500 font-sans font-light">
                Next step: install the JavaScript snippet. Revenue, SEO, and ad cost integrations work after tracking is active.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleCopy}
                className="px-4 py-2.5 text-xs font-semibold bg-st-green hover:opacity-90 text-white rounded-xl transition-colors flex items-center gap-2 shadow-sm"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy script'}
              </button>
              <button
                onClick={handleViewInstallGuide}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white border border-white/10 text-xs font-semibold rounded-xl transition-colors"
              >
                Show install steps
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUIRED SECTION */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-st-gray dark:text-gray-400 uppercase tracking-wider">Required</h3>
        <div id="core-tracking">
          <DashboardCard
            title="Core Tracking"
            subtitle="Tracking script and site verification"
            className="border-gray-150 dark:border-gray-800/80 shadow-none"
            headerClassName="py-2.5 px-4 bg-gray-50/50 dark:bg-[#161919]/50 border-b border-gray-150 dark:border-gray-800/80"
            bodyClassName="p-4 pt-3"
          >
            <div className="space-y-1">
              <CollapsibleRow
                icon={Code}
                title="JavaScript Snippet"
                subtitle="The primary tracking script installed in your site's header"
                status={isVerified ? 'success' : 'pending'}
                badgeLabel={isVerified ? 'Live — Events Flowing' : 'Not Installed'}
                isExpanded={activeSection === 'core.tracker'}
                onToggle={() => setActiveSection(activeSection === 'core.tracker' ? null : 'core.tracker')}
                actionButton={
                  <div className="flex items-center gap-2">
                    <a
                      href="https://www.sourcetrack.ai/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1"
                    >
                      Docs
                    </a>
                    {!isVerified && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                        className="px-2.5 py-1 text-xs font-semibold bg-st-green hover:opacity-90 text-white rounded-lg transition-colors flex items-center gap-1 shrink-0"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy script'}
                      </button>
                    )}
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div>
                      <p className="text-xs text-st-gray dark:text-gray-400 font-medium uppercase tracking-wider mb-1">Last Event</p>
                      <p className="text-sm text-st-black dark:text-white">
                        {installData?.last_event ? new Date(installData.last_event).toLocaleString() : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-st-gray dark:text-gray-400 font-medium uppercase tracking-wider mb-1">Event Type</p>
                      <p className="text-sm text-st-black dark:text-white">{installData?.last_event_type || '—'}</p>
                    </div>
                  </div>

                  <div className="bg-st-black rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-st-gray font-medium">Tracking Script</span>
                      <button onClick={handleCopy}
                        className="px-2.5 py-1 bg-gray-700 text-white text-xs rounded-md hover:bg-gray-600 flex items-center gap-1.5 transition-colors">
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed font-mono">
                      {snippet || 'Loading...'}
                    </pre>
                  </div>

                  {!isVerified && (
                    <div className="bg-amber-50 dark:bg-amber-955/15 border border-amber-200 dark:border-amber-900/30 rounded-lg p-3">
                      <p className="text-sm text-amber-850 dark:text-amber-300 font-medium">Installation not verified</p>
                      <p className="text-xs text-amber-650 dark:text-amber-400 mt-1 font-light font-sans">
                        Paste the tracking script in your site's &lt;head&gt; tag and visit the site to trigger verification.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <a
                      href="https://www.sourcetrack.ai/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline font-semibold flex items-center gap-1"
                    >
                      Full setup guide <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </CollapsibleRow>
            </div>
          </DashboardCard>
        </div>
      </div>

      {/* RECOMMENDED SECTION */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-st-gray dark:text-gray-400 uppercase tracking-wider">Recommended</h3>
        </div>

        {/* 1. Revenue Connections Card */}
        <DashboardCard
          title="Revenue Connections"
          subtitle="Stitch transaction, checkout, and email events back to user journeys"
          className="border-gray-150 dark:border-gray-800/80 shadow-none"
          headerClassName="py-2.5 px-4 bg-gray-50/50 dark:bg-[#161919]/50 border-b border-gray-150 dark:border-gray-800/80"
          bodyClassName="p-4 pt-3"
        >
          <div className="space-y-1">
            {stripeMessage && (
              <div className="p-3 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200 mb-3 font-sans">
                {stripeMessage}
              </div>
            )}
            {stripeError && (
              <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 mb-3 font-sans">
                {stripeError}
              </div>
            )}
            {shopifyMessage && (
              <div className="p-3 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200 mb-3 font-sans">
                {shopifyMessage}
              </div>
            )}
            {shopifyError && (
              <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 mb-3 font-sans">
                {shopifyError}
              </div>
            )}

            <CollapsibleRow
              icon={Plug}
              title="Stripe webhook recipe"
              subtitle="Manual Stripe webhook listener — captures checkout.session.completed only"
              status={stripeConnected ? 'success' : 'pending'}
              badgeLabel={stripeConnected ? 'Active' : 'Not Configured'}
              actionButton={
                <div className="flex items-center gap-2">
                  <Link to="/docs/platforms/stripe" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                    Docs
                  </Link>
                  <button
                    onClick={() => setActiveSection(activeSection === 'revenue.stripe' ? null : 'revenue.stripe')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      stripeConnected
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700'
                        : 'bg-st-green hover:opacity-90 text-white'
                    }`}
                  >
                    {stripeConnected ? 'Manage' : 'Connect'}
                  </button>
                </div>
              }
              isExpanded={activeSection === 'revenue.stripe'}
              onToggle={() => setActiveSection(activeSection === 'revenue.stripe' ? null : 'revenue.stripe')}
            >
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Stripe Webhook Listener URL</label>
                    <button
                      type="button"
                      onClick={handleCopyStripeUrl}
                      className="flex items-center gap-1 text-xs text-st-gray hover:text-st-black dark:hover:text-white transition-colors"
                    >
                      {copiedStripeUrl ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      {copiedStripeUrl ? 'Copied' : 'Copy URL'}
                    </button>
                  </div>
                  <div className="bg-st-black rounded-lg p-3">
                    <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all font-mono">
                      {stripeWebhookUrl || 'Loading URL...'}
                    </pre>
                  </div>
                </div>

                {stripeConnected ? (
                  <div className="space-y-3 bg-gray-50 dark:bg-[#1a1d1d] border border-gray-100 dark:border-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Stripe Webhook Secret</p>
                        <code className="text-xs font-mono text-gray-700 dark:text-gray-300 mt-1 block">
                          {stripeMaskedSecret}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={handleDeleteStripe}
                        disabled={stripeSubmitting}
                        className="px-3 py-1.5 border border-red-200 text-red-655 rounded-lg text-xs font-semibold hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveStripe} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">
                        Stripe Webhook Secret (whsec_...)
                      </label>
                      <input
                        type="password"
                        value={stripeSecret}
                        onChange={e => setStripeSecret(e.target.value)}
                        placeholder="whsec_..."
                        disabled={stripeSubmitting}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1d1d] text-st-black dark:text-white rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-st-black/20"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={stripeSubmitting || !stripeSecret.trim()}
                      className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-white/95 disabled:opacity-50 transition-colors"
                    >
                      {stripeSubmitting ? 'Saving...' : 'Connect Stripe'}
                    </button>
                  </form>
                )}

                <div className="pt-3 border-t border-gray-100 dark:border-gray-800/60 space-y-2">
                  <p className="text-xs font-semibold text-st-black dark:text-white">Quick setup</p>
                  <ul className="text-xs text-st-gray dark:text-gray-400 space-y-1.5 font-sans">
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 font-medium">✓</span>
                      <span>Create webhook in Stripe Developers dashboard</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 font-medium">✓</span>
                      <span>Select <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[10px]">checkout.session.completed</code> event</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 font-medium">✓</span>
                      <span>Paste signing secret here</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 mb-1">What this recipe does — and doesn't</p>
                  <ul className="text-[11px] text-amber-700 dark:text-amber-300/90 space-y-1 font-sans leading-relaxed">
                    <li>• Only <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-[10px]">checkout.session.completed</code> events are processed. Other event types are received and ignored.</li>
                    <li>• For attribution, your checkout must forward the visitor's anonymous id (<code className="font-mono">st_aid</code>) as Stripe <code className="font-mono">client_reference_id</code> or <code className="font-mono">metadata.anonymous_id</code>. Without it, the conversion lands as <code className="font-mono">unattributed</code>.</li>
                    <li>• Duplicate Stripe events are deduped by Stripe event id, order id, and payment id.</li>
                  </ul>
                  <div className="pt-2">
                    <Link to="/docs/platforms/stripe" className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:underline inline-flex items-center gap-0.5">
                      Read the full Stripe recipe →
                    </Link>
                  </div>
                </div>

                <IngestionActivityLog events={stripeEventsData?.data || stripeEventsData} providerLabel="Stripe" />
              </div>
            </CollapsibleRow>

            <CollapsibleRow
              icon={ShoppingCart}
              title="Shopify webhook recipe"
              subtitle="Manual Shopify webhook listener — captures paid orders only"
              status={shopifyConnected ? 'success' : 'pending'}
              badgeLabel={shopifyConnected ? 'Active' : 'Not Configured'}
              actionButton={
                <div className="flex items-center gap-2">
                  <Link to="/docs/platforms/shopify" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                    Docs
                  </Link>
                  <button
                    onClick={() => setActiveSection(activeSection === 'revenue.shopify' ? null : 'revenue.shopify')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      shopifyConnected
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700'
                        : 'bg-st-green hover:opacity-90 text-white'
                    }`}
                  >
                    {shopifyConnected ? 'Manage' : 'Connect'}
                  </button>
                </div>
              }
              isExpanded={activeSection === 'revenue.shopify'}
              onToggle={() => setActiveSection(activeSection === 'revenue.shopify' ? null : 'revenue.shopify')}
            >
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Shopify Webhook Listener URL</label>
                    <button
                      type="button"
                      onClick={handleCopyShopifyUrl}
                      className="flex items-center gap-1 text-xs text-st-gray hover:text-st-black dark:hover:text-white transition-colors"
                    >
                      {copiedShopifyUrl ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      {copiedShopifyUrl ? 'Copied' : 'Copy URL'}
                    </button>
                  </div>
                  <div className="bg-st-black rounded-lg p-3">
                    <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all font-mono">
                      {shopifyWebhookUrl || 'Loading URL...'}
                    </pre>
                  </div>
                </div>

                {shopifyConnected ? (
                  <div className="space-y-3 bg-gray-50 dark:bg-[#1a1d1d] border border-gray-100 dark:border-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Shopify Webhook Secret</p>
                        <code className="text-xs font-mono text-gray-700 dark:text-gray-300 mt-1 block">
                          {shopifyMaskedSecret}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={handleDeleteShopify}
                        disabled={shopifySubmitting}
                        className="px-3 py-1.5 border border-red-200 text-red-655 rounded-lg text-xs font-semibold hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveShopify} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">
                        Shopify Webhook Secret
                      </label>
                      <input
                        type="password"
                        value={shopifySecret}
                        onChange={e => setShopifySecret(e.target.value)}
                        placeholder="Paste webhook secret key"
                        disabled={shopifySubmitting}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1d1d] text-st-black dark:text-white rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-st-black/20"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={shopifySubmitting || !shopifySecret.trim()}
                      className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-white/95 disabled:opacity-50 transition-colors"
                    >
                      {shopifySubmitting ? 'Saving...' : 'Connect Shopify'}
                    </button>
                  </form>
                )}

                <div className="pt-3 border-t border-gray-100 dark:border-gray-800/60 space-y-2">
                  <p className="text-xs font-semibold text-st-black dark:text-white">Quick setup</p>
                  <ul className="text-xs text-st-gray dark:text-gray-400 space-y-1.5 font-sans">
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 font-medium">✓</span>
                      <span>Create webhook in Shopify Admin → Settings → Notifications</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 font-medium">✓</span>
                      <span>Subscribe to <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[10px]">orders/paid</code> (or <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[10px]">orders/create</code>) — JSON format</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 font-medium">✓</span>
                      <span>Paste the shared secret here</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 mb-1">What this recipe does — and doesn't</p>
                  <ul className="text-[11px] text-amber-700 dark:text-amber-300/90 space-y-1 font-sans leading-relaxed">
                    <li>• Accepts <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-[10px]">orders/paid</code>, and <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-[10px]">orders/create</code> only when <code className="font-mono">financial_status === 'paid'</code>. Refunds and unpaid orders are ignored.</li>
                    <li>• For attribution, forward the visitor's anonymous id via the cart's <code className="font-mono">note_attributes</code> using a key of <code className="font-mono">_st_aid</code>, <code className="font-mono">st_aid</code>, <code className="font-mono">anonymous_id</code>, or <code className="font-mono">visitor_id</code>. Without it, the order lands as <code className="font-mono">unattributed</code>.</li>
                    <li>• Duplicate webhooks are deduped by Shopify webhook id and order id. HMAC-SHA256 signatures are verified timing-safely.</li>
                    <li>• This is a manual recipe — SourceTrack is not distributed as a Shopify plugin; setup is done by hand in your store admin.</li>
                  </ul>
                  <div className="pt-2">
                    <Link to="/docs/platforms/shopify" className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:underline inline-flex items-center gap-0.5">
                      Read the full Shopify recipe →
                    </Link>
                  </div>
                </div>

                <IngestionActivityLog events={shopifyEventsData?.data || shopifyEventsData} providerLabel="Shopify" />
              </div>
            </CollapsibleRow>

            <CollapsibleRow
              icon={Mail}
              title="Email Campaign Attribution"
              subtitle="Add source parameters to email links so campaigns are attributed correctly"
              status="success"
              badgeLabel="Available"
              actionButton={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSection(activeSection === 'revenue.email' ? null : 'revenue.email');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors"
                >
                  {activeSection === 'revenue.email' ? 'Close' : 'Setup'}
                </button>
              }
              isExpanded={activeSection === 'revenue.email'}
              onToggle={() => setActiveSection(activeSection === 'revenue.email' ? null : 'revenue.email')}
            >
              <div className="space-y-4">
                <p className="text-xs text-st-gray dark:text-gray-400 font-sans">
                  Track email opens and campaigns without executing any client-side JavaScript.
                </p>

                {/* Tab layout */}
                <div className="flex border-b border-gray-150 dark:border-gray-800/80">
                  {[
                    { id: 'pixel', label: 'Image pixel' },
                    { id: 'server', label: 'Server-side event' },
                    { id: 'params', label: 'Parameters' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEmailTab(tab.id)}
                      className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                        emailTab === tab.id
                          ? 'border-st-lime text-st-lime dark:text-white'
                          : 'border-transparent text-st-gray hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {site?.site_key ? (
                  <div className="space-y-3">
                    {emailTab === 'pixel' && (
                      <div className="space-y-2">
                        <p className="text-xs text-st-gray dark:text-gray-400 font-light leading-relaxed">
                          Embed a 1×1 transparent GIF in any HTML email to record opens and attribute conversions.
                        </p>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Email Image Tag</p>
                            <button onClick={() => handleCopyPixel(emailPixelExample)}
                              className="flex items-center gap-1 text-xs text-st-gray hover:text-st-black dark:hover:text-white transition-colors"
                            >
                              {copiedPixel ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {copiedPixel ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <div className="bg-st-black rounded-lg p-3">
                            <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all font-mono">
                              {`<img src="${emailPixelExample}" width="1" height="1" alt="" />`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}

                    {emailTab === 'server' && (
                      <div className="space-y-2">
                        <p className="text-xs text-st-gray dark:text-gray-400 font-light leading-relaxed">
                          Send a server-side HTTP GET request to capture custom events without using JavaScript.
                        </p>
                        <div>
                          <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1.5">Server-side HTTP GET</p>
                          <div className="bg-st-black rounded-lg p-3">
                            <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all font-mono">
                              {`GET ${serverPixelExample}`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}

                    {emailTab === 'params' && (
                      <div className="space-y-3">
                        <p className="text-xs text-st-gray dark:text-gray-400 font-light leading-relaxed">
                          Query parameters supported by the pixel endpoint:
                        </p>
                        <div className="bg-gray-50 dark:bg-[#111414] rounded-lg p-3 border border-gray-100 dark:border-[#2A2E2E]">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                            {[
                              ['site_key', 'Your site key (required)'],
                              ['event', 'Event name — e.g. email_open'],
                              ['uid', 'User ID for attribution stitching'],
                              ['campaign', 'Campaign name (utm_campaign)'],
                              ['utm_source', 'Traffic source'],
                              ['utm_medium', 'Traffic medium'],
                              ['url', 'Page or email URL'],
                              ['val', 'Numeric value (for conversions)'],
                            ].map(([k, v]) => (
                              <div key={k} className="flex items-start gap-1.5">
                                <code className="text-[10px] font-mono text-st-black dark:text-white bg-gray-250 dark:bg-[#2A2E2E] px-1 py-0.5 rounded shrink-0">{k}</code>
                                <span className="text-[10px] text-st-gray dark:text-gray-400">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-st-gray dark:text-gray-400 py-2">Site key loading…</p>
                )}
              </div>
            </CollapsibleRow>
          </div>
        </DashboardCard>

        {/* 2. Ad Cost Sync Card */}
        <DashboardCard
          title="Ad Cost Sync"
          subtitle="Synchronize advertising costs and impressions to calculate true ROAS"
          className="border-gray-150 dark:border-gray-800/80 shadow-none"
          headerClassName="py-2.5 px-4 bg-gray-50/50 dark:bg-[#161919]/50 border-b border-gray-150 dark:border-gray-800/80"
          bodyClassName="p-4 pt-3"
        >
          <div className="space-y-1">
            {adPlatMessage && (
              <div className="p-3 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200 mb-3 font-sans">
                {adPlatMessage}
              </div>
            )}
            {adPlatError && (
              <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 mb-3 font-sans">
                {adPlatError}
              </div>
            )}

            <CollapsibleRow
              icon={Copy}
              title="Imported campaign costs (CSV)"
              subtitle="Manual upload of ad/campaign spend rows — pair with attributed revenue to see ROAS"
              status="success"
              badgeLabel="Available"
              actionButton={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveSection(activeSection === 'ad.csv' ? null : 'ad.csv') }}
                    className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1"
                  >
                    Details
                  </button>
                  <Link to="/campaigns?import=true" className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors">
                    Import
                  </Link>
                </div>
              }
              isExpanded={activeSection === 'ad.csv'}
              onToggle={() => setActiveSection(activeSection === 'ad.csv' ? null : 'ad.csv')}
            >
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-st-black dark:text-white mb-1.5">CSV columns</p>
                  <div className="overflow-x-auto">
                    <table className="text-[11px] w-full border-collapse">
                      <thead>
                        <tr className="text-st-gray dark:text-gray-400 border-b border-gray-150 dark:border-gray-800 text-left">
                          <th className="py-1.5 pr-3 font-semibold">Column</th>
                          <th className="py-1.5 pr-3 font-semibold">Required</th>
                          <th className="py-1.5 font-semibold">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="text-st-gray dark:text-gray-300">
                        <tr className="border-b border-gray-100 dark:border-gray-850/60"><td className="py-1 pr-3 font-mono">date</td><td className="py-1 pr-3">Required</td><td className="py-1">YYYY-MM-DD — cannot be in the future</td></tr>
                        <tr className="border-b border-gray-100 dark:border-gray-850/60"><td className="py-1 pr-3 font-mono">platform</td><td className="py-1 pr-3">Optional</td><td className="py-1">lowercase alphanumeric (e.g. <code className="font-mono">facebook</code>, <code className="font-mono">google</code>). Defaults to <code className="font-mono">manual_csv</code>.</td></tr>
                        <tr className="border-b border-gray-100 dark:border-gray-850/60"><td className="py-1 pr-3 font-mono">campaign_name</td><td className="py-1 pr-3">Required</td><td className="py-1">Max 255 characters</td></tr>
                        <tr className="border-b border-gray-100 dark:border-gray-850/60"><td className="py-1 pr-3 font-mono">campaign_id</td><td className="py-1 pr-3">Optional</td><td className="py-1">Improves dedupe when re-importing</td></tr>
                        <tr className="border-b border-gray-100 dark:border-gray-850/60"><td className="py-1 pr-3 font-mono">spend</td><td className="py-1 pr-3">Required</td><td className="py-1">Non-negative number, no thousands separators</td></tr>
                        <tr className="border-b border-gray-100 dark:border-gray-850/60"><td className="py-1 pr-3 font-mono">currency</td><td className="py-1 pr-3">Optional</td><td className="py-1">3-letter ISO code (defaults to USD). Must match your conversion currency for ROAS to compute.</td></tr>
                        <tr className="border-b border-gray-100 dark:border-gray-850/60"><td className="py-1 pr-3 font-mono">clicks</td><td className="py-1 pr-3">Optional</td><td className="py-1">Non-negative integer; cannot exceed impressions</td></tr>
                        <tr><td className="py-1 pr-3 font-mono">impressions</td><td className="py-1 pr-3">Optional</td><td className="py-1">Non-negative integer</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent('date,platform,campaign_name,campaign_id,spend,currency,clicks,impressions\n2026-06-08,facebook,Summer Sale,12345,45.50,USD,40,1200\n')}`}
                    download="sourcetrack_ad_spend_template.csv"
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Download sample CSV
                  </a>
                  <span className="text-[11px] text-st-gray dark:text-gray-400">Max 1,000 rows per import. Duplicate (date, platform, campaign) rows are aggregated automatically.</span>
                </div>
                <p className="text-[11px] text-st-gray dark:text-gray-400 leading-relaxed">
                  This is a manual import — SourceTrack does not auto-sync from ad networks here. For Google/Meta auto-sync, see those rows below (when configured on the server).
                </p>
              </div>
            </CollapsibleRow>

            <CollapsibleRow
              icon={BarChart3}
              title="Google Ads"
              subtitle="Sync campaign clicks, impressions, and spend data"
              status={
                !adPlatformData.google_ads?.env_configured
                  ? 'pending'
                  : googleAdsConnected
                  ? 'success'
                  : adPlatformData.google_ads?.status === 'needs_account'
                  ? 'warning'
                  : adPlatformData.google_ads?.status === 'needs_reconnect'
                  ? 'error'
                  : adPlatformData.google_ads?.status === 'error'
                  ? 'error'
                  : 'pending'
              }
              badgeLabel={
                !adPlatformData.google_ads?.env_configured
                  ? 'Not Configured'
                  : googleAdsConnected
                  ? 'Connected'
                  : adPlatformData.google_ads?.status === 'needs_account'
                  ? 'Choose Account'
                  : adPlatformData.google_ads?.status === 'needs_reconnect'
                  ? 'Reconnect Needed'
                  : adPlatformData.google_ads?.status === 'error'
                  ? 'Needs Attention'
                  : 'Not Connected'
              }
              actionButton={
                <div className="flex items-center gap-2">
                  <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                    Docs
                  </a>
                  {adPlatformData.google_ads?.env_configured && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!googleAdsConnected) {
                          handleConnectGoogleAds()
                        } else {
                          setActiveSection(activeSection === 'ad.google_ads' ? null : 'ad.google_ads')
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                        googleAdsConnected
                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700'
                          : 'bg-st-green hover:opacity-90 text-white'
                      }`}
                    >
                      {googleAdsConnected ? 'Manage' : 'Connect'}
                    </button>
                  )}
                </div>
              }
              isExpanded={activeSection === 'ad.google_ads'}
              onToggle={() => setActiveSection(activeSection === 'ad.google_ads' ? null : 'ad.google_ads')}
            >
              <div className="space-y-4">
                {googleAdsConnected && adPlatformData.google_ads?.account_id && (
                  <p className="text-xs text-st-gray dark:text-gray-400">
                    Customer ID: {adPlatformData.google_ads.account_id}
                    {adPlatformData.google_ads.last_synced_at && ` · Last synced: ${new Date(adPlatformData.google_ads.last_synced_at).toLocaleString()}`}
                  </p>
                )}

                {adPlatformData.google_ads?.env_configured ? (
                  <div className="flex flex-wrap gap-2">
                    {!googleAdsConnected ? (
                      <button
                        type="button"
                        onClick={handleConnectGoogleAds}
                        className="px-3 py-1.5 bg-st-green hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        Connect Google Ads
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleSyncGoogleAds}
                          disabled={syncingGads}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                        >
                          {syncingGads ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowGoogleAdvanced(!showGoogleAdvanced)}
                          className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold rounded-lg transition-colors"
                        >
                          {showGoogleAdvanced ? 'Hide Settings' : 'Configure Account'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDisconnectGoogleAds}
                          className="px-3 py-1.5 border border-red-250 text-red-650 hover:bg-red-50 dark:hover:bg-red-955/20 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Disconnect
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-655 dark:text-amber-400 font-sans">
                    Google Ads is not configured on this server. Missing environment variables.
                  </p>
                )}

                {showGoogleAdvanced && googleAdsConnected && (
                  <form onSubmit={handleSaveGoogleAccount} className="bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-semibold text-st-black dark:text-white uppercase tracking-wider">Account ID Selection</p>
                    <div>
                      <label className="block text-[11px] font-medium text-st-gray dark:text-gray-400 mb-1">
                        Target Customer ID (10 digits, e.g. 1234567890)
                      </label>
                      <input
                        type="text"
                        required
                        value={googleCustomerId}
                        onChange={e => setGoogleCustomerId(e.target.value)}
                        placeholder="1234567890"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-850 bg-white dark:bg-gray-800 text-st-black dark:text-white rounded-lg text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-st-gray dark:text-gray-400 mb-1">
                        Login Customer ID (Optional manager account ID link)
                      </label>
                      <input
                        type="text"
                        value={googleLoginCustomerId}
                        onChange={e => setGoogleLoginCustomerId(e.target.value)}
                        placeholder="9876543210"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-855 bg-white dark:bg-gray-800 text-st-black dark:text-white rounded-lg text-xs focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={gadsSaving}
                      className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-white/95 transition-colors"
                    >
                      {gadsSaving ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </form>
                )}
              </div>
            </CollapsibleRow>

            <CollapsibleRow
              icon={BarChart3}
              title="Meta Ads"
              subtitle="Sync Meta (Facebook/Instagram) ad account clicks and spend"
              status={metaAdsConnected ? 'success' : 'pending'}
              badgeLabel={metaAdsConnected ? 'Connected' : 'Not Connected'}
              actionButton={
                <div className="flex items-center gap-2">
                  <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                    Docs
                  </a>
                  <button
                    onClick={() => setActiveSection(activeSection === 'ad.meta_ads' ? null : 'ad.meta_ads')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      metaAdsConnected
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700'
                        : 'bg-st-green hover:opacity-90 text-white'
                    }`}
                  >
                    {metaAdsConnected ? 'Manage' : 'Connect'}
                  </button>
                </div>
              }
              isExpanded={activeSection === 'ad.meta_ads'}
              onToggle={() => setActiveSection(activeSection === 'ad.meta_ads' ? null : 'ad.meta_ads')}
            >
              <div className="space-y-4">
                {metaAdsConnected && (
                  <div className="space-y-1">
                    <p className="text-xs text-st-gray dark:text-gray-400">
                      Account ID: {adPlatformData.meta_ads.account_id}
                      {adPlatformData.meta_ads.last_synced_at && ` · Last synced: ${new Date(adPlatformData.meta_ads.last_synced_at).toLocaleString()}`}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSyncMetaAds}
                        disabled={syncingMeta}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        {syncingMeta ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMetaAdvanced(!showMetaAdvanced)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Configure
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectMetaAds}
                        className="px-3 py-1.5 border border-red-200 text-red-650 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}

                {(!metaAdsConnected || showMetaAdvanced) && (
                  <form onSubmit={handleConnectMetaAds} className="bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-lg p-4 space-y-3">
                    <h4 className="text-xs font-bold text-st-black dark:text-white">Meta Ads — Advanced manual token setup</h4>
                    <p className="text-[11px] text-st-gray dark:text-gray-400 leading-normal font-sans font-light">
                      Paste a Meta access token and ad account ID. This is a beta setup for syncing spend only.
                    </p>
                    <div>
                      <label className="block text-[11px] font-medium text-st-gray dark:text-gray-400 mb-1">
                        Meta Access Token
                      </label>
                      <input
                        type="password"
                        required
                        value={metaAccessToken}
                        onChange={e => setMetaAccessToken(e.target.value)}
                        placeholder="EAA..."
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-850 bg-white dark:bg-gray-800 text-st-black dark:text-white rounded-lg text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-st-gray dark:text-gray-400 mb-1">
                        Ad Account ID (act_123 or 123)
                      </label>
                      <input
                        type="text"
                        required
                        value={metaAdAccountId}
                        onChange={e => setMetaAdAccountId(e.target.value)}
                        placeholder="123456789"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-855 bg-white dark:bg-gray-800 text-st-black dark:text-white rounded-lg text-xs focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={metaConnecting}
                      className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-white/95 transition-colors"
                    >
                      {metaConnecting ? 'Saving...' : 'Connect Meta Ads'}
                    </button>
                  </form>
                )}
              </div>
            </CollapsibleRow>

            {/* Sync History Logs */}
            {syncHistoryList.length > 0 && (
              <div className="pt-3 border-t border-gray-150 dark:border-gray-800/80">
                <button
                  type="button"
                  onClick={() => setShowRecentSyncs(!showRecentSyncs)}
                  className="text-xs font-semibold text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white flex items-center gap-1 font-sans"
                >
                  {showRecentSyncs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showRecentSyncs ? 'Hide' : 'Show'} Recent Sync Logs
                </button>

                {showRecentSyncs && (
                  <div className="mt-3 overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-800/20">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-gray-150 dark:border-gray-800 text-st-gray dark:text-gray-400">
                          <th className="pb-1.5 font-medium">Platform</th>
                          <th className="pb-1.5 font-medium">Status</th>
                          <th className="pb-1.5 font-medium">Records</th>
                          <th className="pb-1.5 font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncHistoryList.map(run => (
                          <tr key={run.id} className="border-b border-gray-50 dark:border-gray-850/30 last:border-0 hover:bg-gray-50/55 dark:hover:bg-gray-800/10">
                            <td className="py-1.5 font-medium text-gray-850 dark:text-gray-300 capitalize">{run.platform?.replace('_', ' ')}</td>
                            <td className="py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                run.status === 'success' ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : run.status === 'pending' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                              }`}>
                                {run.status}
                              </span>
                            </td>
                            <td className="py-1.5 text-gray-655 dark:text-gray-400">{run.records_synced}</td>
                            <td className="py-1.5 text-gray-500 dark:text-gray-500 font-sans">{new Date(run.sync_start).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </DashboardCard>

        {/* 3. SEO Revenue Card */}
        <DashboardCard
          title="SEO Revenue"
          subtitle="Map search query traffic and click-share estimated revenue"
          className="border-gray-150 dark:border-gray-800/80 shadow-none"
          headerClassName="py-2.5 px-4 bg-gray-50/50 dark:bg-[#161919]/50 border-b border-gray-150 dark:border-gray-800/80"
          bodyClassName="p-4 pt-3"
        >
          <div className="space-y-1">
            {gscStatusMessage && (
              <div className="p-3 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200 mb-3 font-sans">
                {gscStatusMessage}
              </div>
            )}
            {gscStatusError && (
              <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 mb-3 font-sans">
                {gscStatusError}
              </div>
            )}
            {syncMessage && (
              <div className="p-3 text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200 mb-3 font-sans">
                {syncMessage}
              </div>
            )}

            <CollapsibleRow
              icon={Globe}
              title="Google Search Console"
              subtitle="Aggregate query and landing-page data — used to estimate SEO revenue allocation"
              status={
                gscIntegData?.connected
                  ? gscIntegData.property_selected
                    ? 'success'
                    : 'warning'
                  : 'pending'
              }
              badgeLabel={
                gscIntegData?.connected
                  ? gscIntegData.property_selected
                    ? 'Connected'
                    : 'Select Property'
                  : 'Not Connected'
              }
              actionButton={
                <div className="flex items-center gap-2">
                  <Link to="/seo-revenue" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                    Report
                  </Link>
                  {hasFeature(site?.plan, 'gsc_seo_revenue') ? (
                    <button
                      onClick={() => {
                        if (!gscIntegData?.connected) {
                          handleConnectGsc()
                        } else {
                          setActiveSection(activeSection === 'seo.gsc' ? null : 'seo.gsc')
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                        gscIntegData?.connected
                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700'
                          : 'bg-st-green hover:opacity-90 text-white'
                      }`}
                    >
                      {gscIntegData?.connected ? 'Manage' : 'Connect'}
                    </button>
                  ) : (
                    <Link
                      to="/billing"
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-st-gray hover:border-st-lime dark:border-gray-700 transition-colors"
                      title="Google Search Console integration is available on Growth and Scale plans"
                    >
                      🔒 Connect · Upgrade
                    </Link>
                  )}
                </div>
              }
              isExpanded={activeSection === 'seo.gsc'}
              onToggle={() => setActiveSection(activeSection === 'seo.gsc' ? null : 'seo.gsc')}
            >
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-3">
                  <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 mb-1">What GSC does — and doesn't</p>
                  <ul className="text-[11px] text-blue-700 dark:text-blue-300/90 space-y-1 font-sans leading-relaxed">
                    <li>• Pulls <em>aggregated</em> query, click, impression, and position data per landing page.</li>
                    <li>• Cannot identify which individual visitor came from a specific query — Google does not expose that.</li>
                    <li>• Query-level revenue is an <em>estimate</em> based on click share on each matching landing page.</li>
                  </ul>
                </div>
                {!gscIntegData?.connected ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleConnectGsc}
                      className="px-4 py-2 bg-st-green hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Connect Google Search Console
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!gscIntegData.property_selected ? (
                      <form onSubmit={handleSelectProperty} className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">
                            Select Search Console Property
                          </label>
                          {gscPropertiesData?.properties && gscPropertiesData.properties.length > 0 ? (
                            <select
                              value={selectedProperty}
                              onChange={e => setSelectedProperty(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-250 bg-white text-st-black dark:text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-st-black/20"
                            >
                              <option value="">-- Choose verified property URL --</option>
                              {gscPropertiesData.properties.map(p => (
                                <option key={p.siteUrl} value={p.siteUrl}>
                                  {p.siteUrl} ({p.permissionLevel})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-xs text-st-gray dark:text-gray-400 py-2 font-sans font-light">
                              {gscPropertiesData?.properties
                                ? 'No verified properties found in your Google Search Console account.'
                                : 'Loading verified GSC properties...'}
                            </p>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={selectingProperty || !selectedProperty}
                          className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-white/95 disabled:opacity-50 transition-colors"
                        >
                          {selectingProperty ? 'Saving...' : 'Confirm Property Selection'}
                        </button>
                      </form>
                    ) : (
                      <div className="space-y-3 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-lg p-4">
                        <div className="space-y-2 font-sans">
                          <div>
                            <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Property URL</p>
                            <code className="text-xs font-mono text-gray-750 dark:text-gray-300 mt-1 block break-all">
                              {gscIntegData.property_url}
                            </code>
                          </div>
                          {gscIntegData.last_synced_at && (
                            <div>
                              <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Last Synced At</p>
                              <span className="text-xs text-st-black dark:text-white mt-0.5 block">
                                {new Date(gscIntegData.last_synced_at).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-850/60 justify-between items-center">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleSyncGsc}
                              disabled={syncingGsc}
                              className="px-3 py-1.5 bg-st-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-white/95 disabled:opacity-50 transition-colors"
                            >
                              {syncingGsc ? 'Syncing...' : 'Sync Search Analytics'}
                            </button>
                            <Link
                              to="/seo-revenue"
                              className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors inline-flex items-center"
                            >
                              View Report
                            </Link>
                          </div>
                          <button
                            type="button"
                            onClick={handleDisconnectGsc}
                            disabled={disconnectingGsc}
                            className="px-3 py-1.5 border border-red-205 text-red-655 rounded-lg text-xs font-semibold hover:bg-red-55 dark:hover:bg-red-955/20 transition-colors disabled:opacity-50"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-3 border-t border-gray-150 dark:border-gray-800/60 space-y-1.5 text-xs text-st-gray dark:text-gray-400 font-sans">
                  <p className="font-semibold text-st-black dark:text-white">Estimated SEO Revenue Allocation Logic</p>
                  <p className="leading-relaxed font-light">
                    This integration maps GSC performance data to SourceTrack conversion records using a landing-page matched estimated allocation model.
                  </p>
                  <p className="leading-relaxed font-light">
                    <strong>Disclaimer:</strong> GSC provides aggregate query data, not user-level attribution. Query revenue is estimated from click share on matching pages.
                  </p>
                  <div className="pt-1">
                    <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline">
                      Read GSC Setup Docs →
                    </a>
                  </div>
                </div>
              </div>
            </CollapsibleRow>
          </div>
        </DashboardCard>
      </div>

      {/* ADVANCED TRACKING SECTION */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-st-gray dark:text-gray-400 uppercase tracking-wider">Advanced Tracking</h3>
        <DashboardCard
          title="Advanced Domains & Routing"
          subtitle="Managed proxy domains and cross-domain tracking setup"
          className="border-gray-150 dark:border-gray-800/80 shadow-none"
          headerClassName="py-2.5 px-4 bg-gray-50/50 dark:bg-[#161919]/50 border-b border-gray-150 dark:border-gray-800/80"
          bodyClassName="p-4 pt-3"
        >
          <div className="space-y-1">
            <CollapsibleRow
              icon={Globe}
              title="Cross-Domain Tracking"
              subtitle="Link and stitch customer journeys across multiple domains automatically"
              status={crossDomainConfigured ? 'success' : 'pending'}
              badgeLabel={crossDomainConfigured ? 'Active' : 'Not Configured'}
              actionButton={
                <div className="flex items-center gap-2">
                  <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                    Docs
                  </a>
                  <Link to="/settings" className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors">
                    Manage
                  </Link>
                </div>
              }
            />

            <CollapsibleRow
              icon={ShieldCheck}
              title="Custom Tracking Domain / Managed Proxy"
              subtitle="Bypass standard browser ad-blockers and run tracking as a first-party resource"
              status={proxyStatusBadgeType === 'verified' ? 'success' : proxyStatusBadgeType}
              badgeLabel={proxyStatusLabel}
              actionButton={
                <div className="flex items-center gap-2">
                  <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                    Docs
                  </a>
                  <Link to="/settings" className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors">
                    Manage
                  </Link>
                </div>
              }
            />
          </div>
        </DashboardCard>
      </div>

      {/* DEVELOPER SECTION */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-st-gray dark:text-gray-400 uppercase tracking-wider">Developer</h3>
        <DashboardCard
          title="Developer Options"
          subtitle="Advanced custom integrations, conversion webhooks, and raw API access"
          className="border-gray-150 dark:border-gray-800/80 shadow-none"
          headerClassName="py-2.5 px-4 bg-gray-50/50 dark:bg-[#161919]/50 border-b border-gray-150 dark:border-gray-800/80"
          bodyClassName="p-4 pt-3"
        >
          <div className="space-y-1">
            {uiMessage && (
              <div className={`p-3 text-xs rounded-lg mb-3 font-sans ${uiMessage.includes('Error') || uiMessage.includes('Failed') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {uiMessage}
              </div>
            )}

            {!(activeSection === 'developer' || activeSection?.startsWith('developer.')) ? (
              <CollapsibleRow
                icon={Bug}
                title="Developer options"
                subtitle="API, webhooks, and custom conversion methods"
                status="verified"
                badgeLabel="Advanced"
                actionButton={
                  <button
                    onClick={() => setActiveSection('developer')}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors"
                  >
                    Expand
                  </button>
                }
                onToggle={() => setActiveSection('developer')}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-150 dark:border-gray-800/60">
                  <div>
                    <h4 className="text-sm font-semibold text-st-black dark:text-white">Developer Options</h4>
                    <p className="text-xs text-st-gray dark:text-gray-400">API, webhooks, and custom conversion methods</p>
                  </div>
                  <button
                    onClick={() => setActiveSection(null)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors"
                  >
                    Collapse
                  </button>
                </div>

                <div className="space-y-1 pl-4 border-l-2 border-st-lime/20">
                  <CollapsibleRow
                    icon={Radio}
                    title="Payments API"
                    subtitle="Trigger server-side checkout conversions from backend applications"
                    status="verified"
                    badgeLabel="Active"
                    isExpanded={activeSection === 'developer.payments_api'}
                    onToggle={() => setActiveSection(activeSection === 'developer.payments_api' ? 'developer' : 'developer.payments_api')}
                    actionButton={
                      <div className="flex items-center gap-2">
                        <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                          Docs
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSection(activeSection === 'developer.payments_api' ? 'developer' : 'developer.payments_api');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors"
                        >
                          {activeSection === 'developer.payments_api' ? 'Close' : 'Setup'}
                        </button>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-1.5">
                        <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300">Two ways to authenticate</p>
                        <ul className="text-[11px] text-blue-700 dark:text-blue-300/90 space-y-1 font-sans leading-relaxed">
                          <li><strong>Public Site Key</strong> — included in the JSON body or query string. Safe to expose in browser code. Used by <code className="font-mono">/api/conversion/offline</code> below.</li>
                          <li><strong>Private Server API Token</strong> — sent as <code className="font-mono">Authorization: Bearer st_live_…</code>. <em>Server-only — never ship this in browser code.</em> Used by <code className="font-mono">/api/server/event</code> for backend-originated events.</li>
                        </ul>
                        <div className="pt-1 flex flex-wrap gap-3">
                          <Link to="/settings#api-tokens" className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-0.5">
                            Manage Server API Tokens →
                          </Link>
                          <Link to="/developers/api" className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-0.5">
                            API reference →
                          </Link>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-st-gray uppercase tracking-wider">Payments API Endpoint</label>
                          <button
                            type="button"
                            onClick={handleCopyPaymentsUrl}
                            className="flex items-center gap-1 text-xs text-st-gray hover:text-st-black transition-colors font-sans"
                          >
                            {copiedPaymentsUrl ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                            {copiedPaymentsUrl ? 'Copied' : 'Copy URL'}
                          </button>
                        </div>
                        <div className="bg-st-black rounded-lg p-3">
                          <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all font-mono">
                            {paymentsApiUrl || 'Loading URL...'}
                          </pre>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-st-gray uppercase tracking-wider">cURL Example</label>
                          <button
                            type="button"
                            onClick={handleCopyCurl}
                            className="flex items-center gap-1 text-xs text-st-gray hover:text-st-black transition-colors font-sans"
                          >
                            {copiedCurl ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                            {copiedCurl ? 'Copied' : 'Copy cURL'}
                          </button>
                        </div>
                        <div className="bg-st-black rounded-lg p-3">
                          <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all font-mono">
                            {curlExample}
                          </pre>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-100 dark:border-gray-800/60 space-y-1">
                        <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-sans">
                          <AlertTriangle className="w-4 h-4 text-amber-600" /> Deduplication Requirement
                        </h4>
                        <p className="text-xs text-st-gray dark:text-gray-400 font-sans leading-relaxed font-light">
                          Always provide a stable <strong>order ID, payment ID, or idempotency key</strong>.
                          For revenue events, the API will reject requests missing all of these keys to prevent duplicate transactions.
                        </p>
                      </div>

                      <div className="pt-3 border-t border-gray-100 dark:border-gray-800/60 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-st-black dark:text-white">Stitching to visitor journeys</h4>
                          <div className="flex gap-3">
                            <Link to="/developers/offline-conversions" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline font-sans">
                              Offline conversions →
                            </Link>
                            <Link to="/developers/security" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline font-sans">
                              Security →
                            </Link>
                          </div>
                        </div>
                        <p className="text-xs text-st-gray dark:text-gray-400 font-sans leading-relaxed font-light">
                          Stitch payments to a visitor journey by sending the anonymous id (from the browser storage <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-st-black dark:text-white">st_aid</code>) in the <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-st-black dark:text-white">anonymous_id</code> field. Without it, the conversion is recorded as <code className="font-mono">unattributed</code>.
                        </p>
                      </div>

                      <IngestionActivityLog events={paymentsApiEventsData?.data || paymentsApiEventsData} providerLabel="Payments API" />
                    </div>
                  </CollapsibleRow>

                  <CollapsibleRow
                    icon={Plug}
                    title="Webhook Conversion Adapter"
                    subtitle="Stream real-time conversion payloads to custom URLs or automation platforms"
                    status={webhookData?.webhook?.active ? 'verified' : 'pending'}
                    badgeLabel={webhookData?.webhook?.active ? 'Active' : 'Inactive'}
                    isExpanded={activeSection === 'developer.webhook_adapter'}
                    onToggle={() => setActiveSection(activeSection === 'developer.webhook_adapter' ? 'developer' : 'developer.webhook_adapter')}
                    actionButton={
                      <div className="flex items-center gap-2">
                        <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                          Docs
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSection(activeSection === 'developer.webhook_adapter' ? 'developer' : 'developer.webhook_adapter');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors"
                        >
                          {activeSection === 'developer.webhook_adapter' ? 'Close' : 'Setup'}
                        </button>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <form onSubmit={handleSaveWebhook} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-st-gray uppercase tracking-wider mb-1">Webhook URL</label>
                          <input
                            type="text"
                            placeholder="https://your-endpoint.com/webhook"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            disabled={submitting}
                            className="w-full px-3 py-2 border border-gray-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-st-black/20"
                          />
                          <p className="text-[10px] text-st-gray mt-1 font-sans">
                            Endpoint will receive a POST request with the conversion payload and X-SourceTrack-Signature header.
                          </p>
                        </div>

                        {webhookData?.webhook && (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-3">
                            <div>
                              <label className="block text-xs font-semibold text-st-gray uppercase tracking-wider mb-1">Signing Secret</label>
                              {showSecret ? (
                                <div className="space-y-2">
                                  <div className="bg-green-50 border border-green-200 rounded p-2 flex items-center justify-between gap-2">
                                    <code className="text-xs font-mono text-green-700 select-all break-all">{showSecret}</code>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(showSecret).catch(() => {})
                                        alert('Copied to clipboard!')
                                      }}
                                      className="px-2 py-1 bg-green-600 text-white rounded text-[10px] font-semibold flex items-center gap-1 shrink-0 font-sans"
                                    >
                                      <Copy className="w-3 h-3" /> Copy
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-green-700 font-semibold font-sans">
                                    Make sure to copy this secret now. It will not be shown again.
                                  </p>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <code className="text-xs font-mono text-gray-700 select-all">{webhookData.webhook.secret}</code>
                                  <button
                                    type="button"
                                    onClick={handleRegenerateSecret}
                                    disabled={submitting}
                                    className="text-[10px] text-gray-500 hover:text-st-black font-semibold flex items-center gap-1 transition-colors font-sans"
                                  >
                                    <RefreshCw className="w-3 h-3" /> Regenerate
                                  </button>
                                </div>
                              )}
                              <p className="text-[10px] text-st-gray mt-1 font-sans">
                                Use this secret to verify the HMAC SHA-256 signature in the request headers.
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-200">
                              <div className="flex items-center gap-2">
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={e => {
                                      setActive(e.target.checked)
                                      const isEdit = !!webhookData?.webhook?.id
                                      const endpoint = `/webhooks/${webhookData.webhook.id}?site_key=${site.site_key}`
                                      fetchApi(endpoint, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ active: e.target.checked })
                                      }).then(() => refetchWebhook()).catch(() => {})
                                    }}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-st-black font-sans"></div>
                                  <span className="ml-2 text-xs font-medium text-gray-700 font-sans">Webhook Enabled</span>
                                </label>
                              </div>
                              <div>
                                {webhookData.deliveries && webhookData.deliveries.length > 0 ? (
                                  <div className="flex items-center gap-1 font-sans">
                                    <span className="text-[10px] text-st-gray">Last Delivery:</span>
                                    <StatusBadge
                                      status={webhookData.deliveries[0].success ? 'verified' : 'error'}
                                      label={webhookData.deliveries[0].success ? `Success (${webhookData.deliveries[0].status_code})` : `Failed (${webhookData.deliveries[0].status_code || 'Err'})`}
                                    />
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-st-gray font-sans">No deliveries yet</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                          <div className="flex items-center gap-2 font-sans">
                            <button
                              type="submit"
                              disabled={submitting}
                              className="px-4 py-2 bg-st-black text-white text-xs font-semibold rounded-lg hover:bg-st-black/90 disabled:opacity-50 transition-colors"
                            >
                              {submitting ? 'Saving...' : 'Save Configuration'}
                            </button>

                            {webhookData?.webhook && (
                              <button
                                type="button"
                                onClick={handleTestWebhook}
                                disabled={testing || submitting}
                                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                              >
                                <Play className="w-3 h-3" /> {testing ? 'Testing...' : 'Test Webhook'}
                              </button>
                            )}
                          </div>

                          {webhookData?.webhook && (
                            <button
                              type="button"
                              onClick={handleDeleteWebhook}
                              disabled={submitting}
                              className="text-xs text-red-655 hover:text-red-850 font-semibold flex items-center gap-1 transition-colors font-sans"
                            >
                              <Trash className="w-3.5 h-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      </form>

                      {testResult && (
                        <div className={`p-3 text-xs rounded-lg border font-sans ${testResult.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                          <p className="font-semibold">{testResult.success ? 'Test Delivery Succeeded' : 'Test Delivery Failed'}</p>
                          <p className="mt-1 font-sans">
                            {testResult.success
                              ? `Webhook responded with status code ${testResult.status_code}.`
                              : `Error: ${testResult.error_message || 'HTTP error ' + testResult.status_code}`
                            }
                          </p>
                        </div>
                      )}

                      {webhookData?.webhook && webhookData.deliveries && webhookData.deliveries.length > 0 && (
                        <div className="pt-4 border-t border-gray-100">
                          <p className="text-xs font-semibold text-st-gray uppercase tracking-wider mb-2">Recent Deliveries</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px] text-left border-collapse">
                              <thead>
                                <tr className="border-b border-gray-100 text-st-gray">
                                  <th className="pb-1.5 font-medium font-sans">Event Type</th>
                                  <th className="pb-1.5 font-medium font-sans">Status</th>
                                  <th className="pb-1.5 font-medium font-sans">Time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {webhookData.deliveries.map(del => (
                                  <tr key={del.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                    <td className="py-1.5 font-mono text-gray-750">{del.event_type}</td>
                                    <td className="py-1.5">
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${del.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                        {del.status_code || 'Error'}
                                      </span>
                                    </td>
                                    <td className="py-1.5 text-gray-500 font-sans">
                                      {new Date(del.created_at).toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div className="pt-2 flex justify-end">
                        <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline font-semibold font-sans">
                          Read Webhook Docs →
                        </a>
                      </div>
                    </div>
                  </CollapsibleRow>

                  <CollapsibleRow
                    icon={Code}
                    title="Conversion Source Map"
                    subtitle="Frontend JavaScript methods for manually firing custom client-side conversions"
                    status="verified"
                    badgeLabel="Ready"
                    isExpanded={activeSection === 'developer.source_map'}
                    onToggle={() => setActiveSection(activeSection === 'developer.source_map' ? 'developer' : 'developer.source_map')}
                    actionButton={
                      <div className="flex items-center gap-2">
                        <a href="https://www.sourcetrack.ai/docs" target="_blank" rel="noopener noreferrer" className="text-xs text-st-gray hover:text-st-black dark:text-slate-300 dark:hover:text-white transition-colors hover:underline mr-1">
                          Docs
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSection(activeSection === 'developer.source_map' ? 'developer' : 'developer.source_map');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors"
                        >
                          {activeSection === 'developer.source_map' ? 'Close' : 'Setup'}
                        </button>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <div className="text-xs text-st-gray leading-relaxed space-y-2">
                        <p>
                          If you cannot trigger conversions from a backend server or webhook, you can trigger conversions directly in the browser using the standard client-side JavaScript object.
                        </p>
                        <p>
                          Ensure the main tracking script is loaded on the page before executing this method.
                        </p>
                      </div>
                      <div className="bg-st-black rounded-lg p-3">
                        <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all font-mono">
{`window.st('track', 'conversion', {
  value: 99.00,
  currency: 'USD',
  order_id: 'ORD_12345',
  email: 'customer@example.com' // Optional for advanced mapping
});`}
                        </pre>
                      </div>
                    </div>
                  </CollapsibleRow>
                </div>
              </div>
            )}
          </div>
        </DashboardCard>
      </div>

      {/* Clean Integrations Footer */}
      <div className="text-center mt-8 pb-12">
        <a href="mailto:support@sourcetrack.ai" className="text-sm text-st-gray dark:text-gray-500 hover:text-st-black dark:hover:text-white transition-colors">
          Need another integration? Request one →
        </a>
      </div>
    </div>
  )
}
}
