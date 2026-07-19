import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SiteProvider } from './contexts/SiteContext'
import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchApi } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import AttributionPage from './pages/AttributionPage'
import Setup from './pages/Setup'
import Settings from './pages/Settings'
import Billing from './pages/Billing'
import Onboarding from './pages/Onboarding'
import AuthCallback from './pages/AuthCallback'
import AuthConfirm from './pages/AuthConfirm'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Campaigns from './pages/Campaigns'
import Integrations from './pages/Integrations'
import Admin from './pages/Admin'
import Analytics from './pages/Analytics'
import AdminRoute from './components/AdminRoute'
import { getAuthAppRole } from './utils/authRole'
import { isSupportPreviewActive } from './utils/supportPreview'
// User Docs
import DocsHome from './pages/docs/DocsHome'
import DocsQuickstart from './pages/docs/DocsQuickstart'
import DocsInstall from './pages/docs/DocsInstall'
import DocsGoogleAds from './pages/docs/DocsGoogleAds'
import DocsGTM from './pages/docs/DocsGTM'
import DocsWebflow from './pages/docs/DocsWebflow'
import DocsWordPress from './pages/docs/DocsWordPress'
import DocsFramer from './pages/docs/DocsFramer'
import DocsShopify from './pages/docs/DocsShopify'
import DocsStripe from './pages/docs/DocsStripe'
import DocsTroubleshooting from './pages/docs/DocsTroubleshooting'

// Developer Docs
import DevelopersHome from './pages/developers/DevelopersHome'
import DevelopersApi from './pages/developers/DevelopersApi'
import DevelopersTracker from './pages/developers/DevelopersTracker'
import DevelopersConversions from './pages/developers/DevelopersConversions'
import DevelopersOfflineConversions from './pages/developers/DevelopersOfflineConversions'
import DevelopersIdentify from './pages/developers/DevelopersIdentify'
import DevelopersWebhooks from './pages/developers/DevelopersWebhooks'
import DevelopersCampaignCosts from './pages/developers/DevelopersCampaignCosts'
import DevelopersSecurity from './pages/developers/DevelopersSecurity'

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
import SolutionShopify from './pages/SolutionShopify'
import Privacy from './pages/Privacy'
import DPA from './pages/DPA'
import Subprocessors from './pages/Subprocessors'
import DoNotSell from './pages/DoNotSell'
import Terms from './pages/Terms'
import SEORevenue from './pages/SEORevenue'
import PublicIntegrations from './pages/PublicIntegrations'
import Security from './pages/Security'
import Demo from './pages/Demo'
import UtmBuilderTool from './pages/tools/UtmBuilder'

const queryClient = new QueryClient()

// ─── onboarding gate state shape ────────────────────────────────────────────
// loading:   true while /onboarding/me is in-flight
// completed: known-true only when API confirms onboarding_completed
// hasSite:   known-true only when API confirms has_site
// errorKind: null (no error) | 'auth' (401/403 — session invalid)
//            | 'transient' (network/5xx — retry-able)
// When errorKind is non-null, NO redirect fires. The gate renders a
// recoverable error screen instead so the user is never silently bounced.
// ─────────────────────────────────────────────────────────────────────────────

function ProtectedRoute({ children }) {
  const { user, loading, signOut } = useAuth()
  // Use react-router's useLocation so pathname is reactive — switching routes
  // within the SPA re-evaluates the gate without remounting the component.
  const { pathname, search } = useLocation()
  const navigate = useNavigate()

  const INITIAL_ONBOARDING = { loading: true, completed: false, hasSite: false, errorKind: null }
  const [onboarding, setOnboarding] = useState(INITIAL_ONBOARDING)

  // Track how many auto-retries have fired for the current user session so we
  // never retry indefinitely. Resets whenever user?.id changes.
  const autoRetriedRef = useRef(false)
  const aliveRef = useRef(true)
  // Generation counter — incremented every time the gate resets (user?.id
  // changes). The retry timer captures the generation at scheduling time; if
  // the generation has advanced by the time the timer fires it means the user
  // or session changed and the callback must not mutate onboarding state.
  const gateRunRef = useRef(0)

  const checkOnboarding = useCallback(async () => {
    if (!aliveRef.current) return

    if (!user) {
      if (aliveRef.current) setOnboarding({ loading: false, completed: false, hasSite: false, errorKind: null })
      return
    }

    // Super admins bypass the onboarding gate — they may not own a site directly.
    if (getAuthAppRole(user) === 'super_admin') {
      if (aliveRef.current) setOnboarding({ loading: false, completed: true, hasSite: true, errorKind: null })
      return
    }

    try {
      const savedKey = window.localStorage.getItem('sourcetrack_active_site_key')
      const url = savedKey ? `/onboarding/me?site_key=${savedKey}` : '/onboarding/me'
      const data = await fetchApi(url)
      if (!aliveRef.current) return
      // Known answer — record it; clear any prior error state.
      setOnboarding({
        loading: false,
        completed: !!data?.onboarding_completed,
        hasSite: !!data?.has_site,
        errorKind: null
      })
    } catch (err) {
      if (!aliveRef.current) return
      // Classify the error so the UI can offer the right recovery action.
      // 401 / 403 → session is invalid; user must sign in again.
      // Everything else (network failure, 5xx, etc.) → transient; retry once.
      const status = err?.status
      const isAuthError = status === 401 || status === 403
      const errorKind = isAuthError ? 'auth' : 'transient'

      setOnboarding({ loading: false, completed: false, hasSite: false, errorKind })

      // For transient errors, schedule one automatic retry after ~1 s.
      // Auth errors are not retried automatically (the session is invalid).
      if (!isAuthError && !autoRetriedRef.current) {
        autoRetriedRef.current = true
        // Capture the current generation so the timer can detect whether the
        // gate was reset (user changed) between scheduling and firing.
        const scheduledGeneration = gateRunRef.current
        setTimeout(() => {
          // Abort if the component unmounted OR the session/user changed after
          // the timer was scheduled. aliveRef alone is not sufficient because
          // it becomes true again when a new user mounts the same component
          // instance; gateRunRef distinguishes old from new sessions.
          if (!aliveRef.current) return
          if (gateRunRef.current !== scheduledGeneration) return
          // Reset to loading, then re-run.
          setOnboarding({ loading: true, completed: false, hasSite: false, errorKind: null })
          checkOnboarding()
        }, 1000)
      }
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    aliveRef.current = true
    autoRetriedRef.current = false
    // Advance the generation counter so any in-flight retry timer scheduled
    // for the previous user/session is invalidated immediately.
    gateRunRef.current += 1
    // Reset to loading whenever the user identity changes so the gate is honest.
    setOnboarding(INITIAL_ONBOARDING)
    checkOnboarding()
    return () => { aliveRef.current = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 1: auth context resolving ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Enforce operator shell isolation: super admins cannot access customer shell without explicit preview
  if (getAuthAppRole(user) === 'super_admin' && !isSupportPreviewActive() && pathname !== '/ops') {
    return <Navigate to="/ops" replace />
  }

  // ── Phase 2: onboarding/me in-flight ──────────────────────────────────────
  if (onboarding.loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-st-lime" />
      </div>
    )
  }

  // ── Phase 3: error — do NOT redirect; show recoverable UI ─────────────────
  // This is the critical fix for the redirection loop. When we don't have a
  // confident answer from the API we must NOT assume the user is incomplete.
  // Auth errors need sign-in recovery; transient errors need a retry.
  if (onboarding.errorKind !== null) {
    const isAuth = onboarding.errorKind === 'auth'
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-bg">
        <div className="max-w-sm w-full mx-auto px-6 text-center space-y-4">
          <p className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Having trouble checking your setup.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isAuth
              ? 'Your session may have expired. Please sign in again.'
              : 'We\u2019ll try once more. If this keeps happening, sign in again or contact support.'}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setOnboarding({ loading: true, completed: false, hasSite: false, errorKind: null })
                checkOnboarding()
              }}
              className="px-5 py-2.5 rounded-xl bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] text-sm font-bold hover:opacity-90"
            >
              Try again
            </button>
            {/* Auth errors always surface sign-in. Transient errors also offer it
                as a secondary escape hatch in case the session is stale. */}
            <button
              onClick={async () => {
                await signOut()
                navigate('/login', { replace: true })
              }}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-white/15 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Sign in again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Phase 4: known answer — apply routing rules ────────────────────────────
  // Explicit onboarding intent: a "Resume setup" entry navigates to
  // /onboarding?site_id=<incomplete>&mode=onboarding. When that intent is
  // present we must NOT bounce a user who also owns a completed site back to
  // the dashboard — Onboarding.jsx resolves the hinted incomplete site itself
  // via ?mode=onboarding. The dashboard gate is otherwise unchanged.
  const onboardingParams = new URLSearchParams(search)
  const explicitOnboardingIntent =
    pathname === '/onboarding' &&
    (onboardingParams.get('mode') === 'onboarding' ||
      !!onboardingParams.get('site_id') ||
      !!onboardingParams.get('site_key'))

  // Force incomplete users to /onboarding; completed users away from it.
  if (pathname !== '/onboarding' && !onboarding.completed) {
    return <Navigate to="/onboarding" replace />
  }
  if (pathname === '/onboarding' && onboarding.completed && !explicitOnboardingIntent) {
    return <Navigate to="/dashboard" replace />
  }

  return <Layout>{children}</Layout>
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) {
    if (getAuthAppRole(user) === 'super_admin') {
      return <Navigate to="/ops" replace />
    }
    return <Navigate to="/dashboard" replace />
  }
  return children
}

// ─── App-subdomain root redirect ─────────────────────────────────────────────
// app.sourcetrack.ai is the app shell — it must NEVER show the marketing
// Landing page. Branch directly on auth state:
//   • authenticated  →  /dashboard  (one redirect)
//   • unauthenticated →  /login      (one redirect, no ProtectedRoute bounce)
//   • loading        →  spinner while Supabase resolves the session
// www.sourcetrack.ai renders <Landing /> as before.
// ─────────────────────────────────────────────────────────────────────────────
const APP_HOSTNAME = 'app.sourcetrack.ai'

function AppRootRedirect() {
  const { user, loading } = useAuth()

  // Only activate on the app subdomain; fall through to Landing elsewhere
  // (This component is only rendered for the '/' route on app. — see Routes below,
  //  but the hostname check is a belt-and-suspenders guard.)
  if (typeof window !== 'undefined' && window.location.hostname !== APP_HOSTNAME) {
    return <Landing />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-st-lime" />
      </div>
    )
  }

  if (user) {
    if (getAuthAppRole(user) === 'super_admin') {
      return <Navigate to="/ops" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SiteProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
              <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
              <Route path="/app/attribution" element={<ProtectedRoute><AttributionPage /></ProtectedRoute>} />
              <Route path="/journeys" element={<Navigate to="/leads" replace />} />
              <Route path="/ai-sources" element={<Navigate to="/app/attribution" replace />} />
              <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
              <Route path="/leads/:leadId" element={<ProtectedRoute><LeadDetail /></ProtectedRoute>} />
              <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
              <Route path="/app/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
              <Route path="/integrations" element={<PublicIntegrations />} />
              <Route path="/security" element={<Security />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/report-builder" element={<ReportBuilderGate />} />
              <Route path="/seo-revenue" element={<ProtectedRoute><SEORevenue /></ProtectedRoute>} />
              <Route path="/old-analytics" element={<Navigate to="/analytics" replace />} />
              <Route path="/snippet" element={<Navigate to="/setup" replace />} />
              <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/ops" element={<AdminRoute><Layout><Admin /></Layout></AdminRoute>} />
              {/* Auth callback — handles OAuth redirect flow */}
              <Route path="/auth/callback" element={<AuthCallback />} />
              {/* Auth confirm — same-domain token_hash verifyOtp flow (email links) */}
              <Route path="/auth/confirm" element={<AuthConfirm />} />
              {/* Public docs — no auth required */}
              <Route path="/docs" element={<DocsHome />} />
              <Route path="/docs/quickstart" element={<DocsQuickstart />} />
              <Route path="/docs/install" element={<DocsInstall />} />
              <Route path="/docs/platforms/google-ads" element={<DocsGoogleAds />} />
              <Route path="/docs/platforms/google-tag-manager" element={<DocsGTM />} />
              <Route path="/docs/platforms/webflow" element={<DocsWebflow />} />
              <Route path="/docs/platforms/wordpress" element={<DocsWordPress />} />
              <Route path="/docs/platforms/framer" element={<DocsFramer />} />
              <Route path="/docs/platforms/shopify" element={<DocsShopify />} />
              <Route path="/docs/platforms/stripe" element={<DocsStripe />} />
              <Route path="/docs/troubleshooting" element={<DocsTroubleshooting />} />

              {/* Developer docs — no auth required */}
              <Route path="/developers" element={<DevelopersHome />} />
              <Route path="/developers/api" element={<DevelopersApi />} />
              <Route path="/developers/tracker" element={<DevelopersTracker />} />
              <Route path="/developers/conversions" element={<DevelopersConversions />} />
              <Route path="/developers/offline-conversions" element={<DevelopersOfflineConversions />} />
              <Route path="/developers/identify" element={<DevelopersIdentify />} />
              <Route path="/developers/webhooks" element={<DevelopersWebhooks />} />
              <Route path="/developers/campaign-costs" element={<DevelopersCampaignCosts />} />
              <Route path="/developers/security" element={<DevelopersSecurity />} />

              {/* Legacy redirects */}
              <Route path="/docs/api" element={<Navigate to="/developers/api" replace />} />
              <Route path="/docs/conversions" element={<Navigate to="/developers/conversions" replace />} />
              <Route path="/docs/revenue" element={<Navigate to="/developers/offline-conversions" replace />} />

              <Route path="/privacy" element={<Privacy />} />
              <Route path="/dpa" element={<DPA />} />
              <Route path="/subprocessors" element={<Subprocessors />} />
              <Route path="/do-not-sell" element={<DoNotSell />} />
              <Route path="/terms" element={<Terms />} />
              {/* Root: app.sourcetrack.ai → auth-branch (authed=/dashboard, unauthed=/login)
                       www.sourcetrack.ai  → Landing (marketing) */}
              <Route path="/" element={<AppRootRedirect />} />
              {/* Public marketing pages — accessible to everyone on www. */}
              <Route path="/product" element={<Product />} />
              <Route path="/attribution" element={<Attribution />} />
              <Route path="/ai-referral-tracking" element={<AIReferralTracking />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/compare/ga4" element={<CompareGA4 />} />
              <Route path="/compare-ga4" element={<Navigate to="/compare/ga4" replace />} />
              {/* Public free tools — SEO landing pages, no auth */}
              <Route path="/tools/utm-builder" element={<UtmBuilderTool />} />
              {/* Solution pages — public direct canonical routes */}
              <Route path="/use-cases/saas" element={<SolutionSaaS />} />
              <Route path="/use-cases/ecommerce" element={<SolutionEcommerce />} />
              <Route path="/use-cases/lead-generation" element={<SolutionLeadGen />} />
              <Route path="/use-cases/agencies" element={<SolutionAgency />} />
              <Route path="/use-cases/shopify" element={<SolutionShopify />} />
              {/* Legacy redirects */}
              <Route path="/saas-attribution" element={<Navigate to="/use-cases/saas" replace />} />
              <Route path="/ecommerce-attribution" element={<Navigate to="/use-cases/ecommerce" replace />} />
              <Route path="/lead-gen-attribution" element={<Navigate to="/use-cases/lead-generation" replace />} />
              <Route path="/agency-attribution" element={<Navigate to="/use-cases/agencies" replace />} />
              {/* /for/* entry points → canonical /use-cases/* (no duplicate content) */}
              <Route path="/for/saas" element={<Navigate to="/use-cases/saas" replace />} />
              <Route path="/for/shopify" element={<Navigate to="/use-cases/shopify" replace />} />
              <Route path="/for/lead-gen" element={<Navigate to="/use-cases/lead-generation" replace />} />
              {/* Unknown paths: on app. subdomain go through auth-branch; on www. fall to Landing */}
              <Route path="*" element={<AppRootRedirect />} />
            </Routes>
          </BrowserRouter>
        </SiteProvider>
      </AuthProvider>
    </QueryClientProvider>
    </HelmetProvider>
  )
}
