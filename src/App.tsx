import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CandlestickChart,
  FileText,
  Newspaper,
  User,
  X,
} from 'lucide-react';
import type {
  AnalysisReport,
  EconomicCalendarPayload,
  MarketQuote,
  NewsProtectionState,
  SureSignalEntry,
  SureSignalScanStatus,
  SureSignalStatus,
} from './types/market.ts';
import {
  createAdaptivePollState,
  evaluateAdaptivePollInterval,
  STANDARD_POLL_INTERVAL_MS,
  type AdaptivePollState,
} from './utils/adaptivePolling.ts';
import {
  computeClientSureStats,
  deleteAnalysisReportFromFirestore,
  deleteSureSignalFromFirestore,
  ensureUserAccountDoc,
  mergeAnalysisReports,
  mergeSureSignalHistories,
  saveAnalysisReportToFirestore,
  subscribeAnalysisReportsFirestore,
  subscribeSureSignalsFirestore,
  syncSureSignalToFirestore,
} from './utils/historyFirestore.ts';
import {
  getPersistedBannerSeenIds,
  isPhoneAlertsEnabled,
  markBannerSeenIds,
  notifyNewSureSignalOnPhone,
  notifySureSignalOutcomeOnPhone,
  reconcileSureStatusTransitions,
  subscribeNotificationPermissionSync,
  syncWebPushSubscriptionIfEnabled,
  unlockAlertAudio,
} from './utils/phoneNotifications.ts';
import { publishLiveQuote, useLiveQuoteState } from './contexts/LiveQuoteContext.tsx';
import { useAuth } from './contexts/AuthContext.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { NewsCalendarView } from './components/NewsCalendarView.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { SignalsView } from './components/SignalsView.tsx';
import { SmoothedPriceText } from './components/SmoothedPriceText.tsx';
import { SureSignalsView } from './components/SureSignalsView.tsx';
import { TradeView } from './components/TradeView.tsx';
import { useOnlineStatus } from './hooks/usePWAInstall.ts';

type BottomTab = 'TRADE' | 'NEWS' | 'SURE' | 'SIGNALS' | 'PROFILE';

interface BannerNotification {
  kind: 'NEW' | 'TP_HIT' | 'SL_HIT' | 'AMBIGUOUS';
  entry: SureSignalEntry;
}

const HeaderPriceStatus = memo(function HeaderPriceStatus() {
  const { quote } = useLiveQuoteState();
  const validPrice =
    quote && quote.freshness !== 'UNAVAILABLE' && quote.mid > 0 ? quote.mid : null;

  return (
    <div className="flex items-center gap-2.5 text-xs font-mono tabular-nums whitespace-nowrap shrink-0">
      {quote && quote.freshness !== 'UNAVAILABLE' && validPrice != null ? (
        <>
          <SmoothedPriceText
            value={validPrice}
            flashOnMove
            className="font-semibold transition-colors duration-200"
          />
          <span className="text-zinc-600">·</span>
          <span
            className={`inline-flex items-center gap-1.5 font-semibold ${
              quote.freshness === 'LIVE' ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {quote.freshness === 'LIVE' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
            {quote.freshness}
          </span>
        </>
      ) : (
        <span className="text-red-400 font-semibold">DATA UNAVAILABLE</span>
      )}
    </div>
  );
});

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<BottomTab>(() => {
    if (typeof window !== 'undefined') {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'SURE' || tabParam === 'NEWS' || tabParam === 'SIGNALS' || tabParam === 'PROFILE') {
        return tabParam;
      }
    }
    return 'TRADE';
  });
  const [serverReports, setServerReports] = useState<AnalysisReport[]>([]);
  const [firestoreReports, setFirestoreReports] = useState<AnalysisReport[]>([]);
  const [serverReportsLoading, setServerReportsLoading] = useState(true);
  const [firestoreReportsLoaded, setFirestoreReportsLoaded] = useState(false);

  const [sureStatus, setSureStatus] = useState<SureSignalScanStatus | null>(null);
  const [firestoreSureSignals, setFirestoreSureSignals] = useState<SureSignalEntry[]>([]);
  const [firestoreSureLoaded, setFirestoreSureLoaded] = useState(false);
  const [sureLoading, setSureLoading] = useState(true);

  const [newsCalendar, setNewsCalendar] = useState<EconomicCalendarPayload | null>(null);
  const [newsProtection, setNewsProtection] = useState<NewsProtectionState | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsRefreshing, setNewsRefreshing] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [unreadSureAlert, setUnreadSureAlert] = useState(false);
  const [bannerAlert, setBannerAlert] = useState<BannerNotification | null>(null);
  const isOnline = useOnlineStatus();

  const pollStateRef = useRef<AdaptivePollState>(createAdaptivePollState());
  const latestQuoteRef = useRef<MarketQuote | null>(null);
  const latestQuoteErrorRef = useRef<string | null>(null);
  const quoteInFlightRef = useRef(false);
  const lastStreamAtRef = useRef(0);
  const activeTabRef = useRef<BottomTab>(activeTab);
  activeTabRef.current = activeTab;
  const sureStatusesRef = useRef<Map<string, SureSignalStatus>>(new Map());
  const sureBaselineHydratedRef = useRef(false);
  const syncedReportIdsRef = useRef<Set<string>>(new Set());
  const syncingSureKeysRef = useRef<Set<string>>(new Set());
  const finalizedSureIdsRef = useRef<Set<string>>(new Set());
  const restoredActiveIdsRef = useRef<Set<string>>(new Set());
  const [firestoreFatalError, setFirestoreFatalError] = useState<Error | null>(null);

  if (firestoreFatalError) {
    throw firestoreFatalError;
  }

  const applyIncomingQuote = useCallback((nextQuote: MarketQuote | null, ok: boolean) => {
    if (nextQuote && nextQuote.freshness !== 'UNAVAILABLE' && nextQuote.mid > 0) {
      latestQuoteRef.current = nextQuote;
      latestQuoteErrorRef.current = null;
      publishLiveQuote(nextQuote, null);
      pollStateRef.current = evaluateAdaptivePollInterval(pollStateRef.current, nextQuote);
      return;
    }

    if (nextQuote) {
      latestQuoteRef.current = nextQuote;
    }
    if (!ok) {
      latestQuoteErrorRef.current = 'DATA UNAVAILABLE';
    }
    publishLiveQuote(latestQuoteRef.current, latestQuoteErrorRef.current);
    pollStateRef.current = evaluateAdaptivePollInterval(pollStateRef.current, null);
  }, []);

  const fetchQuote = useCallback(async (): Promise<number> => {
    if (quoteInFlightRef.current) {
      return pollStateRef.current.currentIntervalMs;
    }
    quoteInFlightRef.current = true;
    try {
      const res = await fetch('/api/market/quote');
      const json = await res.json().catch(() => ({}));
      const nextQuote: MarketQuote | null = json.quote ?? null;
      applyIncomingQuote(nextQuote, res.ok);
      return pollStateRef.current.currentIntervalMs;
    } catch {
      applyIncomingQuote(null, false);
      return pollStateRef.current.currentIntervalMs;
    } finally {
      quoteInFlightRef.current = false;
    }
  }, [applyIncomingQuote]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.reports)) {
        setServerReports(json.reports);
      }
    } finally {
      setServerReportsLoading(false);
    }
  }, []);

  const fetchNewsCalendar = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setNewsRefreshing(true);
    }
    try {
      const url = forceRefresh ? '/api/news/calendar?refresh=1' : '/api/news/calendar';
      const res = await fetch(url);
      const json = (await res.json().catch(() => ({}))) as {
        calendar?: EconomicCalendarPayload;
        error?: string;
      };
      if (!res.ok || !json.calendar) {
        setNewsError(json.error || 'Economic news calendar data unavailable.');
        return;
      }
      setNewsCalendar(json.calendar);
      setNewsProtection(json.calendar.protection);
      setNewsError(null);
    } catch {
      setNewsError('Unable to reach economic news calendar service.');
    } finally {
      setNewsLoading(false);
      setNewsRefreshing(false);
    }
  }, []);

  const applyIncomingSureStatus = useCallback(
    (
      nextStatus: SureSignalScanStatus | null,
      options?: {
        explicitNewSignal?: SureSignalEntry;
        explicitClosedSignal?: SureSignalEntry;
      }
    ) => {
      if (nextStatus) {
        setSureStatus(nextStatus);
        setSureLoading(false);
        if (nextStatus.newsProtection) {
          setNewsProtection(nextStatus.newsProtection);
        }
      }

      const persistedSeen = getPersistedBannerSeenIds();
      const { events, nextStatuses, newlySeenKeys } = reconcileSureStatusTransitions({
        nextStatus,
        prevStatuses: sureStatusesRef.current,
        hasHydratedBaseline: sureBaselineHydratedRef.current,
        persistedSeenKeys: persistedSeen,
        explicitNewSignal: options?.explicitNewSignal,
        explicitClosedSignal: options?.explicitClosedSignal,
      });

      if (nextStatus) {
        sureStatusesRef.current = nextStatuses;
        sureBaselineHydratedRef.current = true;
      }

      if (newlySeenKeys.length > 0) {
        markBannerSeenIds(newlySeenKeys);
      }

      for (const evt of events) {
        setBannerAlert({ kind: evt.kind, entry: evt.entry });
        if (activeTabRef.current !== 'SURE') {
          setUnreadSureAlert(true);
        }
        if (evt.kind === 'NEW') {
          void notifyNewSureSignalOnPhone(evt.entry);
        } else {
          void notifySureSignalOutcomeOnPhone(evt.entry);
        }
      }
    },
    []
  );

  const fetchSureStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sure-signals');
      if (!res.ok) return;
      const json = await res.json();
      if (json.sureStatus) {
        applyIncomingSureStatus(json.sureStatus as SureSignalScanStatus);
      }
    } finally {
      setSureLoading(false);
    }
  }, [applyIncomingSureStatus]);

  const handleDeleteSureSignal = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/sure-signals/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.sureStatus) {
          applyIncomingSureStatus(json.sureStatus as SureSignalScanStatus);
        } else {
          setSureStatus((prev) =>
            prev ? { ...prev, history: prev.history.filter((h) => h.id !== id) } : prev
          );
        }
      } else if (res.status === 404) {
        setSureStatus((prev) =>
          prev ? { ...prev, history: prev.history.filter((h) => h.id !== id) } : prev
        );
      } else {
        return;
      }

      if (user) {
        await deleteSureSignalFromFirestore(user.uid, id);
      }
    },
    [applyIncomingSureStatus, user]
  );

  // Real-time Firestore history subscriptions for authenticated user
  useEffect(() => {
    if (!user) {
      setFirestoreReports([]);
      setFirestoreSureSignals([]);
      setFirestoreReportsLoaded(false);
      setFirestoreSureLoaded(false);
      syncedReportIdsRef.current.clear();
      syncingSureKeysRef.current.clear();
      finalizedSureIdsRef.current.clear();
      restoredActiveIdsRef.current.clear();
      return;
    }

    let cancelled = false;
    let unsubSure: (() => void) | null = null;
    let unsubReports: (() => void) | null = null;

    void (async () => {
      try {
        await ensureUserAccountDoc(user.uid);
        if (cancelled) return;

        unsubSure = subscribeSureSignalsFirestore(
          user.uid,
          (signals) => {
            if (cancelled) return;
            setFirestoreSureSignals(signals);
            setFirestoreSureLoaded(true);
          },
          (err) => {
            if (!cancelled) setFirestoreFatalError(err);
          }
        );

        unsubReports = subscribeAnalysisReportsFirestore(
          user.uid,
          (loadedReports) => {
            if (cancelled) return;
            setFirestoreReports(loadedReports);
            setFirestoreReportsLoaded(true);
          },
          (err) => {
            if (!cancelled) setFirestoreFatalError(err);
          }
        );
      } catch (err) {
        if (!cancelled && err instanceof Error) {
          setFirestoreFatalError(err);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubSure?.();
      unsubReports?.();
    };
  }, [user]);

  // Sync newly discovered or updated SURE signals from backend into permanent Firestore storage
  useEffect(() => {
    if (!user || !firestoreSureLoaded || !sureStatus?.history?.length) return;
    const firestoreById = new Map(firestoreSureSignals.map((item) => [item.id, item]));

    for (const entry of sureStatus.history) {
      const existingFs = firestoreById.get(entry.id) ?? null;
      if ((existingFs && existingFs.status !== 'ACTIVE') || finalizedSureIdsRef.current.has(entry.id)) {
        continue;
      }

      const syncKey = `${entry.id}:${entry.status}:${entry.closedAt ?? ''}`;
      if (syncingSureKeysRef.current.has(syncKey)) {
        continue;
      }

      syncingSureKeysRef.current.add(syncKey);
      void syncSureSignalToFirestore(user.uid, entry, existingFs)
        .then(() => {
          if (entry.status !== 'ACTIVE') {
            finalizedSureIdsRef.current.add(entry.id);
          }
        })
        .catch((err) => {
          if (err instanceof Error) {
            setFirestoreFatalError(err);
          }
        })
        .finally(() => {
          syncingSureKeysRef.current.delete(syncKey);
        });
    }
  }, [user, firestoreSureLoaded, sureStatus?.history, firestoreSureSignals]);

  // Sync any server-side analysis reports into permanent Firestore storage
  useEffect(() => {
    if (!user || !firestoreReportsLoaded || serverReports.length === 0) return;
    const firestoreIds = new Set(firestoreReports.map((r) => r.id));

    for (const report of serverReports) {
      if (firestoreIds.has(report.id) || syncedReportIdsRef.current.has(report.id)) {
        continue;
      }
      syncedReportIdsRef.current.add(report.id);
      void saveAnalysisReportToFirestore(user.uid, report).catch((err) => {
        syncedReportIdsRef.current.delete(report.id);
        if (err instanceof Error) {
          setFirestoreFatalError(err);
        }
      });
    }
  }, [user, firestoreReportsLoaded, serverReports, firestoreReports]);

  // If Firestore holds any ACTIVE SURE signal missing from server (e.g. after server restart/switch),
  // restore its lock on backend or settle it if superseded/closed so Firestore never stays stale ACTIVE.
  useEffect(() => {
    if (!user || !firestoreSureLoaded || sureLoading) return;
    const serverIds = new Set((sureStatus?.history ?? []).map((s) => s.id));
    const orphanedActives = firestoreSureSignals.filter(
      (s) => s.status === 'ACTIVE' && !serverIds.has(s.id) && !restoredActiveIdsRef.current.has(s.id)
    );
    if (orphanedActives.length === 0) return;

    for (const activeFs of orphanedActives) {
      restoredActiveIdsRef.current.add(activeFs.id);
      void fetch('/api/sure-signals/sync-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: activeFs }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { sureStatus?: SureSignalScanStatus } | null) => {
          if (json?.sureStatus) {
            applyIncomingSureStatus(json.sureStatus);
          }
        })
        .catch(() => {
          restoredActiveIdsRef.current.delete(activeFs.id);
        });
    }
  }, [
    user,
    firestoreSureLoaded,
    sureLoading,
    firestoreSureSignals,
    sureStatus?.history,
    applyIncomingSureStatus,
  ]);

  // Automatically unlock Web Audio on first tap/keypress when alerts are enabled in localStorage
  useEffect(() => {
    if (!user) return;
    const handleFirstGesture = () => {
      if (isPhoneAlertsEnabled()) {
        void unlockAlertAudio();
      }
    };
    window.addEventListener('pointerdown', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, [user]);

  // Sync browser Web Push (VAPID) subscription on boot and whenever notification permission becomes granted
  useEffect(() => {
    if (!user) return;
    void syncWebPushSubscriptionIfEnabled();
    return subscribeNotificationPermissionSync((perm) => {
      if (perm === 'granted') {
        void syncWebPushSubscriptionIfEnabled();
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (!authLoading) {
        setActiveTab('TRADE');
      }
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;
    let eventSource: EventSource | null = null;

    const clearScheduled = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const closeStream = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const openStream = () => {
      closeStream();
      if (cancelled || document.hidden || typeof EventSource === 'undefined') return;
      try {
        const es = new EventSource('/api/market/stream');
        es.onopen = () => {
          if (!cancelled) {
            void fetchSureStatus();
          }
        };
        es.onmessage = (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse(event.data) as { quote?: MarketQuote };
            if (payload?.quote) {
              lastStreamAtRef.current = Date.now();
              applyIncomingQuote(payload.quote, payload.quote.freshness !== 'UNAVAILABLE');
            }
          } catch {
            // Ignore malformed SSE tick frame
          }
        };
        es.addEventListener('sure_signal', (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse((event as MessageEvent<string>).data) as {
              status?: SureSignalScanStatus;
              newSignal?: SureSignalEntry;
            };
            applyIncomingSureStatus(payload.status ?? null, {
              explicitNewSignal: payload.newSignal,
            });
          } catch {
            // Ignore malformed sure_signal frame
          }
        });
        es.addEventListener('sure_outcome', (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse((event as MessageEvent<string>).data) as {
              status?: SureSignalScanStatus;
              closedSignal?: SureSignalEntry;
            };
            applyIncomingSureStatus(payload.status ?? null, {
              explicitClosedSignal: payload.closedSignal,
            });
          } catch {
            // Ignore malformed sure_outcome frame
          }
        });
        es.addEventListener('sure_status', (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse((event as MessageEvent<string>).data) as {
              status?: SureSignalScanStatus;
            };
            if (payload.status) {
              applyIncomingSureStatus(payload.status);
            }
          } catch {
            // Ignore malformed sure_status frame
          }
        });
        es.addEventListener('news_status', (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse((event as MessageEvent<string>).data) as {
              protection?: NewsProtectionState;
              calendar?: EconomicCalendarPayload;
            };
            if (payload.protection) {
              setNewsProtection(payload.protection);
            }
            if (payload.calendar) {
              setNewsCalendar(payload.calendar);
              setNewsError(null);
              setNewsLoading(false);
            }
          } catch {
            // Ignore malformed news_status frame
          }
        });
        es.onerror = () => {
          // Adaptive HTTP polling fallback remains active automatically
        };
        eventSource = es;
      } catch {
        // Fallback to HTTP polling if EventSource is unavailable
      }
    };

    const scheduleNext = (delayMs: number) => {
      clearScheduled();
      if (cancelled || document.hidden) return;
      timerId = window.setTimeout(async () => {
        if (cancelled) return;
        const streamHealthy = Date.now() - lastStreamAtRef.current < 4_500;
        const nextDelay =
          document.hidden || streamHealthy
            ? pollStateRef.current.currentIntervalMs || STANDARD_POLL_INTERVAL_MS
            : await fetchQuote();
        if (!cancelled) {
          scheduleNext(nextDelay);
        }
      }, delayMs);
    };

    const startLiveSync = async () => {
      openStream();
      const nextDelay = await fetchQuote();
      if (!cancelled) {
        scheduleNext(nextDelay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearScheduled();
        closeStream();
      } else {
        void startLiveSync();
        void fetchSureStatus();
        void fetchNewsCalendar(false);
      }
    };

    fetchReports();
    void fetchSureStatus();
    void fetchNewsCalendar(false);
    void startLiveSync();
    const sureFallbackTimer = window.setInterval(() => {
      if (!document.hidden) {
        void fetchSureStatus();
        void fetchNewsCalendar(false);
      }
    }, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduled();
      closeStream();
      window.clearInterval(sureFallbackTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    user,
    authLoading,
    applyIncomingQuote,
    applyIncomingSureStatus,
    fetchNewsCalendar,
    fetchQuote,
    fetchReports,
    fetchSureStatus,
  ]);

  const handleReportSaved = useCallback(
    (report: AnalysisReport) => {
      setServerReports((prev) => {
        if (prev.some((r) => r.id === report.id)) return prev;
        return [report, ...prev];
      });
      if (user && !syncedReportIdsRef.current.has(report.id)) {
        syncedReportIdsRef.current.add(report.id);
        void saveAnalysisReportToFirestore(user.uid, report).catch((err) => {
          syncedReportIdsRef.current.delete(report.id);
          if (err instanceof Error) {
            setFirestoreFatalError(err);
          }
        });
      }
    },
    [user]
  );

  const handleDeleteReport = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        setServerReports((prev) => prev.filter((r) => r.id !== id));
        if (user) {
          await deleteAnalysisReportFromFirestore(user.uid, id);
        }
      }
    },
    [user]
  );

  const handleGoToTrade = useCallback(() => {
    setActiveTab('TRADE');
  }, []);

  const handleManualNewsRefresh = useCallback(() => {
    void fetchNewsCalendar(true);
  }, [fetchNewsCalendar]);

  const reports = useMemo(
    () => mergeAnalysisReports(serverReports, firestoreReports),
    [serverReports, firestoreReports]
  );
  const reportsLoading = serverReportsLoading && !firestoreReportsLoaded;

  const effectiveSureStatus = useMemo<SureSignalScanStatus | null>(() => {
    if (!sureStatus) {
      if (!firestoreSureLoaded || firestoreSureSignals.length === 0) return null;
      const activeFs = firestoreSureSignals.find((h) => h.status === 'ACTIVE') ?? null;
      return {
        scanning: false,
        tradeLocked: Boolean(activeFs),
        lastScannedAt: null,
        nextScanAt: null,
        scanIntervalMs: 60_000,
        monitoringMode: 'REALTIME_SPOT_BBO',
        marketState: activeFs
          ? activeFs.direction === 'BUY'
            ? 'SURE_BUY'
            : 'SURE_SELL'
          : 'NO_SURE_SIGNAL',
        latestPrice: null,
        latestConfidencePct: activeFs?.setupScore ?? 0,
        latestScore: activeFs?.combinedScore ?? 0,
        latestSetupScore: activeFs?.setupScore ?? 0,
        latestAdx: activeFs?.adxValue ?? null,
        reason: activeFs
          ? `Monitoring ACTIVE SURE ${activeFs.direction}. New scan paused until SL or TP hits.`
          : 'SCANNING FOR HIGH-QUALITY SETUP',
        checks: activeFs?.checks ?? [],
        activeSignal: activeFs ?? firestoreSureSignals[0] ?? null,
        history: firestoreSureSignals,
        stats: computeClientSureStats(firestoreSureSignals),
      };
    }

    const mergedHistory = mergeSureSignalHistories(sureStatus.history, firestoreSureSignals);
    const activeFromMerged = mergedHistory.find((h) => h.status === 'ACTIVE') ?? null;
    const locked = Boolean(activeFromMerged);
    const newsBlocked =
      sureStatus.marketState === 'NEWS_PAUSED' || sureStatus.newsProtection?.blocked === true;

    return {
      ...sureStatus,
      tradeLocked: locked,
      nextScanAt: locked ? null : sureStatus.nextScanAt,
      activeSignal: newsBlocked
        ? null
        : activeFromMerged ?? mergedHistory[0] ?? sureStatus.activeSignal ?? null,
      marketState: newsBlocked
        ? sureStatus.marketState
        : activeFromMerged
        ? activeFromMerged.direction === 'BUY'
          ? 'SURE_BUY'
          : 'SURE_SELL'
        : sureStatus.marketState,
      history: mergedHistory,
      stats: computeClientSureStats(mergedHistory),
    };
  }, [sureStatus, firestoreSureSignals, firestoreSureLoaded]);

  const effectiveNewsProtection =
    newsProtection ?? effectiveSureStatus?.newsProtection ?? newsCalendar?.protection ?? null;
  const isNewsPaused =
    effectiveNewsProtection?.blocked === true || effectiveSureStatus?.marketState === 'NEWS_PAUSED';
  const activeTradeLocked = (effectiveSureStatus?.tradeLocked ?? false) && !isNewsPaused;
  const navSureMarketState = effectiveSureStatus?.marketState;

  if (authLoading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-[#FFFFFF] via-[#FDFBF7] to-[#F5EEDB] text-[#09090B] flex flex-col items-center justify-center gap-4 px-6">
        <img
          src="/assets/aistudio/images_0b890af9.png"
          alt="LEADERS XAUUSD Icon"
          className="w-12 h-12 rounded-full object-cover shadow-[0_10px_30px_-10px_rgba(255,173,0,0.45)]"
        />
        <div className="text-center">
          <div className="font-display font-bold tracking-tight text-lg text-[#09090B]">
            LEADER <span className="text-[#9A7209]">XAUUSD</span>
          </div>
          <p className="text-xs text-[#71717A] mt-0.5">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div
      className={`min-h-screen flex flex-col ${
        activeTab === 'PROFILE' ? 'bg-[#F5EEDB] text-[#09090B]' : 'bg-[#09090B] text-[#F4F4F5]'
      }`}
    >
      {/* Compact Sticky Top Bar (52px) — opaque surface to eliminate mobile backdrop-blur scroll lag */}
      <header className="sticky top-0 z-30 h-[52px] bg-[#09090B]/[0.98] border-b border-white/10">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <img
              src="/assets/aistudio/images_0b890af9.png"
              alt="LEADERS XAUUSD"
              className="w-7 h-7 rounded-full object-cover shrink-0"
            />
            <div className="font-display font-bold tracking-tight text-base sm:text-lg">
              <span className="text-zinc-100">LEADERS</span>{' '}
              <span className="text-[#D4AF37]">XAUUSD</span>
            </div>
          </div>

          <HeaderPriceStatus />
        </div>
      </header>

      {!isOnline && (
        <div className="fixed bottom-[66px] left-3 z-40 flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold text-[#09090B] shadow-lg">
          <span className="h-1.5 w-1.5 rounded-full bg-[#09090B] animate-pulse" />
          Offline — Cached View
        </div>
      )}

      {/* In-App Alert Banner when a SURE signal or TP/SL outcome triggers (directional NEW banners suppressed during news pause) */}
      {bannerAlert && !(isNewsPaused && bannerAlert.kind === 'NEW') && (
        <div className="sticky top-[52px] z-20 px-3 sm:px-6 pt-2">
          <div
            className={`max-w-7xl mx-auto rounded-2xl border px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-lg ${
              bannerAlert.kind === 'AMBIGUOUS'
                ? 'border-amber-500/50 bg-[#1A160B]/95 text-amber-300'
                : bannerAlert.kind === 'TP_HIT' ||
                  (bannerAlert.kind === 'NEW' && bannerAlert.entry.direction === 'BUY')
                ? 'border-emerald-500/50 bg-[#0D1A15]/95 text-emerald-300'
                : 'border-red-500/50 bg-[#1B0E10]/95 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-mono">
              {bannerAlert.entry.direction === 'BUY' ? (
                <ArrowUp className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <ArrowDown className="w-4 h-4 text-red-400 shrink-0" />
              )}
              {bannerAlert.kind === 'NEW' ? (
                <>
                  <span className="font-bold">SURE {bannerAlert.entry.direction}</span>
                  <span className="text-zinc-200">
                    ${bannerAlert.entry.spotPrice.toFixed(2)} · Score{' '}
                    {bannerAlert.entry.setupScore ?? bannerAlert.entry.confidencePct}/100 · TP $
                    {bannerAlert.entry.tradeLevels.takeProfit1.toFixed(2)}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-bold">
                    {bannerAlert.kind === 'TP_HIT'
                      ? 'TP HIT'
                      : bannerAlert.kind === 'SL_HIT'
                      ? 'SL HIT'
                      : 'AMBIGUOUS'}{' '}
                    · SURE {bannerAlert.entry.direction}
                  </span>
                  <span className="text-zinc-200">
                    Close ${(bannerAlert.entry.closePrice ?? bannerAlert.entry.spotPrice).toFixed(2)} (
                    {(bannerAlert.entry.pnlPoints ?? 0) >= 0 ? '+' : ''}
                    {(bannerAlert.entry.pnlPoints ?? 0).toFixed(2)} pts)
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('SURE');
                  setUnreadSureAlert(false);
                  setBannerAlert(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-semibold"
              >
                Open SURE
              </button>
              <button
                type="button"
                onClick={() => setBannerAlert(null)}
                aria-label="Dismiss alert"
                className="p-1 text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main
        className={
          activeTab === 'PROFILE'
            ? 'flex-1 w-full flex flex-col pb-[58px]'
            : 'flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-20'
        }
      >
        <div className={activeTab === 'TRADE' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'TRADE'}>
          <TradeView
            isActive={activeTab === 'TRADE'}
            reports={reports}
            reportsLoading={reportsLoading}
            newsProtection={effectiveNewsProtection}
            onRefreshQuote={fetchQuote}
            onReportSaved={handleReportSaved}
            onDeleteReport={handleDeleteReport}
            onNewsProtectionSync={setNewsProtection}
          />
        </div>
        {activeTab === 'NEWS' ? (
          <NewsCalendarView
            calendar={newsCalendar}
            loading={newsLoading}
            refreshing={newsRefreshing}
            error={newsError}
            onRefresh={handleManualNewsRefresh}
          />
        ) : activeTab === 'SURE' ? (
          <SureSignalsView
            sureStatus={effectiveSureStatus}
            newsProtection={effectiveNewsProtection}
            loading={sureLoading && !firestoreSureLoaded}
            onDeleteHistoryItem={handleDeleteSureSignal}
          />
        ) : activeTab === 'SIGNALS' ? (
          <SignalsView
            reports={reports}
            newsProtection={effectiveNewsProtection}
            loading={reportsLoading}
            onDeleteReport={handleDeleteReport}
            onGoToTrade={handleGoToTrade}
          />
        ) : activeTab === 'PROFILE' ? (
          <ProfileView />
        ) : null}
      </main>

      {/* Bottom Navigation — Trade | News | Sure | Signal | Profile */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 h-[58px] bg-[#0B0C10]/[0.98] border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-xl mx-auto h-full grid grid-cols-5 items-center px-1">
          <button
            type="button"
            onClick={() => setActiveTab('TRADE')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'TRADE'
                ? 'text-[#F5D061]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CandlestickChart className="w-[18px] h-[18px]" />
            <span className="text-[10px] sm:text-[11px] font-display font-semibold tracking-wide whitespace-nowrap">
              Trade
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('NEWS')}
            aria-label="Economic News Calendar"
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'NEWS'
                ? 'text-[#F5D061]'
                : isNewsPaused || effectiveNewsProtection?.warningActive
                ? 'text-red-400 hover:text-red-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {(isNewsPaused || effectiveNewsProtection?.warningActive) && (
              <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
            <Newspaper className="w-[18px] h-[18px]" />
            <span className="text-[10px] sm:text-[11px] font-display font-semibold tracking-wide whitespace-nowrap">
              News
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('SURE');
              setUnreadSureAlert(false);
            }}
            aria-label="Sure Signal Auto Scanner"
            className={`relative min-h-[44px] mx-1 my-1 px-1.5 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              isNewsPaused
                ? 'border-red-500/65 bg-red-600/15 text-red-300 shadow-sm shadow-red-500/20'
                : activeTradeLocked && navSureMarketState === 'SURE_BUY'
                ? 'border-emerald-500/65 bg-emerald-500/15 text-emerald-300 shadow-sm shadow-emerald-500/20'
                : activeTradeLocked && navSureMarketState === 'SURE_SELL'
                ? 'border-red-500/65 bg-red-500/15 text-red-300 shadow-sm shadow-red-500/20'
                : activeTab === 'SURE'
                ? 'border-[#D4AF37]/60 bg-[#D4AF37]/12 text-[#F5D061]'
                : 'border-white/15 bg-[#121318] text-zinc-200 hover:border-[#D4AF37]/45'
            }`}
          >
            {unreadSureAlert && !isNewsPaused && (
              <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-[#F5D061] animate-pulse" />
            )}
            <div className="flex items-center gap-0.5">
              <ArrowUp className={`w-3.5 h-3.5 stroke-[2.75] ${isNewsPaused ? 'text-red-400' : 'text-emerald-400'}`} />
              <ArrowDown className="w-3.5 h-3.5 text-red-400 stroke-[2.75]" />
            </div>
            <span className="text-[9.5px] sm:text-[10px] font-display font-bold tracking-wide whitespace-nowrap">
              {isNewsPaused
                ? 'NO TRADE'
                : activeTradeLocked && navSureMarketState === 'SURE_BUY'
                ? 'SURE BUY'
                : activeTradeLocked && navSureMarketState === 'SURE_SELL'
                ? 'SURE SELL'
                : 'Sure'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SIGNALS')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'SIGNALS'
                ? 'text-[#F5D061]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-[18px] h-[18px]" />
            <span className="text-[10px] sm:text-[11px] font-display font-semibold tracking-wide whitespace-nowrap">
              Signal{reports.length > 0 ? ` (${reports.length})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PROFILE')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              activeTab === 'PROFILE'
                ? 'text-[#F5D061]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User className="w-[18px] h-[18px]" />
            <span className="text-[10px] sm:text-[11px] font-display font-semibold tracking-wide whitespace-nowrap">
              Profile
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
