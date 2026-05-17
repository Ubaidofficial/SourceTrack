import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchApi } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, Globe, ExternalLink, Shield, Search, Eye, Activity, Info, RefreshCw, Clock, Plus, Trash2, Edit3 } from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import MetricTile from '../components/MetricTile'
import StatusBadge from '../components/StatusBadge'

export default function Admin() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [users, setUsers] = useState([])
  const [sites, setSites] = useState([])
  const [activeTab, setActiveTab] = useState('companies')
  const [loading, setLoading] = useState(true)
  const [siteDetailKey, setSiteDetailKey] = useState('')
  const [siteDetail, setSiteDetail] = useState(null)
  const [siteDetailLoading, setSiteDetailLoading] = useState(false)
  const [featureStatus, setFeatureStatus] = useState(null)
  const [featureLoading, setFeatureLoading] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [recheckDiffs, setRecheckDiffs] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [qaNotes, setQaNotes] = useState([])
  const [qaLoading, setQaLoading] = useState(false)
  const [qaFormMode, setQaFormMode] = useState(null)
  const [qaFormData, setQaFormData] = useState({ feature_key: '', note_type: 'watch', note_text: '' })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return

    const headers = { Authorization: `Bearer ${token}` }

    const [compRes, userRes, siteRes] = await Promise.all([
      fetchApi('/admin/companies', { headers }),
      fetchApi('/admin/users', { headers }),
      fetchApi('/admin/sites', { headers })
    ])

    if (compRes) setCompanies(compRes)
    if (userRes) setUsers(userRes)
    if (siteRes) setSites(siteRes)
    setLoading(false)
  }

  async function handlePreview(site) {
    sessionStorage.setItem('sourcetrack_admin_preview', JSON.stringify({
      site_key: site.site_key,
      site_name: site.name || site.domain,
      site_domain: site.domain,
      site_id: site.id
    }))
    navigate(`/dashboard?preview=${site.site_key}`)
  }

  async function loadSiteDetail() {
    if (!siteDetailKey) return
    setSiteDetailLoading(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const headers = { Authorization: `Bearer ${token}` }
      const data = await fetchApi(`/admin/site-detail?site_key=${encodeURIComponent(siteDetailKey)}`, { headers })
      setSiteDetail(data)
    } catch { setSiteDetail({ error: 'Failed to load site detail' }) }
    finally { setSiteDetailLoading(false) }
  }

  async function loadFeatureStatus() {
    setFeatureLoading(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const headers = { Authorization: `Bearer ${token}` }
      const data = await fetchApi('/admin/feature-status', { headers })
      setFeatureStatus(data)
    } catch { setFeatureStatus({ error: 'Failed to load feature status' }) }
    finally { setFeatureLoading(false) }
  }

  async function handleRecheck() {
    setRechecking(true)
    setRecheckDiffs(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      const data = await fetchApi('/admin/feature-status/recheck', { headers, method: 'POST' })
      setFeatureStatus(data)
      setRecheckDiffs(data.diffs || [])
    } catch { /* */ }
    finally { setRechecking(false) }
  }

  async function loadAuditLog() {
    setAuditLoading(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const headers = { Authorization: `Bearer ${token}` }
      const data = await fetchApi('/admin/audit-log', { headers })
      setAuditLog(data || [])
    } catch { setAuditLog([]) }
    finally { setAuditLoading(false) }
  }

  async function loadQaNotes() {
    setQaLoading(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const headers = { Authorization: `Bearer ${token}` }
      const data = await fetchApi('/admin/qa-notes', { headers })
      setQaNotes(data || [])
    } catch { setQaNotes([]) }
    finally { setQaLoading(false) }
  }

  async function handleQaSave() {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      if (qaFormMode === 'edit') {
        await fetchApi(`/admin/qa-notes/${qaFormData.id}`, { headers, method: 'PUT', body: { note_text: qaFormData.note_text, note_type: qaFormData.note_type } })
      } else {
        await fetchApi('/admin/qa-notes', { headers, method: 'POST', body: qaFormData })
      }
      setQaFormMode(null)
      setQaFormData({ feature_key: '', note_type: 'watch', note_text: '' })
      loadQaNotes()
    } catch { /* */ }
  }

  async function handleQaDelete(id) {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const headers = { Authorization: `Bearer ${token}` }
      await fetchApi(`/admin/qa-notes/${id}`, { headers, method: 'DELETE' })
      loadQaNotes()
    } catch { /* */ }
  }

  useEffect(() => {
    if (activeTab === 'feature_status' && !featureStatus) loadFeatureStatus()
  }, [activeTab, featureStatus])

  useEffect(() => {
    if (activeTab === 'audit_log') loadAuditLog()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'qa_notes') loadQaNotes()
  }, [activeTab])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
      </div>
    )
  }

  const totalCompanies = companies.length
  const totalUsers = users.length
  const totalSites = sites.length
  const verifiedSites = sites.filter(s => s.onboarding_completed).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Super Admin</h2>
          <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">Internal workspace overview</p>
        </div>
        <StatusBadge status="verified" label="Super Admin" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Companies" value={totalCompanies.toLocaleString()}
          icon={Building2} iconBg="bg-lime-100" iconColor="text-lime-700" />
        <MetricTile label="Users" value={totalUsers.toLocaleString()}
          icon={Users} iconBg="bg-blue-100" iconColor="text-blue-600" />
        <MetricTile label="Sites" value={totalSites.toLocaleString()}
          icon={Globe} iconBg="bg-green-100" iconColor="text-green-600" />
        <MetricTile label="Verified" value={verifiedSites.toLocaleString()}
          icon={Shield} iconBg="bg-purple-100" iconColor="text-purple-600" />
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {['companies', 'users', 'sites', 'site_inspector', 'feature_status', 'qa_notes', 'audit_log'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-st-black text-st-black'
                : 'border-transparent text-st-gray dark:text-gray-400 hover:text-gray-700'
            }`}>
            {tab === 'site_inspector' ? 'Site Inspector' : tab === 'feature_status' ? 'Features' : tab === 'qa_notes' ? 'QA Notes' : tab === 'audit_log' ? 'Audit Log' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'companies' && (
        <DashboardCard title="Companies" subtitle={`${totalCompanies} total`}>
          {companies.length === 0 ? (
            <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No companies yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Name</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Members</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Sites</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Created</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-st-black dark:text-white font-medium">{c.name}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{c.member_count}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{c.site_count}</td>
                    <td className="py-2.5 px-3 text-right text-st-gray dark:text-gray-400 text-xs">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DashboardCard>
      )}

      {activeTab === 'users' && (
        <DashboardCard title="Users" subtitle={`${totalUsers} total`}>
          {users.length === 0 ? (
            <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No users yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Email</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Company</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Role</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-st-black">{u.email}</td>
                    <td className="py-2.5 px-3 text-gray-600">{u.company_name || '—'}</td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={u.role === 'admin' ? 'active' : 'pending'} label={u.role || 'none'} />
                    </td>
                    <td className="py-2.5 px-3 text-right text-st-gray dark:text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DashboardCard>
      )}

      {activeTab === 'sites' && (
        <DashboardCard title="Sites" subtitle={`${totalSites} total · ${verifiedSites} verified`}>
          {sites.length === 0 ? (
            <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No sites yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Domain</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Company</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Plan</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Onboarding</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-st-black dark:text-white truncate max-w-[200px]">{s.domain || s.name}</td>
                    <td className="py-2.5 px-3 text-gray-600">{s.company_name || '—'}</td>
                    <td className="py-2.5 px-3">
                      <StatusBadge
                        status={s.plan === 'pro' ? 'active' : s.plan === 'trial' ? 'pending' : 'error'}
                        label={s.plan}
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge
                        status={s.onboarding_completed ? 'verified' : 'pending'}
                        label={s.onboarding_completed ? 'Complete' : 'In progress'}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button onClick={() => handlePreview(s)}
                        className="text-xs text-st-black dark:text-white hover:text-gray-700 font-medium flex items-center gap-1 ml-auto">
                        <ExternalLink className="w-3 h-3" /> Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DashboardCard>
      )}

      {activeTab === 'site_inspector' && (
        <div className="space-y-6">
          <DashboardCard title="Site Inspector" subtitle="Look up detailed install and onboarding state by site key">
            <div className="flex gap-3">
              <input
                type="text"
                value={siteDetailKey}
                onChange={(e) => setSiteDetailKey(e.target.value)}
                placeholder="Site key (e.g., a1b2c3d4-...)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                onKeyDown={(e) => e.key === 'Enter' && loadSiteDetail()}
              />
              <button onClick={loadSiteDetail}
                disabled={siteDetailLoading || !siteDetailKey}
                className="px-4 py-2 bg-st-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
                <Search className="w-4 h-4" /> Lookup
              </button>
            </div>
          </DashboardCard>

          {siteDetailLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
            </div>
          )}

          {siteDetail && !siteDetail.error && (
            <div className="space-y-4">
              <DashboardCard title="Site Info" subtitle={`${siteDetail.site?.domain || siteDetail.site?.name || 'Unnamed'}`}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-st-gray">Site Key</p><p className="font-mono text-xs text-st-black dark:text-white truncate">{siteDetail.site?.site_key}</p></div>
                  <div><p className="text-xs text-st-gray">Plan</p><StatusBadge status={siteDetail.site?.plan === 'pro' ? 'active' : siteDetail.site?.plan === 'trial' ? 'pending' : 'error'} label={siteDetail.site?.plan || 'unknown'} /></div>
                  <div><p className="text-xs text-st-gray">Created</p><p className="text-st-black">{siteDetail.site?.created_at ? new Date(siteDetail.site.created_at).toLocaleDateString() : '—'}</p></div>
                  <div><p className="text-xs text-st-gray">Company</p><p className="text-st-black">{siteDetail.site?.company_name || '—'}</p></div>
                  <div><p className="text-xs text-st-gray">Owner Email</p><p className="text-st-black">{siteDetail.site?.owner_email || '—'}</p></div>
                  <div><p className="text-xs text-st-gray">Domain</p><p className="text-st-black">{siteDetail.site?.domain || '—'}</p></div>
                </div>
              </DashboardCard>

              <DashboardCard title="Onboarding" subtitle={`Step: ${siteDetail.onboarding?.state?.current_step || 1} · Completed: ${siteDetail.onboarding?.completed ? 'Yes' : 'No'}`}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-st-gray">Business Type</p><p className="text-st-black">{siteDetail.onboarding?.state?.business_type || '—'}</p></div>
                  <div><p className="text-xs text-st-gray">Install Method</p><p className="text-st-black">{siteDetail.onboarding?.state?.install_method || '—'}</p></div>
                  <div className="col-span-2"><p className="text-xs text-st-gray">Selected Conversions</p><p className="text-st-black">{(siteDetail.onboarding?.state?.selected_conversions || []).join(', ') || '—'}</p></div>
                  <div><p className="text-xs text-st-gray">Completed</p><StatusBadge status={siteDetail.onboarding?.completed ? 'verified' : 'pending'} label={siteDetail.onboarding?.completed ? 'Yes' : 'No'} /></div>
                </div>
              </DashboardCard>

              <DashboardCard title="Install Verification" subtitle="Live tracking status from PostHog">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-st-gray">Status</p><StatusBadge status={siteDetail.install?.status === 'verified' ? 'verified' : siteDetail.install?.status === 'not_installed' ? 'pending' : 'error'} label={siteDetail.install?.status || 'unknown'} /></div>
                  <div><p className="text-xs text-st-gray">Last Event Type</p><p className="text-st-black">{siteDetail.install?.last_event_type || '—'}</p></div>
                  <div><p className="text-xs text-st-gray">Last Event At</p><p className="text-st-black">{siteDetail.install?.last_event_timestamp ? new Date(siteDetail.install.last_event_timestamp).toLocaleString() : '—'}</p></div>
                  <div><p className="text-xs text-st-gray">Domain</p><p className="text-st-black">{siteDetail.install?.domain || '—'}</p></div>
                </div>
              </DashboardCard>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    sessionStorage.setItem('sourcetrack_admin_preview', JSON.stringify({
                      site_key: siteDetail.site?.site_key,
                      site_name: siteDetail.site?.name || siteDetail.site?.domain,
                      site_domain: siteDetail.site?.domain,
                      site_id: siteDetail.site?.id
                    }))
                    navigate(`/dashboard?preview=${siteDetail.site?.site_key}`)
                  }}
                  className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Preview Dashboard
                </button>
              </div>
            </div>
          )}

          {siteDetail?.error && (
            <p className="text-sm text-red-600">{siteDetail.error}</p>
          )}
        </div>
      )}

      {activeTab === 'feature_status' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-st-gray">
              {featureStatus?.last_verified ? (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last verified: {new Date(featureStatus.last_verified).toLocaleString()}
                </span>
              ) : 'Loading provenance...'}
            </p>
            <button
              onClick={handleRecheck}
              disabled={rechecking}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1A1D1D] border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252929] flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} />
              {rechecking ? 'Rechecking...' : 'Recheck All Features'}
            </button>
          </div>

          {recheckDiffs && recheckDiffs.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-800 mb-1">Status changes detected:</p>
              <ul className="space-y-1">
                {recheckDiffs.map((d, i) => (
                  <li key={i} className="text-xs text-amber-700">
                    {d.feature}: <span className="line-through">{d.previous}</span> → <span className="font-medium">{d.current}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {featureLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
            </div>
          ) : featureStatus?.features ? (
            <DashboardCard title="Feature Status" subtitle="Internal truth panel — current implementation state">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Feature</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Status</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Method</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {featureStatus.features.map((f) => (
                    <tr key={f.name} className="border-b border-gray-50">
                      <td className="py-2.5 px-3 text-st-black dark:text-white font-medium">{f.name}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge
                          status={f.status === 'live' ? 'verified' :
                                  f.status === 'partial' ? 'pending' :
                                  f.status === 'dormant' ? 'warning' :
                                  f.status === 'internal-only' ? 'active' : 'error'}
                          label={f.status.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-2.5 px-3 text-xs text-st-gray">{f.verification_method || 'static-audit'}</td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">{f.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DashboardCard>
          ) : featureStatus?.error ? (
            <p className="text-sm text-red-600">{featureStatus.error}</p>
          ) : null}
        </div>
      )}

      {activeTab === 'qa_notes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-st-gray">Editable truthfulness notes — persisted to database</p>
            <button
              onClick={() => { setQaFormMode('create'); setQaFormData({ feature_key: '', note_type: 'watch', note_text: '' }) }}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1A1D1D] border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252929] flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Note
            </button>
          </div>

          {qaFormMode && (
            <DashboardCard title={qaFormMode === 'edit' ? 'Edit Note' : 'New Note'}>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-st-gray dark:text-gray-400 mb-1">Feature Key</label>
                  <input
                    type="text"
                    value={qaFormData.feature_key}
                    onChange={(e) => setQaFormData({ ...qaFormData, feature_key: e.target.value })}
                    placeholder="e.g. widgetized_dashboard"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-st-gray dark:text-gray-400 mb-1">Type</label>
                  <select
                    value={qaFormData.note_type}
                    onChange={(e) => setQaFormData({ ...qaFormData, note_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="safe_claim">Safe Claim</option>
                    <option value="watch">Watch Item</option>
                    <option value="misleading">Misleading if Claimed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-st-gray dark:text-gray-400 mb-1">Note</label>
                  <textarea
                    value={qaFormData.note_text}
                    onChange={(e) => setQaFormData({ ...qaFormData, note_text: e.target.value })}
                    placeholder="Describe the claim, watch item, or misleading statement..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleQaSave} className="px-4 py-2 bg-st-black text-white rounded-lg text-sm hover:bg-gray-800">
                    Save
                  </button>
                  <button onClick={() => setQaFormMode(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-[#252929] rounded-lg hover:bg-gray-200">
                    Cancel
                  </button>
                </div>
              </div>
            </DashboardCard>
          )}

          {qaLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
            </div>
          ) : (
            <DashboardCard title="QA Notes" subtitle={`${qaNotes.length} note${qaNotes.length !== 1 ? 's' : ''}`}>
              {qaNotes.length === 0 ? (
                <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No QA notes yet. Add one above.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Feature</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Type</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Note</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qaNotes.map((n) => (
                      <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-st-black dark:text-white font-medium">{n.feature_key}</td>
                        <td className="py-2.5 px-3">
                          <StatusBadge
                            status={n.note_type === 'safe_claim' ? 'verified' : n.note_type === 'misleading' ? 'error' : 'warning'}
                            label={n.note_type.replace(/_/g, ' ')}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">{n.note_text}</td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => { setQaFormMode('edit'); setQaFormData({ id: n.id, feature_key: n.feature_key, note_type: n.note_type, note_text: n.note_text }) }}
                              className="p-1.5 text-st-gray dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-[#2A2E2E] rounded transition-colors"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleQaDelete(n.id)}
                              className="p-1.5 text-st-gray dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:bg-red-900/20 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashboardCard>
          )}
        </div>
      )}

      {activeTab === 'audit_log' && (
        <div className="space-y-4">
          {auditLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
            </div>
          ) : (
            <DashboardCard title="Audit Log" subtitle={`${auditLog.length} recent admin actions`}>
              {auditLog.length === 0 ? (
                <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No audit entries yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Time</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Admin</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Action</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-st-gray dark:text-gray-400 text-xs whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-st-black">{entry.admin_email || entry.admin_user_id?.slice(0, 8) || '—'}</td>
                        <td className="py-2.5 px-3">
                          <StatusBadge
                            status={entry.action === 'recheck_features' ? 'warning' : 'active'}
                            label={entry.action.replace(/_/g, ' ')}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 text-xs">
                          {entry.target_type ? `${entry.target_type}: ${entry.target_id || '—'}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashboardCard>
          )}
        </div>
      )}
    </div>
  )
}
