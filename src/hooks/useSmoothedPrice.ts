import { useEffect, useRef, useState } from 'react';

/**
 * Continuous requestAnimationFrame price interpolation hook.
 * Smoothly glides displayed spot price toward incoming live market ticks
 * without visual frame jumps or timer stutter.
 */
export function useSmoothedPrice(targetPrice: number | null, enabled = true): number | null {
  const [displayPrice, setDisplayPrice] = useState<number | null>(targetPrice);
  const currentRef = useRef<number | null>(targetPrice);
  const targetRef = useRef<number | null>(targetPrice);
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);

  useEffect(() => {
    targetRef.current = targetPrice;

    if (!enabled || targetPrice == null || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      currentRef.current = targetPrice;
      setDisplayPrice(targetPrice);
      return;
    }

    // Snap immediately on first valid value or large reconnect discontinuity
    if (
      currentRef.current == null ||
      !Number.isFinite(currentRef.current) ||
      Math.abs(targetPrice - currentRef.current) > 15
    ) {
      currentRef.current = targetPrice;
      setDisplayPrice(targetPrice);
      return;
    }

    if (Math.abs(targetPrice - currentRef.current) < 0.005) {
      currentRef.current = targetPrice;
      setDisplayPrice(targetPrice);
      return;
    }

    if (rafRef.current !== null) {
      // Existing rAF loop will smoothly steer toward updated targetRef.current
      return;
    }

    lastFrameTsRef.current = performance.now();

    const step = (now: number) => {
      const target = targetRef.current;
      const current = currentRef.current;
      if (target == null || current == null || !Number.isFinite(target)) {
        rafRef.current = null;
        return;
      }

      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastFrameTsRef.current) / 1000));
      lastFrameTsRef.current = now;

      const diff = target - current;
      if (Math.abs(diff) < 0.005) {
        currentRef.current = target;
        setDisplayPrice(target);
        rafRef.current = null;
        return;
      }

      const alpha = 1 - Math.exp(-dtSec * 16);
      const next = Number((current + diff * alpha).toFixed(2));

      if (next !== current) {
        currentRef.current = next;
        setDisplayPrice(next);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [targetPrice, enabled]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return displayPrice;
}
