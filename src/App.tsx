import { useCallback, useEffect, useRef, useState } from 'react';
import { CandlestickChart, FileText } from 'lucide-react';
import type { AnalysisReport, MarketQuote } from './types/market.ts';
import {
  createAdaptivePollState,
  evaluateAdaptivePollInterval,
  STANDARD_POLL_INTERVAL_MS,
  type AdaptivePollState,
} from './utils/adaptivePolling.ts';
import { SignalsView } from './components/SignalsView.tsx';
import { TradeView } from './components/TradeView.tsx';

type BottomTab = 'TRADE' | 'SIGNALS';

export default function App() {
  const [activeTab, setActiveTab] = useState<BottomTab>('TRADE');
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | null>(null);
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  const pollStateRef = useRef<AdaptivePollState>(createAdaptivePollState());
  const quoteInFlightRef = useRef(false);
  const lastStreamAtRef = useRef(0);
  const lastPriceRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const applyIncomingQuote = useCallback((nextQuote: MarketQuote | null, ok: boolean) => {
    if (nextQuote && nextQuote.freshness !== 'UNAVAILABLE' && nextQuote.mid > 0) {
      const prev = lastPriceRef.current;
      if (prev !== null && nextQuote.mid !== prev) {
        setPriceDirection(nextQuote.mid > prev ? 'up' : 'down');
        if (flashTimerRef.current !== null) {
          window.clearTimeout(flashTimerRef.current);
        }
        flashTimerRef.current = window.setTimeout(() => {
          setPriceDirection(null);
        }, 450);
      }
      lastPriceRef.current = nextQuote.mid;
      setQuote(nextQuote);
      setQuoteError(null);
      pollStateRef.current = evaluateAdaptivePollInterval(pollStateRef.current, nextQuote);
      return;
    }

    if (nextQuote) {
      setQuote(nextQuote);
    }
    if (!ok) {
      setQuoteError('DATA UNAVAILABLE');
    }
    pollStateRef.current = evaluateAdaptivePollInterval(pollStateRef.current, null);
  }, []);

  const fetchQuote = useCallback(async (): Promise<number> => {
    if (quoteInFlightRef.current) {
      return pollStateRef.current.currentIntervalMs;
    }
    quoteInFlightRef.current = true;
    try {
      const res = await fetch('/api/market/quote');
      const json = await res.json().catch(() => ({}));
      const nextQuote: MarketQuote | null = json.quote ?? null;
      applyIncomingQuote(nextQuote, res.ok);
      return pollStateRef.current.currentIntervalMs;
    } catch {
      applyIncomingQuote(null, false);
      return pollStateRef.current.currentIntervalMs;
    } finally {
      quoteInFlightRef.current = false;
    }
  }, [applyIncomingQuote]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.reports)) {
        setReports(json.reports);
      }
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;
    let eventSource: EventSource | null = null;

    const clearScheduled = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const closeStream = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const openStream = () => {
      closeStream();
      if (cancelled || document.hidden || typeof EventSource === 'undefined') return;
      try {
        const es = new EventSource('/api/market/stream');
        es.onmessage = (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse(event.data) as { quote?: MarketQuote };
            if (payload?.quote) {
              lastStreamAtRef.current = Date.now();
              applyIncomingQuote(payload.quote, payload.quote.freshness !== 'UNAVAILABLE');
            }
          } catch {
            // Ignore malformed SSE tick frame
          }
        };
        es.onerror = () => {
          // Adaptive HTTP polling fallback remains active automatically
        };
        eventSource = es;
      } catch {
        // Fallback to HTTP polling if EventSource is unavailable
      }
    };

    const scheduleNext = (delayMs: number) => {
      clearScheduled();
      if (cancelled || document.hidden) return;
      timerId = window.setTimeout(async () => {
        if (cancelled) return;
        const streamHealthy = Date.now() - lastStreamAtRef.current < 4_500;
        const nextDelay =
          document.hidden || streamHealthy
            ? pollStateRef.current.currentIntervalMs || STANDARD_POLL_INTERVAL_MS
            : await fetchQuote();
        if (!cancelled) {
          scheduleNext(nextDelay);
        }
      }, delayMs);
    };

    const startLiveSync = async () => {
      openStream();
      const nextDelay = await fetchQuote();
      if (!cancelled) {
        scheduleNext(nextDelay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearScheduled();
        closeStream();
      } else {
        void startLiveSync();
      }
    };

    fetchReports();
    void startLiveSync();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduled();
      closeStream();
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyIncomingQuote, fetchQuote, fetchReports]);

  const handleReportSaved = (report: AnalysisReport) => {
    setReports((prev) => {
      if (prev.some((r) => r.id === report.id)) return prev;
      return [report, ...prev];
    });
  };

  const handleDeleteReport = async (id: string) => {
    const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex flex-col">
      {/* Compact Sticky Top Bar (52px) */}
      <header className="sticky top-0 z-30 h-[52px] bg-[#09090B]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="font-display font-bold tracking-tight text-base sm:text-lg whitespace-nowrap shrink-0">
            <span className="text-zinc-100">LEADERS</span>{' '}
            <span className="text-[#D4AF37]">XAUUSD</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs font-mono tabular-nums whitespace-nowrap shrink-0">
            {quote && quote.freshness !== 'UNAVAILABLE' ? (
              <>
                <span
                  className={`font-semibold transition-colors duration-200 ${
                    priceDirection === 'up'
                      ? 'text-emerald-400'
                      : priceDirection === 'down'
                      ? 'text-red-400'
                      : 'text-zinc-100'
                  }`}
                >
                  ${quote.mid.toFixed(2)}
                </span>
                <span className="text-zinc-600">·</span>
                <span
                  className={`inline-flex items-center gap-1.5 font-semibold ${
                    quote.freshness === 'LIVE' ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {quote.freshness === 'LIVE' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  {quote.freshness}
                </span>
              </>
            ) : (
              <span className="text-red-400 font-semibold">DATA UNAVAILABLE</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-20">
        {activeTab === 'TRADE' ? (
          <TradeView
            quote={quote}
            quoteError={quoteError}
            onRefreshQuote={fetchQuote}
            onReportSaved={handleReportSaved}
          />
        ) : (
          <SignalsView
            reports={reports}
            loading={reportsLoading}
            onDeleteReport={handleDeleteReport}
            onGoToTrade={() => setActiveTab('TRADE')}
          />
        )}
      </main>

      {/* Bottom Navigation — ONLY TWO TABS: TRADE & SIGNALS (56px) */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 h-[56px] bg-[#0B0C10]/95 backdrop-blur-md border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-lg mx-auto h-full grid grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab('TRADE')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              activeTab === 'TRADE'
                ? 'text-[#F5D061]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CandlestickChart className="w-5 h-5" />
            <span className="text-[11px] font-display font-semibold tracking-wider">TRADE</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SIGNALS')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              activeTab === 'SIGNALS'
                ? 'text-[#F5D061]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[11px] font-display font-semibold tracking-wider">
              SIGNALS{reports.length > 0 ? ` (${reports.length})` : ''}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
