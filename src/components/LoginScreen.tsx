import { memo, useCallback } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';

function GoogleLogoG() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="w-5 h-5 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export const LoginScreen = memo(function LoginScreen() {
  const { signInWithGoogle, signingIn, authError, clearError } = useAuth();
  const handleSignIn = useCallback(() => {
    void signInWithGoogle();
  }, [signInWithGoogle]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#FFFFFF] via-[#FDFBF7] to-[#F5EEDB] text-[#09090B] flex flex-col justify-between px-5 py-8 sm:px-8 relative overflow-hidden">
      {/* Subtle architectural metallic gold radial accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[340px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.16)_0%,rgba(212,175,55,0)_72%)]"
      />

      {/* Top Brand Header */}
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: 'transform, opacity' }}
        className="relative z-10 w-full max-w-5xl mx-auto flex items-center justify-between transform-gpu"
      >
        <div className="flex items-center gap-3">
          <img
            src="/assets/aistudio/images_0b890af9.png"
            alt="LEADERS XAUUSD App Icon"
            className="w-10 h-10 rounded-full object-cover shadow-[0_6px_16px_-6px_rgba(255,173,0,0.35)] shrink-0"
          />
          <div>
            <div className="font-display font-bold tracking-tight text-base sm:text-lg text-[#09090B]">
              LEADER{' '}
              <span className="bg-gradient-to-r from-[#8E6603] via-[#C69B2B] to-[#7B5700] bg-clip-text text-transparent">
                XAUUSD
              </span>
            </div>
            <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#71717A]">
              Gold Intelligence Desk
            </p>
          </div>
        </div>
      </motion.header>

      {/* Center Luxury Sign-In Card */}
      <main className="relative z-10 w-full flex-1 flex items-center justify-center py-10">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'transform, opacity' }}
          className="w-full max-w-md rounded-3xl bg-white border border-[#D4AF37]/40 shadow-[0_16px_44px_-20px_rgba(140,100,5,0.2)] p-7 sm:p-10 transform-gpu"
        >
          {/* Thin gold top accent */}
          <div className="w-14 h-[2px] mx-auto mb-7 rounded-full bg-gradient-to-r from-[#9E760D] via-[#E5C158] to-[#9E760D]" />

          <div className="text-center space-y-2.5 mb-8">
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#9A7209]">
              Member Access
            </p>
            <h1 className="font-display font-bold text-2xl sm:text-[28px] tracking-tight text-[#09090B]">
              LEADER XAUUSD
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed">
              Sign in with your Google account to open live XAUUSD charts, multi-timeframe analysis, and the SURE auto scanner.
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-xs text-red-800 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{authError}</span>
              <button
                type="button"
                onClick={clearError}
                aria-label="Dismiss authentication error"
                className="text-red-500 hover:text-red-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Large Black Rounded Google Login Button */}
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full min-h-[58px] rounded-full bg-[#09090B] hover:bg-[#18181B] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed text-white font-display font-semibold text-[15px] tracking-wide px-6 flex items-center justify-center gap-3.5 shadow-[0_10px_24px_-8px_rgba(9,9,11,0.38)] border border-[#D4AF37]/35 transition-transform transition-colors duration-150 cursor-pointer"
          >
            {signingIn ? (
              <span className="w-5 h-5 rounded-full border-2 border-[#D4AF37]/40 border-t-[#F5D061] animate-spin shrink-0" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0">
                <GoogleLogoG />
              </span>
            )}
            <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
          </button>

          <div className="mt-7 pt-5 border-t border-[#D4AF37]/20 flex items-center justify-center gap-2 text-xs text-[#71717A]">
            <ShieldCheck className="w-4 h-4 text-[#9A7209] shrink-0" />
            <span>Verified Google OAuth · Persistent Session</span>
          </div>
        </motion.section>
      </main>

      {/* Luxury Footer */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto text-center text-[11px] font-medium tracking-[0.12em] uppercase text-[#71717A]">
        LEADER XAUUSD · Gold Market Terminal
      </footer>
    </div>
  );
});
