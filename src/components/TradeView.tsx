import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CandlestickChart, Eye, EyeOff, Maximize2, RefreshCw, Sparkles } from 'lucide-react';
import { createDefaultIndicators } from '../constants/indicators.ts';
import type {
  AnalysisReport,
  CandleDataset,
  ChartOverlaySeries,
  IndicatorCategory,
  IndicatorId,
  MarketQuote,
  MarketSentiment24h,
  SelectedIndicatorConfig,
  Timeframe,
} from '../types/market.ts';
import { INDICATOR_CATALOG } from '../constants/indicators.ts';
import { AnalysisProcessingModal } from './AnalysisProcessingModal.tsx';
import { AnalysisResultView } from './AnalysisResultView.tsx';
import { IndicatorSelector } from './IndicatorSelector.tsx';
import { LeaderChartFullView } from './LeaderChartFullView.tsx';
import { MarketSentimentWidget } from './MarketSentimentWidget.tsx';
import { TimeframeSelector } from './TimeframeSelector.tsx';
import { XauUsdChart } from './XauUsdChart.tsx';

interface TradeViewProps {
  quote: MarketQuote | null;
  quoteError: string | null;
  onRefreshQuote: () => void;
  onReportSaved: (report: AnalysisReport) => void;
}

export function TradeView({
  quote,
  quoteError,
  onRefreshQuote,
  onReportSaved,
}: TradeViewProps) {
  const [activeChartTimeframe, setActiveChartTimeframe] = useState<Timeframe>('15m');
  const [selectedTimeframes, setSelectedTimeframes] = useState<Timeframe[]>(['15m']);
  const [indicators, setIndicators] = useState<SelectedIndicatorConfig[]>(() => createDefaultIndicators());

  const [dataset, setDataset] = useState<CandleDataset | null>(null);
  const [supportLevels, setSupportLevels] = useState<number[]>([]);
  const [resistanceLevels, setResistanceLevels] = useState<number[]>([]);
  const [overlays, setOverlays] = useState<ChartOverlaySeries[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [leaderViewOpen, setLeaderViewOpen] = useState(false);

  const [sentiment, setSentiment] = useState<MarketSentiment24h | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(true);
  const [sentimentError, setSentimentError] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [analysisErrStatus, setAnalysisErrStatus] = useState<string | null>(null);
  const [analysisErrMsg, setAnalysisErrMsg] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<AnalysisReport | null>(null);

  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
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

  const loadChartData = useCallback(async (tf: Timeframe, showSpinner = false) => {
    if (showSpinner) setChartLoading(true);
    try {
      const [candlesRes, overlaysRes] = await Promise.all([
        fetch(`/api/market/candles?timeframe=${encodeURIComponent(tf)}`),
        fetch('/api/market/overlays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeframe: tf, indicators: indicatorsRef.current }),
        }),
      ]);

      if (!candlesRes.ok) {
        const errJson = await candlesRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Market candle feed unavailable');
      }

      const cJson = await candlesRes.json();
      setDataset(cJson.dataset);
      setSupportLevels(Array.isArray(cJson.supportLevels) ? cJson.supportLevels : []);
      setResistanceLevels(Array.isArray(cJson.resistanceLevels) ? cJson.resistanceLevels : []);
      setChartError(null);

      if (overlaysRes.ok) {
        const oJson = await overlaysRes.json();
        setOverlays(Array.isArray(oJson.overlays) ? oJson.overlays : []);
      }
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Unable to load XAUUSD chart data');
    } finally {
      setChartLoading(false);
    }
  }, []);

  const loadSentiment = useCallback(async () => {
    try {
      const res = await fetch('/api/market/sentiment');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.sentiment) {
        throw new Error(json.error || 'DATA UNAVAILABLE');
      }
      setSentiment(json.sentiment);
      setSentimentError(null);
    } catch (err) {
      setSentimentError(err instanceof Error ? err.message : 'DATA UNAVAILABLE');
    } finally {
      setSentimentLoading(false);
    }
  }, []);

  // Load on timeframe change & poll (5s when chart is open, 15s when collapsed; skip while hidden)
  useEffect(() => {
    loadChartData(activeChartTimeframe, true);
    const pollMs = showChart || leaderViewOpen ? 5_000 : 15_000;
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadChartData(activeChartTimeframe, false);
      }
    }, pollMs);
    return () => clearInterval(interval);
  }, [activeChartTimeframe, loadChartData, showChart, leaderViewOpen]);

  // Trigger an immediate quote sync when opening either chart (SSE keeps live ticks flowing ~750ms)
  useEffect(() => {
    if (!showChart && !leaderViewOpen) return;
    onRefreshQuote();
  }, [showChart, leaderViewOpen, onRefreshQuote]);

  // Load 24h Market Sentiment & poll every 30s (skip while tab is hidden)
  useEffect(() => {
    loadSentiment();
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadSentiment();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadSentiment]);

  // Recompute chart overlays promptly when indicators change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/market/overlays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeframe: activeChartTimeframe, indicators }),
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json.overlays)) {
          setOverlays(json.overlays);
        }
      } catch {
        // Non-fatal overlay refresh error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [indicators, activeChartTimeframe]);

  const handleToggleAnalysisTimeframe = (tf: Timeframe) => {
    setSelectedTimeframes((prev) => {
      if (prev.includes(tf)) {
        if (prev.length === 1) return prev; // Keep at least 1 timeframe selected
        return prev.filter((item) => item !== tf);
      }
      return [...prev, tf];
    });
  };

  const handleToggleIndicator = (id: IndicatorId) => {
    setIndicators((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const handleUpdateParam = (id: IndicatorId, key: string, value: number) => {
    setIndicators((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, params: { ...item.params, [key]: value } } : item
      )
    );
  };

  const handleBulkCategoryToggle = (category: IndicatorCategory, enable: boolean) => {
    const ids = new Set(INDICATOR_CATALOG.filter((d) => d.category === category).map((d) => d.id));
    setIndicators((prev) =>
      prev.map((item) => (ids.has(item.id) ? { ...item, enabled: enable } : item))
    );
  };

  const handleEnableAllIndicators = () => {
    setIndicators((prev) => prev.map((item) => ({ ...item, enabled: true })));
  };

  const handleRunAnalysis = async () => {
    const enabledCount = indicators.filter((i) => i.enabled).length;
    if (enabledCount === 0 || selectedTimeframes.length === 0) return;

    setAnalyzing(true);
    setStageIndex(0);
    setAnalysisErrStatus(null);
    setAnalysisErrMsg(null);

    // Honest early-stage timer while request executes; never advances past stage 3 until API resolves
    const stageTimers: number[] = [];
    stageTimers.push(window.setTimeout(() => setStageIndex((s) => Math.max(s, 1)), 280));
    stageTimers.push(window.setTimeout(() => setStageIndex((s) => Math.max(s, 2)), 620));
    stageTimers.push(window.setTimeout(() => setStageIndex((s) => Math.max(s, 3)), 980));

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframes: selectedTimeframes,
          indicators,
        }),
      });

      const json = await res.json().catch(() => ({}));
      stageTimers.forEach((id) => clearTimeout(id));

      if (!res.ok || !json.report) {
        setAnalysisErrStatus(json.status || 'DATA UNAVAILABLE');
        setAnalysisErrMsg(
          json.error || 'Real XAUUSD market data could not be verified. No classification was generated.'
        );
        return;
      }

      // Now honestly complete final stages
      setStageIndex(4);
      await new Promise((r) => setTimeout(r, 220));
      setStageIndex(5);
      await new Promise((r) => setTimeout(r, 220));
      setStageIndex(6);
      await new Promise((r) => setTimeout(r, 150));

      onReportSaved(json.report);
      setActiveReport(json.report);
      setAnalyzing(false);
    } catch (err) {
      stageTimers.forEach((id) => clearTimeout(id));
      setAnalysisErrStatus('DATA UNAVAILABLE');
      setAnalysisErrMsg(
        err instanceof Error ? err.message : 'Network connection failed while analysing XAUUSD data.'
      );
    }
  };

  if (activeReport) {
    return (
      <AnalysisResultView
        report={activeReport}
        onBack={() => setActiveReport(null)}
        backLabel="Back to XAUUSD Chart"
      />
    );
  }

  const enabledIndicatorCount = indicators.filter((i) => i.enabled).length;
  const showVolumeOnChart = indicators.some((i) => i.id === 'volume' && i.enabled);
  const displayPrice =
    quote && quote.freshness !== 'UNAVAILABLE' && quote.mid > 0
      ? quote.mid
      : dataset?.candles?.[dataset.candles.length - 1]?.close ?? null;
  const freshnessLabel =
    quote && quote.freshness !== 'UNAVAILABLE'
      ? quote.freshness
      : dataset?.freshness ?? 'UNAVAILABLE';
  const latestDataTs = quote?.freshness !== 'UNAVAILABLE' && quote?.timestamp
    ? quote.timestamp
    : dataset?.latestTimestamp ?? null;

  return (
    <div className="space-y-4 pb-6">
      {/* Live XAUUSD Price Strip */}
      <section className="rounded-2xl border border-white/10 bg-[#121318] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="font-semibold text-[#F5D061]">XAU/USD</span>
              <span>·</span>
              <span>Spot Gold / US Dollar</span>
              <span>·</span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  freshnessLabel === 'LIVE'
                    ? 'text-emerald-400'
                    : freshnessLabel === 'DELAYED'
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {freshnessLabel === 'LIVE' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {freshnessLabel === 'UNAVAILABLE' ? 'DATA UNAVAILABLE' : freshnessLabel}
              </span>
            </div>

            {displayPrice != null ? (
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight transition-colors duration-200 ${
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
                    className={`text-xs font-mono font-semibold tabular-nums ${
                      quote.changeAbs >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {quote.changeAbs >= 0 ? '+' : ''}
                    {quote.changeAbs.toFixed(2)} ({quote.changePct >= 0 ? '+' : ''}
                    {quote.changePct.toFixed(2)}%)
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-400 text-sm font-semibold py-1">
                <AlertCircle className="w-4 h-4" />
                <span>DATA UNAVAILABLE — Cannot display spot price</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:items-end gap-1 text-xs font-mono tabular-nums text-zinc-400">
            {quote && quote.freshness !== 'UNAVAILABLE' && (
              <div>
                Bid <span className="text-zinc-200">${quote.bid.toFixed(2)}</span> · Ask{' '}
                <span className="text-zinc-200">${quote.ask.toFixed(2)}</span> · Spread{' '}
                <span className="text-zinc-200">${quote.spread.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span>
                {latestDataTs
                  ? `Updated ${new Date(latestDataTs).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}`
                  : quoteError || 'Awaiting feed'}
              </span>
              <button
                type="button"
                onClick={() => {
                  onRefreshQuote();
                  loadChartData(activeChartTimeframe, false);
                  loadSentiment();
                }}
                aria-label="Refresh quote"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-[#F5D061] hover:bg-white/5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {dataset && (
          <div className="mt-2.5 pt-2.5 border-t border-white/8 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-500">
            <span>Candles: {dataset.candleSource}</span>
            <span>{dataset.volumeNote}</span>
          </div>
        )}
      </section>

      {/* Responsive 2-Column Workstation on Desktop, Vertical Thumb Flow on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 space-y-4">
          {/* Leader Chart View Only */}
          <div className="rounded-2xl border border-white/10 bg-[#121318] px-4 py-4 flex flex-col sm:grid sm:grid-cols-3 items-center gap-3">
            <div className="hidden sm:block" aria-hidden="true" />
            <div className="text-center font-display text-lg sm:text-xl font-bold tracking-[0.24em] text-zinc-100 uppercase select-none">
              LIVE
            </div>

            <button
              type="button"
              onClick={() => setLeaderViewOpen(true)}
              className="w-full sm:w-auto sm:justify-self-end min-h-[44px] px-4 py-2 rounded-xl bg-[#181A20] border border-[#D4AF37]/50 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#D4AF37]/10 transition-colors whitespace-nowrap shrink-0"
            >
              <Maximize2 className="w-3.5 h-3.5 text-[#F5D061]" />
              <span>
                <span className="text-[#F5D061] font-bold">LEADER</span>{' '}
                <span className="text-zinc-100">Chart View Only</span>
              </span>
            </button>
          </div>

          <MarketSentimentWidget
            sentiment={sentiment}
            loading={sentimentLoading}
            error={sentimentError}
          />
        </div>

        <div className="lg:col-span-4 space-y-4">
          {/* Indicator Configuration Section */}
          <IndicatorSelector
            indicators={indicators}
            onToggleIndicator={handleToggleIndicator}
            onUpdateParam={handleUpdateParam}
            onResetDefaults={() => setIndicators(createDefaultIndicators())}
            onBulkCategoryToggle={handleBulkCategoryToggle}
            onEnableAllIndicators={handleEnableAllIndicators}
          />

          {/* Main Analysis Control Panel */}
          <section
            aria-label="Analysis Control Panel"
            className="rounded-2xl border border-[#D4AF37]/25 bg-[#121318] p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/8">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#F5D061]">
                  Analysis Control Panel
                </div>
                <h2 className="text-sm font-display font-semibold text-zinc-100 mt-0.5">
                  Scope & Execution
                </h2>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-400">
                {selectedTimeframes.length} TF × {enabledIndicatorCount} Ind
              </div>
            </div>

            <TimeframeSelector
              embedded
              mode="analysis-only"
              activeChartTimeframe={activeChartTimeframe}
              selectedTimeframes={selectedTimeframes}
              onSelectChartTimeframe={(tf) => {
                setActiveChartTimeframe(tf);
                setSelectedTimeframes((prev) => (prev.includes(tf) ? prev : [...prev, tf]));
              }}
              onToggleAnalysisTimeframe={handleToggleAnalysisTimeframe}
              onSetPresetTimeframes={setSelectedTimeframes}
            />

            {/* Prominent Gold Execute Button */}
            <div className="pt-2.5 border-t border-white/8 space-y-2">
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={analyzing || enabledIndicatorCount === 0 || selectedTimeframes.length === 0}
                className="w-full min-h-[54px] px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#F5D061] via-[#D4AF37] to-[#C29724] text-[#09090B] font-display font-bold text-sm tracking-wide inline-flex items-center justify-center gap-2.5 shadow-lg shadow-[#D4AF37]/15 hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-45 disabled:pointer-events-none"
              >
                <Sparkles className="w-4 h-4" />
                <span>ANALYSE XAUUSD</span>
              </button>
              <p className="text-[11px] text-center font-mono tabular-nums text-zinc-500">
                Processes {selectedTimeframes.length} timeframe(s) × {enabledIndicatorCount} indicator(s)
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Show / Hide Chart Option positioned below ANALYSE XAUUSD at the bottom */}
      <section className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#121318] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CandlestickChart className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">
                XAU/USD Candlestick Chart ({activeChartTimeframe})
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                {showChart ? 'Chart visible · Tap to collapse' : 'Chart hidden by default · Tap Show Chart to expand'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowChart((prev) => !prev)}
            aria-expanded={showChart}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              showChart
                ? 'bg-[#181A20] border border-white/15 text-zinc-200 hover:border-[#D4AF37]/50 hover:text-[#F5D061]'
                : 'bg-[#D4AF37] text-[#09090B] hover:bg-[#F5D061]'
            }`}
          >
            {showChart ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showChart ? 'Hide Chart' : 'Show Chart'}</span>
          </button>
        </div>

        {showChart && (
          <XauUsdChart
            candles={dataset?.candles ?? []}
            overlays={overlays}
            timeframe={activeChartTimeframe}
            supportLevels={supportLevels}
            resistanceLevels={resistanceLevels}
            showVolume={showVolumeOnChart}
            hasExchangeVolume={dataset?.hasExchangeVolume ?? true}
            loading={chartLoading}
            error={chartError}
            onRefresh={() => loadChartData(activeChartTimeframe, true)}
            onCandleRollover={() => loadChartData(activeChartTimeframe, false)}
            liveQuote={quote}
          />
        )}

        {/* Chart Timeframe Selector positioned at the very bottom below Show Chart */}
        <TimeframeSelector
          mode="chart-only"
          activeChartTimeframe={activeChartTimeframe}
          selectedTimeframes={selectedTimeframes}
          onSelectChartTimeframe={(tf) => {
            setActiveChartTimeframe(tf);
            setSelectedTimeframes((prev) => (prev.includes(tf) ? prev : [...prev, tf]));
          }}
          onToggleAnalysisTimeframe={handleToggleAnalysisTimeframe}
          onSetPresetTimeframes={setSelectedTimeframes}
        />
      </section>

      {analyzing && (
        <AnalysisProcessingModal
          currentStageIndex={stageIndex}
          selectedTimeframeCount={selectedTimeframes.length}
          selectedIndicatorCount={enabledIndicatorCount}
          errorStatus={analysisErrStatus}
          errorMessage={analysisErrMsg}
          onCloseError={() => setAnalyzing(false)}
          onRetry={handleRunAnalysis}
        />
      )}

      {leaderViewOpen && (
        <LeaderChartFullView
          quote={quote}
          quoteError={quoteError}
          candles={dataset?.candles ?? []}
          timeframe={activeChartTimeframe}
          loading={chartLoading}
          error={chartError}
          onChangeTimeframe={(tf) => setActiveChartTimeframe(tf)}
          onRefresh={() => {
            onRefreshQuote();
            loadChartData(activeChartTimeframe, true);
          }}
          onCandleRollover={() => loadChartData(activeChartTimeframe, false)}
          onClose={() => setLeaderViewOpen(false)}
        />
      )}
    </div>
  );
}
