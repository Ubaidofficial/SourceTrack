/*
 * countUp — animate a figure UP TO a value the page has already rendered.
 *
 * §37.1 permits "KPI value on first paint | Count up, cubic ease-out | 900ms", and the
 * product-mechanic row added in #585 adds the constraint that matters here: the number must land
 * on a value the product actually computed, not a value chosen to look good while counting. Both
 * call sites satisfy that — SeoRevenueMockup's total is a reduce() over its own rows, and
 * AiSourceLedgerMockup's figures are the ones api/tests/key-features-mockups.test.js pins against
 * DashboardMockup on the same page.
 *
 * ── WHY THE FINAL TEXT IS COPIED VERBATIM, NEVER COMPOSED ───────────────────────────────
 * The settled text is always `data-count-final`, written out byte-for-byte. The helper never
 * builds the final string from its own formatter, because then the formatter would BE the source
 * of truth for what the mockup claims — and a locale, a rounding rule or a missing thousands
 * separator would silently rewrite a figure that two tests and a neighbouring panel depend on.
 * The interpolated frames are cosmetic; the resting frame is the component's own markup.
 *
 * ── WHY THE SERVER RENDERS THE REAL VALUE, AND WHY THAT IS NOT NEGOTIABLE ────────────────
 * Counter.tsx documents the incident this avoids: it used to server-render `{prefix}0{suffix}`
 * and reach the real figure only once its observer fired, so the static HTML said "0%" for a real
 * 100. Invisible-and-wrong became READABLE-and-wrong the moment #530's <noscript> net started
 * forcing inline-hidden elements visible — a rendered 0 standing in for a real number is exactly
 * the fake zero CLAUDE.md §6 forbids. So the markup here ships the true figure and this helper
 * only ever animates towards it.
 *
 * That inverts the usual fail-open problem. revealOnScroll.ts needs a viewport-checked sweep
 * because a dead IntersectionObserver strands its element INVISIBLE. Here a dead observer strands
 * the element on its CORRECT FINAL VALUE — the failure mode is a missing animation, not missing
 * or wrong data — so a plain observer is sufficient and no sweep is warranted.
 *
 * ── WHY ALREADY-ON-SCREEN LATCHES INSTEAD OF ANIMATING ──────────────────────────────────
 * If the element is in view when the script runs (deep link, short viewport, restored scroll
 * position, print), starting the animation would rewind a figure the visitor is already reading
 * down to near zero and count it back up. That reads as the number changing, which on a revenue
 * panel is the worst possible misreading. On-screen at init means the reveal has effectively
 * already happened, so it settles instead.
 */

const DURATION_MS = 900;

// §37.1: "cubic ease-out". Same curve, expressed for a numeric interpolation rather than CSS.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function isOnScreen(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return r.bottom > 0 && r.top < vh;
}

function run(el: HTMLElement, final: string, to: number, prefix: string, delayMs: number) {
  let frame = 0;
  let start: number | null = null;

  const settle = () => {
    el.textContent = final;
  };

  const step = (now: number) => {
    if (start === null) start = now;
    const t = Math.min((now - start) / DURATION_MS, 1);

    if (t >= 1) {
      // §37.2: reveals fire once. The final frame is the component's own string, not a
      // formatted reconstruction of it, so the settled DOM matches the server HTML exactly.
      settle();
      return;
    }

    const value = Math.floor(easeOutCubic(t) * to);
    el.textContent = prefix + value.toLocaleString("en-US");
    frame = requestAnimationFrame(step);
  };

  window.setTimeout(() => {
    frame = requestAnimationFrame(step);
  }, delayMs);

  window.addEventListener("pagehide", () => {
    if (frame) cancelAnimationFrame(frame);
    settle();
  }, { once: true });
}

/**
 * Binds every element matching `selector`. Always querySelectorAll, never querySelector: #582
 * shipped a selector that bound only the first instance, and the homepage already renders two
 * JourneyMockup trails. These two mockups render once today, but both are also imported by
 * KeyFeatures.astro, so reviving that partial would put a second instance of each on the page.
 *
 * Expected attributes:
 *   data-count-final   the exact settled text, e.g. "$5,040" or "38"
 *   data-count-to      the numeric target used for interpolation only
 *   data-count-prefix  optional, prepended to interpolated frames, e.g. "$"
 *   data-count-delay   optional stagger in ms
 */
export function countUp(selector: string) {
  const els = document.querySelectorAll<HTMLElement>(selector);
  if (!els.length) return;

  // §37.3: under `reduce`, render the final state immediately. The figure is already in the DOM,
  // so this is a no-op by construction — stated explicitly so the guarantee is visible here and
  // not merely inherited. MotionGlobalConfig cannot reach a hand-rolled rAF loop; reduced-motion.css
  // names Counter and TrustedClients as the hand-rolled cases, and this is now a third.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  els.forEach((el) => {
    if (el.dataset.countBound === "1") return; // fire once, survive a re-init
    el.dataset.countBound = "1";

    const final = el.dataset.countFinal;
    const to = Number(el.dataset.countTo);
    if (!final || !Number.isFinite(to)) return;

    const prefix = el.dataset.countPrefix ?? "";
    const delayMs = Number(el.dataset.countDelay ?? 0) || 0;

    if (reduced || isOnScreen(el)) {
      el.textContent = final;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          run(el, final, to, prefix, delayMs);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );
    observer.observe(el);
  });
}
