import { memo, useCallback, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  MoreVertical,
  Share,
  Smartphone,
  X,
} from 'lucide-react';

interface PWAInstallModalProps {
  open: boolean;
  onClose: () => void;
  isInstallable: boolean;
  isIOS: boolean;
  isInIframe: boolean;
  onTriggerNativeInstall: () => Promise<boolean>;
}

export const PWAInstallModal = memo(function PWAInstallModal({
  open,
  onClose,
  isInstallable,
  isIOS,
  isInIframe,
  onTriggerNativeInstall,
}: PWAInstallModalProps) {
  const [copied, setCopied] = useState(false);

  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = useCallback(async () => {
    if (!appOrigin) return;
    try {
      await navigator.clipboard.writeText(appOrigin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard failures on restricted contexts
    }
  }, [appOrigin]);

  const handleInstallClick = useCallback(async () => {
    const accepted = await onTriggerNativeInstall();
    if (accepted) {
      onClose();
    }
  }, [onTriggerNativeInstall, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install LEADERS XAUUSD Full-Screen App"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[#121318] border border-[#D4AF37]/40 shadow-2xl p-5 sm:p-6 text-zinc-100 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/assets/aistudio/images_0b890af9.png"
              alt="LEADERS XAUUSD"
              className="w-11 h-11 rounded-full object-cover shrink-0 border border-[#D4AF37]/40"
            />
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base sm:text-lg text-white truncate">
                Install Full-Screen App
              </h2>
              <p className="text-xs text-zinc-400">
                Opens without browser URL bar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install dialog"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Native 1-Tap Install when available */}
        {isInstallable && (
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full min-h-[48px] rounded-2xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#09090B] font-display font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Install App Now (No URL Bar)</span>
          </button>
        )}

        {/* Notice when inside AI Studio preview iframe */}
        {isInIframe && (
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 space-y-2">
            <p className="font-semibold text-amber-300">
              Direct Browser Tab Required for App Download
            </p>
            <p className="leading-relaxed text-amber-100/90">
              Inside preview mode, &ldquo;Add to Home Screen&rdquo; saves a shortcut with a URL bar. Copy the app link below and open it directly in Chrome (Android) or Safari (iPhone):
            </p>
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 min-w-0 rounded-xl bg-black/40 border border-white/10 px-3 py-2 font-mono text-[11px] text-zinc-200 truncate">
                {appOrigin}
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-3 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] font-semibold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Step-by-step instructions */}
        <div className="space-y-3">
          {!isIOS && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider text-[#F5D061]">
                <Smartphone className="w-4 h-4" />
                <span>Android (Google Chrome)</span>
              </div>
              <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>
                  Open this app link directly in <strong>Chrome</strong> (not inside AI Studio editor).
                </li>
                <li>
                  Tap the top-right <MoreVertical className="inline w-3.5 h-3.5 text-zinc-100" /> menu → <strong>Add to home screen</strong> (or <strong>Install app</strong>).
                </li>
                <li>
                  Choose <strong className="text-emerald-400">Install</strong> (do <em>not</em> select &ldquo;Create shortcut&rdquo;) — then open from your phone home screen for full screen without URL bar.
                </li>
              </ol>
            </div>
          )}

          {(isIOS || !isInstallable) && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider text-[#F5D061]">
                <Share className="w-4 h-4" />
                <span>iPhone / iPad (Safari)</span>
              </div>
              <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>
                  Open the app link directly in <strong>Safari</strong>.
                </li>
                <li>
                  Tap the <strong>Share</strong> icon (<Share className="inline w-3.5 h-3.5 text-zinc-100" />) at the bottom toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong> → <strong>Add</strong>. Launching from the new icon opens full screen with zero URL bar.
                </li>
              </ol>
            </div>
          )}
        </div>

        {!isInIframe && appOrigin && (
          <button
            type="button"
            onClick={handleCopyUrl}
            className="w-full py-2.5 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#F5D061]" />}
            <span>{copied ? 'App URL Copied to Clipboard' : 'Copy Direct App Link'}</span>
          </button>
        )}
      </div>
    </div>
  );
});
