import { animateMini as animate, inView } from "motion";

/*
 * Scroll reveal that cannot strand its element invisible.
 *
 * THE FAILURE THIS EXISTS FOR is the opposite of the one #530 fixed. CallToAction and Footer
 * never baked opacity:0 into their markup — their templates carry no opacity at all — so a
 * scripting-disabled visitor was always fine and the <noscript> net in Base.astro never had to
 * cover them. The hide happens entirely at runtime: the script set `el.style.opacity = "0"` on
 * every matched element the instant it ran, then handed the un-hiding to inView().
 *
 * So WORKING JS was the dangerous case. Once that line runs, the only thing that can undo it is
 * an IntersectionObserver callback. If the observer never fires for an element — it is on screen
 * but the callback does not arrive, IntersectionObserver is unavailable or throttled, the page is
 * captured or printed without a scroll event — the content stays invisible forever, on a page
 * where JS is working perfectly. A scripting-disabled visitor never hit this at all.
 *
 * WHY A VIEWPORT-CHECKED SWEEP, and not either obvious option:
 *
 *   - "Only hide once the observer is confirmed attached" does not fix it. inView() attaches
 *     synchronously, so there is almost no window between hiding and observing — and the failure
 *     is not that nothing was watching, it is that something was watching and never fired.
 *     Narrowing that window closes a gap that is not the reported one.
 *
 *   - "Force opacity to 1 after a fixed timeout" does fix it, but bluntly: content the visitor
 *     reaches at t=20s would already have been force-revealed at t=3s, so most of the page loses
 *     its animation. That trades a correctness bug for a site-wide aesthetic regression.
 *
 * The sweep below keeps the guarantee and drops the cost: every SWEEP_MS, any element still
 * hidden AND actually inside the viewport is revealed immediately. Genuinely off-screen elements
 * stay hidden and keep their animation, because nobody can see them — being hidden there is not a
 * defect. Only "hidden while on screen" is, and that is exactly what this catches.
 *
 * It deliberately uses getBoundingClientRect rather than a second observer, so it still works
 * when IntersectionObserver itself is the thing that failed.
 */

const SWEEP_MS = 400;

const pending = new Map<HTMLElement, () => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function stopSweeping() {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function isOnScreen(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
}

function sweep() {
  for (const [el, settle] of pending) {
    // View transitions swap the document out from under us; drop anything detached.
    if (!el.isConnected) pending.delete(el);
    else if (isOnScreen(el)) settle();
  }
  if (!pending.size) stopSweeping();
}

type Keyframes = Parameters<typeof animate>[1];
type Options = Parameters<typeof animate>[2];

export function revealOnScroll(el: HTMLElement, keyframes: Keyframes, options: Options) {
  if (pending.has(el)) return;

  el.style.opacity = "0";

  // Whichever path arrives first wins; the other becomes a no-op. Without this, a sweep reveal
  // followed by a late inView would replay the fade from 0 and read as a flicker.
  const settle = (run?: () => void) => {
    if (!pending.delete(el)) return;
    if (run) run();
    else el.style.opacity = "";
    if (!pending.size) stopSweeping();
  };

  pending.set(el, () => settle());
  inView(el, () => settle(() => animate(el, keyframes, options)), { margin: "0px", amount: 0.05 });

  if (timer === undefined) {
    timer = setInterval(sweep, SWEEP_MS);
    window.addEventListener("pagehide", stopSweeping, { once: true });
  }
}
