import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSite } from '../contexts/SiteContext'
import { supabase } from '../lib/supabase'
import { getBillingPortal, fetchApi } from '../lib/api'
import { Copy, Check, ExternalLink, Globe, Link2, CreditCard, Link, ShieldCheck, Trash2, AlertTriangle, Clock, Key, X, HelpCircle } from 'lucide-react'
import UTMBuilder from '../components/UTMBuilder'
import { getTrialInfo, getPlanLabel, isPaidPlan } from '../lib/billing'
import { hasFeature } from '../lib/planFeatures'


export default function Settings() {
  const { user } = useAuth()
  const { activeSite } = useSite()
  const isPreview = activeSite?.support_preview || false
  const displaySiteKey = isPreview ? 'HIDDEN_IN_PREVIEW' : (activeSite?.site_key || 'YOUR_SITE_KEY')

  const [site, setSite]                 = useState(null)
  const [name, setName]                 = useState('')
  const [domain, setDomain]             = useState('')
  const [saving, setSaving]             = useState(false)
  const [shareEnabled, setShareEnabled]         = useState(false)
  const [shareToken, setShareToken]             = useState(null)
  const [shareLoading, setShareLoading]         = useState(false)
  const [shareCopied, setShareCopied]           = useState(false)
  const [cookielessMode, setCookielessMode]         = useState(false)
  const [cookielessLoading, setCookielessLoading]   = useState(false)
  const [retentionDays, setRetentionDays]           = useState(0)
  const [retentionSaving, setRetentionSaving]       = useState(false)
  const [visitorId, setVisitorId]                   = useState('')
  const [visitorDeleting, setVisitorDeleting]       = useState(false)
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('')
  const [deletingAccount, setDeletingAccount]       = useState(false)
  const [message, setMessage]                       = useState('')
  const [loadingPortal, setLoadingPortal]           = useState(false)
  const [attrWindow, setAttrWindow]                 = useState(30)
  const [attrWindowSaving, setAttrWindowSaving]     = useState(false)

  const [proxyDomain, setProxyDomain]               = useState('')
  const [proxyConfig, setProxyConfig]               = useState(null)
  const [proxyLoading, setProxyLoading]             = useState(false)
  const [proxyError, setProxyError]                 = useState('')
  const [proxySuccess, setProxySuccess]             = useState('')
  const [proxyCopied, setProxyCopied]               = useState(false)

  const [excludedPaths, setExcludedPaths]           = useState('')
  const [timezone, setTimezone]                     = useState('UTC')
  const [settingsSaving, setSettingsSaving]         = useState(false)

  const [customParams, setCustomParams]             = useState([])
  const [newParam, setNewParam]                     = useState('')
  const [customParamsSaving, setCustomParamsSaving] = useState(false)

  const [crossDomainDomains, setCrossDomainDomains]           = useState('')
  const [crossDomainCookieDomain, setCrossDomainCookieDomain] = useState('')
  const [crossDomainSaving, setCrossDomainSaving]             = useState(false)

  // API Keys state
  const [apiKeys, setApiKeys]                       = useState([])
  const [apiKeysLoading, setApiKeysLoading]         = useState(false)
  const [apiKeysError, setApiKeysError]             = useState('')
  const [newTokenName, setNewTokenName]             = useState('')
  const [newTokenModalOpen, setNewTokenModalOpen]   = useState(false)
  const [createdToken, setCreatedToken]             = useState(null)
  const [tokenCopied, setTokenCopied]               = useState(false)

  async function loadApiKeys() {
    if (!activeSite?.site_key) return
    setApiKeysLoading(true)
    setApiKeysError('')
    try {
      const keys = await fetchApi(`/integrations/api-keys?site_key=${activeSite.site_key}`)
      setApiKeys(keys || [])
    } catch (err) {
      console.error('Failed to load API keys:', err)
      setApiKeysError(err.message || 'Failed to load API keys')
    } finally {
      setApiKeysLoading(false)
    }
  }

  const handleCreateApiKey = async (e) => {
    e.preventDefault()
    if (!newTokenName.trim()) {
      setApiKeysError('Token name is required')
      return
    }
    setApiKeysLoading(true)
    setApiKeysError('')
    try {
      const data = await fetchApi(`/integrations/api-keys?site_key=${activeSite.site_key}`, {
        method: 'POST',
        body: { name: newTokenName.trim() }
      })
      setCreatedToken(data)
      setNewTokenName('')
      await loadApiKeys()
    } catch (err) {
      setApiKeysError(err.message || 'Failed to generate token')
    } finally {
      setApiKeysLoading(false)
    }
  }

  const handleRevokeApiKey = async (id) => {
    if (!window.confirm('Are you sure you want to revoke this API token? Any server-side applications using this token will fail immediately.')) {
      return
    }
    setApiKeysLoading(true)
    setApiKeysError('')
    try {
      await fetchApi(`/integrations/api-keys/${id}?site_key=${activeSite.site_key}`, {
        method: 'DELETE'
      })
      await loadApiKeys()
    } catch (err) {
      setApiKeysError(err.message || 'Failed to revoke token')
    } finally {
      setApiKeysLoading(false)
    }
  }

  useEffect(() => { loadSite() }, [user, activeSite])

  async function loadSite() {
    if (!activeSite?.site_key) {
      setSite(null)
      return
    }

    let query = supabase
      .from('sites')
      .select('*, cookieless_mode, data_retention_days, attribution_window_days, excluded_paths, timezone, custom_url_params, cross_domain_domains, cross_domain_cookie_domain')

    if (activeSite.id) {
      query = query.eq('id', activeSite.id)
    }

    query = query.eq('site_key', activeSite.site_key)

    const { data } = await query.maybeSingle()

    setSite(data)
    if (data) {
      setShareEnabled(!!data.public_share_enabled)
      setShareToken(data.public_share_token || null)
      setCookielessMode(!!data.cookieless_mode)
      setRetentionDays(data.data_retention_days || 0)
      setAttrWindow(data.attribution_window_days || 30)
      setName(data.name || '')
      setDomain(data.domain || '')
      setExcludedPaths((data.excluded_paths || []).join(', '))
      setTimezone(data.timezone || 'UTC')
      setCustomParams(data.custom_url_params || [])
      setCrossDomainDomains((data.cross_domain_domains || []).join(', '))
      setCrossDomainCookieDomain(data.cross_domain_cookie_domain || '')
      loadApiKeys()
    }

    try {
      const proxyData = await fetchApi(`/integrations/proxy-domain?site_key=${activeSite.site_key}`)
      setProxyConfig(proxyData)
      if (proxyData?.domain) {
        setProxyDomain(proxyData.domain)
      } else {
        setProxyDomain('')
      }
    } catch (err) {
      console.error('Failed to load proxy config:', err)
    }
  }

  const handleSaveProxy = async (e) => {
    e.preventDefault()
    if (!proxyDomain.trim()) {
      setProxyError('Domain name is required')
      return
    }
    setProxyLoading(true)
    setProxyError('')
    setProxySuccess('')
    try {
      const data = await fetchApi(`/integrations/proxy-domain?site_key=${activeSite.site_key}`, {
        method: 'POST',
        body: { domain: proxyDomain.trim() }
      })
      setProxyConfig(data)
      setProxySuccess('Custom domain saved. Please configure your DNS CNAME record.')
    } catch (err) {
      setProxyError(err.message || 'Failed to save custom domain')
    } finally {
      setProxyLoading(false)
    }
  }

  const handleVerifyProxy = async () => {
    setProxyLoading(true)
    setProxyError('')
    setProxySuccess('')
    try {
      const data = await fetchApi(`/integrations/proxy-domain/verify?site_key=${activeSite.site_key}`, {
        method: 'POST'
      })
      setProxyConfig(data)
      if (data.status === 'active') {
        setProxySuccess('Custom tracking domain verified and active!')
      } else if (data.status === 'pending_ssl_or_routing') {
        setProxySuccess('DNS resolves correctly! SSL certificate is now provisioning. Please allow 10-30 minutes.')
      } else {
        setProxyError(data.error_message || 'Verification failed. CNAME does not match the target.')
      }
    } catch (err) {
      setProxyError(err.message || 'Failed to verify custom domain')
    } finally {
      setProxyLoading(false)
    }
  }

  const handleDeleteProxy = async () => {
    if (!window.confirm('Are you sure you want to remove this custom tracking domain? This will stop script and event delivery through this subdomain.')) {
      return
    }
    setProxyLoading(true)
    setProxyError('')
    setProxySuccess('')
    try {
      await fetchApi(`/integrations/proxy-domain?site_key=${activeSite.site_key}`, {
        method: 'DELETE'
      })
      setProxyConfig(null)
      setProxyDomain('')
      setProxySuccess('Custom domain removed successfully.')
    } catch (err) {
      setProxyError(err.message || 'Failed to delete custom domain')
    } finally {
      setProxyLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) {
      setMessage('Active site context mismatch. Please try again.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      // Block free-tier abuse: PaaS subdomains (vercel.app, netlify.app, etc.)
      // require a custom domain or a paid plan. Defense-in-depth: the DB has a
      // trigger too, this is the UX-friendly path.
      const planForCheck = site?.plan || 'free'
      if (planForCheck === 'free' && domain) {
        const PAAS_SUFFIXES = ['.vercel.app','.netlify.app','.netlify.com','.webflow.io','.glitch.me','.replit.dev','.replit.app','.repl.co','.ngrok.io','.ngrok-free.app','.herokuapp.com','.firebaseapp.com','.web.app','.pages.dev','.workers.dev','.github.io','.gitlab.io','.surge.sh','.fly.dev','.up.railway.app','.onrender.com','.lovable.app','.myshopify.com']
        const clean = String(domain).toLowerCase().trim().replace(/^https?:\/\//,'').replace(/\/$/,'').split('/')[0]
        const match = PAAS_SUFFIXES.find(s => clean.endsWith(s) && clean.length > s.length)
        if (match) {
          setMessage(`Free accounts can't use ${match} subdomains. Use a custom domain or upgrade.`)
          setSaving(false)
          return
        }
      }

      if (site) {
        await supabase.from('sites').update({ name, domain }).eq('id', site.id)
      } else {
        // Don't pass `plan` — the DB column DEFAULT 'free' applies. Passing
        // an explicit value would override the default and risk drifting from
        // the canonical signup-defaults-to-free policy.
        const { data } = await supabase.from('sites').insert({
          name, domain, owner_id: user.id
        }).select().single()
        setSite(data)
      }
      setMessage('Saved!')
    } catch (_err) {
      setMessage('Error saving')
    } finally {
      setSaving(false)
    }
  }

  const handlePortal = async () => {
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setLoadingPortal(true)
    setMessage('')
    try {
      const returnUrl = `${window.location.origin}/settings`
      const data = await getBillingPortal(site.site_key, returnUrl)
      if (data?.url) window.location.href = data.url
    } catch (_err) {
      setMessage('Failed to open billing portal')
    } finally {
      setLoadingPortal(false)
    }
  }

  const handleShareToggle = async () => {
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setShareLoading(true)
    try {
      const newEnabled = !shareEnabled
      const { data, error } = await supabase
        .from('sites')
        .update({ public_share_enabled: newEnabled })
        .eq('id', site.id)
        .select('public_share_token, public_share_enabled')
        .single()
      if (error) throw error
      setShareEnabled(!!data.public_share_enabled)
      setShareToken(data.public_share_token || null)
    } catch (_err) {
      setMessage('Error updating share settings')
    } finally {
      setShareLoading(false)
    }
  }

  const handleShareCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const handleCookielessToggle = async () => {
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setCookielessLoading(true)
    try {
      const newMode = !cookielessMode
      const { error } = await supabase
        .from('sites')
        .update({ cookieless_mode: newMode })
        .eq('id', site.id)
      if (error) throw error
      setCookielessMode(newMode)
      setMessage(newMode ? 'Cookieless mode enabled.' : 'Cookieless mode disabled.')
      setTimeout(() => setMessage(''), 3000)
    } catch (_err) {
      setMessage('Error updating tracking mode')
    } finally {
      setCookielessLoading(false)
    }
  }

  const handleRetentionSave = async () => {
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setRetentionSaving(true)
    try {
      const data = await fetchApi('/gdpr/retention', {
        method: 'PUT',
        body: { site_key: site.site_key, retention_days: retentionDays }
      })
      setMessage(data.message || 'Retention policy saved.')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(err?.message || 'Error saving retention policy')
    } finally {
      setRetentionSaving(false)
    }
  }

  const handleVisitorDelete = async (e) => {
    e.preventDefault()
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key || !visitorId.trim()) return
    setVisitorDeleting(true)
    try {
      const data = await fetchApi('/gdpr/visitor', {
        method: 'DELETE',
        body: { site_key: site.site_key, anonymous_id: visitorId.trim() }
      })
      setMessage(data.message || 'Visitor data erased.')
      setVisitorId('')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(err?.message || 'Error deleting visitor data')
    } finally {
      setVisitorDeleting(false)
    }
  }

  const handleAccountDelete = async () => {
    if (deleteAccountConfirm !== 'DELETE') return
    setDeletingAccount(true)
    try {
      await fetchApi('/gdpr/account', {
        method: 'DELETE'
      })
      // Force sign out — account no longer exists
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (err) {
      setMessage(err?.message || 'Error deleting account. Please contact support.')
      setDeletingAccount(false)
    }
  }

  const handleAttrWindowSave = async () => {
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setAttrWindowSaving(true)
    setMessage('')
    try {
      await fetchApi(`/integrations/settings?site_key=${site.site_key}`, {
        method: 'PATCH',
        body: JSON.stringify({ attribution_window_days: attrWindow })
      })
      setMessage('Attribution window saved.')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(err?.message || 'Error saving attribution window')
      setTimeout(() => setMessage(''), 4000)
    } finally {
      setAttrWindowSaving(false)
    }
  }

  const handleSettingsSave = async () => {
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setSettingsSaving(true)
    setMessage('')
    try {
      await fetchApi(`/integrations/settings?site_key=${site.site_key}`, {
        method: 'PATCH',
        body: JSON.stringify({
          timezone,
          excluded_paths: excludedPaths
        })
      })
      setMessage('Site settings saved.')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(err?.message || 'Error saving settings')
      setTimeout(() => setMessage(''), 4000)
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleCustomParamsSave = async (updatedParams) => {
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setCustomParamsSaving(true)
    setMessage('')
    try {
      await fetchApi(`/integrations/settings?site_key=${site.site_key}`, {
        method: 'PATCH',
        body: JSON.stringify({
          custom_url_params: updatedParams
        })
      })
      setMessage('Custom parameters saved.')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(err?.message || 'Error saving custom parameters')
      setTimeout(() => setMessage(''), 4000)
    } finally {
      setCustomParamsSaving(false)
    }
  }

  const handleCrossDomainSave = async (e) => {
    if (e) e.preventDefault()
    if (!site || !activeSite || site.id !== activeSite.id || site.site_key !== activeSite.site_key) return
    setCrossDomainSaving(true)
    setMessage('')
    try {
      const domainsArr = crossDomainDomains
        ? crossDomainDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
        : []
      const cookieDomainVal = crossDomainCookieDomain ? crossDomainCookieDomain.trim().toLowerCase() : null

      await fetchApi(`/integrations/settings?site_key=${site.site_key}`, {
        method: 'PATCH',
        body: {
          cross_domain_domains: domainsArr,
          cross_domain_cookie_domain: cookieDomainVal
        }
      })
      setMessage('Cross-domain settings saved.')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(err?.message || 'Error saving cross-domain settings')
      setTimeout(() => setMessage(''), 4000)
    } finally {
      setCrossDomainSaving(false)
    }
  }

  const handleAddParam = (e) => {
    e.preventDefault()
    const trimmed = newParam.trim().toLowerCase()
    if (!trimmed) return

    if (!/^[a-z0-9_-]{1,40}$/.test(trimmed)) {
      setMessage('Invalid key format. Must be 1-40 lowercase alphanumeric characters, underscores or dashes.')
      return
    }

    const blockedSubstrings = ['email', 'phone', 'name', 'address', 'token', 'secret', 'password', 'session', 'auth', 'cookie', 'card', 'ssn']
    for (const sub of blockedSubstrings) {
      if (trimmed.includes(sub)) {
        setMessage(`Key cannot contain sensitive word: "${sub}"`)
        return
      }
    }

    if (customParams.includes(trimmed)) {
      setMessage('Parameter is already allowlisted.')
      return
    }

    if (customParams.length >= 10) {
      setMessage('Maximum of 10 custom parameters allowed.')
      return
    }

    const updated = [...customParams, trimmed]
    setCustomParams(updated)
    setNewParam('')
    handleCustomParamsSave(updated)
  }

  const handleRemoveParam = (paramToRemove) => {
    const updated = customParams.filter(p => p !== paramToRemove)
    setCustomParams(updated)
    handleCustomParamsSave(updated)
  }




  // `isPaid` covers any non-free, non-trial plan (starter/growth/scale).
  // Legacy 'pro'/'agency'/'business' are normalized to 'growth'/'scale' upstream.
  const plan = site?.plan || 'free'
  const isPaid = isPaidPlan(plan)
  const isPro = isPaid // back-compat alias for any remaining references
  const isTrial = plan === 'trial'

  // Days left in trial
  const trialInfo = site ? getTrialInfo(site) : null
  const daysLeft = trialInfo?.daysLeft ?? null
  const trialExpired = trialInfo?.expired ?? false

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-st-black dark:text-white">Settings</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">{user?.email}</p>
      </div>

      {isPreview && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-400 font-medium">
          Settings are read-only in Support Preview. Billing, API tokens, and sensitive actions are hidden.
        </div>
      )}

      {/* Status message */}
      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          message.includes('Error') || message.includes('Failed')
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
        }`}>
          {message}
        </div>
      )}

      {/* ── Plan & Billing ─────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-st-gray dark:text-gray-400" />
            <div>
              <p className="text-sm font-bold text-st-black dark:text-white">
                Plan: <span className="capitalize">{getPlanLabel(plan)}</span>
                {isTrial && daysLeft !== null && (
                  <span className={`ml-2 text-xs font-medium ${trialExpired ? 'text-red-500' : daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`}>
                    ({trialExpired ? 'expired' : `${daysLeft}d left`})
                  </span>
                )}
              </p>
            </div>
          </div>
          {!isPreview && (
            <a href="/billing" className="text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white underline">
              Manage billing →
            </a>
          )}
        </div>
      </section>

      {/* ── Site Settings ──────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-st-black dark:text-white">Site Settings</h3>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isPreview}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
              placeholder="My Website"
            />
          </div>
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              disabled={isPreview}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
              placeholder="yoursite.com"
            />
          </div>
          {isPreview ? (
            <div className="text-xs text-st-gray italic">Setting changes are hidden in Support Preview</div>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </form>
      </section>

      {/* ── Public Dashboard ───────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Public Dashboard</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">Share a read-only view of your analytics — no login required.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">{shareEnabled ? 'Sharing enabled' : 'Sharing disabled'}</span>
          {!isPreview ? (
            <button
              onClick={handleShareToggle}
              disabled={shareLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                shareEnabled ? 'bg-st-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-800'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-st-black shadow transition-transform ${
                shareEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          ) : (
            <span className="text-xs text-st-gray italic">Hidden in Support Preview</span>
          )}
        </div>
        {shareEnabled && shareToken && (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-st-gray dark:text-gray-400 shrink-0" />
            <span className="text-xs text-st-gray dark:text-gray-400 truncate flex-1">
              {`${window.location.origin}/share/${shareToken}`}
            </span>
            <button onClick={handleShareCopy} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
              {shareCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-st-gray dark:text-gray-400" />}
            </button>
            <a
              href={`${window.location.origin}/share/${shareToken}`}
              target="_blank" rel="noopener noreferrer"
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              <ExternalLink className="w-4 h-4 text-st-gray dark:text-gray-400" />
            </a>
          </div>
        )}
      </section>

      {/* ── Cookieless Tracking ───────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Cookieless Tracking</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          When enabled, the tracker uses a server-derived daily-rotating hash instead of localStorage or cookies.
          No personal data is stored in the browser — no cookies, no fingerprinting. Designed to reduce tracking risk and operate without a consent banner.
        </p>
        {cookielessMode && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Attribution trade-offs in cookieless mode</p>
            <ul className="text-[11px] text-amber-700 dark:text-amber-300/90 space-y-1 font-sans leading-relaxed">
              <li>• Cookieless mode is more privacy-friendly but less persistent. Visitor IDs are derived server-side and rotate roughly once a day.</li>
              <li>• If the visitor ID request to <code className="font-mono">/api/tracker/id</code> is blocked by an ad-blocker or fails on the network, SourceTrack falls back to a session-only id and writes a one-line <code className="font-mono">console.warn</code> in the browser DevTools.</li>
              <li>• When that fallback fires, the visitor will not be connected across sessions and any later conversion may be recorded as <em>direct</em>. Attribution may become same-session only or weaker depending on browser/network behavior.</li>
              <li>• First-touch source is held in memory for the active session only — it is not preserved across page reloads.</li>
            </ul>
            <p className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-relaxed pt-1">
              If you need full multi-session attribution, switch off cookieless mode and use the standard tracker, which stores a stable id in <code className="font-mono">localStorage</code>.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {cookielessMode ? 'Cookieless mode — no browser storage, privacy-friendly' : 'Standard mode — visitor IDs stored in localStorage'}
          </span>
          {!isPreview ? (
            <button
              onClick={handleCookielessToggle}
              disabled={cookielessLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                cookielessMode ? 'bg-st-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-800'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-st-black shadow transition-transform ${
                cookielessMode ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          ) : (
            <span className="text-xs text-st-gray italic">Hidden in Support Preview</span>
          )}
        </div>
        {cookielessMode && (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Use this snippet instead:</p>
            <code className="block text-xs text-gray-600 dark:text-gray-400 break-all">
              {`<script async src="${typeof window !== 'undefined' ? window.location.origin : ''}/tracker.cookieless.min.js" data-site-key="${displaySiteKey}"></script>`}
            </code>
          </div>
        )}
      </section>

      {/* ── Custom Tracking Domain ───────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-st-gray dark:text-gray-400" />
            <h3 className="text-sm font-bold text-st-black dark:text-white">Custom Tracking Domain</h3>
          </div>
          {(() => {
            const getProxyStatusInfo = () => {
              if (!proxyConfig) {
                return { label: 'Not configured', color: 'text-gray-500 bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700' }
              }
              switch (proxyConfig.status) {
                case 'pending_dns':
                  return { label: 'Waiting for DNS', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30' }
                case 'pending_ssl_or_routing':
                  return { label: 'Securing domain', color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/10 border-sky-200 dark:border-sky-900/30' }
                case 'active':
                  return { label: 'Active', color: 'text-green-600 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30' }
                case 'error':
                  return { label: 'Needs attention', color: 'text-red-600 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' }
                default:
                  return { label: 'Unknown', color: 'text-gray-500 bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700' }
              }
            }
            const statusInfo = getProxyStatusInfo()
            return (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            )
          })()}
        </div>

        <p className="text-xs text-st-gray dark:text-gray-400">
          Tip: short neutral names like <code className="font-mono bg-gray-50 dark:bg-gray-800 px-1 py-0.5 rounded">a.yourdomain.com</code> or <code className="font-mono bg-gray-50 dark:bg-gray-800 px-1 py-0.5 rounded">cdn.yourdomain.com</code> work best.
        </p>

        {proxyError && (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Verification Alert</p>
              <p className="opacity-90">{proxyError}</p>
            </div>
          </div>
        )}

        {proxySuccess && (
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 text-green-600 dark:text-green-400 p-3 rounded-lg text-xs">
            {proxySuccess}
          </div>
        )}

        {!proxyConfig ? (
          <form onSubmit={handleSaveProxy} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={proxyDomain}
                onChange={e => setProxyDomain(e.target.value)}
                placeholder="track.yourdomain.com"
                disabled={proxyLoading || isPreview}
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
              />
              {isPreview ? (
                <span className="text-xs text-st-gray italic self-center">Hidden in Support Preview</span>
              ) : (
                <button
                  type="submit"
                  disabled={proxyLoading}
                  className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {proxyLoading ? 'Saving...' : 'Set Domain'}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-[#202222] border border-gray-100 dark:border-gray-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="block text-st-gray dark:text-gray-400 font-medium mb-1">DNS Record Type</span>
                  <code className="font-mono text-st-black dark:text-white font-bold bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">CNAME</code>
                </div>
                <div>
                  <span className="block text-st-gray dark:text-gray-400 font-medium mb-1">Host/Subdomain</span>
                  <code className="font-mono text-st-black dark:text-white font-bold bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">{proxyConfig.domain}</code>
                </div>
                <div className="md:col-span-2">
                  <span className="block text-st-gray dark:text-gray-400 font-medium mb-1">Points To (Target)</span>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-st-black dark:text-white font-bold bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded truncate flex-1">{proxyConfig.cname_target}</code>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(proxyConfig.cname_target)
                          setProxySuccess('CNAME target copied to clipboard!')
                          setTimeout(() => setProxySuccess(''), 2000)
                        } catch (_) {}
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-st-gray transition-colors flex-shrink-0"
                      title="Copy Target"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {isPreview ? (
              <div className="text-xs text-st-gray italic">Domain mutation controls are hidden in Support Preview</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleVerifyProxy}
                  disabled={proxyLoading}
                  className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {proxyLoading ? 'Checking...' : 'Check CNAME Status'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProxy}
                  disabled={proxyLoading}
                  className="px-4 py-2 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Remove Custom Domain
                </button>
              </div>
            )}

            {proxyConfig.status === 'active' && (
              <div className="bg-gray-50 dark:bg-[#202222] border border-gray-100 dark:border-gray-800 rounded-xl p-4 space-y-2">
                <span className="block text-xs font-semibold text-st-black dark:text-white">Your first-party tracking snippet:</span>
                <div className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 rounded-lg p-2">
                  <code className="font-mono text-xs text-st-black dark:text-white break-all flex-1 select-all">
                    {`<script async src="https://${proxyConfig.domain}/${site?.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'}" data-site-key="${displaySiteKey}"></script>`}
                  </code>
                  <button
                    onClick={async () => {
                      try {
                        const snippetText = `<script async src="https://${proxyConfig.domain}/${site?.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'}" data-site-key="${displaySiteKey}"></script>`
                        await navigator.clipboard.writeText(snippetText)
                        setProxyCopied(true)
                        setTimeout(() => setProxyCopied(false), 2000)
                      } catch (_) {}
                    }}
                    className="p-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-st-gray transition-colors flex-shrink-0"
                    title="Copy Snippet"
                  >
                    {proxyCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="text-right">
          <a
            href="/developers/tracker"
            className="inline-flex items-center gap-1 text-xs font-medium text-st-gray hover:text-st-black dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Custom Domain Setup Guide
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>

      {/* ── Attribution Window ────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Attribution Window</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          The maximum number of days between a visitor's first touch and a conversion for it to be attributed.
          Conversions outside this window are still recorded but won't be linked to earlier touchpoints.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={attrWindow}
            onChange={e => setAttrWindow(Number(e.target.value))}
            disabled={isPreview}
            className="px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days (recommended)</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          {isPreview ? (
            <span className="text-xs text-st-gray italic self-center">Hidden in Support Preview</span>
          ) : (
            <button
              onClick={handleAttrWindowSave}
              disabled={attrWindowSaving}
              className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {attrWindowSaving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          This window applies to all attribution reports unless overridden per-query in the Report Builder.
        </p>
      </section>

      {/* ── Site Settings (Timezone & Path Exclusions) ───────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Site Settings</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          Configure default reporting timezone boundaries and exclude specific client paths from tracking.
        </p>

        <form onSubmit={e => { e.preventDefault(); handleSettingsSave(); }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Reporting Timezone</label>
            <p className="text-[11px] text-st-gray dark:text-gray-400">
              Set the default reporting timezone for your workspace. Supported reports (such as dashboard overview graphs) will group daily totals using this timezone. Custom reports and event logs remain UTC.
            </p>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              disabled={isPreview}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
            >
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="America/Chicago">America/Chicago (CST/CDT)</option>
              <option value="America/Denver">America/Denver (MST/MDT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Excluded Paths</label>
            <p className="text-[11px] text-st-gray dark:text-gray-400">
              Comma-separated list of paths to exclude from tracking (e.g. <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">/admin/*, /staging, /secret</code>). Trailing wildcard <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">*</code> matches prefixes.
            </p>
            <input
              type="text"
              value={excludedPaths}
              onChange={e => setExcludedPaths(e.target.value)}
              disabled={isPreview}
              placeholder="/admin/*, /staging/*"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
            />
          </div>

          {isPreview ? (
            <div className="text-xs text-st-gray italic">Setting changes are hidden in Support Preview</div>
          ) : (
            <button
              type="submit"
              disabled={settingsSaving}
              className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {settingsSaving ? 'Saving…' : 'Save Site Settings'}
            </button>
          )}
        </form>
      </section>

      {/* ── Custom URL Parameters ─────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Custom URL Parameters</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          Capture and attribute custom marketing parameters (e.g. <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">?affiliate=123</code> or <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">?partner=xyz</code>).
          Values matching emails, phone numbers, or credentials/tokens are automatically dropped to maintain privacy.
        </p>

        <form onSubmit={handleAddParam} className="flex gap-2">
          <input
            type="text"
            value={newParam}
            onChange={e => setNewParam(e.target.value)}
            placeholder="e.g. affiliate"
            className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
            disabled={customParamsSaving || isPreview}
          />
          {!isPreview && (
            <button
              type="submit"
              disabled={customParamsSaving || !newParam.trim()}
              className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          )}
        </form>

        {customParams.length > 0 ? (
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg divide-y divide-gray-200 dark:divide-gray-800">
            {customParams.map(param => (
              <div key={param} className="flex items-center justify-between p-3">
                <span className="text-sm font-mono text-st-black dark:text-white">{param}</span>
                {!isPreview && (
                  <button
                    onClick={() => handleRemoveParam(param)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500 rounded disabled:opacity-50"
                    disabled={customParamsSaving}
                    title="Remove parameter"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-st-gray dark:text-gray-400 italic">No custom parameters allowlisted yet.</p>
        )}
        <p className="text-[10px] text-st-gray dark:text-gray-400">
          Max 10 active parameters. Keys must be lowercase alphanumeric with underscores/dashes, up to 40 characters.
        </p>
      </section>

      {/* ── Cross-Domain Tracking ─────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-st-gray dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h3 className="text-sm font-bold text-st-black dark:text-white">Cross-Domain Tracking</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          Stitch visitor attribution continuity across separate domains you own. Links pointing to domains listed here will be decorated automatically with secure identity tags.
        </p>

        <form onSubmit={handleCrossDomainSave} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-st-black dark:text-white">Cross-Domain Hostnames</label>
            <input
              type="text"
              value={crossDomainDomains}
              onChange={e => setCrossDomainDomains(e.target.value)}
              disabled={isPreview}
              placeholder="e.g. app.example.com, checkout.example.com"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
            />
            <p className="text-[10px] text-st-gray dark:text-gray-400">
              Comma-separated list of target domains (maximum 20). No protocols, wildcards, or paths.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-st-black dark:text-white">TLD Cookie Domain Fallback (Optional)</label>
            <input
              type="text"
              value={crossDomainCookieDomain}
              onChange={e => setCrossDomainCookieDomain(e.target.value)}
              disabled={isPreview}
              placeholder="e.g. .example.com"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
            />
            <p className="text-[10px] text-st-gray dark:text-gray-400">
              Must start with a leading dot and match or be a parent domain of your primary site domain. Enables fallback storage continuity.
            </p>
          </div>

          {isPreview ? (
            <div className="text-xs text-st-gray italic">Setting changes are hidden in Support Preview</div>
          ) : (
            <button
              type="submit"
              disabled={crossDomainSaving}
              className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {crossDomainSaving ? 'Saving…' : 'Save Cross-Domain Settings'}
            </button>
          )}
        </form>
      </section>

      {/* ── Privacy & Data Retention ──────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Privacy &amp; Data</h3>
        </div>

        {/* Retention policy */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-st-black dark:text-white">Data Retention</p>
          <p className="text-xs text-st-gray dark:text-gray-400">
            Attribution records older than the selected period are automatically deleted each night.
            Set to "Keep forever" if you are not subject to a retention obligation.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={retentionDays}
              onChange={e => setRetentionDays(Number(e.target.value))}
              disabled={isPreview}
              className="px-3 py-2 border border-gray-200 dark:border-gray-800 dark:bg-[#1A1C1C] dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50"
            >
              <option value={0}>Keep forever</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
            {isPreview ? (
              <span className="text-xs text-st-gray italic self-center">Hidden in Support Preview</span>
            ) : (
              <button
                onClick={handleRetentionSave}
                disabled={retentionSaving}
                className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {retentionSaving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>

        {/* Visitor data erasure */}
        {!isPreview && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
            <p className="text-xs font-semibold text-st-black dark:text-white">Erase Visitor Data (Right to Erasure)</p>
            <p className="text-xs text-st-gray dark:text-gray-400">
              Enter a visitor's anonymous ID to erase matching SourceTrack app database records. This action is immediate for app database records and cannot be undone.
            </p>
            <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg p-3 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5 font-sans">
              <p>• Database attribution records and stitched identity mappings will be permanently deleted from our app database.</p>
              <p>• <strong>PostHog Deletion Limitation:</strong> Visitor erasure sends a best-effort deletion request to our analytics backend where supported. However, this is not independently verified and full raw-event purge verification is still pending.</p>
              <p>• <strong>Sanitization Note:</strong> Ingestion-side PII sanitization is locally implemented to filter sensitive keys, but live staging/production verification remains pending.</p>
              <p>• Third-party Stripe customer and billing records are not affected or queried during visitor data deletion.</p>
            </div>
            <form onSubmit={handleVisitorDelete} className="flex items-center gap-3">
              <input
                type="text"
                value={visitorId}
                onChange={e => setVisitorId(e.target.value)}
                placeholder="anonymous_id (e.g. xxxxxxxx-xxxx-4xxx-…)"
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20"
              />
              <button
                type="submit"
                disabled={visitorDeleting || !visitorId.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {visitorDeleting ? 'Erasing…' : 'Erase'}
              </button>
            </form>
          </div>
        )}
      </section>

      {/* ── Server API Tokens ─────────────────────────────────────────── */}
      {!isPreview && (
      <section id="api-tokens" className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 scroll-mt-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-st-gray dark:text-gray-400" />
            <h3 className="text-sm font-bold text-st-black dark:text-white">Server API Tokens</h3>
          </div>
          <a
            href="/developers"
            className="text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white underline"
          >
            Developer Portal →
          </a>
        </div>

        <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
          Use Server API Tokens to track offline events, server-side conversions, or send telemetry from backends (like Node.js, Python, or Ruby) directly to the <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">/api/server/event</code> endpoint.
        </p>

        <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-400">Site Key vs. Private API Token</p>
          <p className="text-[11px] text-blue-700/85 dark:text-blue-400/85 leading-relaxed">
            Your <strong>Site Key</strong> is public and embedded in your tracking pixel. It can only ingest client-side traffic and cannot read your data. A <strong>Private API Token</strong> authorizes server-side conversion writes and must be kept secure.
          </p>
        </div>

        <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg p-3 flex gap-2.5 items-start">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">Security Warning</p>
            <p className="text-[11px] text-amber-700/85 dark:text-amber-400/85 leading-relaxed">
              <strong>Never use private API tokens in browser-side JavaScript or public client code.</strong> Doing so exposes your secret credentials. Only use them in secure backend environments.
            </p>
          </div>
        </div>

        {apiKeysError && (
          <div className="p-3 text-xs bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg border border-red-100 dark:border-red-900/20">
            {apiKeysError}
          </div>
        )}

        {!hasFeature(plan, 'api_access') ? (
          <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-6 text-center bg-gray-50/30 dark:bg-dark-hover/5">
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-2">🔒 Premium Feature</div>
            <p className="text-xs font-bold text-st-black dark:text-white mb-1">Server API Token Management</p>
            <p className="text-[11px] text-st-gray dark:text-gray-400 mb-4">API access is available on Growth and Scale plans.</p>
            <a
              href="/billing"
              className="inline-block text-xs font-semibold px-4 py-2 rounded-lg bg-st-black dark:bg-white text-white dark:text-st-black hover:bg-st-black/95 dark:hover:bg-gray-100 transition-colors"
            >
              Upgrade to unlock
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tokens table/list */}
            {apiKeysLoading && apiKeys.length === 0 ? (
              <div className="text-center py-4 text-xs text-st-gray dark:text-gray-400 animate-pulse">
                Loading API tokens...
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-gray-100 dark:border-gray-800 rounded-lg text-xs text-st-gray dark:text-gray-400">
                No active API tokens. Click the button below to generate one.
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-lg">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800 text-st-gray dark:text-gray-400">
                      <th className="p-3 font-semibold">Name</th>
                      <th className="p-3 font-semibold">Token prefix</th>
                      <th className="p-3 font-semibold">Created</th>
                      <th className="p-3 font-semibold">Last Used</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {apiKeys.map(k => (
                      <tr key={k.id} className="text-st-black dark:text-gray-300">
                        <td className="p-3 font-medium truncate max-w-[150px]">{k.name}</td>
                        <td className="p-3 font-mono text-[11px]">{k.key_prefix}</td>
                        <td className="p-3 text-st-gray dark:text-gray-400">{new Date(k.created_at).toLocaleDateString()}</td>
                        <td className="p-3 text-st-gray dark:text-gray-400">
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleRevokeApiKey(k.id)}
                            className="text-red-600 hover:text-red-700 font-semibold text-xs"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              onClick={() => {
                setCreatedToken(null);
                setNewTokenModalOpen(true);
              }}
              className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 transition-colors"
            >
              + Generate API Token
            </button>
          </div>
        )}

        {/* Links to developer resources */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100 dark:border-gray-800 text-[11px]">
          <a
            href="/developers/api"
            className="flex items-center gap-1 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            API Integration Guide
          </a>
          <a
            href="/developers/security"
            className="flex items-center gap-1 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Security & Token Best Practices
          </a>
        </div>
      </section>
      )}

      {/* ── Support & Feedback ────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Support & Feedback</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
          Need help setting up your tracking script, configuring integrations, or have questions? Email us at{' '}
          <a href="mailto:support@sourcetrack.ai" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
            support@sourcetrack.ai
          </a>
          . Please include your domain name and site key for faster troubleshooting. We’ll review your message and reply as soon as possible.
        </p>
      </section>

      {/* ── Danger Zone (Account Deletion) ────────────────────────────── */}
      {!isPreview && (
      <section className="bg-white dark:bg-[#1A1C1C] border border-red-200 dark:border-red-900/40 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
          Permanently delete your account. This action is irreversible.
        </p>
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg p-3 text-[11px] text-red-800 dark:text-red-300 space-y-1.5 font-sans">
          <p>• Account/workspace deletion removes SourceTrack workspace and app database records according to current code paths.</p>
          <p>• <strong>PostHog Event Retention:</strong> Deleting your account does NOT delete historical raw analytics events already sent to our analytics backend (PostHog). These events may remain until separate retention or purge tooling is implemented.</p>
          <p>• <strong>Paid Beta Blocker:</strong> Paid beta remains blocked by PostHog retention/deletion handling and live verification.</p>
          <p>• If you are the only workspace member, your workspace and sites will be permanently deleted from our app database.</p>
          <p>• If this is a shared workspace, your account and membership will be removed, leaving the shared sites active for other members.</p>
          <p>• If you are the only administrator of a shared workspace, you must transfer ownership or remove other members before deleting your account.</p>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          Type <strong>DELETE</strong> below to confirm.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={deleteAccountConfirm}
            onChange={e => setDeleteAccountConfirm(e.target.value)}
            placeholder='Type DELETE to confirm'
            className="flex-1 px-3 py-2 border border-red-200 dark:border-red-900/40 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40"
          />
          <button
            onClick={handleAccountDelete}
            disabled={deletingAccount || deleteAccountConfirm !== 'DELETE'}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deletingAccount ? 'Deleting…' : 'Delete Account'}
          </button>
        </div>
      </section>
      )}

      {/* ── UTM Builder ────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">UTM Builder</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">Generate tagged URLs for accurate campaign tracking. All parameters are lowercased automatically.</p>
        <UTMBuilder />
      </section>

      {/* ── Create Token Modal ────────────────────────────────────────── */}
      {newTokenModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="text-sm font-bold text-st-black dark:text-white">Generate Server API Token</h3>
              {!createdToken && (
                <button
                  onClick={() => setNewTokenModalOpen(false)}
                  className="text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {!createdToken ? (
              <form onSubmit={handleCreateApiKey} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs text-st-gray dark:text-gray-400">Token Description Name</label>
                  <input
                    type="text"
                    value={newTokenName}
                    onChange={e => setNewTokenName(e.target.value)}
                    placeholder="e.g. Production Backend SDK"
                    required
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20"
                  />
                  <p className="text-[10px] text-st-gray dark:text-gray-400">
                    Use a descriptive name so you remember where this token is deployed.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setNewTokenModalOpen(false)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-st-black dark:text-white text-xs font-semibold rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={apiKeysLoading}
                    className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
                  >
                    {apiKeysLoading ? 'Generating…' : 'Generate Token'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-800 dark:text-green-400">Token Generated Successfully</p>
                  <p className="text-[11px] text-green-700/80 dark:text-green-300/80 leading-relaxed mt-0.5">
                    Copy the token now. <strong>For security, we cannot show this token to you again.</strong>
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-st-gray dark:text-gray-400">API Token</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdToken.token}
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-xs font-mono select-all focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdToken.token);
                        setTokenCopied(true);
                        setTimeout(() => setTokenCopied(false), 2000);
                      }}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-st-black dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0 flex items-center justify-center"
                      title="Copy to Clipboard"
                    >
                      {tokenCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg p-3 flex gap-2.5 items-start">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700/85 dark:text-amber-400/85 leading-relaxed font-semibold">
                    Never commit this token to Git repositories, include it in frontend source files, or post it publicly.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setNewTokenModalOpen(false);
                      setCreatedToken(null);
                    }}
                    className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 transition-colors"
                  >
                    I Have Copied It
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
