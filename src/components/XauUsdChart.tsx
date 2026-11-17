import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { Maximize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Candle, ChartOverlaySeries, MarketQuote, Timeframe } from '../types/market.ts';

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1_800,
  '1H': 3_600,
  '4H': 14_400,
  '1D': 86_400,
  '1W': 604_800,
};

interface XauUsdChartProps {
  candles: Candle[];
  overlays: ChartOverlaySeries[];
  timeframe: Timeframe;
  supportLevels: number[];
  resistanceLevels: number[];
  showVolume: boolean;
  hasExchangeVolume: boolean;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onCandleRollover?: () => void;
  fullHeight?: boolean;
  liveQuote?: MarketQuote | null;
}

interface CrosshairReadout {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: string;
}

function applyLiveQuoteToCandles(
  baseCandles: Candle[],
  timeframe: Timeframe,
  liveQuote?: MarketQuote | null
): Candle[] {
  if (
    baseCandles.length === 0 ||
    !liveQuote ||
    liveQuote.freshness === 'UNAVAILABLE' ||
    !Number.isFinite(liveQuote.mid) ||
    liveQuote.mid <= 0
  ) {
    return baseCandles;
  }

  const tfSec = TIMEFRAME_SECONDS[timeframe];
  const quoteSec = Math.floor(liveQuote.timestamp / 1000);
  const price = Number(liveQuote.mid.toFixed(2));
  const next = baseCandles.map((c) => ({ ...c }));
  const last = next[next.length - 1];

  if (quoteSec >= last.time && quoteSec - last.time < tfSec) {
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
  } else if (quoteSec - last.time >= tfSec) {
    const bucket = Math.floor(quoteSec / tfSec) * tfSec;
    const safeTime = bucket > last.time ? bucket : last.time + tfSec;
    next.push({
      time: safeTime,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    });
  }

  return next;
}

export function XauUsdChart({
  candles,
  overlays,
  timeframe,
  supportLevels,
  resistanceLevels,
  showVolume,
  hasExchangeVolume,
  loading,
  error,
  onRefresh,
  onCandleRollover,
  fullHeight = false,
  liveQuote = null,
}: XauUsdChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesMapRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastFittedTfRef = useRef<Timeframe | null>(null);
  const candleMapRef = useRef<Map<number, Candle>>(new Map());
  const lastRenderedCandleRef = useRef<Candle | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastRolloverBucketRef = useRef<number>(0);

  const [readout, setReadout] = useState<CrosshairReadout | null>(null);
  const [liveLatestBar, setLiveLatestBar] = useState<Candle | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0B0C10' },
        textColor: '#A1A1AA',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(212, 175, 55, 0.45)', labelBackgroundColor: '#181A20' },
        horzLine: { color: 'rgba(212, 175, 55, 0.45)', labelBackgroundColor: '#181A20' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.2 : 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        rightBarStaysOnScroll: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      priceLineColor: '#F5D061',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setReadout(null);
        return;
      }
      const ts = typeof param.time === 'number' ? param.time : null;
      if (ts == null) return;
      const bar = candleMapRef.current.get(ts);
      if (bar) {
        setReadout({
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          time: new Date(bar.time * 1000).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
      }
    });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    ro.observe(el);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      overlaySeriesMapRef.current.clear();
      priceLinesRef.current = [];
      lastRenderedCandleRef.current = null;
    };
  }, []);

  // Update full candle & volume series when candles or timeframe change
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const synced = applyLiveQuoteToCandles(candles, timeframe, liveQuote);

    // Preserve intra-bar high/low captured by fast live ticks when background candles reload
    const prevRendered = lastRenderedCandleRef.current;
    if (prevRendered && synced.length > 0) {
      const latestSynced = synced[synced.length - 1];
      if (latestSynced.time === prevRendered.time) {
        latestSynced.high = Math.max(latestSynced.high, prevRendered.high);
        latestSynced.low = Math.min(latestSynced.low, prevRendered.low);
      }
    }

    const map = new Map<number, Candle>();
    for (const c of synced) map.set(c.time, c);
    candleMapRef.current = map;

    if (synced.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      lastRenderedCandleRef.current = null;
      setLiveLatestBar(null);
      return;
    }

    candleSeries.setData(
      synced.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const latest = synced[synced.length - 1];
    candleSeries.applyOptions({
      priceLineColor: latest.close >= latest.open ? '#10B981' : '#EF4444',
    });
    lastRenderedCandleRef.current = { ...latest };
    setLiveLatestBar(latest);

    if (showVolume) {
      volumeSeries.setData(
        synced.map((c) => {
          const val = hasExchangeVolume ? c.volume : Math.round((c.high - c.low) * 100 + Math.abs(c.close - c.open) * 50);
          return {
            time: c.time as Time,
            value: val,
            color: c.close >= c.open ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)',
          };
        })
      );
    } else {
      volumeSeries.setData([]);
    }

    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.08, bottom: showVolume ? 0.2 : 0.08 },
    });

    if (lastFittedTfRef.current !== timeframe) {
      const visibleCount = Math.min(synced.length, 75);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, synced.length - visibleCount),
        to: synced.length + 2,
      });
      lastFittedTfRef.current = timeframe;
    }
    // liveQuote is intentionally handled incrementally by the smooth tick effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, timeframe, showVolume, hasExchangeVolume]);

  // Smoothly animate and update active forming candle on every live quote tick
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const prevLast = lastRenderedCandleRef.current;
    if (
      !candleSeries ||
      !prevLast ||
      !liveQuote ||
      liveQuote.freshness === 'UNAVAILABLE' ||
      !Number.isFinite(liveQuote.mid) ||
      liveQuote.mid <= 0
    ) {
      return;
    }

    const tfSec = TIMEFRAME_SECONDS[timeframe];
    const quoteSec = Math.floor(liveQuote.timestamp / 1000);
    const targetPrice = Number(liveQuote.mid.toFixed(2));

    let targetBar: Candle | null = null;
    let fromClose = prevLast.close;

    if (quoteSec >= prevLast.time && quoteSec - prevLast.time < tfSec) {
      targetBar = {
        time: prevLast.time,
        open: prevLast.open,
        high: Math.max(prevLast.high, targetPrice),
        low: Math.min(prevLast.low, targetPrice),
        close: targetPrice,
        volume: prevLast.volume,
      };
    } else if (quoteSec - prevLast.time >= tfSec) {
      const bucket = Math.floor(quoteSec / tfSec) * tfSec;
      const safeTime = bucket > prevLast.time ? bucket : prevLast.time + tfSec;
      if (lastRolloverBucketRef.current !== safeTime) {
        lastRolloverBucketRef.current = safeTime;
        onCandleRollover?.();
      }
      fromClose = prevLast.close;
      targetBar = {
        time: safeTime,
        open: prevLast.close,
        high: Math.max(prevLast.close, targetPrice),
        low: Math.min(prevLast.close, targetPrice),
        close: targetPrice,
        volume: 0,
      };
    }

    if (!targetBar) return;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const finalBar = targetBar;
    const startClose = fromClose;
    const baseHigh = finalBar.time === prevLast.time ? prevLast.high : finalBar.open;
    const baseLow = finalBar.time === prevLast.time ? prevLast.low : finalBar.open;

    candleSeries.applyOptions({
      priceLineColor: finalBar.close >= finalBar.open ? '#10B981' : '#EF4444',
    });

    // Immediate update when price didn't change
    if (Math.abs(finalBar.close - startClose) < 0.005) {
      candleSeries.update({
        time: finalBar.time as Time,
        open: finalBar.open,
        high: finalBar.high,
        low: finalBar.low,
        close: finalBar.close,
      });
      lastRenderedCandleRef.current = finalBar;
      candleMapRef.current.set(finalBar.time, finalBar);
      setLiveLatestBar(finalBar);
      return;
    }

    const durationMs = 180;
    const startTime = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const currentClose = Number((startClose + (finalBar.close - startClose) * eased).toFixed(2));
      const frameBar: Candle = {
        time: finalBar.time,
        open: finalBar.open,
        high: t === 1 ? finalBar.high : Math.max(baseHigh, currentClose),
        low: t === 1 ? finalBar.low : Math.min(baseLow, currentClose),
        close: t === 1 ? finalBar.close : currentClose,
        volume: finalBar.volume,
      };

      candleSeries.update({
        time: frameBar.time as Time,
        open: frameBar.open,
        high: frameBar.high,
        low: frameBar.low,
        close: frameBar.close,
      });
      lastRenderedCandleRef.current = frameBar;
      candleMapRef.current.set(frameBar.time, frameBar);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
        setLiveLatestBar(finalBar);
      }
    };

    setLiveLatestBar(finalBar);
    animFrameRef.current = requestAnimationFrame(step);
  }, [liveQuote, timeframe]);

  // Update indicator overlays
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const existing = overlaySeriesMapRef.current;
    const incomingIds = new Set(overlays.map((o) => o.id));

    for (const [id, series] of existing.entries()) {
      if (!incomingIds.has(id)) {
        chart.removeSeries(series);
        existing.delete(id);
      }
    }

    for (const ov of overlays) {
      let series = existing.get(ov.id);
      const lineStyle =
        ov.lineStyle === 'dashed'
          ? LineStyle.Dashed
          : ov.lineStyle === 'dotted'
          ? LineStyle.Dotted
          : LineStyle.Solid;

      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: ov.color,
          lineWidth: (ov.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          lineStyle,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        existing.set(ov.id, series);
      } else {
        series.applyOptions({
          color: ov.color,
          lineWidth: (ov.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          lineStyle,
        });
      }

      series.setData(ov.data.map((pt) => ({ time: pt.time as Time, value: pt.value })));
    }
  }, [overlays]);

  // Update Support & Resistance price lines
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    for (const pl of priceLinesRef.current) {
      candleSeries.removePriceLine(pl);
    }
    priceLinesRef.current = [];

    for (const s of supportLevels.slice(0, 2)) {
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: s,
          color: 'rgba(16, 185, 129, 0.45)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'S',
        })
      );
    }
    for (const r of resistanceLevels.slice(0, 2)) {
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: r,
          color: 'rgba(239, 68, 68, 0.45)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'R',
        })
      );
    }
  }, [supportLevels, resistanceLevels]);

  const handleZoom = (direction: 'in' | 'out') => {
    const chart = chartRef.current;
    if (!chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const span = range.to - range.from;
    const delta = span * 0.2;
    const nextFrom = direction === 'in' ? range.from + delta : range.from - delta;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, nextFrom),
      to: range.to,
    });
  };

  const handleResetZoom = () => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    const visibleCount = Math.min(candles.length, 75);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, candles.length - visibleCount),
      to: candles.length + 2,
    });
  };

  const latestBar = liveLatestBar ?? candles[candles.length - 1];
  const activeBar = readout ?? (latestBar ? { ...latestBar, time: '' } : null);

  return (
    <div
      className={`relative flex flex-col bg-[#0B0C10] overflow-hidden ${
        fullHeight ? 'flex-1 h-full border-0 rounded-none' : 'rounded-2xl border border-white/10'
      }`}
    >
      {/* Compact OHLC Readout & Chart Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/8 bg-[#101217]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-zinc-400">
          <span className="font-semibold text-[#F5D061]">{timeframe}</span>
          {activeBar && (
            <>
              <span>O <strong className="text-zinc-200">{activeBar.open.toFixed(2)}</strong></span>
              <span>H <strong className="text-zinc-200">{activeBar.high.toFixed(2)}</strong></span>
              <span>L <strong className="text-zinc-200">{activeBar.low.toFixed(2)}</strong></span>
              <span>C <strong className="text-zinc-200">{activeBar.close.toFixed(2)}</strong></span>
              {activeBar.time && <span className="text-zinc-500">{activeBar.time}</span>}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleZoom('in')}
            aria-label="Zoom in chart"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#F5D061] hover:bg-white/5 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom('out')}
            aria-label="Zoom out chart"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#F5D061] hover:bg-white/5 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            aria-label="Reset chart scale"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#F5D061] hover:bg-white/5 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh chart data"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#F5D061] hover:bg-white/5 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Overlay Legend (Unboxed Metadata Text) */}
      {overlays.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 bg-[#0B0C10] border-b border-white/5 text-[11px] font-mono text-zinc-400">
          {overlays.slice(0, 6).map((ov) => (
            <span key={ov.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: ov.color }} />
              <span>{ov.label}</span>
            </span>
          ))}
          {overlays.length > 6 && <span className="text-zinc-500">+{overlays.length - 6} more</span>}
        </div>
      )}

      {/* Chart Canvas */}
      <div
        className={`relative w-full ${
          fullHeight ? 'flex-1 min-h-0' : 'h-[300px] sm:h-[340px] lg:h-[420px]'
        }`}
      >
        <div ref={containerRef} className="w-full h-full touch-pan-x" />

        {loading && candles.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0C10]/90 text-zinc-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#D4AF37]" />
            <span className="text-xs font-medium">Loading XAUUSD candles...</span>
          </div>
        )}

        {error && candles.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0C10]/95 p-6 text-center gap-3">
            <span className="text-sm font-semibold text-red-400">DATA UNAVAILABLE</span>
            <p className="text-xs text-zinc-400 max-w-sm">{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#F5D061] transition-colors"
            >
              Retry Market Feed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
