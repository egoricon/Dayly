import { useEffect, useRef, useState } from 'react';

// Small animation helpers. Everything is skipped when the phone asks for reduced motion.

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Matches the CSS leave animations (row collapse, banner exit). */
export const LEAVE_MS = 240;

/** Runs `then` after a leave animation, or at once with reduced motion. */
export function afterLeave(then: () => void): void {
  if (prefersReducedMotion()) then();
  else window.setTimeout(then, LEAVE_MS);
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number of kopecks that runs to `target` over `durationMs` instead of jumping.
 * Starts from `from` on mount (count-up) or from the target itself.
 */
export function useAnimatedNumber(target: number, { from, durationMs = 450 }: { from?: number; durationMs?: number } = {}): number {
  const [value, setValue] = useState(from ?? target);
  const current = useRef(value);

  useEffect(() => {
    const start = current.current;
    if (start === target || prefersReducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    const startTime = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - startTime) / durationMs);
      const next = t === 1 ? target : Math.round(start + (target - start) * easeOutCubic(t));
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
