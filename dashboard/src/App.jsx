import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SiteProvider } from './contexts/SiteContext'
import { useEffect, useState } from 'react'
import { fetchApi } from './lib/api'
import { initPostHog } from './lib/posthog'
import Layout from './components/Layout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Journey from './pages/Journey'
import AIChat from './pages/AIChat'
import AIAnalytics from './pages/AIAnalytics'
import Snippet from './pages/Snippet'
import Settings from './pages/Settings'
import ShareDashboard from './pages/ShareDashboard'
import Billing from './pages/Billing'
import DataQuality from './pages/DataQuality'
import Onboarding from './pages/Onboarding'
import AuthCallback from './pages/AuthCallback'
import EventDebugger from './pages/EventDebugger'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Campaigns from './pages/Campaigns'
import Integrations from './pages/Integrations'
import Admin from './pages/Admin'
import Analytics from './pages/Analytics'
import AdminRoute from './components/AdminRoute'
import Docs from './pages/Docs'
import Landing from './pages/Landing'
import Product from './pages/Product'
import Attribution from './pages/Attribution'
import AIReferralTracking from './pages/AIReferralTracking'
import ReportBuilderGate from './ReportBuilderGate'
import Pricing from './pages/Pricing'
import CompareGA4 from './pages/CompareGA4'
import SolutionEcommerce from './pages/SolutionEcommerce'
import SolutionSaaS from './pages/SolutionSaaS'
import SolutionLeadGen from './pages/SolutionLeadGen'
import SolutionAgency from './pages/SolutionAgency'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import SEORevenue from './pages/SEORevenue'
import PublicIntegrations from './pages/PublicIntegrations'
import Security from './pages/Security'
import Demo from './pages/Demo'

const queryClient = new QueryClient()

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  // Use react-router's useLocation so pathname is reactive — switching routes
  // within the SPA re-evaluates the gate without remounting the component.
  const { pathname } = useLocation()
  const [onboarding, setOnboarding] = useState({ loading: true, completed: false, hasSite: false })

  useEffect(() => {
    let alive = true

    async function checkOnboarding() {
      if (!user) {
        if (alive) setOnboarding({ loading: false, completed: false, hasSite: false })
        return
      }

      // Super admins bypass the onboarding gate — they may not own a site directly.
      if (user.raw_app_meta_data?.role === 'super_admin') {
        if (alive) setOnboarding({ loading: false, completed: true, hasSite: true })
        return
      }

      try {
        const data = await fetchApi('/onboarding/me')
        if (!alive) return
        setOnboarding({
          loading: false,
          completed: !!data?.onboarding_completed,
          hasSite: !!data?.has_site
        })
      } catch (_err) {
        // If the endpoint fails (network error, missing column, etc), fail open
        // so the user can still reach login/dashboard rather than infinite spinner.
        if (alive) setOnboarding({ loading: false, completed: false, hasSite: false })
      }
    }

    // Reset to loading whenever the user identity changes so the gate is honest.
    setOnboarding({ loading: true, completed: false, hasSite: false })
    checkOnboarding()
    return () => { alive = false }
  }, [user?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (onboarding.loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-st-lime" />
      </div>
    )
  }

  // Force incomplete users to /onboarding; completed users away from it.
  if (pathname !== '/onboarding' && !onboarding.completed) {
    return <Navigate to="/onboarding" replace />
  }
  if (pathname === '/onboarding' && onboarding.completed) {
    return <Navigate to="/dashboard" replace />
  }

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
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SiteProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
              <Route path="/leads/:leadId" element={<ProtectedRoute><LeadDetail /></ProtectedRoute>} />
              <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
              <Route path="/app/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
              <Route path="/integrations" element={<PublicIntegrations />} />
              <Route path="/security" element={<Security />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/report-builder" element={<ReportBuilderGate />} />
              <Route path="/journey" element={<ProtectedRoute><Journey /></ProtectedRoute>} />
              <Route path="/seo-revenue" element={<ProtectedRoute><SEORevenue /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
              <Route path="/ai-chat" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
              <Route path="/ai-analytics" element={<ProtectedRoute><AIAnalytics /></ProtectedRoute>} />
              <Route path="/snippet" element={<ProtectedRoute><Snippet /></ProtectedRoute>} />
              <Route path="/debugger" element={<ProtectedRoute><EventDebugger /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
              <Route path="/data-quality" element={<ProtectedRoute><DataQuality /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><Layout><Admin /></Layout></AdminRoute>} />
              <Route path="/share/:token" element={<ShareDashboard />} />
              {/* Auth callback — handles OAuth redirect flow */}
              <Route path="/auth/callback" element={<AuthCallback />} />
              {/* Public docs — no auth required */}
              <Route path="/docs" element={<Docs />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              {/* Public marketing pages — accessible to everyone */}
              <Route path="/" element={<Landing />} />
              <Route path="/product" element={<Product />} />
              <Route path="/attribution" element={<Attribution />} />
              <Route path="/ai-referral-tracking" element={<AIReferralTracking />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/compare/ga4" element={<CompareGA4 />} />
              <Route path="/compare-ga4" element={<Navigate to="/compare/ga4" replace />} />
              {/* Solution pages — public direct canonical routes */}
              <Route path="/use-cases/saas" element={<SolutionSaaS />} />
              <Route path="/use-cases/ecommerce" element={<SolutionEcommerce />} />
              <Route path="/use-cases/lead-generation" element={<SolutionLeadGen />} />
              <Route path="/use-cases/agencies" element={<SolutionAgency />} />
              {/* Legacy redirects */}
              <Route path="/saas-attribution" element={<Navigate to="/use-cases/saas" replace />} />
              <Route path="/ecommerce-attribution" element={<Navigate to="/use-cases/ecommerce" replace />} />
              <Route path="/lead-gen-attribution" element={<Navigate to="/use-cases/lead-generation" replace />} />
              <Route path="/agency-attribution" element={<Navigate to="/use-cases/agencies" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SiteProvider>
      </AuthProvider>
    </QueryClientProvider>
    </HelmetProvider>
  )
}
