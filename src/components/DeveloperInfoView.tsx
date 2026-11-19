import { memo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Phone, Shield } from 'lucide-react';

interface DeveloperInfoViewProps {
  onBack: () => void;
}

interface DeveloperProfile {
  code: string;
  name: string;
  phoneDisplay: string;
  phoneHref: string;
}

const DEVELOPERS: DeveloperProfile[] = [
  {
    code: 'DEVELOPER 01',
    name: 'SRINATH PANIGRAHI',
    phoneDisplay: '+91 7848033527',
    phoneHref: 'tel:+917848033527',
  },
  {
    code: 'DEVELOPER 02',
    name: 'PRABHU PRASAD',
    phoneDisplay: '+91 8249927734',
    phoneHref: 'tel:+918249927734',
  },
];

export const DeveloperInfoView = memo(function DeveloperInfoView({
  onBack,
}: DeveloperInfoViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: 'transform, opacity' }}
      className="w-full max-w-3xl mx-auto space-y-6 transform-gpu"
    >
      {/* Back Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white border border-[#D4AF37]/35 text-[#09090B] hover:border-[#B8860B] hover:bg-[#FCF8EE] shadow-[0_6px_16px_-8px_rgba(140,100,5,0.16)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#9A7209]" />
          <span className="text-sm font-display font-semibold">Back to Profile</span>
        </button>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase text-[#9A7209]">
          <Shield className="w-3.5 h-3.5" />
          <span>Engineering Desk</span>
        </div>
      </div>

      {/* Luxury Header */}
      <div className="rounded-3xl bg-white border border-[#D4AF37]/35 shadow-[0_12px_32px_-16px_rgba(140,100,5,0.18)] p-6 sm:p-7">
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#9A7209]">
          LEADER XAUUSD
        </p>
        <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-[#09090B] mt-1">
          Developer Info
        </h1>
        <p className="text-sm text-[#52525B] mt-1.5">
          Direct engineering contacts for LEADER XAUUSD platform support and inquiries.
        </p>
      </div>

      {/* Separate Luxury Cards for Both Developers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {DEVELOPERS.map((dev) => (
          <article
            key={dev.code}
            className="rounded-3xl bg-gradient-to-b from-[#FFFFFF] to-[#FDF9EE] border border-[#D4AF37]/40 shadow-[0_12px_32px_-16px_rgba(140,100,5,0.18)] p-6 sm:p-7 flex flex-col justify-between gap-6"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9A7209]">
                  {dev.code}
                </span>
                <span className="h-[1px] flex-1 bg-gradient-to-r from-[#D4AF37]/45 to-transparent" />
              </div>

              <h2 className="font-display font-bold text-xl sm:text-[22px] tracking-tight text-[#09090B]">
                {dev.name}
              </h2>
            </div>

            <div className="pt-4 border-t border-[#D4AF37]/25 space-y-2.5">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#71717A]">
                CONTACT
              </p>

              <a
                href={dev.phoneHref}
                aria-label={`Call ${dev.name} at ${dev.phoneDisplay}`}
                className="min-h-[48px] w-full rounded-2xl bg-white hover:bg-[#09090B] group border border-[#D4AF37]/40 hover:border-[#09090B] px-4 py-3 flex items-center justify-between gap-3 shadow-sm transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FBF5E3] to-[#F3E5BE] group-hover:from-[#D4AF37] group-hover:to-[#B8860B] border border-[#D4AF37]/40 flex items-center justify-center shrink-0 transition-colors">
                    <Phone className="w-4 h-4 text-[#8E6603] group-hover:text-[#09090B] transition-colors" />
                  </span>
                  <span className="font-mono font-semibold text-sm sm:text-[15px] text-[#09090B] group-hover:text-white tracking-tight truncate transition-colors">
                    {dev.phoneDisplay}
                  </span>
                </div>
                <span className="text-[11px] font-display font-semibold tracking-wider uppercase text-[#9A7209] group-hover:text-[#F5D061] shrink-0 transition-colors">
                  Call
                </span>
              </a>
            </div>
          </article>
        ))}
      </div>
    </motion.div>
  );
});
