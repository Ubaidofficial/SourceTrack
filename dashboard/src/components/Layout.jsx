import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileBarChart, Settings, Users, BarChart3, Plug, LogOut, Menu, X, Shield,
  Sun, Moon, ChevronDown, Megaphone, ListChecks, Bell
} from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useSite } from '../contexts/SiteContext'
import { LogoFull, LogoFullDark } from './Logo'
import SupportModeBanner from './SupportModeBanner'
import AlertDrawer from './AlertDrawer'

// "Install" removed: Integrations already surfaces the snippet + "Full Setup Guide" link,
// making a separate top-level Install entry redundant.
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/setup',         label: 'Setup & Health', icon: ListChecks },
      { to: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
      { to: '/analytics',     label: 'Analytics',    icon: BarChart3 },
      { to: '/app/attribution',   label: 'Attribution',  icon: FileBarChart },
      { to: '/leads',         label: 'All Leads',    icon: Users },
      { to: '/campaigns',     label: 'Campaigns',    icon: Megaphone },
      { to: '/report-builder', label: 'Report Builder', icon: FileBarChart },
      { to: '/app/integrations', label: 'Integrations', icon: Plug },
      { to: '/settings',      label: 'Settings',    icon: Settings },
    ],
  }
]

const PAGE_TITLES = {
  '/setup': 'Setup & Health',
  '/dashboard': 'Dashboard',
  '/analytics': 'Analytics',
  '/app/attribution': 'Attribution',
  '/leads': 'All Leads',
  '/campaigns': 'Campaigns',
  '/report-builder': 'Report Builder',
  '/journey': 'Visitor Journeys',
  '/ai-analytics': 'AI Analytics',
  '/app/integrations': 'Integrations',
  '/snippet': 'Install Tracking',
  '/debugger': 'Live Events',
  '/settings': 'Settings',
  '/ops': 'Ops Console'
}

export default function Layout({ children }) {
  const { signOut, user, role } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { sites, activeSite, setActiveSiteKey, loading: sitesLoading } = useSite()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const isPreview = activeSite?.support_preview || false

  // Anomaly-watcher alerts for the bell badge — undismissed only, 60s stale.
  const { data: alertsData } = useQuery({
    queryKey: ['site-alerts', activeSite?.site_key],
    queryFn: async () => {
      if (!activeSite?.site_key) return null
      return fetchApi(`/site-alerts?site_key=${encodeURIComponent(activeSite.site_key)}`)
    },
    enabled: !!activeSite?.site_key,
    staleTime: 60000,
    retry: false,
  })
  const alerts = alertsData?.data?.alerts || []
  const alertCount = alerts.length

  // Query setup diagnostics for active site safely, silently, and without polling
  const { data: doctorData } = useQuery({
    queryKey: ['setup-doctor', activeSite?.site_key],
    queryFn: async () => {
      if (!activeSite?.site_key) return null
      return fetchApi(`/install/doctor?site_key=${encodeURIComponent(activeSite.site_key)}`)
    },
    enabled: !!activeSite?.site_key,
    staleTime: 30000,
    retry: false,
  })

  // Calculate badge/dot setup state
  let setupBadgeDot = null
  if (activeSite) {
    const diagnostics = doctorData?.data ?? doctorData ?? null
    if (!diagnostics) {
      if (!activeSite.last_seen_at || activeSite.onboarding_completed === false) {
        setupBadgeDot = 'bg-amber-500'
      }
    } else {
      const hasFirstEvent = !!activeSite.last_seen_at || !!diagnostics?.tracker_install?.last_seen_at
      const hasVerifiedDomain = diagnostics?.domain_match?.status === 'passed' || diagnostics?.domain_match?.event_domain === diagnostics?.domain_match?.registered_domain
      const hasConversion = diagnostics?.conversion_setup?.detected || !!diagnostics?.checks?.find(c => c.label === 'Conversion tracking' && c.status === 'passed')
      const isHealthy = diagnostics?.status === 'healthy' && hasVerifiedDomain && hasConversion
      if (isHealthy) {
        setupBadgeDot = 'bg-green-500'
      } else {
        setupBadgeDot = 'bg-amber-500'
      }
    }
  }

  if (location.pathname === '/onboarding') {
    return <>{children}</>
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const pageTitle = PAGE_TITLES[location.pathname] || ''

  return (
    <>
    <div className="flex h-screen bg-gray-50 dark:bg-dark-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white dark:bg-dark-card border-r border-gray-200 dark:border-dark-border flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2">
            <LogoFull className="h-7 w-auto dark:hidden" />
            <LogoFullDark className="h-7 w-auto hidden dark:block" />
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-st-gray dark:text-gray-400" />
          </button>
        </div>

        {/* Site Switcher */}
        {role !== 'super_admin' ? (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50/30 dark:bg-dark-hover/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600 mb-1 select-none">
              Active Site
            </p>
            {sitesLoading ? (
              <div className="h-9 animate-pulse bg-gray-200 dark:bg-dark-hover rounded-lg" />
            ) : sites.length > 1 ? (
              <div className="relative group">
                <select
                  value={activeSite?.site_key || ''}
                  onChange={(e) => setActiveSiteKey(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 text-xs font-semibold text-st-black dark:text-white bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-sm hover:border-st-lime dark:hover:border-st-lime focus:outline-none focus:ring-1 focus:ring-st-lime transition-all appearance-none cursor-pointer font-sans"
                >
                  {sites.map((s) => (
                    <option key={s.site_key || s.id} value={s.site_key || s.id}>
                      {s.name || s.domain}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none">
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 group-hover:text-st-lime transition-colors" />
                </div>
              </div>
            ) : sites.length === 1 ? (
              <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-sm">
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-xs font-semibold text-st-black dark:text-white truncate">{activeSite?.name || activeSite?.domain}</p>
                  <p className="text-[9px] font-mono text-st-gray dark:text-gray-500 truncate">{activeSite?.site_key}</p>
                </div>
                {activeSite?.last_seen_at && (
                  <span className="w-1.5 h-1.5 rounded-full bg-st-lime animate-pulse shrink-0 ml-2" title="Active telemetry detected" />
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setSidebarOpen(false)
                  navigate('/onboarding')
                }}
                className="w-full px-3 py-1.5 text-xs font-semibold text-center text-st-black bg-st-lime hover:bg-st-lime/90 rounded-lg shadow-sm transition-colors"
              >
                + Add New Site
              </button>
            )}
            {activeSite && activeSite.onboarding_completed === false && activeSite.id && (
              <button
                onClick={() => {
                  setSidebarOpen(false)
                  navigate(`/onboarding?site_id=${activeSite.id}&mode=onboarding`)
                }}
                className="mt-2 w-full px-3 py-1.5 text-[11px] font-semibold text-center text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors"
              >
                Resume setup
              </button>
            )}
          </div>
        ) : isPreview ? (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900/30">
            <div className="flex items-center justify-between mb-1 select-none">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Active Site
              </p>
              <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-widest">Preview</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-dark-card border border-emerald-100 dark:border-emerald-900/30 rounded-lg shadow-sm">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-xs font-semibold text-st-black dark:text-white truncate">{activeSite?.name || activeSite?.domain || 'Preview Site'}</p>
                {activeSite?.domain && <p className="text-[9px] font-mono text-st-gray dark:text-gray-500 truncate">{activeSite?.domain}</p>}
              </div>
            </div>
          </div>
        ) : null}

        <nav className="flex-1 p-3 overflow-y-auto space-y-4">
          {role !== 'super_admin' || isPreview ? NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-st-lime text-st-black dark:bg-dark-hover dark:text-st-lime'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover hover:text-st-black dark:hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                    {label === 'Setup' && setupBadgeDot && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-auto ${setupBadgeDot}`} />
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )) : null}
          {role === 'super_admin' && (
            <div>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 select-none">
                Internal
              </p>
              <NavLink
                to="/ops"
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-st-lime text-st-black dark:bg-dark-hover dark:text-st-lime'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover hover:text-st-black dark:hover:text-white'
                  }`
                }
              >
                <Shield className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Ops Console</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-dark-border">
          <div className="text-xs text-st-gray dark:text-gray-400 mb-1 truncate">{user?.email}</div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="h-14 flex items-center justify-between px-6 bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            {pageTitle && (
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-st-black dark:text-white">{pageTitle}</h2>
                {location.pathname === '/dashboard' && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-st-lime/20 text-st-black rounded-full">Live</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Alerts bell */}
            <button
              onClick={() => setAlertsOpen(true)}
              className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              aria-label={alertCount > 0 ? `Alerts (${alertCount} unread)` : 'Alerts'}
            >
              <Bell className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <Moon className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>
        </header>

        <AlertDrawer
          isOpen={alertsOpen}
          onClose={() => setAlertsOpen(false)}
          siteKey={activeSite?.site_key}
          alerts={alerts}
        />

        {isPreview && (
          <SupportModeBanner
            siteName={activeSite?.name}
            siteDomain={activeSite?.domain}
          />
        )}

        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
    </>
  )
}
