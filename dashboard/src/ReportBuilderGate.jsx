import { lazy, Suspense } from 'react'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import RouteFallback from './components/RouteFallback'

// Split the two branches apart, not just this gate. /report-builder is a public
// marketing URL for logged-out visitors, and ReportBuilder is the largest page
// in the app — bundling both into the gate's chunk would make every marketing
// visitor download the full builder just to see the marketing page.
const ReportBuilderMarketing = lazy(() => import('./pages/ReportBuilderMarketing'))
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'))

export default function ReportBuilderGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <ReportBuilderMarketing />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Layout><ReportBuilder /></Layout>
    </Suspense>
  )
}
