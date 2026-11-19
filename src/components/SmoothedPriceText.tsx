import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface SmoothedPriceTextProps {
  value: number | null | undefined;
  prefix?: string;
  decimals?: number;
  enabled?: boolean;
  flashOnMove?: boolean;
  className?: string;
  upClassName?: string;
  downClassName?: string;
  neutralClassName?: string;
  fallbackText?: string;
}

/**
 * Renders a price string driven directly via requestAnimationFrame -> textContent
 * so 60/120fps tick interpolation never triggers React tree re-renders.
 */
export const SmoothedPriceText = memo(function SmoothedPriceText({
  value,
  prefix = '$',
  decimals = 2,
  enabled = true,
  flashOnMove = false,
  className = '',
  upClassName = 'text-emerald-400',
  downClassName = 'text-red-400',
  neutralClassName = 'text-zinc-100',
  fallbackText = '—',
}: SmoothedPriceTextProps) {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const currentRef = useRef<number | null>(value ?? null);
  const targetRef = useRef<number | null>(value ?? null);
  const lastFlashTargetRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);
  const flashTimerRef = useRef<number | null>(null);

  const [flashDir, setFlashDir] = useState<'up' | 'down' | null>(null);

  // Sync initial or invalid/disabled state before paint without React text child clobbering
  useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    if (!enabled || value == null || !Number.isFinite(value) || value <= 0) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      currentRef.current = value ?? null;
      targetRef.current = value ?? null;
      el.textContent =
        value != null && Number.isFinite(value) && value > 0
          ? `${prefix}${value.toFixed(decimals)}`
          : fallbackText;
      return;
    }

    if (currentRef.current == null || !Number.isFinite(currentRef.current)) {
      currentRef.current = value;
      el.textContent = `${prefix}${value.toFixed(decimals)}`;
    } else if (!el.textContent) {
      el.textContent = `${prefix}${currentRef.current.toFixed(decimals)}`;
    }
  }, [value, enabled, prefix, decimals, fallbackText]);

  useEffect(() => {
    targetRef.current = value ?? null;
    const el = spanRef.current;

    if (!enabled || value == null || !Number.isFinite(value) || value <= 0) {
      return;
    }

    if (flashOnMove) {
      const prevFlashTarget = lastFlashTargetRef.current;
      lastFlashTargetRef.current = value;
      if (prevFlashTarget !== null && value !== prevFlashTarget) {
        setFlashDir(value > prevFlashTarget ? 'up' : 'down');
        if (flashTimerRef.current !== null) {
          window.clearTimeout(flashTimerRef.current);
        }
        flashTimerRef.current = window.setTimeout(() => {
          setFlashDir(null);
          flashTimerRef.current = null;
        }, 450);
      }
    }

    // Snap immediately on first valid price or large discontinuity
    if (
      currentRef.current == null ||
      !Number.isFinite(currentRef.current) ||
      Math.abs(value - currentRef.current) > 15
    ) {
      currentRef.current = value;
      if (el) el.textContent = `${prefix}${value.toFixed(decimals)}`;
      return;
    }

    if (Math.abs(value - currentRef.current) < 0.005) {
      currentRef.current = value;
      if (el) el.textContent = `${prefix}${value.toFixed(decimals)}`;
      return;
    }

    if (rafRef.current !== null) {
      return;
    }

    lastFrameTsRef.current = performance.now();

    const step = (now: number) => {
      const node = spanRef.current;
      const target = targetRef.current;
      const current = currentRef.current;

      if (!node || target == null || current == null || !Number.isFinite(target)) {
        rafRef.current = null;
        return;
      }

      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastFrameTsRef.current) / 1000));
      lastFrameTsRef.current = now;

      const diff = target - current;
      if (Math.abs(diff) < 0.005) {
        currentRef.current = target;
        node.textContent = `${prefix}${target.toFixed(decimals)}`;
        rafRef.current = null;
        return;
      }

      const alpha = 1 - Math.exp(-dtSec * 16);
      const next = Number((current + diff * alpha).toFixed(decimals));

      if (next !== current) {
        currentRef.current = next;
        node.textContent = `${prefix}${next.toFixed(decimals)}`;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [value, enabled, prefix, decimals, flashOnMove]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, []);

  const colorClass =
    flashDir === 'up' ? upClassName : flashDir === 'down' ? downClassName : neutralClassName;

  return <span ref={spanRef} className={`${className} ${colorClass}`} />;
});
