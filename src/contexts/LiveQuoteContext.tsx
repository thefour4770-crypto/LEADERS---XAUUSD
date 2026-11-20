import { useSyncExternalStore } from 'react';
import type { MarketQuote } from '../types/market.ts';

export interface LiveQuoteSnapshot {
  quote: MarketQuote | null;
  error: string | null;
}

const initialSnapshot: LiveQuoteSnapshot = {
  quote: null,
  error: null,
};

let currentSnapshot: LiveQuoteSnapshot = initialSnapshot;
const listeners = new Set<() => void>();
const quoteTickListeners = new Set<(quote: MarketQuote | null) => void>();

function quotesEqual(a: MarketQuote | null, b: MarketQuote | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.timestamp === b.timestamp &&
    a.bid === b.bid &&
    a.ask === b.ask &&
    a.mid === b.mid &&
    a.freshness === b.freshness &&
    a.changeAbs === b.changeAbs &&
    a.changePct === b.changePct
  );
}

export function publishLiveQuote(nextQuote: MarketQuote | null, nextError: string | null): void {
  const sameQuote = quotesEqual(currentSnapshot.quote, nextQuote);
  const sameError = currentSnapshot.error === nextError;
  if (sameQuote && sameError) {
    return;
  }

  currentSnapshot = {
    quote: nextQuote,
    error: nextError,
  };

  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore subscriber error
    }
  }

  if (!sameQuote) {
    for (const tickListener of quoteTickListeners) {
      try {
        tickListener(nextQuote);
      } catch {
        // Ignore tick subscriber error
      }
    }
  }
}

export function getLiveQuoteSnapshot(): LiveQuoteSnapshot {
  return currentSnapshot;
}

function subscribeSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeLiveQuoteTicks(listener: (quote: MarketQuote | null) => void): () => void {
  quoteTickListeners.add(listener);
  return () => {
    quoteTickListeners.delete(listener);
  };
}

export function useLiveQuoteState(): LiveQuoteSnapshot {
  return useSyncExternalStore(subscribeSnapshot, getLiveQuoteSnapshot, getLiveQuoteSnapshot);
}
