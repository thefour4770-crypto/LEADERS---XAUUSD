import { useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronUp, ImageDown, Info, Minus, ShieldCheck, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import type { AnalysisReport, SignalClassification } from '../types/market.ts';
import {
  renderAnalysisReportJpg,
  triggerJpgDownload,
  type RenderedJpgReport,
} from '../utils/exportReportJpg.ts';
import { JpgPreviewModal } from './JpgPreviewModal.tsx';
import { TradeLevelsScale } from './TradeLevelsScale.tsx';

interface AnalysisResultViewProps {
  report: AnalysisReport;
  onBack: () => void;
  backLabel?: string;
}

function getClassificationStyle(classification: SignalClassification) {
  switch (classification) {
    case 'BUY':
      return {
        text: 'text-emerald-400',
        border: 'border-emerald-500/35',
        bg: 'bg-emerald-500/10',
        meaning: 'Calculated market conditions indicate an upward directional bias.',
        Icon: TrendingUp,
      };
    case 'SELL':
      return {
        text: 'text-red-400',
        border: 'border-red-500/35',
        bg: 'bg-red-500/10',
        meaning: 'Calculated market conditions indicate a downward directional bias.',
        Icon: TrendingDown,
      };
    case 'HOLD':
      return {
        text: 'text-[#F5D061]',
        border: 'border-[#D4AF37]/40',
        bg: 'bg-[#D4AF37]/10',
        meaning: 'Market direction is unclear, indicators disagree, or available evidence is insufficient.',
        Icon: Minus,
      };
  }
}

export function AnalysisResultView({
  report,
  onBack,
  backLabel = 'Back to Chart',
}: AnalysisResultViewProps) {
  const [expandedTf, setExpandedTf] = useState<string | null>(
    report.timeframeAnalyses[0]?.timeframe ?? null
  );
  const [previewJpg, setPreviewJpg] = useState<RenderedJpgReport | null>(null);
  const [exportedFile, setExportedFile] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportJpg = () => {
    setExportError(null);
    try {
      const rendered = renderAnalysisReportJpg(report);
      // Synchronous download trigger while user gesture is active
      triggerJpgDownload(rendered.blobUrl, rendered.filename);
      setPreviewJpg(rendered);
      setExportedFile(rendered.filename);
      window.setTimeout(
        () => setExportedFile((curr) => (curr === rendered.filename ? null : curr)),
        4000
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to generate JPG image');
    }
  };

  const style = getClassificationStyle(report.classification);
  const ClassIcon = style.Icon;

  const formattedReportDate = new Date(report.createdAt).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedMarketTs = new Date(report.marketDataTimestamp).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4 pb-6"
    >
      {/* Top Back & Export Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3 rounded-xl bg-[#121318] border border-white/10 text-zinc-200 text-xs font-semibold inline-flex items-center gap-2 hover:border-[#D4AF37]/50 hover:text-[#F5D061] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{backLabel}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
          <div className="text-right text-[11px] font-mono text-zinc-400 hidden sm:block">
            <div>Saved {formattedReportDate}</div>
          </div>
          <button
            type="button"
            onClick={handleExportJpg}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#F5D061] transition-colors whitespace-nowrap"
          >
            {exportedFile ? <Check className="w-4 h-4" /> : <ImageDown className="w-4 h-4" />}
            <span>{exportedFile ? 'JPG Ready' : 'Export JPG'}</span>
          </button>
        </div>
      </div>

      {exportedFile && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-mono text-emerald-300 flex items-center justify-between gap-2">
          <span className="truncate">Saved locally: {exportedFile}</span>
        </div>
      )}

      {exportError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
          JPG export failed: {exportError}
        </div>
      )}

      {/* Primary Classification Card */}
      <section className={`rounded-2xl border ${style.border} ${style.bg} p-5 space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-zinc-400">
              XAU/USD Market Classification · {report.freshness} Data
            </div>
            <div className="flex items-center gap-3">
              <ClassIcon className={`w-8 h-8 ${style.text}`} />
              <h1 className={`text-3xl sm:text-4xl font-display font-bold tracking-tight ${style.text}`}>
                {report.classification}
              </h1>
            </div>
            <p className="text-sm text-zinc-200 max-w-xl">{style.meaning}</p>
          </div>

          <div className="text-left sm:text-right font-mono tabular-nums space-y-1">
            <div className="text-xs text-zinc-400">Spot Reference</div>
            <div className="text-2xl font-bold text-zinc-100">${report.spotPrice.toFixed(2)}</div>
            <div className="text-[11px] text-zinc-400">
              Bid ${report.spotBid.toFixed(2)} · Ask ${report.spotAsk.toFixed(2)}
            </div>
            <div className="text-[11px] text-zinc-400">
              Composite Score {report.combinedScore >= 0 ? '+' : ''}
              {report.combinedScore.toFixed(3)}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-300">
          <span>Data Timestamp: {formattedMarketTs}</span>
          <span>·</span>
          <span>Freshness: {report.freshness}</span>
          <span>·</span>
          <span>Timeframes: {report.selectedTimeframes.join(', ')}</span>
          <span>·</span>
          <span>{report.selectedIndicators.length} Indicators</span>
        </div>
      </section>

      {/* Educational Notice */}
      <div className="rounded-2xl border border-white/10 bg-[#121318] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-300 leading-relaxed">
          BUY, SELL, and HOLD are educational market-condition classifications computed strictly from historical price and indicator math. Calculated SL/TP reference levels are derived from ATR volatility and swing structure, not personalized financial advice.
        </p>
      </div>

      {/* Calculated SL & TP Levels (for BUY / SELL) or HOLD Notice */}
      {report.tradeLevels ? (
        <section className="rounded-2xl border border-[#D4AF37]/30 bg-[#121318] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-display font-semibold text-[#F5D061]">
              Calculated SL & TP Reference Levels ({report.classification})
            </h2>
            <span className="text-[11px] font-mono text-zinc-400">
              {report.tradeLevels.referenceTimeframe} ATR(14): ${report.tradeLevels.atrValue.toFixed(2)} · Risk: ${report.tradeLevels.riskPoints.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums">
            <div className="rounded-xl bg-[#0D0E12] border border-white/8 p-3 space-y-1">
              <div className="text-[11px] text-zinc-400">Reference Spot</div>
              <div className="text-base font-bold text-zinc-100">
                ${report.tradeLevels.referencePrice.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-500">Market price at analysis</div>
            </div>

            <div className="rounded-xl bg-[#0D0E12] border border-red-500/30 p-3 space-y-1">
              <div className="text-[11px] text-red-400 font-semibold">Stop Loss (SL)</div>
              <div className="text-base font-bold text-red-400">
                ${report.tradeLevels.stopLoss.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-500">
                -${report.tradeLevels.riskPoints.toFixed(2)} distance
              </div>
            </div>

            <div className="rounded-xl bg-[#0D0E12] border border-emerald-500/30 p-3 space-y-1">
              <div className="text-[11px] text-emerald-400 font-semibold">Take Profit 1 (TP1)</div>
              <div className="text-base font-bold text-emerald-400">
                ${report.tradeLevels.takeProfit1.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-500">
                R:R {report.tradeLevels.rewardRiskRatio1}
              </div>
            </div>

            <div className="rounded-xl bg-[#0D0E12] border border-emerald-500/30 p-3 space-y-1">
              <div className="text-[11px] text-emerald-400 font-semibold">Take Profit 2 (TP2)</div>
              <div className="text-base font-bold text-emerald-400">
                ${report.tradeLevels.takeProfit2.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-500">
                R:R {report.tradeLevels.rewardRiskRatio2}
              </div>
            </div>
          </div>

          <TradeLevelsScale classification={report.classification} levels={report.tradeLevels} />

          <p className="text-xs text-zinc-400 leading-relaxed">
            {report.tradeLevels.methodology}
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-[#121318] p-4 space-y-1.5">
          <h2 className="text-sm font-display font-semibold text-[#F5D061]">
            SL & TP Reference Levels Withheld (HOLD)
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Directional Stop Loss (SL) and Take Profit (TP) targets are computed only when multi-timeframe consensus reaches BUY or SELL. Review the calculated Support & Resistance levels below for structural boundaries.
          </p>
        </section>
      )}

      {/* Anti-Fake-Signal Filter Gates */}
      {report.signalQualityChecks && report.signalQualityChecks.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-[#121318] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-sm font-display font-semibold text-[#F5D061]">
                Signal Conviction & Anti-Fake-Signal Gates
              </h2>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              {report.signalQualityChecks.filter((g) => g.passed).length} / {report.signalQualityChecks.length} gates passed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.signalQualityChecks.map((gate) => (
              <div
                key={gate.label}
                className={`rounded-xl border p-3 flex items-start gap-2.5 ${
                  gate.passed
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : 'border-amber-500/30 bg-amber-500/5'
                }`}
              >
                {gate.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                    <span>{gate.label}</span>
                    <span
                      className={`text-[10px] font-mono ${
                        gate.passed ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      · {gate.passed ? 'PASS' : 'BLOCKED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{gate.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Combined Summary Grid (2-col on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Methodology & Short vs Long Horizon */}
        <section className="rounded-2xl border border-white/10 bg-[#121318] p-4 space-y-3.5">
          <h2 className="text-sm font-display font-semibold text-[#F5D061]">
            Combined Multi-Timeframe Synthesis
          </h2>
          <p className="text-xs text-zinc-300 leading-relaxed">{report.combinedMethodology}</p>

          <div className="pt-2 border-t border-white/8 space-y-1">
            <h3 className="text-xs font-semibold text-zinc-200">Short-Term vs Long-Term Comparison</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">{report.shortVsLongComparison}</p>
          </div>

          <div className="pt-2 border-t border-white/8 space-y-1">
            <h3 className="text-xs font-semibold text-zinc-200">Data Sources</h3>
            <p className="text-[11px] font-mono text-zinc-400">
              Spot: {report.spotSource} · Candles: {report.candleSource}
            </p>
          </div>
        </section>

        {/* Reasons, Agreements, Conflicts */}
        <section className="rounded-2xl border border-white/10 bg-[#121318] p-4 space-y-3.5">
          <h2 className="text-sm font-display font-semibold text-[#F5D061]">
            Reasons, Agreements & Disagreements
          </h2>

          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-zinc-200">Calculation Rationale</h3>
            <ul className="space-y-1.5 text-xs text-zinc-300">
              {report.reasons.map((r, i) => (
                <li key={i} className="leading-relaxed">
                  · {r}
                </li>
              ))}
            </ul>
          </div>

          {report.agreements.length > 0 && (
            <div className="pt-2 border-t border-white/8 space-y-1.5">
              <h3 className="text-xs font-semibold text-emerald-400">Indicator Agreements</h3>
              <ul className="space-y-1 text-xs text-zinc-300">
                {report.agreements.map((a, i) => (
                  <li key={i} className="leading-relaxed">
                    · {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.conflicts.length > 0 && (
            <div className="pt-2 border-t border-white/8 space-y-1.5">
              <h3 className="text-xs font-semibold text-amber-400">Conflicting Signals</h3>
              <ul className="space-y-1 text-xs text-zinc-300">
                {report.conflicts.map((c, i) => (
                  <li key={i} className="leading-relaxed">
                    · {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Support & Resistance + Uncertainty */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-white/10 bg-[#121318] p-4 space-y-3">
          <h2 className="text-sm font-display font-semibold text-[#F5D061]">
            Calculated Support & Resistance Levels
          </h2>
          <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
            <div className="rounded-xl bg-[#0D0E12] border border-white/8 p-3 space-y-1.5">
              <div className="text-[11px] text-emerald-400 font-semibold">Calculated Support</div>
              {report.supportLevels.length > 0 ? (
                report.supportLevels.map((lvl) => (
                  <div key={lvl} className="text-sm text-zinc-100">
                    ${lvl.toFixed(2)}
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500">None detected in lookback</div>
              )}
            </div>
            <div className="rounded-xl bg-[#0D0E12] border border-white/8 p-3 space-y-1.5">
              <div className="text-[11px] text-red-400 font-semibold">Calculated Resistance</div>
              {report.resistanceLevels.length > 0 ? (
                report.resistanceLevels.map((lvl) => (
                  <div key={lvl} className="text-sm text-zinc-100">
                    ${lvl.toFixed(2)}
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-500">None detected in lookback</div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Levels derived strictly from historical 5-bar swing fractals across selected timeframes.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#121318] p-4 space-y-2.5">
          <h2 className="text-sm font-display font-semibold text-[#F5D061]">
            Uncertainty & Risk Context
          </h2>
          <p className="text-xs text-zinc-300 leading-relaxed">{report.uncertaintyExplanation}</p>
        </section>
      </div>

      {/* Per-Timeframe Independent Analysis */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-zinc-100">
            Timeframe Breakdown ({report.timeframeAnalyses.length})
          </h2>
          <span className="text-[11px] font-mono text-zinc-400">Tap timeframe to expand all indicators</span>
        </div>

        <div className="space-y-2.5">
          {report.timeframeAnalyses.map((tf) => {
            const isOpen = expandedTf === tf.timeframe;
            const tfStyle = getClassificationStyle(tf.classification);
            return (
              <div
                key={tf.timeframe}
                className="rounded-2xl border border-white/10 bg-[#121318] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedTf(isOpen ? null : tf.timeframe)}
                  className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-mono font-bold text-zinc-100">{tf.timeframe}</span>
                      <span className={`text-xs font-mono font-bold ${tfStyle.text}`}>
                        {tf.classification}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        · Score {tf.combinedScore >= 0 ? '+' : ''}
                        {tf.combinedScore.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate">{tf.summary}</p>
                  </div>
                  <div className="shrink-0 text-zinc-400">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-2 border-t border-white/8 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                      <div className="rounded-xl bg-[#0C0D11] p-2.5 border border-white/5">
                        <div className="text-[10px] text-zinc-500">Latest Close</div>
                        <div className="text-zinc-100 font-semibold">${tf.latestClose.toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl bg-[#0C0D11] p-2.5 border border-white/5">
                        <div className="text-[10px] text-zinc-500">Trend / Momentum</div>
                        <div className="text-zinc-100 font-semibold">
                          {tf.trendScore.toFixed(2)} / {tf.momentumScore.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#0C0D11] p-2.5 border border-white/5">
                        <div className="text-[10px] text-zinc-500">Volatility</div>
                        <div className="text-zinc-100 truncate">{tf.volatilityState}</div>
                      </div>
                      <div className="rounded-xl bg-[#0C0D11] p-2.5 border border-white/5">
                        <div className="text-[10px] text-zinc-500">Volume</div>
                        <div className="text-zinc-100 truncate">{tf.volumeState}</div>
                      </div>
                    </div>

                    <p className="text-[11px] font-mono text-zinc-500">
                      Candles analyzed: {tf.candleCount} · Freshness: {tf.freshness} · {tf.volumeNote}
                    </p>

                    {/* Actual Indicator Readings Table */}
                    <div className="overflow-x-auto rounded-xl border border-white/8">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#0C0D11] text-zinc-400 border-b border-white/8">
                            <th className="py-2 px-3 font-medium">Indicator</th>
                            <th className="py-2 px-3 font-medium">Category</th>
                            <th className="py-2 px-3 font-medium">Calculated Value</th>
                            <th className="py-2 px-3 font-medium text-right">Bias</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {tf.indicatorResults.map((ind) => {
                            const bColor =
                              ind.bias === 'BUY'
                                ? 'text-emerald-400'
                                : ind.bias === 'SELL'
                                ? 'text-red-400'
                                : 'text-[#F5D061]';
                            return (
                              <tr key={ind.id} className="hover:bg-white/[0.02]">
                                <td className="py-2.5 px-3">
                                  <div className="font-medium text-zinc-100">{ind.name}</div>
                                  <div className="text-[11px] text-zinc-400 mt-0.5">{ind.explanation}</div>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400 whitespace-nowrap align-top">
                                  {ind.category}
                                </td>
                                <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-200 whitespace-nowrap align-top">
                                  {ind.primaryValue}
                                </td>
                                <td className={`py-2.5 px-3 font-mono font-bold text-right whitespace-nowrap align-top ${bColor}`}>
                                  {ind.bias}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      {previewJpg && (
        <JpgPreviewModal rendered={previewJpg} onClose={() => setPreviewJpg(null)} />
      )}
    </motion.div>
  );
}
