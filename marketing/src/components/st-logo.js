/**
 * <st-logo> — the SourceTrack mark. design.md §3.1 / §3.1.1.
 *
 * A signal travelling a track: the track BEHIND the signal is lit and fades into a
 * comet tail, the track AHEAD stays dim, and the signal cuts a clean gap as it passes.
 * That is the product's own claim in miniature — a path is only bright where there is
 * evidence for it — and §3.7 extends the same lit/dim grammar to the attribution trail,
 * the source chip, the loader and the empty state.
 *
 * ── WHY A WEB COMPONENT AND NOT AN .astro PARTIAL ───────────────────────────────
 * SVG <mask> and <clipPath> are referenced by id, and ids are DOCUMENT-global. Two
 * marks on one page (header 44px + footer 48px, which is every page) would collide:
 * the second instance's defs silently win for both. A shadow root scopes ids per
 * instance, which is exactly why §3.1.1 specifies one.
 *
 * ── GEOMETRY IS §3.1.1's, VERBATIM ──────────────────────────────────────────────
 *   viewBox 0 0 48 48, transform translate(2.9 2.7) rotate(28 24 24)
 *   bar A  x 6.2  y 4.5  w 10.4  h 25    rx 5.2  dot r 4.7  travel 14.6  #FF8552  phase -1.35s
 *   bar B  x 22.8 y 3.2  w 11.4  h 38.5  rx 5.7  dot r 5.2  travel 27.1  #CCF03F  phase 0
 *
 * ── THE TRAIL CLIP, DERIVED NOT GUESSED ─────────────────────────────────────────
 * The lit trail is the bar rect clipped by a copy of itself that slides. For the clip's
 * BOTTOM edge to sit exactly on the signal, translateY runs from (signalStart − rectBottom)
 * to (signalEnd − rectBottom):
 *   bar A  rect bottom 4.5+25  =29.5 ; signal 9.2→23.8 ; so −20.3 → −5.7  (range 14.6 ✓)
 *   bar B  rect bottom 3.2+38.5=41.7 ; signal 8.4→35.5 ; so −33.3 → −6.2  (range 27.1 ✓)
 * The ranges equalling `travel` is the check that these are right.
 *
 * ── ATTRIBUTES ──────────────────────────────────────────────────────────────────
 *   size      px, default 44 (header). Footer uses 48.
 *   on-dark   raises --track .42 -> .5 and --lit .85 -> .92
 *   still     freeze on the composed end frame
 *
 * ── REDUCED MOTION: FREEZES, NEVER BLANKS ───────────────────────────────────────
 * `prefers-reduced-motion` lands on the SAME composed end frame as `still` — signals at
 * the end of travel, trails lit behind them. §3.1.1 is explicit that it must never be a
 * blank frame. StLogo.astro's light-DOM fallback draws that same frame for no-JS.
 * Three degraded paths, one picture.
 *
 * ── ONE DELIBERATE SIMPLIFICATION, STATED ───────────────────────────────────────
 * §3.1.1 specifies an ALTERNATING traverse. A comet tail that always trails the signal
 * would have to flip direction on the return leg, which SVG gradients cannot do without
 * a second animated gradient per bar. The tail here is a symmetric fade — strongest at
 * mid-travel, falling off toward both ends — so it reads correctly in both directions at
 * the sizes this renders at (44/48px). Recorded rather than left to be discovered.
 */

const TPL = document.createElement('template')
TPL.innerHTML = `
<style>
  :host {
    display: inline-grid;
    place-items: center;
    inline-size: var(--st-size, 44px);
    block-size: var(--st-size, 44px);
    --track: 0.42;
    --lit: 0.85;
    --dur: 2.9s;
    --ease: cubic-bezier(0.62, 0, 0.38, 1);
  }
  :host([on-dark]) { --track: 0.5; --lit: 0.92; }

  svg { inline-size: 100%; block-size: 100%; display: block; }

  .travel, .dot, .trail {
    animation-duration: var(--dur);
    animation-timing-function: var(--ease);
    animation-iteration-count: infinite;
    animation-direction: alternate;
  }
  /* The ring fires on ARRIVAL, so it runs forward once per leg rather than alternating —
     an alternating pulse would play backwards on the return and read as an implosion. */
  .ring {
    animation: ringPulse var(--dur) ease-out infinite;
  }

  /* Bar A leads B by 1.35s so the two arrivals never pulse in lockstep (§3.1.1). */
  .a .travel, .a .dot, .a .trail, .a .ring { animation-delay: -1.35s; }

  .travel { animation-name: travelY; }
  .dot    { animation-name: dotStretch; }
  .trail  { animation-name: trailFollow; }

  @keyframes travelY {
    from { transform: translateY(0); }
    to   { transform: translateY(var(--travel)); }
  }
  /* Stretches along the axis mid-flight, rounds out at each end (§3.1.1). */
  @keyframes dotStretch {
    0%, 100% { transform: scale(1, 1); }
    18%, 82% { transform: scale(0.93, 1.14); }
  }
  @keyframes trailFollow {
    from { transform: translateY(var(--trail-from)); }
    to   { transform: translateY(var(--trail-to)); }
  }
  @keyframes ringPulse {
    0%, 68% { transform: scale(1);    opacity: 0; }
    76%     { transform: scale(1);    opacity: 0.9; }
    100%    { transform: scale(1.28); opacity: 0; }
  }

  :host(:hover) { --dur: 1.25s; }

  /* FREEZE — one composed end frame, shared by [still] and reduced motion.
     No backticks in here: this block lives inside a JS template literal, and one
     would terminate it. */
  :host([still]) .travel, :host([still]) .dot,
  :host([still]) .trail,  :host([still]) .ring { animation: none; }
  :host([still]) .travel { transform: translateY(var(--travel)); }
  :host([still]) .dot    { transform: scale(1, 1); }
  :host([still]) .trail  { transform: translateY(var(--trail-to)); }
  :host([still]) .ring   { opacity: 0; }

  @media (prefers-reduced-motion: reduce) {
    .travel, .dot, .trail, .ring { animation: none; }
    .travel { transform: translateY(var(--travel)); }
    .dot    { transform: scale(1, 1); }
    .trail  { transform: translateY(var(--trail-to)); }
    .ring   { opacity: 0; }
  }
</style>

<svg viewBox="0 0 48 48" aria-hidden="true">
  <title></title>
  <defs>
    <linearGradient id="fadeA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.15"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="fadeB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.15"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.15"/>
    </linearGradient>
    <mask id="fadeMaskA"><rect x="6.2" y="4.5" width="10.4" height="25" fill="url(#fadeA)"/></mask>
    <mask id="fadeMaskB"><rect x="22.8" y="3.2" width="11.4" height="38.5" fill="url(#fadeB)"/></mask>

    <mask id="gapA">
      <rect width="48" height="48" fill="#fff"/>
      <g class="a" style="--travel:14.6px"><g class="travel" style="transform-origin:11.4px 9.2px">
        <circle cx="11.4" cy="9.2" r="6.1" fill="#000"/></g></g>
    </mask>
    <mask id="gapB">
      <rect width="48" height="48" fill="#fff"/>
      <g class="b" style="--travel:27.1px"><g class="travel" style="transform-origin:28.5px 8.4px">
        <circle cx="28.5" cy="8.4" r="6.7" fill="#000"/></g></g>
    </mask>

    <clipPath id="clipA"><g class="a" style="--trail-from:-20.3px;--trail-to:-5.7px">
      <rect class="trail" x="6.2" y="4.5" width="10.4" height="25" rx="5.2"/></g></clipPath>
    <clipPath id="clipB"><g class="b" style="--trail-from:-33.3px;--trail-to:-6.2px">
      <rect class="trail" x="22.8" y="3.2" width="11.4" height="38.5" rx="5.7"/></g></clipPath>
  </defs>

  <g transform="translate(2.9 2.7) rotate(28 24 24)">
    <!-- ── bar A · peach, the short track ── -->
    <g class="a" style="--travel:14.6px">
      <g mask="url(#gapA)">
        <rect x="6.2" y="4.5" width="10.4" height="25" rx="5.2" fill="#FF8552" opacity="var(--track)"/>
        <g clip-path="url(#clipA)" mask="url(#fadeMaskA)">
          <rect x="6.2" y="4.5" width="10.4" height="25" rx="5.2" fill="#FF8552" opacity="var(--lit)"/>
        </g>
      </g>
      <g class="travel" style="transform-origin:11.4px 9.2px">
        <circle class="ring" cx="11.4" cy="9.2" r="4.7" fill="none" stroke="#FF8552" stroke-width="1.4"
                style="transform-origin:11.4px 9.2px"/>
        <circle class="dot" cx="11.4" cy="9.2" r="4.7" fill="#FF8552"
                style="transform-origin:11.4px 9.2px"/>
      </g>
    </g>

    <!-- ── bar B · lime, the long track ── -->
    <g class="b" style="--travel:27.1px">
      <g mask="url(#gapB)">
        <rect x="22.8" y="3.2" width="11.4" height="38.5" rx="5.7" fill="#CCF03F" opacity="var(--track)"/>
        <g clip-path="url(#clipB)" mask="url(#fadeMaskB)">
          <rect x="22.8" y="3.2" width="11.4" height="38.5" rx="5.7" fill="#CCF03F" opacity="var(--lit)"/>
        </g>
      </g>
      <g class="travel" style="transform-origin:28.5px 8.4px">
        <circle class="ring" cx="28.5" cy="8.4" r="5.2" fill="none" stroke="#CCF03F" stroke-width="1.5"
                style="transform-origin:28.5px 8.4px"/>
        <circle class="dot" cx="28.5" cy="8.4" r="5.2" fill="#CCF03F"
                style="transform-origin:28.5px 8.4px"/>
      </g>
    </g>
  </g>
</svg>
`

class StLogo extends HTMLElement {
  static observedAttributes = ['size', 'title']

  connectedCallback () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' }).append(TPL.content.cloneNode(true))
    }
    this.#sync()
  }

  attributeChangedCallback () { if (this.shadowRoot) this.#sync() }

  #sync () {
    const size = Number(this.getAttribute('size')) || 44
    this.style.setProperty('--st-size', `${size}px`)

    // Accessible name. Decorative beside the wordmark in the header lockup (no title ->
    // aria-hidden), named when it stands alone. The caller decides, not this file.
    const title = this.getAttribute('title')
    const svg = this.shadowRoot.querySelector('svg')
    const t = this.shadowRoot.querySelector('title')
    if (title) {
      t.textContent = title
      svg.setAttribute('role', 'img')
      svg.removeAttribute('aria-hidden')
    } else {
      t.textContent = ''
      svg.setAttribute('aria-hidden', 'true')
      svg.removeAttribute('role')
    }
  }
}

if (!customElements.get('st-logo')) customElements.define('st-logo', StLogo)
