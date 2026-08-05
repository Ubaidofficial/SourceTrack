import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import { useActiveSite } from './hooks/useActiveSite'
import { hasFeature, FEATURE_LABELS } from './lib/planFeatures'
import ReportBuilderMarketing from './pages/ReportBuilderMarketing'
import ReportBuilder from './pages/ReportBuilder'
import Layout from './components/Layout'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
    </div>
  )
}

// Styling deliberately mirrors the gate empty states in pages/ReportBuilder.jsx:1222-1223 —
// this is the same "you cannot see this yet, here is why" surface one level up, so it should
// not look like a different product.
function UpgradeNotice() {
  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center max-w-2xl mx-auto my-8 shadow-sm flex flex-col items-center justify-center animate-fade-in">
      <div className="w-16 h-16 bg-lime-500/10 border border-lime-500/20 text-lime-500 rounded-full flex items-center justify-center mx-auto mb-4">
        <Lock className="w-8 h-8 text-lime-600 dark:text-lime-400" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">
        {FEATURE_LABELS.advanced_report_builder} is a paid feature
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
        Build custom reports across attribution models, campaigns, and conversions.
        Available on Starter and above.
      </p>
      <Link
        to="/billing"
        className="inline-flex items-center gap-2 px-4 py-2 bg-lime-500 text-st-black hover:bg-lime-400 rounded-lg text-sm font-bold transition-all shadow-sm"
      >
        View plans
      </Link>
    </div>
  )
}

// #631 — this gate used to branch on login ONLY. `advanced_report_builder` was declared in
// both plan matrices and labelled for the upgrade UI, but passed to hasFeature()/
// requireFeature() nowhere on either side of the wire: a declared entitlement that nothing
// enforced. Resolved by enforcing the flag as written (free AND trial locked out), which
// matches the two sibling flags in the same starter+ band that ARE enforced today —
// ad_cost_sync (api/routes/ad-platforms.js:146) and gsc_seo_revenue
// (api/routes/google-search-console.js:195).
//
// SCOPE OF THIS GATE, stated honestly: it is a UI gate, and a UI gate is advisory. The data
// behind the page was already protected and still is — saved_reports, dashboard_widgets,
// multi_touch_attribution and csv_export each 402 server-side on their own flags. What this
// closes is the entitlement/packaging hole (an unentitled plan getting the paid surface),
// not a data leak, because there was no data leak.
export default function ReportBuilderGate() {
  const { user, loading } = useAuth()
  const { site, siteLoading } = useActiveSite()

  if (loading) return <Spinner />

  if (!user) {
    return <ReportBuilderMarketing />
  }

  // Do not judge entitlement until the site — and therefore its plan — has resolved.
  // normalizePlan(undefined) is 'free' (lib/planFeatures.js:11-13), so gating during load
  // would flash the locked state at paying customers on every single visit.
  if (siteLoading) return <Spinner />

  // Support preview is exempt because the preview site CANNOT carry a plan: SiteContext
  // builds it from sessionStorage with id/site_key/name/domain/onboarding_completed/
  // support_preview and nothing else (contexts/SiteContext.jsx:34-41). Gating it would not
  // "show what the customer sees" — it would show 'free' for every previewed customer
  // regardless of what they actually pay for, i.e. it would show something false.
  const entitled =
    site?.support_preview === true ||
    hasFeature(site?.plan, 'advanced_report_builder')

  if (!entitled) {
    return <Layout><UpgradeNotice /></Layout>
  }

  return <Layout><ReportBuilder /></Layout>
}
