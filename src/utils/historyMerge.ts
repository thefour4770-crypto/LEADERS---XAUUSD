import type {
  AnalysisReport,
  SureHistoryStats,
  SureSignalEntry,
} from '../types/market.ts';

const VALID_DOC_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidFirestoreId(id: string | undefined | null): id is string {
  return typeof id === 'string' && VALID_DOC_ID_RE.test(id);
}

function preferSureEntry(a: SureSignalEntry, b: SureSignalEntry): SureSignalEntry {
  const aClosed = a.status !== 'ACTIVE';
  const bClosed = b.status !== 'ACTIVE';
  if (aClosed && !bClosed) return a;
  if (bClosed && !aClosed) return b;
  if (aClosed && bClosed) {
    if (a.closedAt && !b.closedAt) return a;
    if (b.closedAt && !a.closedAt) return b;
    return a;
  }
  const aCheck = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
  const bCheck = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
  return aCheck >= bCheck ? a : b;
}

export function mergeSureSignalHistories(
  serverHistory: SureSignalEntry[],
  firestoreHistory: SureSignalEntry[]
): SureSignalEntry[] {
  const byId = new Map<string, SureSignalEntry>();
  for (const item of firestoreHistory) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? preferSureEntry(item, prev) : item);
  }
  for (const item of serverHistory) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? preferSureEntry(item, prev) : item);
  }

  // Also guard against duplicate records created with identical timestamp, direction & entry price
  const bySignature = new Map<string, SureSignalEntry>();
  for (const item of byId.values()) {
    const sig = `${item.createdAt}|${item.direction}|${item.tradeLevels?.referencePrice ?? item.spotPrice}`;
    const prev = bySignature.get(sig);
    bySignature.set(sig, prev ? preferSureEntry(item, prev) : item);
  }

  return Array.from(bySignature.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function mergeAnalysisReports(
  serverReports: AnalysisReport[],
  firestoreReports: AnalysisReport[]
): AnalysisReport[] {
  const byId = new Map<string, AnalysisReport>();
  for (const r of firestoreReports) {
    if (r?.id) byId.set(r.id, r);
  }
  for (const r of serverReports) {
    if (r?.id) byId.set(r.id, r);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function parseRiskRewardRatio(rr: string | undefined): number | null {
  if (!rr) return null;
  const parts = rr.split(':');
  const val = Number((parts[parts.length - 1] ?? '').trim());
  return Number.isFinite(val) && val > 0 ? val : null;
}

export function computeClientSureStats(history: SureSignalEntry[]): SureHistoryStats {
  const tpHits = history.filter((h) => h.status === 'TP_HIT').length;
  const slHits = history.filter((h) => h.status === 'SL_HIT').length;
  const ambiguousOutcomes = history.filter((h) => h.status === 'AMBIGUOUS').length;
  const activeSignals = history.filter((h) => h.status === 'ACTIVE').length;
  const completed = history.filter((h) => h.status !== 'ACTIVE');

  const resolvedWinsLosses = tpHits + slHits;
  const winRatePct =
    resolvedWinsLosses > 0 ? Number(((tpHits / resolvedWinsLosses) * 100).toFixed(1)) : null;

  const rrValues = completed
    .map((c) => parseRiskRewardRatio(c.riskRewardRatio ?? c.tradeLevels?.rewardRiskRatio1))
    .filter((v): v is number => v !== null);
  const avgRiskReward =
    rrValues.length > 0
      ? Number((rrValues.reduce((s, v) => s + v, 0) / rrValues.length).toFixed(2))
      : null;

  const durations = completed
    .map((c) => {
      if (typeof c.durationMs === 'number' && Number.isFinite(c.durationMs) && c.durationMs >= 0) {
        return c.durationMs;
      }
      if (c.closedAt) {
        const diff = new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime();
        return Number.isFinite(diff) && diff >= 0 ? diff : null;
      }
      return null;
    })
    .filter((v): v is number => v !== null);

  const avgDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
      : null;

  return {
    totalSignals: completed.length,
    tpHits,
    slHits,
    ambiguousOutcomes,
    activeSignals,
    winRatePct,
    avgRiskReward,
    avgDurationMs,
  };
}
