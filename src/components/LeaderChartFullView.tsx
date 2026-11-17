import { useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { ALL_TIMEFRAMES, type Candle, type MarketQuote, type Timeframe } from '../types/market.ts';
import { XauUsdChart } from './XauUsdChart.tsx';

interface LeaderChartFullViewProps {
  quote: MarketQuote | null;
  quoteError: string | null;
  candles: Candle[];
  timeframe: Timeframe;
  loading: boolean;
  error: string | null;
  onChangeTimeframe: (tf: Timeframe) => void;
  onRefresh: () => void;
  onCandleRollover?: () => void;
  onClose: () => void;
}

export function LeaderChartFullView({
  quote,
  quoteError,
  candles,
  timeframe,
  loading,
  error,
  onChangeTimeframe,
  onRefresh,
  onCandleRollover,
  onClose,
}: LeaderChartFullViewProps) {
  const lastPriceRef = useRef<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const mid = quote?.freshness !== 'UNAVAILABLE' ? quote?.mid : undefined;
    if (!mid || mid <= 0) return;
    const prev = lastPriceRef.current;
    lastPriceRef.current = mid;
    if (prev !== null && mid !== prev) {
      setPriceFlash(mid > prev ? 'up' : 'down');
      const id = window.setTimeout(() => setPriceFlash(null), 450);
      return () => window.clearTimeout(id);
    }
  }, [quote?.mid, quote?.freshness]);

  const displayPrice =
    quote && quote.freshness !== 'UNAVAILABLE' && quote.mid > 0
      ? quote.mid
      : candles[candles.length - 1]?.close ?? null;

  const freshness =
    quote && quote.freshness !== 'UNAVAILABLE'
      ? quote.freshness
      : candles.length > 0
      ? 'DELAYED'
      : 'UNAVAILABLE';

  return (
    <div
      className="fixed inset-0 z-50 h-[100dvh] w-screen bg-[#09090B] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Leader Chart View Only"
    >
      {/* Compact Live Price Bar */}
      <header className="shrink-0 bg-[#0D0E12] border-b border-white/10 px-3 sm:px-5 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="font-display font-bold tracking-wide text-[#F5D061]">LEADER</span>
              <span className="text-zinc-500">·</span>
              <span className="font-semibold text-zinc-200">XAU/USD</span>
              <span className="text-zinc-600">·</span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  freshness === 'LIVE'
                    ? 'text-emerald-400'
                    : freshness === 'DELAYED'
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {freshness === 'LIVE' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {freshness === 'UNAVAILABLE' ? 'DATA UNAVAILABLE' : freshness}
              </span>
            </div>

            {displayPrice != null ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums">
                <span
                  className={`text-2xl sm:text-3xl font-bold transition-colors duration-200 ${
                    priceFlash === 'up'
                      ? 'text-emerald-400'
                      : priceFlash === 'down'
                      ? 'text-red-400'
                      : 'text-zinc-100'
                  }`}
                >
                  ${displayPrice.toFixed(2)}
                </span>
                {quote?.changeAbs != null && quote?.changePct != null && (
                  <span
                    className={`text-xs font-semibold ${
                      quote.changeAbs >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {quote.changeAbs >= 0 ? '+' : ''}
                    {quote.changeAbs.toFixed(2)} ({quote.changePct >= 0 ? '+' : ''}
                    {quote.changePct.toFixed(2)}%)
                  </span>
                )}
                {quote && quote.freshness !== 'UNAVAILABLE' && (
                  <span className="text-[11px] text-zinc-400">
                    Bid ${quote.bid.toFixed(2)} · Ask ${quote.ask.toFixed(2)}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-red-400 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{quoteError || 'DATA UNAVAILABLE'}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Exit Leader Chart View Only"
            className="min-h-[44px] px-3 rounded-xl bg-[#181A20] border border-white/15 text-zinc-200 hover:border-[#D4AF37]/50 hover:text-[#F5D061] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        {/* Compact Single-Row Timeframe Selector for Plain Chart */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {ALL_TIMEFRAMES.map((tf) => {
            const active = timeframe === tf;
            return (
              <button
                key={`leader-tf-${tf}`}
                type="button"
                onClick={() => onChangeTimeframe(tf)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#D4AF37] text-[#09090B]'
                    : 'bg-[#181A20] text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>
      </header>

      {/* Full-Screen Plain Live Candlestick Chart (No Indicators / Overlays) */}
      <div className="flex-1 min-h-0 flex flex-col">
        <XauUsdChart
          candles={candles}
          overlays={[]}
          timeframe={timeframe}
          supportLevels={[]}
          resistanceLevels={[]}
          showVolume={false}
          hasExchangeVolume={false}
          loading={loading}
          error={error}
          onRefresh={onRefresh}
          onCandleRollover={onCandleRollover}
          fullHeight
          liveQuote={quote}
        />
      </div>
    </div>
  );
}
