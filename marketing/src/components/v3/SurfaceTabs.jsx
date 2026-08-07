import { useState } from 'react'

// Capture-surface tabs — the handoff's `surface-logos` mount, recreated.
//
// §35.4: TEXT LABELS ONLY. The handoff renders `<span>{name}</span>` and draws no marks —
// verified: surface-logos.jsx contains zero <svg>, <path> or viewBox. This follows it
// exactly. Every integration below is named, never drawn.
//
// The only motion in the handoff version is a per-cell animationDelay on entry; that is a
// CSS concern and is gated by the reduced-motion media query in v3-surfaces.css rather
// than by JS, because it is a pure CSS animation with no timer behind it.
const SURFACES = [
  { id: 'forms',    tab: 'Forms',    n: 12, h: 'Every form, every source',
    sub: 'Submissions arrive with the full path already attached.',
    items: ['HubSpot', 'Typeform', 'Webflow', 'Gravity Forms', 'Contact Form 7', 'Elementor'], more: '+6 more' },
  { id: 'meetings', tab: 'Meetings', n: 4,  h: 'Booked demos, attributed',
    sub: 'Know where a meeting came from before you walk into it.',
    items: ['Calendly', 'Cal.com', 'HubSpot Meetings', 'Chili Piper'], more: '' },
  { id: 'payments', tab: 'Payments', n: 5,  h: 'Revenue, not just conversions',
    sub: 'Each charge rolls up to the channel that earned it.',
    items: ['Stripe', 'Shopify', 'Paddle', 'Chargebee', 'Lemon Squeezy'], more: '' },
]

export default function SurfaceTabs() {
  const [id, setId] = useState('forms')
  const s = SURFACES.find((x) => x.id === id) || SURFACES[0]
  return (
    <div class="v3-surf">
      <div class="v3-surf-tabs" role="tablist">
        {SURFACES.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={x.id === id}
            class={`v3-surf-tab${x.id === id ? ' is-on' : ''}`}
            onClick={() => setId(x.id)}
          >
            {x.tab}<i>{x.n}</i>
          </button>
        ))}
      </div>
      <div class="v3-surf-body" key={id}>
        <div class="v3-surf-head">
          <h3>{s.h}</h3>
          <p>{s.sub}</p>
        </div>
        <div class="v3-surf-grid">
          {s.items.map((name) => <div class="v3-surf-cell" key={name}><span>{name}</span></div>)}
          {s.more && <div class="v3-surf-cell v3-surf-cell--more"><span>{s.more}</span></div>}
        </div>
      </div>
    </div>
  )
}
