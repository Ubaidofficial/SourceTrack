import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileBarChart, Route, MessageSquare, Code, Bug, Settings,
  Users, BarChart3, Plug, LogOut, Menu, X, Bot
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/campaigns', label: 'Campaigns', icon: BarChart3 },
  { to: '/report-builder', label: 'Reports', icon: FileBarChart },
  { to: '/journey', label: 'Journeys', icon: Route },
  { to: '/ai-chat', label: 'AI Chat', icon: Bot },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/snippet', label: 'Install', icon: Code },
  { to: '/debugger', label: 'Debugger', icon: Bug },
  { to: '/settings', label: 'Settings', icon: Settings }
]

const PAGE_TITLES = {
  '/dashboard': 'Performance Overview',
  '/leads': 'Leads',
  '/campaigns': 'Campaigns & Attribution',
  '/report-builder': 'Report Builder',
  '/journey': 'Visitor Journeys',
  '/ai-chat': 'AI Chat',
  '/integrations': 'Integrations',
  '/snippet': 'Install Tracking',
  '/debugger': 'Event Debugger',
  '/settings': 'Settings'
}

export default function Layout({ children }) {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (location.pathname === '/onboarding') {
    return <>{children}</>
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const pageTitle = PAGE_TITLES[location.pathname] || ''

  return (
    <div className="flex h-screen bg-[#F9FAFB]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-gray-900" />
            <h1 className="text-lg font-bold text-gray-900">SourceTrack</h1>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-gray-400" />
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
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-1 truncate">{user?.email}</div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            {pageTitle && (
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">{pageTitle}</h2>
                {location.pathname === '/dashboard' && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-lime-100 text-lime-800 rounded-full">Live</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:block"></span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
