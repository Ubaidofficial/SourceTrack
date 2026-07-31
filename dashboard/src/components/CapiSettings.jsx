import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import StatusBadge from './StatusBadge'
import { MetaLogo, GoogleLogo, GoogleAnalyticsLogo, TikTokLogo, LinkedInLogo } from '../lib/brandLogos'

// Minimal functional CAPI config surface (Phase 2). Per-platform: connect a
// server-side conversion API token, see connected state + last delivery,
// disconnect. Tokens are write-only — never returned by the API.
// Keys MUST match CAPI_PLATFORMS in api/routes/capi.js — the key is the URL segment.
//
// `Logo` reuses dashboard/src/lib/brandLogos.jsx — the same registry SourceIcon renders
// across Analytics and the journey views — rather than introducing a second icon idiom for
// this one surface. lucide-react stays the generic-icon fallback everywhere else.
const PLATFORMS = [
  { key: 'meta',   label: 'Meta CAPI',     Logo: MetaLogo,            tokenLabel: 'Access token',     idFields: [{ name: 'pixel_id', label: 'Pixel ID' }] },
  // Google is OAuth, not a pasted token. It used to ask for a "Developer token", which no
  // customer can ever supply — Google issues that once to the software provider, not to
  // advertisers. The credential is now the Google Ads OAuth connection that ad-cost import
  // already establishes (ad_platform_connections); this card reuses that same connection
  // and only adds the conversion action to upload against.
  { key: 'google', label: 'Google Ads',    Logo: GoogleLogo,          oauth: true,                    idFields: [] },
  { key: 'ga4',    label: 'Google Analytics 4', Logo: GoogleAnalyticsLogo, tokenLabel: 'API secret',  idFields: [{ name: 'measurement_id', label: 'Measurement ID' }] },
  { key: 'tiktok', label: 'TikTok',        Logo: TikTokLogo,          tokenLabel: 'Access token',     idFields: [{ name: 'pixel_code', label: 'Pixel Code' }] },
  // Field names must match CAPI_PLATFORMS.linkedin.idCols in api/routes/capi.js —
  // buildCapiUpdate rejects the request by field NAME, so a mismatch here surfaces as
  // "partner_id is required" on a form that appears filled in.
  { key: 'linkedin', label: 'LinkedIn',    Logo: LinkedInLogo,        tokenLabel: 'Access token',     idFields: [{ name: 'partner_id', label: 'Partner ID' }] }
]

function timeAgo(iso) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// The second line under the platform name. Promoted out of the body so a connected card
// answers "is this actually delivering?" at a glance instead of burying it in a stack of
// grey detail lines.
//
// §6 — this NEVER invents a timestamp. Three genuinely distinct states:
//   · not connected      -> no line at all (there is nothing true to say yet)
//   · connected, no runs  -> "No deliveries yet" (an honest empty state, not a fake time)
//   · connected, delivered -> the real status + relative age, with the exact instant on hover
function LastForwarded({ st }) {
  if (!st.connected) return null

  if (!st.last_delivery?.at) {
    return <p className="text-[11px] text-st-gray dark:text-gray-400 mt-0.5">No deliveries yet</p>
  }

  const failed = st.last_delivery.status && st.last_delivery.status !== 'success'
  return (
    <p
      className="text-[11px] mt-0.5 text-st-gray dark:text-gray-400"
      title={new Date(st.last_delivery.at).toLocaleString()}
    >
      Last forwarded{' '}
      <span className="font-medium text-st-black dark:text-dark-primary">{timeAgo(st.last_delivery.at)}</span>
      {failed && <span className="text-red-600 dark:text-red-400"> · {st.last_delivery.status}</span>}
    </p>
  )
}

// One shell for every card, so the OAuth card and the token cards cannot drift apart
// visually. Google keeps its three real states (they are a truthfulness decision, not a
// styling one) — what is unified is the frame around them: same icon slot, same title
// block, same badge position, same body offset. Before this, Google rendered a bare
// coloured <span> where the others rendered a different bare coloured <span>, and its
// taller three-state body broke the two-column grid.
function CapiCard({ platform, st, badge, children }) {
  const Logo = platform.Logo
  return (
    <div className="flex flex-col border border-gray-200 dark:border-dark-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Logo className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-st-black dark:text-dark-primary truncate">{platform.label}</h4>
            <LastForwarded st={st} />
          </div>
        </div>
        <StatusBadge status={badge.status} label={badge.label} className="shrink-0" />
      </div>
      {children}
    </div>
  )
}

// Google Ads card — OAuth, not a pasted token. Three honest states, deliberately not
// collapsed into one "connected" flag:
//   1. no OAuth grant        -> Connect (redirects to Google, same flow ad-cost import uses)
//   2. grant, no action id   -> connected for cost import, NOT yet forwarding conversions
//   3. grant + action id     -> forwarding
// State 2 is the one that matters: showing it as "Connected" would claim a forwarding path
// that sendGoogleConversion does not have (it no-ops without a conversion action).
function GoogleAdsCard({ platform, status, siteKey, onChanged }) {
  const [actionId, setActionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const st = status?.[platform.key] || {}

  async function connect() {
    setBusy(true); setMsg('')
    try {
      const res = await fetchApi(`/integrations/ad-platforms/google/auth-url?site_key=${siteKey}`)
      if (res?.url) { window.location.href = res.url; return }
      // The API answers not_configured when Google OAuth env is absent. Today that is the
      // expected state everywhere: no developer token has been issued and the `adwords`
      // scope has not cleared Google's sensitive-scope verification. Say so plainly rather
      // than showing a generic failure.
      if (res?.not_configured) setMsg('Google Ads connection is not available yet.')
      else setMsg(res?.error || 'Failed to start Google connection')
    } catch (e) { setMsg(e?.message || 'Error connecting to Google Ads') } finally { setBusy(false) }
  }

  async function saveActionId() {
    setBusy(true); setMsg('')
    try {
      const res = await fetchApi(`/integrations/capi/google?site_key=${siteKey}`, {
        method: 'POST',
        body: JSON.stringify({ conversion_action_id: actionId.trim() })
      })
      if (res?.data?.connected) { setMsg('Forwarding enabled.'); setActionId(''); onChanged() }
      else setMsg(res?.error || 'Failed to save')
    } catch (e) { setMsg(e?.message || 'Error saving') } finally { setBusy(false) }
  }

  async function stopForwarding() {
    // Deliberately explicit: this does NOT revoke the Google account connection, because
    // that same connection powers ad-cost import. Revoking lives on the Campaigns surface.
    if (!window.confirm('Stop forwarding conversions to Google Ads? Your Google Ads account stays connected for ad-cost import.')) return
    setBusy(true); setMsg('')
    try {
      await fetchApi(`/integrations/capi/google/disconnect?site_key=${siteKey}`, { method: 'POST', body: JSON.stringify({}) })
      onChanged()
    } catch (e) { setMsg(e?.message || 'Error') } finally { setBusy(false) }
  }

  // The three states map onto three DISTINCT badge tones. 'Action needed' stays amber and
  // stays its own state — collapsing it into success would claim a forwarding path
  // sendGoogleConversion does not have (it no-ops without a conversion action).
  const badge = st.connected
    ? { status: 'success', label: 'Forwarding' }
    : st.oauth_connected
      ? { status: 'warning', label: 'Action needed' }
      : { status: 'pending', label: 'Not connected' }

  return (
    <CapiCard platform={platform} st={st} badge={badge}>
      {!st.oauth_connected && (
        <div className="space-y-2">
          <p className="text-[11px] text-st-gray dark:text-gray-400">
            Connect your Google Ads account to upload offline conversions. Uses the same
            connection as ad-cost import — connect once.
          </p>
          <button onClick={connect} disabled={busy}
            className="text-xs px-3 py-1.5 bg-st-black dark:bg-white text-white dark:text-st-black rounded font-semibold disabled:opacity-50">
            {busy ? 'Connecting…' : 'Connect Google Ads'}
          </button>
        </div>
      )}

      {st.oauth_connected && !st.connected && (
        <div className="space-y-2">
          <p className="text-[11px] text-st-gray dark:text-gray-400">
            Account connected{st.customer_id ? <> (<span className="font-mono">{st.customer_id}</span>)</> : null}.
            Add a conversion action ID to start forwarding.
          </p>
          <input type="text" inputMode="numeric" placeholder="Conversion action ID" value={actionId}
            onChange={e => setActionId(e.target.value)}
            className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-card" />
          <button onClick={saveActionId} disabled={busy || !actionId.trim()}
            className="text-xs px-3 py-1.5 bg-st-black dark:bg-white text-white dark:text-st-black rounded font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : 'Enable forwarding'}
          </button>
        </div>
      )}

      {st.connected && (
        <div className="text-[11px] text-st-gray dark:text-gray-400 space-y-1">
          {st.customer_id ? <div>Customer ID: <span className="font-mono">{st.customer_id}</span></div> : null}
          <div>Conversion action: <span className="font-mono">{st.conversion_action_id}</span></div>
          <button onClick={stopForwarding} disabled={busy} className="mt-2 text-[11px] text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">Stop forwarding</button>
        </div>
      )}

      {msg && <p className="text-[11px] text-st-gray dark:text-gray-400 mt-2">{msg}</p>}
    </CapiCard>
  )
}

function PlatformCard({ platform, status, siteKey, onChanged }) {
  const [fields, setFields] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const st = status?.[platform.key] || {}

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }))

  async function save() {
    setBusy(true); setMsg('')
    try {
      const body = { token: fields.token || '' }
      for (const f of platform.idFields) body[f.name] = fields[f.name] || ''
      const res = await fetchApi(`/integrations/capi/${platform.key}?site_key=${siteKey}`, { method: 'POST', body: JSON.stringify(body) })
      if (res?.data?.connected) { setMsg('Connected.'); setFields({}); onChanged() }
      else setMsg(res?.error || 'Failed to save')
    } catch (e) { setMsg(e?.message || 'Error saving') } finally { setBusy(false) }
  }

  async function disconnect() {
    if (!window.confirm(`Disconnect ${platform.label}? This removes the stored token.`)) return
    setBusy(true); setMsg('')
    try {
      await fetchApi(`/integrations/capi/${platform.key}/disconnect?site_key=${siteKey}`, { method: 'POST', body: JSON.stringify({}) })
      onChanged()
    } catch (e) { setMsg(e?.message || 'Error') } finally { setBusy(false) }
  }

  const badge = st.connected
    ? { status: 'success', label: 'Connected' }
    : { status: 'pending', label: 'Not connected' }

  return (
    <CapiCard platform={platform} st={st} badge={badge}>
      {st.connected ? (
        <div className="text-[11px] text-st-gray dark:text-gray-400 space-y-1">
          {platform.idFields.map(f => st[f.name] ? <div key={f.name}>{f.label}: <span className="font-mono">{st[f.name]}</span></div> : null)}
          <button onClick={disconnect} disabled={busy} className="mt-2 text-[11px] text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">Disconnect</button>
        </div>
      ) : (
        <div className="space-y-2">
          {platform.idFields.map(f => (
            <input key={f.name} type="text" placeholder={f.label} value={fields[f.name] || ''}
              onChange={e => set(f.name, e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-card" />
          ))}
          <input type="password" placeholder={platform.tokenLabel} value={fields.token || ''}
            onChange={e => set('token', e.target.value)}
            className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-card" />
          <button onClick={save} disabled={busy} className="text-xs px-3 py-1.5 bg-st-black dark:bg-white text-white dark:text-st-black rounded font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : 'Connect'}
          </button>
        </div>
      )}
      {msg && <p className="text-[11px] text-st-gray dark:text-gray-400 mt-2">{msg}</p>}
    </CapiCard>
  )
}

export default function CapiSettings({ site }) {
  const siteKey = site?.site_key
  const { data, refetch } = useQuery({
    queryKey: ['capi-status', siteKey],
    queryFn: () => fetchApi(`/integrations/capi/status?site_key=${siteKey}`),
    enabled: !!siteKey
  })
  const status = data?.data || {}

  return (
    <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary mb-1">Server-side Conversions (CAPI)</h3>
      <p className="text-[11px] text-st-gray dark:text-gray-400 mb-4">
        Forward conversions server-side to ad platforms for better match quality. Default event mapping applies automatically.
        For non-order events, pass a stable <span className="font-mono">event_id</span> to dedupe against your browser pixel.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map(p => p.oauth
          ? <GoogleAdsCard key={p.key} platform={p} status={status} siteKey={siteKey} onChanged={refetch} />
          : <PlatformCard key={p.key} platform={p} status={status} siteKey={siteKey} onChanged={refetch} />
        )}
      </div>
    </div>
  )
}
