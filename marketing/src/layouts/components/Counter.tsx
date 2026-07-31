
import React, { useEffect, useRef } from "react";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";

export interface CounterProps {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  startDelay?: number;
}

const Counter: React.FC<CounterProps> = ({
  target,
  duration = 2000,
  prefix = "",
  suffix = "",
  className = "counter",
  startDelay = 0,
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let frame: number;
    let startTime: number | null = null;
    let observer: IntersectionObserver | null = null;

    const animateCount = (
      element: HTMLElement,
      start: number,
      end: number,
      duration: number,
      prefix: string,
      suffix: string,
    ) => {
      prefix = prefix || "";
      suffix = suffix || "";
      startTime = null;

      function step(timestamp: number) {
        if (!startTime) {
          startTime = timestamp;
        }
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        element.textContent = prefix + value + suffix;
        if (progress < 1) {
          frame = requestAnimationFrame(step);
        }
      }
      frame = requestAnimationFrame(step);
    };

    const startAnimation = () => {
      if (spanRef.current) {
        // Reduced motion: the count-up is a hand-rolled rAF loop, so
        // MotionGlobalConfig cannot skip it. Write the final value straight
        // out — same number, no ticking.
        if (reducedMotion) {
          spanRef.current.textContent = `${prefix}${target}${suffix}`;
          return;
        }
        setTimeout(() => {
          animateCount(spanRef.current!, 0, target, duration, prefix, suffix);
        }, startDelay);
      }
    };

    if (spanRef.current) {
      observer = new window.IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              startAnimation();
              observer?.disconnect();
            }
          });
        },
        {
          threshold: 0.1,
          rootMargin: "0px 0px -50px 0px",
        },
      );
      observer.observe(spanRef.current);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [target, duration, prefix, suffix, startDelay, reducedMotion]);

  return (
    // No initial="hidden"/whileInView: Framer serialises `initial` into the server HTML, so this
    // span shipped style="opacity:0" and only hydration could clear it.
    //
    // The text is the more serious half. It used to render `{prefix}0{suffix}` on the server and
    // reach the real figure only once the IntersectionObserver fired, so the static HTML said
    // "0%" for "Privacy-First & Cookieless Model" and "0 Min" for setup time. While the numbers
    // were also invisible that was merely wrong-and-unseen; once #530's <noscript> net started
    // forcing inline-hidden elements visible, a scripting-disabled visitor began READING those
    // zeros. A rendered 0 standing in for a real 100 is exactly the fake zero CLAUDE.md section 6
    // forbids, so the server now renders the true value and the count-up animates down from it.
    <span
      ref={spanRef}
      className={className}
      data-target={target}
      data-duration={duration}
      data-prefix={prefix}
      data-suffix={suffix}
      data-delay={startDelay}
    >
      {prefix}{target}{suffix}
    </span>
  );
};

export default Counter;
