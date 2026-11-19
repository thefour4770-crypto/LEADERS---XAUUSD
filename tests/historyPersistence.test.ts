import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisReport, SureSignalEntry } from '../src/types/market.ts';
import {
  computeClientSureStats,
  isValidFirestoreId,
  mergeAnalysisReports,
  mergeSureSignalHistories,
} from '../src/utils/historyMerge.ts';

function makeSure(overrides: Partial<SureSignalEntry> = {}): SureSignalEntry {
  return {
    id: 'sig-1',
    createdAt: '2026-11-19T05:00:00.000Z',
    direction: 'BUY',
    spotPrice: 2650.5,
    confidencePct: 92,
    combinedScore: 0.78,
    setupScore: 92,
    scoreCategory: 'STRONG SIGNAL',
    adxValue: 28.4,
    timeframes: ['1m', '5m', '15m', '1H'],
    tradeLevels: {
      referencePrice: 2650.5,
      atrValue: 2.5,
      referenceTimeframe: '15m',
      stopLoss: 2645.5,
      takeProfit1: 2660.5,
      takeProfit2: 2665.5,
      riskPoints: 5,
      rewardRiskRatio1: '1 : 2.00',
      rewardRiskRatio2: '1 : 3.00',
      methodology: 'Swing structure',
    },
    riskRewardRatio: '1 : 2.00',
    summary: 'Aligned bullish setup',
    checks: [],
    status: 'ACTIVE',
    ...overrides,
  };
}

function makeReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    id: 'rep-1',
    createdAt: '2026-11-19T05:00:00.000Z',
    marketDataTimestamp: 1795064400000,
    freshness: 'LIVE',
    spotPrice: 2650.5,
    spotBid: 2650.2,
    spotAsk: 2650.8,
    spotSource: 'Spot Feed',
    candleSource: 'OHLCV Feed',
    classification: 'BUY',
    combinedScore: 0.65,
    selectedTimeframes: ['15m'],
    selectedIndicators: [{ id: 'ema', name: 'EMA', category: 'TREND', params: { period: 20 } }],
    timeframeAnalyses: [],
    combinedMethodology: 'Trend aligned',
    reasons: ['Bullish momentum'],
    agreements: ['EMA + Supertrend BUY'],
    conflicts: [],
    supportLevels: [2645],
    resistanceLevels: [2662],
    shortVsLongComparison: 'Aligned',
    uncertaintyExplanation: 'Low uncertainty',
    ...overrides,
  };
}

test('isValidFirestoreId enforces strict path safety', () => {
  assert.equal(isValidFirestoreId('a1b2c3_d4-e5'), true);
  assert.equal(isValidFirestoreId('../bad/path'), false);
  assert.equal(isValidFirestoreId(''), false);
  assert.equal(isValidFirestoreId('x'.repeat(129)), false);
});

test('mergeSureSignalHistories preserves completed Firestore history when server cache resets and prefers closed outcome over ACTIVE', () => {
  const firestoreOld = makeSure({
    id: 'sig-old',
    createdAt: '2026-11-18T10:00:00.000Z',
    status: 'TP_HIT',
    closedAt: '2026-11-18T10:45:00.000Z',
    closePrice: 2660.5,
    pnlPoints: 10,
    durationMs: 2_700_000,
  });
  const firestoreStaleActive = makeSure({
    id: 'sig-live',
    createdAt: '2026-11-19T06:00:00.000Z',
    status: 'ACTIVE',
  });
  const serverClosed = makeSure({
    id: 'sig-live',
    createdAt: '2026-11-19T06:00:00.000Z',
    status: 'SL_HIT',
    closedAt: '2026-11-19T06:20:00.000Z',
    closePrice: 2645.5,
    pnlPoints: -5,
    durationMs: 1_200_000,
  });

  const merged = mergeSureSignalHistories([serverClosed], [firestoreOld, firestoreStaleActive]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'sig-live');
  assert.equal(merged[0].status, 'SL_HIT');
  assert.equal(merged[1].id, 'sig-old');
  assert.equal(merged[1].status, 'TP_HIT');

  const stats = computeClientSureStats(merged);
  assert.equal(stats.totalSignals, 2);
  assert.equal(stats.tpHits, 1);
  assert.equal(stats.slHits, 1);
  assert.equal(stats.winRatePct, 50);
  assert.equal(stats.avgRiskReward, 2);
});

test('mergeAnalysisReports merges Firestore + server reports deduplicated newest-first', () => {
  const fsOld = makeReport({ id: 'rep-old', createdAt: '2026-11-18T08:00:00.000Z' });
  const fsDup = makeReport({ id: 'rep-new', createdAt: '2026-11-19T08:00:00.000Z' });
  const srvNew = makeReport({ id: 'rep-new', createdAt: '2026-11-19T08:00:00.000Z' });

  const merged = mergeAnalysisReports([srvNew], [fsOld, fsDup]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'rep-new');
  assert.equal(merged[1].id, 'rep-old');
});

test('SURE 1-active-signal lock rejects second ACTIVE signal until SL or TP closes first signal', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const {
    listSureSignals,
    saveSureSignal,
    setSureSignalsStoreFile,
    updateSureSignal,
  } = await import('../server/sureSignalsStore.ts');
  const { restoreActiveSureSignal } = await import('../server/sureScanner.ts');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaders-sure-lock-'));
  setSureSignalsStoreFile(path.join(tmpDir, 'sure-signals.json'));

  try {
    const first = makeSure({ id: 'lock-sig-1', status: 'ACTIVE' });
    const second = makeSure({ id: 'lock-sig-2', status: 'ACTIVE' });

    const r1 = await saveSureSignal(first);
    assert.equal(r1.saved, true);

    // Attempting a second ACTIVE signal while first is open must be blocked
    const r2 = await saveSureSignal(second);
    assert.equal(r2.saved, false);
    assert.equal(r2.entry.id, 'lock-sig-1');

    // Invalid SL/TP restore payload must be rejected
    await assert.rejects(() =>
      restoreActiveSureSignal({
        ...second,
        tradeLevels: { ...second.tradeLevels, stopLoss: 2700 },
      })
    );

    // While first signal is ACTIVE, closing it to TP_HIT unlocks saving the next signal
    const closed = await updateSureSignal('lock-sig-1', {
      status: 'TP_HIT',
      closedAt: '2026-11-19T05:30:00.000Z',
      closePrice: 2660.5,
      pnlPoints: 10,
      durationMs: 1_800_000,
    });
    assert.equal(closed?.status, 'TP_HIT');

    const r3 = await saveSureSignal(second);
    assert.equal(r3.saved, true);
    const all = await listSureSignals();
    assert.equal(all.length, 2);
  } finally {
    setSureSignalsStoreFile(null);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('mergeSureSignalHistories deduplicates identical creation signatures and prefers finalized TP_HIT/SL_HIT', () => {
  const activeDup = makeSure({
    id: 'sig-dup-1',
    createdAt: '2026-11-19T07:00:00.000Z',
    direction: 'BUY',
    spotPrice: 2655,
    status: 'ACTIVE',
  });
  const finalizedDup = makeSure({
    id: 'sig-dup-2',
    createdAt: '2026-11-19T07:00:00.000Z',
    direction: 'BUY',
    spotPrice: 2655,
    status: 'TP_HIT',
    closedAt: '2026-11-19T07:15:00.000Z',
    closePrice: 2665,
    pnlPoints: 10,
    durationMs: 900_000,
  });

  const merged = mergeSureSignalHistories([finalizedDup], [activeDup]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'TP_HIT');
});

test('restoreActiveSureSignal finalizes orphaned stale ACTIVE signal when a newer ACTIVE signal owns lock', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const {
    listSureSignals,
    saveSureSignal,
    setSureSignalsStoreFile,
  } = await import('../server/sureSignalsStore.ts');
  const { restoreActiveSureSignal } = await import('../server/sureScanner.ts');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaders-sure-orphan-'));
  setSureSignalsStoreFile(path.join(tmpDir, 'sure-signals.json'));

  try {
    const currentServerActive = makeSure({
      id: 'srv-active-2',
      createdAt: '2026-11-19T08:00:00.000Z',
      status: 'ACTIVE',
    });
    const orphanedFirestoreActive = makeSure({
      id: 'fs-orphan-1',
      createdAt: '2026-11-19T06:00:00.000Z',
      status: 'ACTIVE',
    });

    await saveSureSignal(currentServerActive);
    const status = await restoreActiveSureSignal(orphanedFirestoreActive);

    const all = await listSureSignals();
    assert.equal(all.length, 2);
    const activeItems = all.filter((s) => s.status === 'ACTIVE');
    assert.equal(activeItems.length, 1);
    assert.equal(activeItems[0].id, 'srv-active-2');

    const settledOrphan = all.find((s) => s.id === 'fs-orphan-1');
    assert.ok(settledOrphan);
    assert.notEqual(settledOrphan.status, 'ACTIVE');
    assert.ok(settledOrphan.closedAt);
    assert.equal(status.activeSignal?.id, 'srv-active-2');
  } finally {
    setSureSignalsStoreFile(null);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
