import { useState } from 'react';
import { Check, ChevronRight, FileText, ImageDown, Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { AnalysisReport, SignalClassification } from '../types/market.ts';
import {
  renderAnalysisReportJpg,
  triggerJpgDownload,
  type RenderedJpgReport,
} from '../utils/exportReportJpg.ts';
import { AnalysisResultView } from './AnalysisResultView.tsx';
import { JpgPreviewModal } from './JpgPreviewModal.tsx';

interface SignalsViewProps {
  reports: AnalysisReport[];
  loading: boolean;
  onDeleteReport: (id: string) => Promise<void>;
  onGoToTrade: () => void;
}

type FilterOption = 'ALL' | SignalClassification;

export function SignalsView({
  reports,
  loading,
  onDeleteReport,
  onGoToTrade,
}: SignalsViewProps) {
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);
  const [filter, setFilter] = useState<FilterOption>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewJpg, setPreviewJpg] = useState<RenderedJpgReport | null>(null);
  const [exportedReportId, setExportedReportId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (selectedReport) {
    return (
      <AnalysisResultView
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
        backLabel="Back to Signals History"
      />
    );
  }

  const filtered = filter === 'ALL' ? reports : reports.filter((r) => r.classification === filter);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await onDeleteReport(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportJpg = (e: React.MouseEvent, report: AnalysisReport) => {
    e.stopPropagation();
    setExportError(null);
    try {
      const rendered = renderAnalysisReportJpg(report);
      // Synchronous download trigger while user gesture is active
      triggerJpgDownload(rendered.blobUrl, rendered.filename);
      setPreviewJpg(rendered);
      setExportedReportId(report.id);
      setExportNotice(rendered.filename);
      window.setTimeout(() => {
        setExportedReportId((curr) => (curr === report.id ? null : curr));
        setExportNotice((curr) => (curr === rendered.filename ? null : curr));
      }, 4000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export JPG image');
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-zinc-100">Saved Analysis Signals</h1>
          <p className="text-xs text-zinc-400">
            Preserved snapshots of completed XAUUSD multi-timeframe reports
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121318] border border-white/10 self-start sm:self-auto">
          {(['ALL', 'BUY', 'SELL', 'HOLD'] as FilterOption[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-mono font-semibold transition-colors ${
                filter === opt
                  ? 'bg-[#D4AF37] text-[#09090B]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {exportNotice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-mono text-emerald-300 truncate">
          JPG exported to local downloads: {exportNotice}
        </div>
      )}

      {exportError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
          JPG export failed: {exportError}
        </div>
      )}

      {/* States */}
      {loading && reports.length === 0 ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 rounded-2xl border border-white/8 bg-[#121318] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#121318] p-8 text-center space-y-3">
          <div className="mx-auto w-11 h-11 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
            <FileText className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-display font-semibold text-zinc-100">
              {reports.length === 0 ? 'No Analysis Reports Yet' : `No ${filter} Reports Found`}
            </h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              {reports.length === 0
                ? 'Run ANALYSE XAUUSD from the TRADE tab to calculate real technical indicators and automatically save reports here.'
                : 'Switch the filter above to inspect other saved classifications.'}
            </p>
          </div>
          {reports.length === 0 && (
            <button
              type="button"
              onClick={onGoToTrade}
              className="min-h-[44px] px-5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-semibold hover:bg-[#F5D061] transition-colors"
            >
              Go to TRADE Chart
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((report) => {
            const classColor =
              report.classification === 'BUY'
                ? 'text-emerald-400'
                : report.classification === 'SELL'
                ? 'text-red-400'
                : 'text-[#F5D061]';
            const Icon =
              report.classification === 'BUY'
                ? TrendingUp
                : report.classification === 'SELL'
                ? TrendingDown
                : Minus;
            const dt = new Date(report.createdAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedReport(report);
                  }
                }}
                className="w-full text-left rounded-2xl border border-white/10 bg-[#121318] hover:border-[#D4AF37]/45 p-4 transition-colors cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-display font-bold ${classColor}`}>
                      <Icon className="w-4 h-4" />
                      <span>{report.classification}</span>
                    </span>
                    <span className="text-xs font-mono tabular-nums text-zinc-200">
                      · ${report.spotPrice.toFixed(2)}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">· {dt}</span>
                  </div>

                  <div className="text-xs font-mono text-zinc-300 truncate">
                    Timeframes: {report.selectedTimeframes.join(', ')} · {report.freshness}
                    {report.tradeLevels && (
                      <span className="text-zinc-200">
                        {' '}· SL ${report.tradeLevels.stopLoss.toFixed(2)} · TP1 ${report.tradeLevels.takeProfit1.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-zinc-400 truncate">
                    Indicators ({report.selectedIndicators.length}):{' '}
                    {report.selectedIndicators.map((i) => i.name).join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => handleExportJpg(e, report)}
                    aria-label="Export analysis report as JPG"
                    title="Export JPG"
                    className={`min-h-[44px] px-3 flex items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                      exportedReportId === report.id
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-[#D4AF37]/35 bg-[#181A20] text-[#F5D061] hover:bg-[#D4AF37]/15'
                    }`}
                  >
                    {exportedReportId === report.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <ImageDown className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {exportedReportId === report.id ? 'Ready' : 'JPG'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, report.id)}
                    disabled={deletingId === report.id}
                    aria-label="Delete report"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {previewJpg && (
        <JpgPreviewModal rendered={previewJpg} onClose={() => setPreviewJpg(null)} />
      )}
    </div>
  );
}
