import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileBarChart, Route, MessageSquare, Code, Bug, Settings,
  Users, BarChart3, Plug, LogOut, Menu, X, Bot, Shield, TrendingUp, Activity,
  AlertTriangle, Send, Sun, Moon, CreditCard, BookOpen, ChevronDown
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useSite } from '../contexts/SiteContext'
import { supabase } from '../lib/supabase'
import { LogoFull, LogoFullDark } from './Logo'

// ── Grouped nav — replaces flat 14-item list ─────────────────────────────────
// "Install" removed: Integrations already surfaces the snippet + "Full Setup Guide" link,
// making a separate top-level Install entry redundant.
// Items grouped into 4 logical sections so the nav is scannable at a glance.
const NAV_GROUPS = [
  {
    label: null, // no heading for primary views
    items: [
      { to: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
      { to: '/analytics',     label: 'Analytics',    icon: Activity },
      { to: '/ai-analytics',  label: 'AI Analytics', icon: TrendingUp },
      { to: '/campaigns',     label: 'Campaigns',    icon: BarChart3 },
      { to: '/leads',         label: 'Leads',        icon: Users },
    ],
  },
  {
    label: 'Attribution',
    items: [
      { to: '/report-builder', label: 'Reports',   icon: FileBarChart },
      { to: '/journey',        label: 'Journeys',  icon: Route },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/integrations', label: 'Integrations', icon: Plug },
      { to: '/debugger',     label: 'Live Events',  icon: Bug },
      { to: '/data-quality', label: 'Data Quality', icon: Shield },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/settings', label: 'Settings',  icon: Settings },
      { to: '/billing',  label: 'Billing',   icon: CreditCard },
      { to: '/docs',     label: 'API Docs',  icon: BookOpen },
    ],
  },
]

const PAGE_TITLES = {
  '/dashboard': 'Performance Overview',
  '/leads': 'Leads',
  '/campaigns': 'Campaigns & Attribution',
  '/report-builder': 'Report Builder',
  '/journey': 'Visitor Journeys',
  '/ai-analytics': 'AI Analytics',
  '/analytics': 'Analytics',
  '/integrations': 'Integrations',
  '/snippet': 'Install Tracking',
  '/debugger': 'Live Events',
  '/settings': 'Settings',
  '/admin': 'Super Admin'
}

export default function Layout({ children }) {
  const { signOut, user, role } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { sites, activeSite, setActiveSiteKey, loading: sitesLoading } = useSite()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen]   = useState(false)
  const [trialInfo, setTrialInfo]     = useState(null)

  useEffect(() => {
    if (!user || !activeSite) {
      setTrialInfo(null)
      return
    }
    // Skip trial banner for super admins — they're internal accounts.
    if (user.raw_app_meta_data?.role === 'super_admin') return
    // Only show the trial countdown banner for actual trial accounts.
    if (activeSite.plan === 'trial') {
      const end  = new Date(new Date(activeSite.created_at).getTime() + 14 * 86400000)
      const endDate = end ? new Date(end) : null
      const days = endDate && !isNaN(endDate) ? Math.ceil((endDate - new Date()) / 86400000) : 0
      setTrialInfo({ daysLeft: Math.max(0, days) })
    } else {
      setTrialInfo(null)
    }
  }, [user, activeSite])

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
                  <option key={s.site_key} value={s.site_key}>
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
        </div>

        <nav className="flex-1 p-3 overflow-y-auto space-y-4">
          {NAV_GROUPS.map((group, gi) => (
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
                          ? 'bg-st-lime text-st-black'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover hover:text-st-black dark:hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          {role === 'super_admin' && (
            <div>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 select-none">
                Super Admin
              </p>
              <NavLink
                to="/admin"
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-st-lime text-st-black'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover hover:text-st-black dark:hover:text-white'
                  }`
                }
              >
                <Shield className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Admin</span>
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
            
            {trialInfo !== null && (
              trialInfo.daysLeft > 3 ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  {trialInfo.daysLeft} day{trialInfo.daysLeft === 1 ? '' : 's'} left in trial
                </span>
              ) : trialInfo.daysLeft > 0 ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full animate-pulse">
                  <AlertTriangle className="w-3 h-3" />
                  {trialInfo.daysLeft} day{trialInfo.daysLeft === 1 ? '' : 's'} left — upgrade now
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 px-2.5 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Trial expired
                </span>
              )
            )}
            {trialInfo !== null && (
              <button
                onClick={() => navigate('/billing')}
                className="hidden sm:block text-xs font-semibold bg-st-black dark:bg-white text-white dark:text-st-black px-3 py-1.5 rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 transition-colors"
              >
                Upgrade
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

      {/* ── AI Chat Bubble + Slide-in Panel ─────────────────────────── */}
      {location.pathname !== '/onboarding' && (
        <>
          {/* Bubble button */}
          <button
            onClick={() => setAiChatOpen(o => !o)}
            className={`fixed bottom-6 right-6 z-50 w-13 h-13 rounded-full shadow-lg flex items-center justify-center transition-all ${
              aiChatOpen ? 'bg-st-black rotate-90' : 'bg-st-black hover:bg-st-black/90'
            }`}
            style={{ width: 52, height: 52 }}
            aria-label="AI Chat"
          >
            {aiChatOpen
              ? <X className="w-5 h-5 text-white" />
              : <MessageSquare className="w-5 h-5 text-white" />
            }
          </button>

          {/* Slide-in panel */}
          <div className={`fixed bottom-0 right-0 z-40 flex flex-col bg-white dark:bg-dark-card border-l border-t border-gray-200 dark:border-dark-border shadow-2xl rounded-tl-2xl transition-all duration-300 ease-in-out ${
            aiChatOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
          }`} style={{ width: 400, height: '70vh', maxHeight: 600 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-st-black dark:text-white" />
                <span className="text-sm font-semibold text-st-black dark:text-white">AI Analytics Chat</span>
              </div>
              <button onClick={() => setAiChatOpen(false)} className="p-1 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <AIChatPanel />
          </div>
        </>
      )}
    </div>
    </>
  )
}

// ── Inline AI Chat Panel ───────────────────────────────────────────────────
import { fetchApi } from '../lib/api'

function AIChatPanel() {
  const { user } = useAuth()
  const { activeSiteKey: siteKey } = useSite()
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! Ask me anything about your marketing data — sources, conversions, revenue, AI traffic.' }
  ])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const question = input.trim()
    if (!question || loading || !siteKey) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)
    try {
      const data = await fetchApi('/ai-chat', {
        method: 'POST',
        body: JSON.stringify({ question, site_key: siteKey })
      })
      const answer = data?.data?.answer || data?.answer || 'No response'
      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (_err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-st-black dark:bg-white text-white dark:text-st-black rounded-br-sm'
                : 'bg-gray-100 dark:bg-dark-hover text-st-black dark:text-white rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-dark-hover rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-st-gray dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-st-gray dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-st-gray dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-dark-border flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={siteKey ? 'Ask about your data…' : 'Loading…'}
            disabled={!siteKey || loading}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-dark-border dark:bg-dark-hover dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !siteKey}
            className="p-2 bg-st-black dark:bg-white text-white dark:text-st-black rounded-xl hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-40 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {!siteKey && !loading && (
          <p className="text-[10px] text-st-gray dark:text-gray-400 mt-1">Complete setup to enable AI chat.</p>
        )}
      </div>
    </>
  )
}
