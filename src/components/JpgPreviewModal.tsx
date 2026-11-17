import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { RenderedJpgReport } from '../utils/exportReportJpg.ts';

interface JpgPreviewModalProps {
  rendered: RenderedJpgReport;
  onClose: () => void;
}

export function JpgPreviewModal({ rendered, onClose }: JpgPreviewModalProps) {
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(rendered.blobUrl);
    };
  }, [rendered]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Exported Report Image Preview"
    >
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-[#121318] border border-[#D4AF37]/35 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-sm font-display font-semibold text-[#F5D061]">
              Hold JPG to download
            </h3>
            <p className="text-[11px] font-mono text-zinc-400 truncate">{rendered.filename}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close JPG preview"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Image Preview (Long-press / right-click image to save) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#09090B]">
          <img
            src={rendered.dataUrl}
            alt={rendered.filename}
            className="w-full h-auto rounded-xl border border-white/10 select-auto"
          />
        </div>
      </div>
    </div>
  );
}
