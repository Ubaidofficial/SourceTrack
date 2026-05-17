import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileBarChart, Route, MessageSquare, Code, Bug, Settings,
  Users, BarChart3, Plug, LogOut, Menu, X, Bot, Shield, TrendingUp, Activity,
  AlertTriangle, Send, Sun, Moon
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/campaigns', label: 'Campaigns', icon: BarChart3 },
  { to: '/report-builder', label: 'Reports', icon: FileBarChart },
  { to: '/journey', label: 'Journeys', icon: Route },
  { to: '/analytics', label: 'Analytics', icon: Activity },
  { to: '/ai-analytics', label: 'AI Analytics', icon: TrendingUp },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/snippet', label: 'Install', icon: Code },
  { to: '/debugger', label: 'Live Events', icon: Bug },
  { to: '/settings', label: 'Settings', icon: Settings }
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
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen]   = useState(false)
  const [trialInfo, setTrialInfo]     = useState(null)
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('st-dark') === 'true' ||
      (!localStorage.getItem('st-dark') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('st-dark', String(dark))
  }, [dark])

  useEffect(() => {
    if (!user) return
    async function fetchTrial() {
      try {
        const { data: member } = await supabase
          .from('company_members').select('company_id')
          .eq('user_id', user.id).maybeSingle()
        const query = supabase.from('sites').select('plan, created_at').limit(1)
        if (member?.company_id) query.eq('company_id', member.company_id)
        else query.eq('owner_id', user.id)
        const { data } = await query.maybeSingle()
        if (!data) return
        if (data.plan === 'trial') {
          const end  = new Date(new Date(data.created_at).getTime() + 14 * 86400000)
          const days = Math.ceil((end - new Date()) / 86400000)
          setTrialInfo({ daysLeft: Math.max(0, days) })
        }
      } catch (_e) { /* silent */ }
    }
    fetchTrial()
  }, [user])

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
    <div className="flex h-screen bg-[#F9FAFB] dark:bg-[#111414]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white dark:bg-[#1A1D1D] border-r border-gray-200 dark:border-[#333838] flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-[#333838]">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-st-black dark:text-white" />
            <h1 className="text-lg font-bold text-st-black dark:text-white">SourceTrack</h1>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-st-gray dark:text-gray-400" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-st-lime/10 dark:bg-st-lime/5 text-st-black dark:text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252929] hover:text-st-black dark:hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
          {role === 'super_admin' && (
            <NavLink
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-st-lime/20 dark:bg-st-lime/5 text-st-black dark:text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252929] hover:text-st-black dark:hover:text-white'
                }`
              }
            >
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-[#333838]">
          <div className="text-xs text-st-gray dark:text-gray-400 mb-1 truncate">{user?.email}</div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A2E2E]"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="h-14 flex items-center justify-between px-6 bg-white dark:bg-[#1A1D1D] border-b border-gray-200 dark:border-[#333838] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            {pageTitle && (
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-st-black dark:text-white">{pageTitle}</h2>
                {location.pathname === '/dashboard' && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-st-lime/20 dark:bg-st-lime/5 text-st-black dark:text-white rounded-full">Live</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded-lg text-st-gray hover:bg-gray-100 dark:hover:bg-[#252929] transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {trialInfo !== null && (
              trialInfo.daysLeft > 3 ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-600/30 px-2.5 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  {trialInfo.daysLeft} day{trialInfo.daysLeft === 1 ? '' : 's'} left in trial
                </span>
              ) : trialInfo.daysLeft > 0 ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600/30 px-2.5 py-1 rounded-full animate-pulse">
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
                onClick={() => navigate('/settings')}
                className="hidden sm:block text-xs font-semibold bg-st-black text-white px-3 py-1.5 rounded-lg hover:bg-st-black/90 transition-colors"
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
          <div className={`fixed bottom-0 right-0 z-40 flex flex-col bg-white dark:bg-[#1A1D1D] border-l border-t border-gray-200 dark:border-[#333838] shadow-2xl rounded-tl-2xl transition-all duration-300 ease-in-out ${
            aiChatOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
          }`} style={{ width: 400, height: '70vh', maxHeight: 600 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#2A2E2E] flex-shrink-0">
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
import { useRef } from 'react'
import { fetchApi } from '../lib/api'

function AIChatPanel() {
  const { user } = useAuth()
  const [siteKey, setSiteKey] = useState(null)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! Ask me anything about your marketing data — sources, conversions, revenue, AI traffic.' }
  ])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    async function load() {
      if (!user) return
      const { data: member } = await supabase
        .from('company_members').select('company_id')
        .eq('user_id', user.id).maybeSingle()
      const query = supabase.from('sites').select('site_key').limit(1)
      if (member?.company_id) query.eq('company_id', member.company_id)
      else query.eq('owner_id', user.id)
      const { data } = await query.maybeSingle()
      setSiteKey(data?.site_key || null)
    }
    load()
  }, [user])

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
                ? 'bg-st-black text-white rounded-br-sm'
                : 'bg-gray-100 dark:bg-[#252929] text-st-black dark:text-white rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-[#252929] rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-st-gray rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-st-gray rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-st-gray rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-[#2A2E2E] flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={siteKey ? 'Ask about your data…' : 'Loading…'}
            disabled={!siteKey || loading}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-[#333838] rounded-xl focus:outline-none focus:ring-2 focus:ring-st-black/20 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !siteKey}
            className="p-2 bg-st-black text-white rounded-xl hover:bg-st-black/90 disabled:opacity-40 flex-shrink-0"
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
