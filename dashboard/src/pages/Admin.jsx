import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchApi } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, Globe, ExternalLink, Shield } from 'lucide-react'
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
    const token = (await supabase.auth.getSession()).data.session?.access_token
    sessionStorage.setItem('sourcetrack_admin_preview', JSON.stringify({
      site_key: site.site_key,
      site_name: site.name || site.domain,
      site_id: site.id
    }))
    navigate(`/dashboard?preview=${site.site_key}`)
  }

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
        {['companies', 'users', 'sites'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
    </div>
  )
}
