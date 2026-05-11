import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { initPostHog } from './lib/posthog'
import Layout from './components/Layout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import ReportBuilder from './pages/ReportBuilder'
import Journey from './pages/Journey'
import AIChat from './pages/AIChat'
import AIAnalytics from './pages/AIAnalytics'
import Snippet from './pages/Snippet'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'
import EventDebugger from './pages/EventDebugger'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Campaigns from './pages/Campaigns'
import Integrations from './pages/Integrations'
import Admin from './pages/Admin'
import AdminRoute from './components/AdminRoute'

const queryClient = new QueryClient()

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  initPostHog()

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
            <Route path="/leads/:leadId" element={<ProtectedRoute><LeadDetail /></ProtectedRoute>} />
            <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
            <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
            <Route path="/report-builder" element={<ProtectedRoute><ReportBuilder /></ProtectedRoute>} />
            <Route path="/journey" element={<ProtectedRoute><Journey /></ProtectedRoute>} />
            <Route path="/ai-chat" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
            <Route path="/ai-analytics" element={<ProtectedRoute><AIAnalytics /></ProtectedRoute>} />
            <Route path="/snippet" element={<ProtectedRoute><Snippet /></ProtectedRoute>} />
            <Route path="/debugger" element={<ProtectedRoute><EventDebugger /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/admin" element={<AdminRoute><Layout><Admin /></Layout></AdminRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
