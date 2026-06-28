import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'

// Minimal functional CAPI config surface (Phase 2). Per-platform: connect a
// server-side conversion API token, see connected state + last delivery,
// disconnect. Tokens are write-only — never returned by the API.
const PLATFORMS = [
  { key: 'meta',   label: 'Meta CAPI',     tokenLabel: 'Access token',     idFields: [{ name: 'pixel_id', label: 'Pixel ID' }] },
  { key: 'google', label: 'Google Ads',    tokenLabel: 'Developer token',  idFields: [{ name: 'customer_id', label: 'Customer ID' }, { name: 'conversion_action_id', label: 'Conversion action ID' }] }
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

  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-st-black dark:text-white">{platform.label}</h4>
        <span className={`text-[11px] font-semibold ${st.connected ? 'text-green-600 dark:text-green-400' : 'text-st-gray dark:text-gray-400'}`}>
          {st.connected ? 'Connected' : 'Not connected'}
        </span>
      </div>
      {st.connected ? (
        <div className="text-[11px] text-st-gray dark:text-gray-400 space-y-1">
          {platform.idFields.map(f => st[f.name] ? <div key={f.name}>{f.label}: <span className="font-mono">{st[f.name]}</span></div> : null)}
          <div>Last forwarded: {st.last_delivery ? `${st.last_delivery.status} · ${timeAgo(st.last_delivery.at)}` : 'no deliveries yet'}</div>
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
    </div>
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
      <h3 className="text-sm font-semibold text-st-black dark:text-white mb-1">Server-side Conversions (CAPI)</h3>
      <p className="text-[11px] text-st-gray dark:text-gray-400 mb-4">
        Forward conversions server-side to ad platforms for better match quality. Default event mapping applies automatically.
        For non-order events, pass a stable <span className="font-mono">event_id</span> to dedupe against your browser pixel.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map(p => (
          <PlatformCard key={p.key} platform={p} status={status} siteKey={siteKey} onChanged={refetch} />
        ))}
      </div>
    </div>
  )
}
