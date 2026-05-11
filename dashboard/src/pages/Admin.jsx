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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
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
          <h2 className="text-2xl font-bold text-gray-900">Super Admin</h2>
          <p className="text-sm text-gray-500 mt-0.5">Internal workspace overview</p>
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
        {['companies', 'users', 'sites', 'site_inspector', 'feature_status', 'qa_notes'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab === 'site_inspector' ? 'Site Inspector' : tab === 'feature_status' ? 'Features' : tab === 'qa_notes' ? 'QA Notes' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'companies' && (
        <DashboardCard title="Companies" subtitle={`${totalCompanies} total`}>
          {companies.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No companies yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Name</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Members</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Sites</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-900 font-medium">{c.name}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{c.member_count}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{c.site_count}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500 text-xs">
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
            <p className="text-sm text-gray-400 py-6 text-center">No users yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Email</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Company</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Role</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-900">{u.email}</td>
                    <td className="py-2.5 px-3 text-gray-600">{u.company_name || '—'}</td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={u.role === 'admin' ? 'active' : 'pending'} label={u.role || 'none'} />
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-500 text-xs">
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
            <p className="text-sm text-gray-400 py-6 text-center">No sites yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Domain</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Company</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Plan</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Onboarding</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-900 truncate max-w-[200px]">{s.domain || s.name}</td>
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
                        className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1 ml-auto">
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
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
                <Search className="w-4 h-4" /> Lookup
              </button>
            </div>
          </DashboardCard>

          {siteDetailLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          )}

          {siteDetail && !siteDetail.error && (
            <div className="space-y-4">
              <DashboardCard title="Site Info" subtitle={`${siteDetail.site?.domain || siteDetail.site?.name || 'Unnamed'}`}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Site Key</p><p className="font-mono text-xs text-gray-900 truncate">{siteDetail.site?.site_key}</p></div>
                  <div><p className="text-xs text-gray-500">Plan</p><StatusBadge status={siteDetail.site?.plan === 'pro' ? 'active' : siteDetail.site?.plan === 'trial' ? 'pending' : 'error'} label={siteDetail.site?.plan || 'unknown'} /></div>
                  <div><p className="text-xs text-gray-500">Created</p><p className="text-gray-900">{siteDetail.site?.created_at ? new Date(siteDetail.site.created_at).toLocaleDateString() : '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Company</p><p className="text-gray-900">{siteDetail.site?.company_name || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Owner Email</p><p className="text-gray-900">{siteDetail.site?.owner_email || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Domain</p><p className="text-gray-900">{siteDetail.site?.domain || '—'}</p></div>
                </div>
              </DashboardCard>

              <DashboardCard title="Onboarding" subtitle={`Step: ${siteDetail.onboarding?.state?.current_step || 1} · Completed: ${siteDetail.onboarding?.completed ? 'Yes' : 'No'}`}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Business Type</p><p className="text-gray-900">{siteDetail.onboarding?.state?.business_type || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Install Method</p><p className="text-gray-900">{siteDetail.onboarding?.state?.install_method || '—'}</p></div>
                  <div className="col-span-2"><p className="text-xs text-gray-500">Selected Conversions</p><p className="text-gray-900">{(siteDetail.onboarding?.state?.selected_conversions || []).join(', ') || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Completed</p><StatusBadge status={siteDetail.onboarding?.completed ? 'verified' : 'pending'} label={siteDetail.onboarding?.completed ? 'Yes' : 'No'} /></div>
                </div>
              </DashboardCard>

              <DashboardCard title="Install Verification" subtitle="Live tracking status from PostHog">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Status</p><StatusBadge status={siteDetail.install?.status === 'verified' ? 'verified' : siteDetail.install?.status === 'not_installed' ? 'pending' : 'error'} label={siteDetail.install?.status || 'unknown'} /></div>
                  <div><p className="text-xs text-gray-500">Last Event Type</p><p className="text-gray-900">{siteDetail.install?.last_event_type || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Last Event At</p><p className="text-gray-900">{siteDetail.install?.last_event_timestamp ? new Date(siteDetail.install.last_event_timestamp).toLocaleString() : '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Domain</p><p className="text-gray-900">{siteDetail.install?.domain || '—'}</p></div>
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
          {featureLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : featureStatus?.features ? (
            <DashboardCard title="Feature Status" subtitle="Internal truth panel — current implementation state">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Feature</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Status</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {featureStatus.features.map((f) => (
                    <tr key={f.name} className="border-b border-gray-50">
                      <td className="py-2.5 px-3 text-gray-900 font-medium">{f.name}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge
                          status={f.status === 'live' ? 'verified' :
                                  f.status === 'partial' ? 'pending' :
                                  f.status === 'dormant' ? 'warning' :
                                  f.status === 'internal-only' ? 'active' : 'error'}
                          label={f.status.replace(/_/g, ' ')}
                        />
                      </td>
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
        <div className="space-y-6">
          <DashboardCard title="QA Notes — Safe Claims" subtitle="What can truthfully be stated about the product">
            <ul className="space-y-2 text-sm text-gray-700">
              {(featureStatus?.qa_notes?.safe_claims || [
                'Single-touch attribution with 5 models',
                'AI platform detection via deterministic referrer matching',
                'AI Chat is a HogQL query assistant',
                'Dashboard is a fixed card grid (not widgetized)',
                'LTV is cumulative historical revenue, not predictive',
                'Install flow is complete with honest limitations'
              ]).map((claim, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">✓</span> {claim}
                </li>
              ))}
            </ul>
          </DashboardCard>

          <DashboardCard title="QA Notes — Would Be Misleading" subtitle="Claims that would not match current product reality">
            <ul className="space-y-2 text-sm text-gray-700">
              {(featureStatus?.qa_notes?.misleading_if_claimed || [
                'Multi-dashboard system with CRUD',
                'Widgetized dashboard with drag-and-drop',
                'Cross-platform ad-account analyst in AI Chat',
                'Linear attribution',
                'Consent-aware tracking pipeline'
              ]).map((claim, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">✗</span> {claim}
                </li>
              ))}
            </ul>
          </DashboardCard>

          <DashboardCard title="QA Notes — Watch Items" subtitle="Dormant code, stale data, or things worth checking">
            <ul className="space-y-2 text-sm text-gray-700">
              {(featureStatus?.qa_notes?.watch_items || [
                'sourcetrack_dashboard_widgets_staging localStorage key',
                'dashboard_widgets table in schema (unused)',
                'Reports are localStorage-only',
                'AI_SOURCES frontend constant only lists 7/10 platforms'
              ]).map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </DashboardCard>
        </div>
      )}
    </div>
  )
}
