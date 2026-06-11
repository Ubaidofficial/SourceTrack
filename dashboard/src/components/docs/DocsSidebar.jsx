import { Link, useLocation } from 'react-router-dom'

const USER_DOCS_LINKS = [
  {
    title: 'Get started',
    links: [
      { label: 'Overview', to: '/docs' },
      { label: 'Quickstart', to: '/docs/quickstart' },
      { label: 'Install script', to: '/docs/install' },
    ]
  },
  {
    title: 'Platform guides',
    links: [
      { label: 'Google Ads', to: '/docs/platforms/google-ads' },
      { label: 'Google Tag Manager', to: '/docs/platforms/google-tag-manager' },
      { label: 'Webflow', to: '/docs/platforms/webflow' },
      { label: 'WordPress', to: '/docs/platforms/wordpress' },
      { label: 'Framer', to: '/docs/platforms/framer' },
      { label: 'Shopify (Manual)', to: '/docs/platforms/shopify' },
      { label: 'Stripe (Manual)', to: '/docs/platforms/stripe' },
    ]
  },
  {
    title: 'Help & Security',
    links: [
      { label: 'Troubleshooting', to: '/docs/troubleshooting' },
      { label: 'Developer Docs', to: '/developers' },
    ]
  }
]

const DEV_DOCS_LINKS = [
  {
    title: 'Reference',
    links: [
      { label: 'Overview', to: '/developers' },
      { label: 'API Reference', to: '/developers/api' },
      { label: 'Tracker SDK', to: '/developers/tracker' },
      { label: 'Browser conversions', to: '/developers/conversions' },
      { label: 'Offline conversions', to: '/developers/offline-conversions' },
      { label: 'User stitching (Identify)', to: '/developers/identify' },
      { label: 'Outbound & webhooks', to: '/developers/webhooks' },
      { label: 'Campaign costs API/CSV', to: '/developers/campaign-costs' },
      { label: 'Security specs', to: '/developers/security' },
    ]
  },
  {
    title: 'Guides',
    links: [
      { label: 'User Docs Home', to: '/docs' },
    ]
  }
]

export default function DocsSidebar({ isDeveloper = false, onItemClick }) {
  const { pathname } = useLocation()
  const sections = isDeveloper ? DEV_DOCS_LINKS : USER_DOCS_LINKS

  return (
    <div className="space-y-6">
      {sections.map((sec, idx) => (
        <div key={idx}>
          <h4 className="px-3 text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
            {sec.title}
          </h4>
          <nav className="space-y-1">
            {sec.links.map(link => {
              const active = pathname === link.to
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={onItemClick}
                  className={`block px-3 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                    active
                      ? 'bg-gray-150 dark:bg-[#252929] text-[#1F2323] dark:text-[#CCF03F] font-bold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1A1D1D]'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>
      ))}
    </div>
  )
}
