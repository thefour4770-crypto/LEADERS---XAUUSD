import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type { AnalysisReport, SureSignalEntry } from '../types/market.ts';
import {
  computeClientSureStats,
  isValidFirestoreId,
  mergeAnalysisReports,
  mergeSureSignalHistories,
} from './historyMerge.ts';

export {
  computeClientSureStats,
  isValidFirestoreId,
  mergeAnalysisReports,
  mergeSureSignalHistories,
};

const ensuredUsersInSession = new Map<string, Promise<void>>();
const lastActiveTickSyncAt = new Map<string, number>();
const signalOperationQueues = new Map<string, Promise<void>>();

function runSerializedSignalOp(
  uid: string,
  signalId: string,
  task: () => Promise<void>
): Promise<void> {
  const key = `${uid}:${signalId}`;
  const prev = signalOperationQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  const tracked = next.finally(() => {
    if (signalOperationQueues.get(key) === tracked) {
      signalOperationQueues.delete(key);
    }
  });
  signalOperationQueues.set(key, tracked);
  return tracked;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' ? val : fallback;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, n));
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export async function ensureUserAccountDoc(uid: string): Promise<void> {
  if (!isValidFirestoreId(uid)) {
    throw new Error('Invalid user UID for Firestore persistence');
  }
  const existingPromise = ensuredUsersInSession.get(uid);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async () => {
    const userPath = `users/${uid}`;
    const userRef = doc(db, 'users', uid);
    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(userRef, {
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      ensuredUsersInSession.delete(uid);
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }
  })();

  ensuredUsersInSession.set(uid, task);
  return task;
}

function sanitizeSureSignalPayload(uid: string, entry: SureSignalEntry) {
  const status =
    entry.status === 'TP_HIT' || entry.status === 'SL_HIT' || entry.status === 'AMBIGUOUS'
      ? entry.status
      : 'ACTIVE';
  const createdAt = clampString(entry.createdAt, 64, new Date().toISOString()) || new Date().toISOString();
  const base: Record<string, unknown> = {
    id: entry.id,
    ownerId: uid,
    createdAt,
    direction: entry.direction === 'SELL' ? 'SELL' : 'BUY',
    spotPrice: typeof entry.spotPrice === 'number' && entry.spotPrice > 0 ? entry.spotPrice : 1,
    confidencePct: clampNum(entry.confidencePct, 0, 100, 0),
    combinedScore: typeof entry.combinedScore === 'number' && Number.isFinite(entry.combinedScore) ? entry.combinedScore : 0,
    setupScore: clampNum(entry.setupScore, 0, 100, Math.round(entry.confidencePct ?? 0)),
    scoreCategory:
      entry.scoreCategory === 'STRONG SIGNAL' ||
      entry.scoreCategory === 'VALID SIGNAL' ||
      entry.scoreCategory === 'WAIT' ||
      entry.scoreCategory === 'NO TRADE'
        ? entry.scoreCategory
        : 'STRONG SIGNAL',
    adxValue: typeof entry.adxValue === 'number' && Number.isFinite(entry.adxValue) ? entry.adxValue : 0,
    timeframes: (Array.isArray(entry.timeframes) && entry.timeframes.length > 0
      ? entry.timeframes
      : ['1m', '5m', '15m', '1H']
    )
      .slice(0, 10)
      .map((tf) => clampString(tf, 10, '15m')),
    tradeLevels: stripUndefinedDeep(entry.tradeLevels),
    riskRewardRatio: clampString(entry.riskRewardRatio || entry.tradeLevels?.rewardRiskRatio1, 32, '1 : 1.50') || '1 : 1.50',
    summary: clampString(entry.summary, 2000, ''),
    checks: stripUndefinedDeep(Array.isArray(entry.checks) ? entry.checks.slice(0, 16) : []),
    status,
  };

  if (status !== 'ACTIVE') {
    base.closedAt = clampString(entry.closedAt, 64, createdAt) || createdAt;
  } else if (entry.closedAt) {
    base.closedAt = clampString(entry.closedAt, 64);
  }
  if (typeof entry.closePrice === 'number' && Number.isFinite(entry.closePrice)) {
    base.closePrice = entry.closePrice;
  }
  if (typeof entry.pnlPoints === 'number' && Number.isFinite(entry.pnlPoints)) {
    base.pnlPoints = entry.pnlPoints;
  }
  if (typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs) && entry.durationMs >= 0) {
    base.durationMs = entry.durationMs;
  }
  if (entry.lastCheckedAt) {
    base.lastCheckedAt = clampString(entry.lastCheckedAt, 64);
  }
  if (typeof entry.lastCheckedPrice === 'number' && Number.isFinite(entry.lastCheckedPrice)) {
    base.lastCheckedPrice = entry.lastCheckedPrice;
  }

  return stripUndefinedDeep(base);
}

function docToSureSignalEntry(data: Record<string, unknown>): SureSignalEntry {
  const cleaned = { ...data };
  delete cleaned.ownerId;
  delete cleaned.createdServerAt;
  delete cleaned.updatedServerAt;
  return cleaned as unknown as SureSignalEntry;
}

export function subscribeSureSignalsFirestore(
  uid: string,
  onData: (signals: SureSignalEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isValidFirestoreId(uid)) {
    return () => {};
  }
  const collectionPath = `users/${uid}/sureSignals`;
  const q = query(collection(db, 'users', uid, 'sureSignals'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => docToSureSignalEntry(d.data()));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
          return;
        }
        throw wrapped;
      }
    }
  );
}

export async function syncSureSignalToFirestore(
  uid: string,
  entry: SureSignalEntry,
  existingFirestoreEntry?: SureSignalEntry | null
): Promise<void> {
  if (!isValidFirestoreId(uid) || !isValidFirestoreId(entry.id)) {
    return;
  }

  // Completed signals already stored in Firestore are strictly immutable.
  if (existingFirestoreEntry && existingFirestoreEntry.status !== 'ACTIVE') {
    return;
  }

  // Skip throttled active heartbeats before queueing if Firestore already holds ACTIVE
  if (entry.status === 'ACTIVE' && existingFirestoreEntry?.status === 'ACTIVE') {
    const lastSync = lastActiveTickSyncAt.get(entry.id) ?? 0;
    if (Date.now() - lastSync < 60_000) {
      return;
    }
  }

  return runSerializedSignalOp(uid, entry.id, async () => {
    const docPath = `users/${uid}/sureSignals/${entry.id}`;
    await ensureUserAccountDoc(uid);

    const docRef = doc(db, 'users', uid, 'sureSignals', entry.id);

    let currentSnap;
    try {
      currentSnap = await getDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, docPath);
    }

    if (!currentSnap.exists()) {
      const payload = sanitizeSureSignalPayload(uid, entry);
      try {
        await setDoc(docRef, {
          ...payload,
          createdServerAt: serverTimestamp(),
          updatedServerAt: serverTimestamp(),
        });
        if (entry.status === 'ACTIVE') {
          lastActiveTickSyncAt.set(entry.id, Date.now());
        } else {
          lastActiveTickSyncAt.delete(entry.id);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
      return;
    }

    const existingData = docToSureSignalEntry(currentSnap.data());
    if (existingData.status !== 'ACTIVE') {
      lastActiveTickSyncAt.delete(entry.id);
      return;
    }

    // Existing document is ACTIVE
    if (entry.status !== 'ACTIVE') {
      const closePayload: Record<string, unknown> = {
        status: entry.status,
        closedAt: clampString(entry.closedAt, 64, new Date().toISOString()) || new Date().toISOString(),
        updatedServerAt: serverTimestamp(),
      };
      if (typeof entry.closePrice === 'number' && Number.isFinite(entry.closePrice)) {
        closePayload.closePrice = entry.closePrice;
      }
      if (typeof entry.pnlPoints === 'number' && Number.isFinite(entry.pnlPoints)) {
        closePayload.pnlPoints = entry.pnlPoints;
      }
      if (typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs) && entry.durationMs >= 0) {
        closePayload.durationMs = entry.durationMs;
      }
      if (entry.lastCheckedAt) {
        closePayload.lastCheckedAt = clampString(entry.lastCheckedAt, 64);
      }
      if (typeof entry.lastCheckedPrice === 'number' && Number.isFinite(entry.lastCheckedPrice)) {
        closePayload.lastCheckedPrice = entry.lastCheckedPrice;
      }

      try {
        await updateDoc(docRef, closePayload);
        lastActiveTickSyncAt.delete(entry.id);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
      return;
    }

    // Throttle minor active-monitoring heartbeat updates (at most once per 60 seconds)
    const lastSync = lastActiveTickSyncAt.get(entry.id) ?? 0;
    if (Date.now() - lastSync < 60_000) {
      return;
    }

    if (entry.lastCheckedAt || typeof entry.lastCheckedPrice === 'number') {
      const tickPayload: Record<string, unknown> = {
        updatedServerAt: serverTimestamp(),
      };
      if (entry.lastCheckedAt) {
        tickPayload.lastCheckedAt = clampString(entry.lastCheckedAt, 64);
      }
      if (typeof entry.lastCheckedPrice === 'number' && Number.isFinite(entry.lastCheckedPrice)) {
        tickPayload.lastCheckedPrice = entry.lastCheckedPrice;
      }
      try {
        await updateDoc(docRef, tickPayload);
        lastActiveTickSyncAt.set(entry.id, Date.now());
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    }
  });
}

export async function deleteSureSignalFromFirestore(uid: string, signalId: string): Promise<void> {
  if (!isValidFirestoreId(uid) || !isValidFirestoreId(signalId)) {
    return;
  }
  return runSerializedSignalOp(uid, signalId, async () => {
    const docPath = `users/${uid}/sureSignals/${signalId}`;
    try {
      const docRef = doc(db, 'users', uid, 'sureSignals', signalId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return;
      if (snap.data()?.status !== 'ACTIVE') return;
      await deleteDoc(docRef);
      lastActiveTickSyncAt.delete(signalId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  });
}

function sanitizeAnalysisReportPayload(uid: string, report: AnalysisReport) {
  const createdAt = clampString(report.createdAt, 64, new Date().toISOString()) || new Date().toISOString();
  const base: Record<string, unknown> = {
    id: report.id,
    ownerId: uid,
    createdAt,
    marketDataTimestamp:
      typeof report.marketDataTimestamp === 'number' && report.marketDataTimestamp > 0
        ? report.marketDataTimestamp
        : Date.now(),
    freshness: report.freshness === 'LIVE' ? 'LIVE' : 'DELAYED',
    spotPrice: typeof report.spotPrice === 'number' && report.spotPrice > 0 ? report.spotPrice : 1,
    spotBid: typeof report.spotBid === 'number' && report.spotBid >= 0 ? report.spotBid : 0,
    spotAsk: typeof report.spotAsk === 'number' && report.spotAsk >= 0 ? report.spotAsk : 0,
    spotSource: clampString(report.spotSource, 200, 'XAU/USD Spot'),
    candleSource: clampString(report.candleSource, 200, 'XAU/USD Candles'),
    classification:
      report.classification === 'BUY' || report.classification === 'SELL' ? report.classification : 'HOLD',
    combinedScore:
      typeof report.combinedScore === 'number' && Number.isFinite(report.combinedScore)
        ? report.combinedScore
        : 0,
    selectedTimeframes: (Array.isArray(report.selectedTimeframes) && report.selectedTimeframes.length > 0
      ? report.selectedTimeframes
      : ['15m']
    )
      .slice(0, 10)
      .map((tf) => clampString(tf, 10, '15m')),
    selectedIndicators: stripUndefinedDeep(
      Array.isArray(report.selectedIndicators) && report.selectedIndicators.length > 0
        ? report.selectedIndicators.slice(0, 50)
        : [{ id: 'ema', name: 'EMA', category: 'TREND', params: { period: 20 } }]
    ),
    timeframeAnalyses: stripUndefinedDeep(
      Array.isArray(report.timeframeAnalyses) ? report.timeframeAnalyses.slice(0, 10) : []
    ),
    combinedMethodology: clampString(report.combinedMethodology, 4000, ''),
    reasons: (Array.isArray(report.reasons) ? report.reasons : [])
      .slice(0, 30)
      .map((r) => clampString(r, 1000, '')),
    agreements: (Array.isArray(report.agreements) ? report.agreements : [])
      .slice(0, 30)
      .map((a) => clampString(a, 1000, '')),
    conflicts: (Array.isArray(report.conflicts) ? report.conflicts : [])
      .slice(0, 30)
      .map((c) => clampString(c, 1000, '')),
    supportLevels: (Array.isArray(report.supportLevels) ? report.supportLevels : [])
      .filter((n) => typeof n === 'number' && Number.isFinite(n))
      .slice(0, 20),
    resistanceLevels: (Array.isArray(report.resistanceLevels) ? report.resistanceLevels : [])
      .filter((n) => typeof n === 'number' && Number.isFinite(n))
      .slice(0, 20),
    shortVsLongComparison: clampString(report.shortVsLongComparison, 4000, ''),
    uncertaintyExplanation: clampString(report.uncertaintyExplanation, 4000, ''),
  };

  if (report.signalConfidence) {
    base.signalConfidence = stripUndefinedDeep(report.signalConfidence);
  }
  if (report.tradeLevels) {
    base.tradeLevels = stripUndefinedDeep(report.tradeLevels);
  }
  if (Array.isArray(report.signalQualityChecks)) {
    base.signalQualityChecks = stripUndefinedDeep(report.signalQualityChecks.slice(0, 30));
  }
  if (report.strategyEvaluation) {
    base.strategyEvaluation = stripUndefinedDeep(report.strategyEvaluation);
  }
  if (report.newsProtection) {
    base.newsProtection = stripUndefinedDeep(report.newsProtection);
  }

  return stripUndefinedDeep(base);
}

function docToAnalysisReport(data: Record<string, unknown>): AnalysisReport {
  const cleaned = { ...data };
  delete cleaned.ownerId;
  delete cleaned.createdServerAt;
  return cleaned as unknown as AnalysisReport;
}

export function subscribeAnalysisReportsFirestore(
  uid: string,
  onData: (reports: AnalysisReport[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isValidFirestoreId(uid)) {
    return () => {};
  }
  const collectionPath = `users/${uid}/analysisReports`;
  const q = query(collection(db, 'users', uid, 'analysisReports'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => docToAnalysisReport(d.data()));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
          return;
        }
        throw wrapped;
      }
    }
  );
}

export async function saveAnalysisReportToFirestore(
  uid: string,
  report: AnalysisReport
): Promise<void> {
  if (!isValidFirestoreId(uid) || !isValidFirestoreId(report.id)) {
    return;
  }
  if (!Array.isArray(report.timeframeAnalyses) || report.timeframeAnalyses.length === 0) {
    return;
  }

  const docPath = `users/${uid}/analysisReports/${report.id}`;
  await ensureUserAccountDoc(uid);

  const docRef = doc(db, 'users', uid, 'analysisReports', report.id);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return;
    }
    const payload = sanitizeAnalysisReportPayload(uid, report);
    await setDoc(docRef, {
      ...payload,
      createdServerAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deleteAnalysisReportFromFirestore(
  uid: string,
  reportId: string
): Promise<void> {
  if (!isValidFirestoreId(uid) || !isValidFirestoreId(reportId)) {
    return;
  }
  const docPath = `users/${uid}/analysisReports/${reportId}`;
  try {
    const docRef = doc(db, 'users', uid, 'analysisReports', reportId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
