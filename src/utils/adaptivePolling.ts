import type { MarketQuote } from '../types/market.ts';

export const STANDARD_POLL_INTERVAL_MS = 6_000;
export const VOLATILE_POLL_INTERVAL_MS = 3_000;

const VOLATILITY_WINDOW_MS = 30_000;
const MIN_PRICE_DELTA_USD = 0.01;
const VOLATILE_CHANGE_COUNT_THRESHOLD = 3;
const VOLATILE_CHANGE_RATIO_THRESHOLD = 0.6;
const VOLATILE_RANGE_USD_THRESHOLD = 1.5;
const VOLATILE_SINGLE_JUMP_USD = 0.75;
const MIN_FAST_MODE_HOLD_MS = 12_000;

export interface QuoteSample {
  timestamp: number;
  price: number;
  changed: boolean;
}

export interface AdaptivePollState {
  samples: QuoteSample[];
  lastPrice: number | null;
  currentIntervalMs: number;
  lastVolatileAt: number;
}

export function createAdaptivePollState(): AdaptivePollState {
  return {
    samples: [],
    lastPrice: null,
    currentIntervalMs: STANDARD_POLL_INTERVAL_MS,
    lastVolatileAt: 0,
  };
}

/**
 * Evaluates recent XAU/USD price change frequency and short-term tick dispersion
 * to adapt the market quote polling interval between 3 seconds (volatile) and
 * 6 seconds (standard) for battery and data efficiency.
 */
export function evaluateAdaptivePollInterval(
  prevState: AdaptivePollState,
  quote: MarketQuote | null,
  now = Date.now()
): AdaptivePollState {
  // If feed is unavailable, revert to standard 6s polling to save battery/data
  if (!quote || quote.freshness === 'UNAVAILABLE' || !Number.isFinite(quote.mid) || quote.mid <= 0) {
    return {
      ...prevState,
      currentIntervalMs: STANDARD_POLL_INTERVAL_MS,
    };
  }

  const price = quote.mid;
  const prevPrice = prevState.lastPrice;
  const singleDelta = prevPrice !== null ? Math.abs(price - prevPrice) : 0;
  const changed = prevPrice !== null && singleDelta >= MIN_PRICE_DELTA_USD;

  const cutoff = now - VOLATILITY_WINDOW_MS;
  const prunedSamples = prevState.samples.filter((s) => s.timestamp >= cutoff);
  const nextSamples: QuoteSample[] = [...prunedSamples, { timestamp: now, price, changed }];

  // Count how frequently price moved within the 30s sliding window
  const transitionSamples = nextSamples.slice(1); // first sample has no prior delta
  const changeCount = transitionSamples.filter((s) => s.changed).length;
  const changeRatio =
    transitionSamples.length >= 3 ? changeCount / transitionSamples.length : 0;

  // Measure high-low dispersion inside the 30s window
  let minPrice = price;
  let maxPrice = price;
  for (const s of nextSamples) {
    if (s.price < minPrice) minPrice = s.price;
    if (s.price > maxPrice) maxPrice = s.price;
  }
  const windowRangeUsd = maxPrice - minPrice;

  const isVolatileNow =
    singleDelta >= VOLATILE_SINGLE_JUMP_USD ||
    changeCount >= VOLATILE_CHANGE_COUNT_THRESHOLD ||
    (transitionSamples.length >= 3 && changeRatio >= VOLATILE_CHANGE_RATIO_THRESHOLD) ||
    windowRangeUsd >= VOLATILE_RANGE_USD_THRESHOLD;

  if (isVolatileNow) {
    return {
      samples: nextSamples,
      lastPrice: price,
      currentIntervalMs: VOLATILE_POLL_INTERVAL_MS,
      lastVolatileAt: now,
    };
  }

  // Hold 3s fast polling briefly to prevent rapid thrashing when ticks pause between bursts
  const shouldKeepFastMode =
    prevState.currentIntervalMs === VOLATILE_POLL_INTERVAL_MS &&
    now - prevState.lastVolatileAt < MIN_FAST_MODE_HOLD_MS;

  return {
    samples: nextSamples,
    lastPrice: price,
    currentIntervalMs: shouldKeepFastMode
      ? VOLATILE_POLL_INTERVAL_MS
      : STANDARD_POLL_INTERVAL_MS,
    lastVolatileAt: prevState.lastVolatileAt,
  };
}
