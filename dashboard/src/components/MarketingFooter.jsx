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
          </div>
          <div>
            <h4 className="mb-3 text-white text-[13px] uppercase tracking-[0.08em] font-bold">Use cases</h4>
            <Link to="/saas-attribution" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">SaaS</Link>
            <Link to="/ecommerce-attribution" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Ecommerce</Link>
            <Link to="/lead-gen-attribution" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Lead generation</Link>
            <Link to="/agency-attribution" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Agencies</Link>
            <Link to="/compare-ga4" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Compare GA4</Link>
          </div>
          <div>
            <h4 className="mb-3 text-white text-[13px] uppercase tracking-[0.08em] font-bold">Company</h4>
            <Link to="/pricing" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Pricing</Link>
            <Link to="/login" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Log in</Link>
            <Link to="/signup" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Start free</Link>
            <Link to="/docs" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">API docs</Link>
          </div>
          <div>
            <h4 className="mb-3 text-white text-[13px] uppercase tracking-[0.08em] font-bold">Resources</h4>
            <a href="mailto:support@sourcetrack.ai" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Support</a>
            <a href="mailto:sales@sourcetrack.ai" className="block my-2 text-sm font-bold hover:text-st-lime transition-colors">Contact sales</a>
          </div>
        </div>
        <div className="mt-[30px] pt-[22px] border-t border-white/10 flex flex-col sm:flex-row justify-between gap-5 text-[13px] text-[#899393]">
          <span>© {new Date().getFullYear()} SourceTrack.</span>
          <span>Free forever for up to 5,000 pageviews/mo.</span>
        </div>
      </div>
    </footer>
  )
}
