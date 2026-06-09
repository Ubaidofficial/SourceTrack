import { Link } from 'react-router-dom'
import { LogoFullDark } from './Logo'

export default function MarketingFooter() {
  return (
    <footer className="py-[42px] bg-st-black text-[#B9C2C2] border-t border-white/10">
      <div className="max-w-[1320px] mx-auto px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-7">
          <div>
            <Link to="/" className="inline-flex items-center">
              <LogoFullDark className="h-9 w-auto" />
            </Link>
            <p className="mt-[18px] max-w-[340px] text-sm leading-relaxed text-[#B9C2C2]">
              Revenue attribution for modern marketing teams. Track sources, journeys, AI referrals, conversions, and reports from one clean workspace.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-white text-[13px] uppercase tracking-[0.08em] font-bold">Product</h4>
            <Link to="/product" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Overview</Link>
            <Link to="/attribution" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Attribution</Link>
            <Link to="/ai-referral-tracking" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">AI tracking</Link>
            <Link to="/report-builder" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Report builder</Link>
            <Link to="/demo" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Interactive Demo</Link>
            <Link to="/integrations" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Integrations</Link>
          </div>
          <div>
            <h4 className="mb-3 text-white text-[13px] uppercase tracking-[0.08em] font-bold">Use cases</h4>
            <Link to="/use-cases/saas" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">SaaS</Link>
            <Link to="/use-cases/ecommerce" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Ecommerce</Link>
            <Link to="/use-cases/lead-generation" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Lead generation</Link>
            <Link to="/use-cases/agencies" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Agencies</Link>
            <Link to="/compare/ga4" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Compare GA4</Link>
          </div>
          <div>
            <h4 className="mb-3 text-white text-[13px] uppercase tracking-[0.08em] font-bold">Company</h4>
            <Link to="/pricing" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Pricing</Link>
            <Link to="/login" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Log in</Link>
            <Link to="/signup" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Start free</Link>
            <Link to="/docs" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Docs</Link>
            <Link to="/developers" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Developers</Link>
          </div>
          <div>
            <h4 className="mb-3 text-white text-[13px] uppercase tracking-[0.08em] font-bold">Resources</h4>
            <Link to="/developers/api" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">API Reference</Link>
            <Link to="/docs/troubleshooting" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Troubleshooting</Link>
            <Link to="/security" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Security</Link>
            <a href="mailto:support@sourcetrack.ai" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Support</a>
            <a href="mailto:sales@sourcetrack.ai" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Contact sales</a>
          </div>
        </div>
        <div className="mt-[30px] pt-[22px] border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-5 text-[13px] text-[#899393]">
          <div className="flex flex-wrap items-center gap-5">
            <span>© {new Date().getFullYear()} SourceTrack.</span>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link to="/security" className="hover:text-white transition-colors">Security</Link>
          </div>
          <span>Free conversion source-to-revenue tracker — up to 30 conversions free.</span>
        </div>
      </div>
    </footer>
  )
}
