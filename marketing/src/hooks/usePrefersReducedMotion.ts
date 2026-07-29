import { useEffect, useState } from "react";

/**
 * usePrefersReducedMotion
 * Returns `true` when the user has asked for reduced motion, and updates if
 * they change the preference without reloading.
 *
 * For anything driven by the `motion` library, the global
 * `MotionGlobalConfig.skipAnimations` flag set in Base.astro already applies.
 * This hook is for the motion that flag cannot see: hand-rolled
 * requestAnimationFrame loops, setInterval auto-advance, and the infinite
 * marquee whose "final keyframe" is not a sane resting position.
 *
 * Starts `false` so server-rendered markup matches the first client render;
 * the effect corrects it on mount.
 */
export default function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}
