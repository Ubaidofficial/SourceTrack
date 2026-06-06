import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Copy, Check, ChevronRight, ExternalLink, Menu, X } from 'lucide-react'
import { LogoFull, LogoFullDark } from '../components/Logo'

// ─── Code block with copy button ─────────────────────────────────────────────
function Code({ children, lang = 'js' }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(children.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group my-4">
      <div className="flex items-center justify-between bg-[#0d1117] rounded-t-lg px-4 py-2 border border-[#30363d] border-b-0">
        <span className="text-[11px] text-gray-500 font-mono uppercase tracking-wide">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-[#0d1117] border border-[#30363d] rounded-b-lg px-4 py-4 overflow-x-auto text-sm text-gray-300 font-mono leading-relaxed">
        <code>{children.trim()}</code>
      </pre>
    </div>
  )
}

// ─── Inline code ──────────────────────────────────────────────────────────────
function IC({ children }) {
  return (
    <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-[13px] font-mono">
      {children}
    </code>
  )
}

// ─── Method badge ─────────────────────────────────────────────────────────────
const METHOD_COLORS = {
  GET:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  POST:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  PUT:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

function Method({ verb }) {
  return (
    <span className={`inline-block text-[11px] font-bold font-mono px-2 py-0.5 rounded ${METHOD_COLORS[verb] || ''}`}>
      {verb}
    </span>
  )
}

// ─── Endpoint header ──────────────────────────────────────────────────────────
function Endpoint({ method, path, description }) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-[#1a1d1d] border border-gray-200 dark:border-[#2a2e2e] rounded-lg px-4 py-3 my-4">
      <Method verb={method} />
      <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-semibold">{path}</code>
      {description && <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{description}</span>}
    </div>
  )
}

// ─── Parameter table ──────────────────────────────────────────────────────────
function ParamTable({ params }) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-40">Parameter</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-24">Type</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-20">Required</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
              <td className="py-2 pr-4 font-mono text-[13px] text-gray-800 dark:text-gray-200 align-top">{p.name}</td>
              <td className="py-2 pr-4 text-[13px] text-[#00AA57] dark:text-green-400 font-mono align-top">{p.type}</td>
              <td className="py-2 pr-4 align-top">
                {p.required
                  ? <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">required</span>
                  : <span className="text-[11px] text-gray-400">optional</span>}
              </td>
              <td className="py-2 text-[13px] text-gray-600 dark:text-gray-400 align-top">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Nav items ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',         label: 'Overview' },
  { id: 'quickstart',       label: 'Quick Start' },
  { id: 'tracker',          label: 'Tracker Script',    indent: true },
  { id: 'exclusions',       label: 'Path Exclusions',   indent: true },
  { id: 'cookieless',       label: 'Cookieless Mode',   indent: true },
  { id: 'timezone',         label: 'Timezone Behavior', indent: true },
  { id: 'recipes',          label: 'Installation Guides' },
  { id: 'track',            label: 'POST /api/track' },
  { id: 'conversion',       label: 'POST /api/conversion' },
  { id: 'identify',         label: 'POST /api/identify' },
  { id: 'attribution',      label: 'GET /api/attribution' },
  { id: 'tracker-id',       label: 'GET /api/tracker/id' },
  { id: 'settings-api',     label: 'PATCH /api/integrations/settings' },
  { id: 'gdpr',             label: 'GDPR Endpoints' },
  { id: 'webhooks',         label: 'Outbound Webhooks' },
  { id: 'auth',             label: 'Authentication' },
  { id: 'errors',           label: 'Error Handling' },
  { id: 'changelog',        label: 'Changelog' },
]

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 py-10 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{title}</h2>
      <div className="w-8 h-0.5 bg-black dark:bg-white mb-6" />
      <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed text-[15px]">
        {children}
      </div>
    </section>
  )
}

function H3({ children }) {
  return <h3 className="text-base font-bold text-gray-900 dark:text-white mt-8 mb-2">{children}</h3>
}

function Note({ children }) {
  return (
    <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300 my-4">
      <span className="text-base leading-none mt-0.5">ℹ</span>
      <div>{children}</div>
    </div>
  )
}

function Warn({ children }) {
  return (
    <div className="flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-300 my-4">
      <span className="text-base leading-none mt-0.5">⚠</span>
      <div>{children}</div>
    </div>
  )
}

const RECIPES = {
  html: {
    name: 'Plain HTML',
    desc: 'Add the pixel directly to standard HTML templates.',
    code: `<!-- Paste this in the <head> of your pages -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`,
    instructions: 'Paste this copy-paste setup directly into your index.html or layout file before the closing </head> tag. Works with your existing stack.'
  },
  react: {
    name: 'React / Vite',
    desc: 'Add to a single-page React app with dynamic script injection.',
    code: `// Add this to your main App.jsx or layout mount effect
import { useEffect } from 'react'

export default function App() {
  useEffect(() => {
    // Avoid duplicate script tag creation
    if (document.querySelector('script[data-site-key]')) return

    const script = document.createElement('script')
    script.src = 'https://api.srctk.com/tracker/tracker.min.js'
    script.setAttribute('data-site-key', 'YOUR_SITE_KEY')
    script.async = true
    document.head.appendChild(script)
  }, [])

  return (
    <div>{/* Your App */}</div>
  )
}`,
    instructions: 'Loads the tracking script dynamically on initial component mount. This implementation guide works with your existing stack.'
  },
  nextjs: {
    name: 'Next.js',
    desc: 'Load the pixel using the next/script component.',
    code: `// For App Router, add this in app/layout.jsx
import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://api.srctk.com/tracker/tracker.min.js"
          data-site-key="YOUR_SITE_KEY"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}`,
    instructions: 'Utilizes the built-in Next.js Script optimizer to load after interactive phase. An easy implementation guide.'
  },
  webflow: {
    name: 'Webflow',
    desc: 'Setup tracking on your Webflow site.',
    code: `<!-- Paste in Webflow Page Settings -> Custom Code -> Head Code -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`,
    instructions: 'Go to your Webflow project settings, select Custom Code tab, and paste the code in the "Head Code" section. Save and publish. A simple copy-paste setup.'
  },
  framer: {
    name: 'Framer',
    desc: 'Deploy the tracking snippet inside Framer.',
    code: `<!-- Paste in Framer Page Settings -> Custom Code -> Head tag -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`,
    instructions: 'In Framer, open your project settings, navigate to Custom Code, select the "Start of <head>" section, paste the script, and publish. A copy-paste setup.'
  },
  wordpress: {
    name: 'WordPress Manual',
    desc: 'Manual integration via WordPress header layout.',
    code: `<!-- Paste in wp-content/themes/your-theme/header.php before </head> -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`,
    instructions: 'Paste this manual install recipe manually into your theme\'s header.php file or use a headers plugin.'
  },
  shopify: {
    name: 'Shopify Manual',
    desc: 'Pasting the pixel manually into theme.liquid layout.',
    code: `<!-- Paste inside layout/theme.liquid before </head> -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`,
    instructions: 'In your Shopify Admin, navigate to Online Store -> Themes -> Edit Code. Open layout/theme.liquid and paste the script before the closing </head> tag. A manual install recipe.'
  },
  woocommerce: {
    name: 'WooCommerce Manual',
    desc: 'Manual tracking snippet & checkout success trigger.',
    code: `<!-- Part 1: Paste tracking snippet in header.php -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>

<!-- Part 2: WooCommerce order confirmation script (e.g. thank-you page PHP template) -->
<?php if (is_wc_endpoint_url('order-received')) :
  $order_id = get_query_var('order-received');
  $order = wc_get_order($order_id);
  if ($order) : ?>
    <script>
      window.addEventListener('load', function() {
        if (window.sourcetrack) {
          window.sourcetrack.conversion({
            value: <?php echo wp_json_encode((float) $order->get_total()); ?>,
            type: 'purchase',
            order_id: <?php echo wp_json_encode((string) $order_id); ?>
          });
        }
      });
    </script>
<?php endif; endif; ?>`,
    instructions: 'Part 1 inserts the base script, Part 2 extracts order details on WooCommerce\'s confirmation template page to record the conversion. This is a conversion-ready manual install recipe.'
  },
  stripe: {
    name: 'Stripe Checkout',
    desc: 'Manual conversion page trigger after checkout success.',
    code: `<!-- Place on your checkout success redirect page (e.g. /checkout-success) -->
<script>
  window.addEventListener('load', function() {
    // Extract parameters from URL for deduplication mapping
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('session_id') || 'STRIPE_SESSION_ID';

    if (window.sourcetrack) {
      // Mark checkout completion on the frontend (value 0).
      // Send actual verified revenue via webhook / offline conversion API.
      window.sourcetrack.conversion({
        value: 0,
        type: 'purchase_success',
        order_id: orderId
      });
    }
  });
</script>`,
    instructions: 'Use the success page to mark checkout completion. Send verified revenue from your backend using the offline conversion endpoint.'
  },
  supabase: {
    name: 'Supabase Auth',
    desc: 'Stitch anonymous sessions with Supabase Auth users.',
    code: `// In your Supabase Auth provider listener
import { supabase } from './supabaseClient'

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    if (window.sourcetrack) {
      window.sourcetrack.identify(session.user.id);
    }
  }
})`,
    instructions: 'Triggers the identify method as soon as a user successfully signs in, merging their pre-auth path with their logged-in record. Privacy-friendly setup.'
  },
  firebase: {
    name: 'Firebase Auth',
    desc: 'Stitch sessions with Firebase Authentication users.',
    code: `// Call in your Firebase auth state change listener
import { getAuth, onAuthStateChanged } from "firebase/auth";

const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (window.sourcetrack) {
      window.sourcetrack.identify(user.uid);
    }
  }
});`,
    instructions: 'Ensures that Firebase logged-in users are immediately identified with their user IDs for precise stitching. Works with your existing stack.'
  },
  clerk: {
    name: 'Clerk Auth',
    desc: 'Stitch sessions with Clerk Authentication users.',
    code: `// In your App mount or navigation router when user state transitions
import { useUser } from '@clerk/clerk-react';
import { useEffect } from 'react';

export default function UserListener() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      if (window.sourcetrack) {
        window.sourcetrack.identify(user.id);
      }
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}`,
    instructions: 'Listens to Clerk authentication status changes to link the active browser session. Implementation guide for Clerk.'
  },
  leadform: {
    name: 'Lead Form',
    desc: 'Track form submissions as conversion events.',
    code: `// Attach to your contact / lead form submit handler
document.getElementById('lead-form').addEventListener('submit', function(e) {
  // Capture details before submit redirect
  if (window.sourcetrack) {
    window.sourcetrack.conversion({
      value: 0, // Set dynamic estimation if relevant
      type: 'lead',
      order_id: 'FORM_' + Date.now() // Unique ID to deduplicate double-submits
    });
  }
});`,
    instructions: 'Trigger this conversion-ready lead form submit recipe during the submit handling loop.'
  },
  calendly: {
    name: 'Calendly / Demo',
    desc: 'Track conversions on Calendly schedule embeds.',
    code: `// Add to the parent page hosting the Calendly widget iframe
window.addEventListener('message', function(e) {
  // Origin guard check
  if (!String(e.origin).includes('calendly.com')) return;
  // Safely guard e.data
  if (!e.data || typeof e.data !== 'object') return;

  if (e.data.event && e.data.event.indexOf('calendly') === 0) {
    if (e.data.event === 'calendly.event_scheduled') {
      if (window.sourcetrack) {
        window.sourcetrack.conversion({
          value: 0,
          type: 'demo_scheduled',
          order_id: 'CAL_' + Date.now()
        });
      }
    }
  }
});`,
    instructions: 'Listens to the postMessage event sent by Calendly\'s iframe to parent page when scheduling is completed. A webhook-ready demo booking recipe.'
  },
  offline: {
    name: 'Backend / Offline API',
    desc: 'Submit backend conversions via the offline REST API.',
    code: `// Node.js example of sending a backend-submitted conversion
// site_key is passed in the JSON body
await fetch('https://api.srctk.com/api/conversion/offline', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    site_key: 'YOUR_SITE_KEY',
    user_id: 'user_123', // Or pass anonymous_id
    conversion_value: 99.00,
    conversion_type: 'purchase',
    order_id: 'ORD-54321', // Keeps calculations duplicate-safe
    currency: 'USD'
  })
})`,
    instructions: 'Useful for backend payment systems or webhook processes. Send a backend-submitted conversion by providing the site_key parameter.'
  },
  trial: {
    name: 'SaaS Trial',
    desc: 'Trigger conversion and identify upon signup.',
    code: `// Call on registration success
function onSignupSuccess(user) {
  if (window.sourcetrack) {
    // 1. Identify the user
    window.sourcetrack.identify(user.id);

    // 2. Track trial conversion
    window.sourcetrack.conversion({
      value: 0,
      type: 'trial',
      order_id: 'TRIAL_' + user.id
    });
  }
}`,
    instructions: 'Triggers both identification and a free trial conversion-ready manual recipe immediately after signup completes.'
  },
  upgrade: {
    name: 'Paid Upgrade',
    desc: 'Attribute upgrade value on subscription plan upgrades.',
    code: `// Triggers upon plan upgrade confirmation
function onUpgradeConfirmed(userId, newPlanName, priceAmount) {
  if (window.sourcetrack) {
    window.sourcetrack.conversion({
      value: priceAmount, // Upgrade revenue value
      type: 'upgrade',
      order_id: 'UPG_' + userId + '_' + Date.now()
    });
  }
}`,
    instructions: 'Call on upgrade success screen or via webhook integration to trigger a paid upgrade conversion-ready manual recipe.'
  },
  agency: {
    name: 'Agency Multi-Site',
    desc: 'Configuring independent sites with different site keys.',
    code: `<!-- Client Site A Head -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="CLIENT_A_SITE_KEY"></script>

<!-- Client Site B Head -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="CLIENT_B_SITE_KEY"></script>`,
    instructions: 'Each site should utilize its own explicit site key, ensuring data isolation and correct client routing. Works with your existing stack.'
  }
};

// ─── Main Docs Page ───────────────────────────────────────────────────────────
export default function Docs() {
  const [activeSection, setActiveSection] = useState('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState('html')
  const observerRef = useRef(null)

  // Intersection observer to highlight active nav section
  useEffect(() => {
    const sections = NAV.map(n => document.getElementById(n.id)).filter(Boolean)
    observerRef.current = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )
    sections.forEach(s => observerRef.current.observe(s))
    return () => observerRef.current?.disconnect()
  }, [])

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileNavOpen(false)
  }

  const NavLinks = () => (
    <nav className="space-y-0.5">
      {NAV.map(item => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
            item.indent ? 'pl-6' : ''
          } ${
            activeSection === item.id
              ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-white dark:bg-[#111414] text-gray-900 dark:text-white">
      <Helmet>
        <title>SourceTrack API Docs — Multi-Touch Attribution Integration Guide</title>
        <meta name="description" content="Complete API reference for SourceTrack. Track events, conversions, and visitors. Server-side conversion pipeline, 8 attribution models, GDPR cookieless mode. Get started in minutes." />
        <link rel="canonical" href="https://sourcetrack.ai/docs" />
        <meta property="og:title"       content="SourceTrack API Documentation" />
        <meta property="og:description" content="Integrate multi-touch attribution in minutes. Full API reference for tracking, conversions, attribution, and GDPR compliance." />
        <meta property="og:url"         content="https://sourcetrack.ai/docs" />
        <meta property="og:type"        content="website" />
        <meta name="robots"             content="index, follow" />
      </Helmet>
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-[#111414]/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="dark:hidden"><LogoFull className="h-6 w-auto" /></Link>
            <Link to="/dashboard" className="hidden dark:block"><LogoFullDark className="h-6 w-auto" /></Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">API Docs</span>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full font-mono">
              v1.0
            </span>
            <a
              href="https://sourcetrack.ai"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              sourcetrack.ai <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {/* Mobile nav toggle */}
          <button
            onClick={() => setMobileNavOpen(v => !v)}
            className="sm:hidden p-1 rounded text-gray-500"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMobileNavOpen(false)}>
          <div
            className="absolute left-0 top-14 bottom-0 w-64 bg-white dark:bg-[#111414] border-r border-gray-200 dark:border-gray-800 p-4 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <NavLinks />
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex">
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="hidden sm:block w-56 shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-6">
          <NavLinks />
        </aside>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-8 max-w-3xl">

          {/* ── Overview ────────────────────────────────────────────────── */}
          <Section id="overview" title="Overview">
            <p>
              SourceTrack is a privacy-friendly, multi-touch attribution platform. These docs cover the
              tracking endpoints you can call from your website or server, the attribution query API, and
              the GDPR compliance endpoints.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {[
                { label: 'Base URL', value: 'https://api.srctk.com' },
                { label: 'Response format', value: 'JSON — always { success, data, error }' },
                { label: 'Authentication', value: 'Bearer token (user API routes) or site_key (tracking)' },
                { label: 'Rate limits', value: '1 000 req/min (tracking), 60 req/min (analytics)' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 dark:bg-[#1a1d1d] border border-gray-200 dark:border-[#2a2e2e] rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-[13px] text-gray-800 dark:text-gray-200 font-mono">{value}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Quick Start ──────────────────────────────────────────────── */}
          <Section id="quickstart" title="Quick Start">
            <p>
              Add the SourceTrack snippet to the <IC>&lt;head&gt;</IC> of every page. Replace{' '}
              <IC>YOUR_SITE_KEY</IC> with the key from your <Link to="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">Settings</Link> page.
            </p>
            <Code lang="html">{`<!-- Standard tracker (uses localStorage) -->
<script async src="https://api.srctk.com/tracker/tracker.min.js"
        data-site-key="YOUR_SITE_KEY"></script>`}</Code>
            <p>That's it. Pageviews are tracked automatically on every navigation, including SPA route changes.</p>

            <H3>Record a conversion</H3>
            <Code lang="js">{`// Call this on your order confirmation / thank-you page
window.sourcetrack.conversion({
  value: 99.00,          // revenue attributed to this conversion
  type:  'purchase',     // any string label
  order_id: 'ORD-1234'  // optional, used for deduplication
})`}</Code>

            <H3>Identify a user</H3>
            <Code lang="js">{`// Call after login / sign-up to attach a user ID or traits to the visitor
window.sourcetrack.identify('user_123', {
  name:  'Jane Doe'
})`}</Code>

            <H3>Custom event</H3>
            <Code lang="js">{`window.sourcetrack.track('button_clicked', { button: 'hero_cta' })`}</Code>
          </Section>

          {/* ── Tracker Script ───────────────────────────────────────────── */}
          <Section id="tracker" title="Tracker Script">
            <p>
              The tracker is a lightweight (~4 KB gzip) IIFE script. It does not use third-party cookies.
              By default it stores three values in <IC>localStorage</IC>:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse my-2">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-4">Key</th>
                    <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-4">Storage</th>
                    <th className="text-left text-xs font-semibold text-gray-500 py-2">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {[
                    ['st_aid', 'localStorage', 'Anonymous visitor ID — stable across sessions, persists until cleared'],
                    ['st_ft_src / med / cmp / ts', 'localStorage', 'First-touch UTM attribution — written once on first visit, never overwritten'],
                    ['st_sid', 'sessionStorage', 'Session ID — new per browser tab'],
                  ].map(([k, s, d]) => (
                    <tr key={k} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-2 pr-4 font-mono text-gray-800 dark:text-gray-200">{k}</td>
                      <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{s}</td>
                      <td className="py-2 text-gray-600 dark:text-gray-400">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>
              Under GDPR/ePrivacy, <IC>localStorage</IC> counts as tracking storage and typically requires a
              consent banner. Use <strong>Cookieless Mode</strong> (below) if you want to track without any
              consent mechanism.
            </Note>

            <H3>Public API</H3>
            <ParamTable params={[
              { name: 'window.sourcetrack.conversion(opts)', type: 'function', required: false, desc: 'Record a conversion. opts: { value, type, order_id }' },
              { name: 'window.sourcetrack.identify(userId, traits)', type: 'function', required: false, desc: 'Attach a user ID and optional identity traits to the current visitor. traits: { name, ...custom }' },
              { name: 'window.sourcetrack.track(event, props)', type: 'function', required: false, desc: 'Send any custom event with optional properties object.' },
            ]} />
          </Section>

          {/* ── Path Exclusions ────────────────────────────────────────── */}
          <Section id="exclusions" title="Path Exclusions">
            <p>
              SourceTrack supports path exclusions at two levels: (1) server-side via site settings (the authoritative source of truth), and (2) client-side in the pixel tracker.
            </p>
            <p>
              When a page path matches an exclusion pattern, no pageviews, conversions, or custom events on that path will be recorded. Excluded traffic is dropped immediately.
            </p>

            <H3>1. Server-Side Exclusions (Authoritative)</H3>
            <p>
              Configure exclusions on the Settings page of your dashboard. Enter a comma-separated list of paths (e.g. <IC>/admin/*, /staging, /secret-landing</IC>).
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-sm text-gray-600 dark:text-gray-400">
              <li><strong>Wildcards:</strong> Use a trailing asterisk <IC>*</IC> to exclude all nested sub-paths (e.g., <IC>/admin/*</IC> matches both <IC>/admin</IC> and <IC>/admin/settings</IC>).</li>
              <li><strong>Exact Matches:</strong> Paths without wildcards (e.g., <IC>/hidden-page</IC>) must match the pathname exactly.</li>
            </ul>

            <H3>2. Client-Side Exclusions (Snippet Helper)</H3>
            <p>
              To prevent the tracker from sending events on specific paths, use the <IC>data-exclude</IC> attribute directly on the tracker script tag.
              The tracker listens to SPA routing (pushState/popstate) and dynamically suppresses event sends when navigating into excluded paths.
            </p>
            <Code lang="html">{`<!-- Exclude admin and checkout success pages -->
<script async src="https://api.srctk.com/tracker/tracker.min.js"
        data-site-key="YOUR_SITE_KEY"
        data-exclude="/admin/*, /checkout/success"></script>`}</Code>
          </Section>

          {/* ── Cookieless Mode ──────────────────────────────────────────── */}
          <Section id="cookieless" title="Cookieless Mode">
            <p>
              Enable <strong>Cookieless Mode</strong> in Settings → Cookieless Tracking. The tracker will
              switch to <IC>tracker.cookieless.js</IC>, which stores <em>nothing</em> in the browser.
            </p>
            <Code lang="html">{`<!-- Cookieless tracker — no localStorage, no cookies -->
<script async src="https://api.srctk.com/tracker/tracker.cookieless.js"
        data-site-key="YOUR_SITE_KEY"></script>`}</Code>

            <p>
              On load, the tracker fetches a server-derived visitor ID from{' '}
              <IC>GET /api/tracker/id</IC>. The ID is a SHA-256 hash of:
            </p>
            <Code lang="text">{`SHA-256( HMAC(daily_salt, UTC-date) : site_key : SHA-256(IP) : SHA-256(UserAgent) )`}</Code>
            <p>
              The raw IP address is <strong>never logged or stored</strong>. The visitor ID rotates every
              24 h (UTC midnight). The session ID rotates every 1 h.
            </p>
            <Note>
              Because there is no persistent storage, first-touch attribution is scoped to the current
              session. Multi-session first-touch tracking requires the standard tracker.
            </Note>

            <H3>Compliance table</H3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse my-2">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-6">Regulation</th>
                    <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-6">Standard tracker</th>
                    <th className="text-left text-xs font-semibold text-gray-500 py-2">Cookieless tracker</th>
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {[
                    ['GDPR (EU)', 'Needs consent banner', '✅ No consent required'],
                    ['ePrivacy / PECR', 'Needs consent banner', '✅ No consent required'],
                    ['CCPA (US)', '✅ OK (no personal data sold)', '✅ OK'],
                    ['First-touch attribution', '✅ Persistent across sessions', '⚡ Session-scoped only'],
                  ].map(([r, s, c]) => (
                    <tr key={r} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-2 pr-6 font-semibold text-gray-800 dark:text-gray-200">{r}</td>
                      <td className="py-2 pr-6 text-gray-500 dark:text-gray-400">{s}</td>
                      <td className="py-2 text-gray-600 dark:text-gray-300">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Timezone Behavior ────────────────────────────────────────── */}
          <Section id="timezone" title="Timezone Behavior">
            <p>
              By default, all sites in SourceTrack report using Coordinated Universal Time (UTC).
              However, you can configure a custom reporting timezone in your dashboard under <strong>Settings → Site Settings</strong>.
            </p>
            <p>
              Once configured, the following behavior will apply:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-1 text-sm text-gray-600 dark:text-gray-400">
              <li>
                <strong>Dashboard Trends:</strong> The "Revenue Trend" and "Leads Over Time" daily charts on your overview dashboard will group metrics and conversions according to the selected local timezone day boundaries (e.g. 12:00 AM to 11:59 PM in New York).
              </li>
              <li>
                <strong>Raw Event Feeds & Logs:</strong> The Event Logger, recent activity lists, and raw debugger logs will remain in UTC or use exact timestamps. This ensures debugging remains simple and matches the raw ingestion pipeline telemetry.
              </li>
              <li>
                <strong>Custom/Saved Reports:</strong> The Report Builder and custom saved reports currently process dates in UTC.
              </li>
            </ul>
            <Note>
              Timezone-aware query execution utilizes index-friendly padded search windows (±24h UTC boundaries) to retrieve candidate rows, keeping queries index-friendly and performance-conscious.
            </Note>
          </Section>

          {/* ── Installation Guides ─────────────────────────────────────── */}
          <Section id="recipes" title="Installation Guides">
            <p>
              Implement custom manual tracking setups for your specific framework, CMS, authentication flow, checkout success page, or backend conversion flow using these copy-paste setup recipes. All recipes are conversion-ready and work with your existing stack.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-6">
              {/* Recipe tabs */}
              <div className="md:col-span-4 flex flex-col gap-1 max-h-[500px] overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg p-2 bg-gray-50 dark:bg-[#1a1d1d]">
                {Object.entries(RECIPES).map(([key, r]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedRecipe(key)}
                    className={`text-left px-3 py-2 rounded text-xs transition-colors ${
                      selectedRecipe === key
                        ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>

              {/* Selected recipe details */}
              <div className="md:col-span-8 space-y-4">
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-[#111414]">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">{RECIPES[selectedRecipe].name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{RECIPES[selectedRecipe].desc}</p>
                  <Code lang={selectedRecipe === 'offline' || selectedRecipe === 'woocommerce' || selectedRecipe === 'wordpress' ? 'code' : 'js'}>
                    {RECIPES[selectedRecipe].code}
                  </Code>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 bg-gray-50 dark:bg-[#1a1d1d] p-3 rounded border border-gray-100 dark:border-gray-800">
                    <strong>Setup:</strong> {RECIPES[selectedRecipe].instructions}
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* ── POST /api/track ──────────────────────────────────────────── */}
          <Section id="track" title="Track Pageview / Event">
            <Endpoint method="POST" path="/api/track" description="No auth — validated by site_key" />
            <p>
              The tracker calls this automatically for every pageview. You can also call it directly from
              your server for server-side event ingestion.
            </p>

            <H3>Request body</H3>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'Your site key from the Settings page.' },
              { name: 'event', type: 'string', required: false, desc: 'Event name. Defaults to $pageview.' },
              { name: 'anonymous_id', type: 'string', required: false, desc: 'Visitor UUID. Auto-generated if omitted.' },
              { name: 'session_id', type: 'string', required: false, desc: 'Session UUID.' },
              { name: 'page_url', type: 'string', required: false, desc: 'Full URL of the page.' },
              { name: 'referrer', type: 'string', required: false, desc: 'HTTP referrer.' },
              { name: 'utm_source', type: 'string', required: false, desc: 'UTM source. Lowercased automatically.' },
              { name: 'utm_medium', type: 'string', required: false, desc: 'UTM medium.' },
              { name: 'utm_campaign', type: 'string', required: false, desc: 'UTM campaign.' },
              { name: 'utm_content', type: 'string', required: false, desc: 'UTM content.' },
              { name: 'utm_term', type: 'string', required: false, desc: 'UTM term.' },
              { name: 'gclid / fbclid / msclkid / ttclid', type: 'string', required: false, desc: 'Click IDs for paid channel detection.' },
              { name: 'first_touch_source', type: 'string', required: false, desc: 'Pass the stored first-touch source for attribution.' },
              { name: 'first_touch_medium', type: 'string', required: false, desc: 'Pass the stored first-touch medium.' },
              { name: 'first_touch_campaign', type: 'string', required: false, desc: 'Pass the stored first-touch campaign.' },
            ]} />

            <H3>Example</H3>
            <Code lang="bash">{`curl -X POST https://api.srctk.com/api/track \\
  -H "Content-Type: application/json" \\
  -d '{
    "site_key":     "sk_live_abc123",
    "event":        "$pageview",
    "anonymous_id": "550e8400-e29b-41d4-a716-446655440000",
    "page_url":     "https://yoursite.com/pricing",
    "referrer":     "https://google.com",
    "utm_source":   "google",
    "utm_medium":   "cpc",
    "utm_campaign": "brand-search"
  }'`}</Code>

            <H3>Response</H3>
            <Code lang="json">{`{ "success": true, "data": { "received": true }, "error": null }`}</Code>
          </Section>

          {/* ── POST /api/conversion ─────────────────────────────────────── */}
          <Section id="conversion" title="Track Conversion">
            <Endpoint method="POST" path="/api/conversion" description="No auth — validated by site_key" />
            <p>
              Record a revenue-generating conversion event. This is what powers the attribution models.
              Call it on your order confirmation page, after a lead form submit, or from your server.
            </p>

            <H3>Request body</H3>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'Your site key.' },
              { name: 'anonymous_id', type: 'string', required: true, desc: 'Visitor UUID — must match the ID used in pageview calls so touchpoints can be stitched.' },
              { name: 'conversion_value', type: 'number', required: false, desc: 'Revenue amount (e.g. 99.00). Defaults to 0.' },
              { name: 'conversion_type', type: 'string', required: false, desc: 'Conversion label (e.g. "purchase", "lead", "trial"). Defaults to "conversion".' },
              { name: 'order_id', type: 'string', required: false, desc: 'Idempotency key — duplicate order_ids for the same site are discarded.' },
              { name: 'page_url', type: 'string', required: false, desc: 'Page where the conversion happened.' },
              { name: 'utm_source / utm_medium / utm_campaign', type: 'string', required: false, desc: 'Last-touch UTM signals (current page).' },
              { name: 'first_touch_source / first_touch_medium / first_touch_campaign', type: 'string', required: false, desc: 'First-touch signals stored on the client. Critical for first-touch attribution models.' },
              { name: 'gclid / fbclid / msclkid / ttclid', type: 'string', required: false, desc: 'Click IDs for last-touch ad channel detection.' },
            ]} />

            <H3>Server-side example (Node.js)</H3>
            <Code lang="js">{`// Call from your webhook / order fulfilment service
await fetch('https://api.srctk.com/api/conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site_key:         'sk_live_abc123',
    anonymous_id:     req.body.anonymous_id,   // pass through from client
    conversion_value: 199.00,
    conversion_type:  'purchase',
    order_id:         'ORD-9876',
    first_touch_source:   req.body.first_touch_source,
    first_touch_medium:   req.body.first_touch_medium,
    first_touch_campaign: req.body.first_touch_campaign,
  })
})`}</Code>

            <H3>Offline conversion (delayed import)</H3>
            <Endpoint method="POST" path="/api/conversion/offline" description="No auth — validated by site_key" />
            <p>
              Same schema as <IC>/api/conversion</IC>. Use this endpoint when you are importing historical
              conversions or sending them after a delay (e.g. CRM sync). Duplicate order IDs are silently
              ignored.
            </p>

            <H3>Response</H3>
            <Code lang="json">{`{ "success": true, "data": { "received": true }, "error": null }`}</Code>
          </Section>

          {/* ── POST /api/identify ───────────────────────────────────────── */}
          <Section id="identify" title="Identify Visitor">
            <Endpoint method="POST" path="/api/identify" description="No auth — validated by site_key" />
            <p>
              Attach identity traits to an anonymous visitor. Call this after sign-up or login. The
              anonymous ID is aliased to the user ID, so events before and after login are
              stitched together automatically.
            </p>

            <H3>Request body</H3>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'Your site key.' },
              { name: 'anonymous_id', type: 'string', required: true, desc: 'The visitor\'s current anonymous_id from the tracker.' },
              { name: 'user_id', type: 'string', required: false, desc: 'Your internal user ID. If provided, the anonymous_id is aliased to it.' },
              { name: 'email', type: 'string', required: false, desc: 'User email.' },
              { name: 'name', type: 'string', required: false, desc: 'Display name.' },
              { name: 'traits', type: 'object', required: false, desc: 'Any additional key/value properties to attach to the person profile.' },
              { name: 'source_system', type: 'string', required: false, desc: 'e.g. "shopify", "stripe", "hubspot" — source of the identification.' },
              { name: 'external_id', type: 'string', required: false, desc: 'ID in an external system (CRM, payment processor).' },
              { name: 'contact_email', type: 'string', required: false, desc: 'Contact email (separate from login email, e.g. for B2B).' },
            ]} />

            <H3>Example</H3>
            <Code lang="js">{`window.sourcetrack.identify('user_123', {
  name:         'Jane Doe',
  traits: {
    plan:       'pro',
    company:    'Acme Inc'
  }
})`}</Code>

            <H3>Response</H3>
            <Code lang="json">{`{ "success": true, "data": { "received": true }, "error": null }`}</Code>
          </Section>

          {/* ── GET /api/attribution ─────────────────────────────────────── */}
          <Section id="attribution" title="Attribution Data">
            <Endpoint method="GET" path="/api/attribution" description="Requires Bearer token + site_key" />
            <p>
              Query multi-touch attribution data across 7 models. Powers the Dashboard and Report Builder.
              Results are pre-aggregated nightly from the full touchpoint graph.
            </p>

            <H3>Query parameters</H3>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'Your site key.' },
              { name: 'model', type: 'string', required: true, desc: 'Attribution model: first_touch · last_touch · first_touch_non_direct · last_touch_non_direct · ai_platforms · linear · u_shaped' },
              { name: 'date_from', type: 'string', required: true, desc: 'ISO 8601 date (YYYY-MM-DD). Start of range (inclusive).' },
              { name: 'date_to', type: 'string', required: true, desc: 'ISO 8601 date (YYYY-MM-DD). End of range (inclusive).' },
              { name: 'group_by', type: 'string', required: false, desc: 'Dimension to break down by: channel · source · medium · campaign · ai_source · landing_page · country · device · conversion_type · date' },
              { name: 'metric', type: 'string', required: false, desc: 'Metric to aggregate: revenue · conversions · conversion_rate · avg_conversion_value · ai_conversions · ai_revenue · ltv_revenue · days_to_convert · touchpoints_per_conversion' },
              { name: 'group_by2', type: 'string', required: false, desc: 'Optional second dimension for a 2D breakdown.' },
              { name: 'time_granularity', type: 'string', required: false, desc: 'When group_by=date: day · week · month · quarter · year' },
              { name: 'attribution_window', type: 'string', required: false, desc: 'Filter conversions to those that occurred within N days of first touch: 1 · 7 · 14 · 30 · 60 · 90 · ltv' },
              { name: 'attribute_by', type: 'string', required: false, desc: 'Which date to use: conversion_date (default) · first_seen_date · original_source_date' },
              { name: 'filter_channel', type: 'string', required: false, desc: 'Filter to a specific channel (e.g. "Organic Search").' },
              { name: 'filter_source', type: 'string', required: false, desc: 'Filter to a specific source (e.g. "google").' },
              { name: 'filter_campaign', type: 'string', required: false, desc: 'Filter to a campaign name.' },
              { name: 'filter_country', type: 'string', required: false, desc: 'ISO 3166 country code.' },
              { name: 'filter_device_type', type: 'string', required: false, desc: '"desktop" | "mobile" | "tablet"' },
              { name: 'filter_customer_type', type: 'string', required: false, desc: '"new" | "returning"' },
            ]} />

            <H3>Attribution models</H3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse my-2">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-6 w-48">Model</th>
                    <th className="text-left text-xs font-semibold text-gray-500 py-2">Credit distribution</th>
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {[
                    ['first_touch', '100% to the first touchpoint'],
                    ['last_touch', '100% to the last touchpoint before conversion'],
                    ['first_touch_non_direct', '100% to the first non-direct touchpoint (ignores "direct/none")'],
                    ['last_touch_non_direct', '100% to the last non-direct touchpoint before conversion'],
                    ['ai_platforms', 'Isolates traffic from AI assistants (ChatGPT, Claude, Perplexity, etc.)'],
                    ['linear', 'Equally distributed across all touchpoints in the path'],
                    ['u_shaped', '40% first touch, 40% last touch, 20% split equally across middle'],
                  ].map(([m, d]) => (
                    <tr key={m} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-2 pr-6 font-mono text-gray-800 dark:text-gray-200 align-top">{m}</td>
                      <td className="py-2 text-gray-600 dark:text-gray-400">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <H3>Example — channel revenue under first_touch</H3>
            <Code lang="bash">{`curl "https://api.srctk.com/api/attribution?site_key=sk_live_abc123&model=first_touch&date_from=2026-04-01&date_to=2026-04-30&group_by=channel&metric=revenue" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`}</Code>

            <H3>Response</H3>
            <Code lang="json">{`{
  "success": true,
  "data": {
    "model": "first_touch",
    "date_from": "2026-04-01",
    "date_to": "2026-04-30",
    "group_by": "channel",
    "metric": "revenue",
    "results": [
      { "dimension": "Organic Search", "value": 12400.00 },
      { "dimension": "Paid Search",    "value":  8750.50 },
      { "dimension": "AI Search",      "value":  3200.00 },
      { "dimension": "Direct",         "value":  2100.00 }
    ]
  },
  "error": null
}`}</Code>

            <H3>Attribution Explain endpoint</H3>
            <Endpoint method="GET" path="/api/attribution/explain" description="Requires Bearer token + site_key" />
            <p>
              Returns per-conversion explanations — the full touchpoint path and how credit was distributed.
              Same query parameters as <IC>/api/attribution</IC>.
            </p>
          </Section>

          {/* ── GET /api/tracker/id ──────────────────────────────────────── */}
          <Section id="tracker-id" title="Cookieless Visitor ID">
            <Endpoint method="GET" path="/api/tracker/id?site_key=xxx" description="Public — called by tracker.cookieless.js" />
            <p>
              Returns a server-derived <IC>visitor_id</IC> and <IC>session_id</IC> without setting any
              cookies. Called automatically by <IC>tracker.cookieless.js</IC> — you don't normally need
              to call this yourself.
            </p>

            <H3>Query parameters</H3>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'Your site key.' },
            ]} />

            <H3>Response</H3>
            <Code lang="json">{`{
  "visitor_id": "065968f48865120c6980818edf0a1303ae9a2d94c6e4ae1840df05ec3d606594",
  "session_id":  "6c09c032d9aef254b79fd0776c6aea8197d996561bc58d209fb2b3e101177c7c"
}`}</Code>
            <Note>
              <IC>visitor_id</IC> rotates at UTC midnight. <IC>session_id</IC> rotates every hour.
              Response headers include <IC>Cache-Control: no-store</IC> — do not cache this endpoint.
            </Note>
          </Section>

          {/* ── PATCH /api/integrations/settings ───────────────────────────── */}
          <Section id="settings-api" title="Update Site Settings">
            <Endpoint method="PATCH" path="/api/integrations/settings?site_key=xxx" description="Requires Bearer token + site_key" />
            <p>
              Updates the configurations for a site, including attribution window size, custom reporting timezone, and excluded path patterns.
              Requires authentication via a Bearer token and the <IC>site_key</IC> passed as a query parameter or inside the request headers.
            </p>

            <H3>Query parameters</H3>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'The site key of the site being configured.' },
            ]} />

            <H3>Payload</H3>
            <p>
              Pass a JSON object with one or more of the following properties:
            </p>
            <ParamTable params={[
              { name: 'attribution_window_days', type: 'number', required: false, desc: 'Attribution lookback window in days. Must be one of: 1, 7, 14, 30, 60, 90.' },
              { name: 'timezone', type: 'string', required: false, desc: 'Canonical timezone identifier (e.g. "America/New_York", "Europe/London"). Defaults to "UTC" on null or empty.' },
              { name: 'excluded_paths', type: 'array|string', required: false, desc: 'Path patterns to exclude from tracking. Can be an array of paths or a comma-separated string.' },
            ]} />
            <Code lang="json">{`{
  "attribution_window_days": 30,
  "timezone": "America/New_York",
  "excluded_paths": ["/admin/*", "/checkout/success", "/secret"]
}`}</Code>

            <H3>Response</H3>
            <Code lang="json">{`{
  "success": true,
  "data": {
    "id": "a2cec48d-3eae-4c52-82d7-4919835eaf33",
    "attribution_window_days": 30,
    "excluded_paths": [
      "/admin/*",
      "/checkout/success",
      "/secret"
    ],
    "timezone": "America/New_York"
  },
  "error": null
}`}</Code>

            <H3>Troubleshooting & Validation</H3>
            <ul className="list-disc list-inside space-y-2 pl-1 text-sm text-gray-600 dark:text-gray-400">
              <li>
                <strong>Invalid Timezone:</strong> If an unsupported timezone identifier is passed, the endpoint returns a <IC>400 Bad Request</IC> with <IC>{'{"error": "Invalid timezone: [value]"}'}</IC>. Check spelling against standard IANA names.
              </li>
              <li>
                <strong>Invalid Attribution Window:</strong> Must be exactly one of the allowed numbers. Otherwise, returns <IC>400 Bad Request</IC>.
              </li>
              <li>
                <strong>Caching:</strong> The server caches site configuration contexts for 5 minutes. After updating settings via this API, the cache is invalidated automatically, so changes apply to new incoming tracking events immediately.
              </li>
            </ul>
          </Section>

          {/* ── GDPR Endpoints ───────────────────────────────────────────── */}
          <Section id="gdpr" title="GDPR Endpoints">
            <p>
              All GDPR endpoints require a valid Bearer token. They are designed to fulfil Article 17
              (right to erasure) and Article 5(1)(e) (storage limitation) obligations under GDPR.
            </p>

            <H3>Erase visitor data</H3>
            <Endpoint method="DELETE" path="/api/gdpr/visitor" description="Requires Bearer token" />
            <p>
              Permanently deletes all <IC>attributed_conversions</IC> records for a visitor and submits a
              data deletion request to the analytics backend. Irreversible.
            </p>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'Your site key.' },
              { name: 'anonymous_id', type: 'string', required: true, desc: 'The visitor\'s anonymous_id to erase.' },
            ]} />
            <Code lang="bash">{`curl -X DELETE https://api.srctk.com/api/gdpr/visitor \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "site_key": "sk_live_abc123", "anonymous_id": "550e8400-e29b-41d4-a716-446655440000" }'`}</Code>
            <Code lang="json">{`{
  "success": true,
  "message": "Visitor data for anonymous_id \"550e8400...\" has been erased."
}`}</Code>

            <H3>Set data retention policy</H3>
            <Endpoint method="PUT" path="/api/gdpr/retention" description="Requires Bearer token" />
            <p>
              Set an automatic purge window. Attribution records older than <IC>retention_days</IC> are
              deleted every night.
            </p>
            <ParamTable params={[
              { name: 'site_key', type: 'string', required: true, desc: 'Your site key.' },
              { name: 'retention_days', type: 'number', required: true, desc: 'Days to retain data: 30 | 60 | 90 | 180 | 365 | 0 (keep forever).' },
            ]} />
            <Code lang="bash">{`curl -X PUT https://api.srctk.com/api/gdpr/retention \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "site_key": "sk_live_abc123", "retention_days": 90 }'`}</Code>

            <H3>Delete account</H3>
            <Endpoint method="DELETE" path="/api/gdpr/account" description="Requires Bearer token" />
            <p>
              Permanently purges all sites, attribution data, and the authenticated user's account from
              Supabase auth. This is irreversible and takes effect immediately.
            </p>
            <Warn>
              There is no undo. The user will be signed out and the account destroyed. Ensure you have a
              confirmation UI (e.g. type "DELETE") before calling this endpoint.
            </Warn>
            <Code lang="bash">{`curl -X DELETE https://api.srctk.com/api/gdpr/account \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`}</Code>
          </Section>

          {/* ── Outbound Webhooks ───────────────────────────────────────── */}
          <Section id="webhooks" title="Outbound Webhooks">
            <p>
              SourceTrack can send attributed conversion data to custom HTTP endpoints, Zapier, n8n, Make, and CRMs in real time using generic outbound webhooks.
            </p>
            <p>
              When a conversion is successfully recorded and accepted, a <IC>POST</IC> request is triggered to your configured endpoint with the conversion data payload. Duplicate conversions are not sent.
            </p>

            <H3>Payload structure</H3>
            <Code lang="json">{`{
  "event": "conversion.created",
  "created_at": "2026-06-05T15:00:00.000Z",
  "site_key": "sk_live_abc123",
  "conversion": {
    "type": "purchase",
    "value": 100,
    "currency": "USD",
    "order_id": "ORD-1234",
    "event_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "visitor": {
    "anonymous_id": "8a7c6b5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d",
    "user_id": "user_9876"
  },
  "attribution": {
    "source": "google",
    "medium": "cpc",
    "campaign": "brand-search",
    "content": "brand-headline",
    "term": "sourcetrack analytics",
    "channel": "Paid Search"
  },
  "page": {
    "page_url": "https://example.com/checkout/thank-you",
    "referrer": "https://google.com"
  },
  "properties": {}
}`}</Code>

            <H3>Signature Verification</H3>
            <p>
              Each webhook request contains an <IC>X-SourceTrack-Signature</IC> header. You can use it to verify that the request came from SourceTrack.
              The signature is an HMAC hex digest of the raw request body using your webhook's signing secret (SHA-256).
            </p>
            <Code lang="js">{`// Node.js Express verification example
const crypto = require('crypto');

app.post('/webhook-receiver', (req, res) => {
  const signature = req.headers['x-sourcetrack-signature'];
  const secret = 'YOUR_WEBHOOK_SIGNING_SECRET';

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature === expectedSignature) {
    // Request is verified and safe
    res.sendStatus(200);
  } else {
    // Unauthorized
    res.sendStatus(401);
  }
});`}</Code>

            <H3>Zapier / n8n / Make Integration</H3>
            <p>
              To process SourceTrack conversions in automation tools, configure a webhook trigger step (e.g. "Webhook by Zapier" Catch Hook, "Webhook" node in n8n, or "Custom Webhook" in Make) to receive events:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2 font-light">
              <li>Create a new webhook trigger in Zapier/n8n/Make and copy the provided webhook URL.</li>
              <li>Paste the URL into the **Outbound Webhooks** card under **Integrations** in your SourceTrack dashboard and click **Save**.</li>
              <li>Use the **Test Webhook** button to send a sample payload to establish the schema in your workflow.</li>
              <li>Route fields such as <IC>conversion.value</IC>, <IC>conversion.type</IC>, <IC>visitor.user_id</IC>, <IC>attribution.source</IC>, and <IC>attribution.campaign</IC> downstream to your CRMs, Slack, sheets, or analytics targets.</li>
            </ul>
          </Section>

          {/* ── Authentication ───────────────────────────────────────────── */}
          <Section id="auth" title="Authentication">
            <p>There are two authentication mechanisms depending on the endpoint category:</p>

            <H3>Site key (tracking endpoints)</H3>
            <p>
              Tracking endpoints (<IC>/api/track</IC>, <IC>/api/conversion</IC>, <IC>/api/identify</IC>)
              accept a <IC>site_key</IC> in the request body. Your site key is shown in{' '}
              <Link to="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">Settings</Link>.
              It is safe to embed in front-end code.
            </p>
            <Code lang="json">{`// In the request body:
{ "site_key": "sk_live_abc123", ... }`}</Code>

            <H3>Bearer token (analytics &amp; GDPR endpoints)</H3>
            <p>
              Analytics and GDPR endpoints require a user access token obtained from Supabase Auth.
              In a browser context, the SourceTrack dashboard handles this automatically. For server-to-server
              calls, exchange your credentials for a token first:
            </p>
            <Code lang="js">{`import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data: { session } } = await supabase.auth.signInWithPassword({
  email: 'you@example.com', password: 'your-password'
})

const token = session.access_token

// Then use it:
fetch('/api/attribution?site_key=...&model=first_touch&...', {
  headers: { Authorization: \`Bearer \${token}\` }
})`}</Code>
          </Section>

          {/* ── Errors ───────────────────────────────────────────────────── */}
          <Section id="errors" title="Error Handling">
            <p>
              All responses follow the same envelope regardless of success or failure:
            </p>
            <Code lang="json">{`// Success
{ "success": true,  "data": { ... }, "error": null }

// Failure
{ "success": false, "data": null,   "error": "Human-readable message" }`}</Code>

            <H3>HTTP status codes</H3>
            <ParamTable params={[
              { name: '200', type: '', required: false, desc: 'Request succeeded.' },
              { name: '400', type: '', required: false, desc: 'Bad request — missing or invalid parameter. Check the error field.' },
              { name: '401', type: '', required: false, desc: 'Missing or expired Bearer token.' },
              { name: '403', type: '', required: false, desc: 'Valid token but you do not own (or are not a member of) the requested site.' },
              { name: '429', type: '', required: false, desc: 'Rate limit exceeded. Back off and retry.' },
              { name: '500', type: '', required: false, desc: 'Internal server error. These are logged — contact support if they persist.' },
            ]} />
          </Section>

          {/* ── Changelog ───────────────────────────────────────────────── */}
          <Section id="changelog" title="Changelog">
            {[
              {
                date: '2026-05-19',
                items: [
                  'Added cookieless tracker variant (tracker.cookieless.js) — zero browser storage, server-derived daily-rotating ID',
                  'Added GET /api/tracker/id — server-side visitor ID endpoint',
                  'Added GDPR endpoints: DELETE /api/gdpr/visitor, DELETE /api/gdpr/account, PUT /api/gdpr/retention',
                  'Added data_retention_days to sites — nightly auto-purge of old attribution records',
                  'Fixed linear + u_shaped attribution models — channel field was missing from stored touchpoints',
                  'Restored sessions KPI in dashboard (extracted from bounce_rate HogQL for free)',
                ]
              },
              {
                date: '2026-05-16',
                items: [
                  'Optimized dashboard data loading with faster parallel queries',
                  'Fixed NaN values on Campaigns and Leads pages',
                  'Added dark mode to Report Builder',
                  'Fixed tracker snippet URL in Analytics install guide',
                ]
              },
            ].map(({ date, items }) => (
              <div key={date} className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{date}</p>
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="text-gray-400 mt-0.5 shrink-0">–</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>

          {/* Footer */}
          <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-600">
            <p>
              Questions?{' '}
              <a href="mailto:support@sourcetrack.ai" className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline underline-offset-2">
                support@sourcetrack.ai
              </a>
              {' · '}
              <a href="https://sourcetrack.ai" target="_blank" rel="noopener noreferrer" className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline underline-offset-2">
                sourcetrack.ai
              </a>
            </p>
          </div>
        </main>

        {/* ── Right gutter — blank spacer for balance ─────────────────── */}
        <div className="hidden xl:block w-40 shrink-0" />
      </div>
    </div>
  )
}
