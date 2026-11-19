import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase.ts';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  signingOut: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatAuthError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: unknown }).code);
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in was cancelled. Please try again when ready.';
      case 'auth/popup-blocked':
        return 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
      case 'auth/network-request-failed':
        return 'Network error while connecting to Google Authentication. Check your connection and retry.';
      case 'auth/unauthorized-domain':
        return 'This domain is not yet authorized for Google Sign-In in Firebase Authentication.';
      case 'auth/operation-not-allowed':
        return 'Google Sign-In is not enabled in Firebase Authentication settings.';
      default:
        break;
    }
  }
  return 'Unable to complete Google sign-in. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      () => {
        setUser(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(formatAuthError(error));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    setSigningOut(true);
    try {
      await signOut(auth);
    } catch {
      setAuthError('Unable to sign out cleanly. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signingIn,
      signingOut,
      authError,
      signInWithGoogle,
      logout,
      clearError,
    }),
    [user, loading, signingIn, signingOut, authError, signInWithGoogle, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
