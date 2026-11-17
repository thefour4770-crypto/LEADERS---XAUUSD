import crypto from 'node:crypto';
import { INDICATOR_CATALOG } from '../src/constants/indicators.ts';
import type {
  AnalysisReport,
  CandleDataset,
  SelectedIndicatorConfig,
  SignalClassification,
  SignalGateCheck,
  Timeframe,
  TimeframeAnalysis,
  TradeLevelsAnalysis,
} from '../src/types/market.ts';
import { calculateIndicator, computeSupportResistance, getLatestAdx, getLatestAtr } from './indicators.ts';
import { fetchCandles, fetchLiveXauUsdQuote } from './marketData.ts';
import { saveReport } from './reportsStore.ts';

const TIMEFRAME_WEIGHTS: Record<Timeframe, number> = {
  '1m': 0.7,
  '5m': 0.85,
  '15m': 1.0,
  '30m': 1.2,
  '1H': 1.4,
  '4H': 1.7,
  '1D': 2.0,
  '1W': 2.2,
};

const TIMEFRAME_ORDER: Record<Timeframe, number> = {
  '1m': 1,
  '5m': 2,
  '15m': 3,
  '30m': 4,
  '1H': 5,
  '4H': 6,
  '1D': 7,
  '1W': 8,
};

export class DataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataUnavailableError';
  }
}

function analyzeSingleTimeframe(
  dataset: CandleDataset,
  enabledIndicators: SelectedIndicatorConfig[]
): TimeframeAnalysis {
  const results = enabledIndicators.map((cfg) => calculateIndicator(dataset.candles, cfg));
  const { supportLevels, resistanceLevels } = computeSupportResistance(dataset.candles);

  const trendResults = results.filter((r) => r.category === 'TREND');
  const momentumResults = results.filter((r) => r.category === 'MOMENTUM');
  const volatilityResults = results.filter((r) => r.category === 'VOLATILITY');
  const volumeResults = results.filter((r) => r.category === 'VOLUME');

  const avgScore = (items: typeof results) =>
    items.length === 0 ? 0 : items.reduce((sum, r) => sum + r.score, 0) / items.length;

  const trendScore = avgScore(trendResults);
  const momentumScore = avgScore(momentumResults);
  const directionalPool = results.filter((r) => r.id !== 'atr' && r.id !== 'bollinger_width');
  const combinedScore =
    directionalPool.length > 0
      ? directionalPool.reduce((sum, r) => sum + r.score, 0) / directionalPool.length
      : 0;

  const buyVotes = directionalPool.filter((r) => r.bias === 'BUY');
  const sellVotes = directionalPool.filter((r) => r.bias === 'SELL');
  const holdVotes = directionalPool.filter((r) => r.bias === 'HOLD');

  const adxState = getLatestAdx(dataset.candles, 14);
  const adxVal = adxState.adx;

  let classification: SignalClassification = 'HOLD';
  const totalDir = buyVotes.length + sellVotes.length;
  const majorityRatio = totalDir > 0 ? Math.max(buyVotes.length, sellVotes.length) / directionalPool.length : 0;
  const trendMomentumAligned =
    trendResults.length === 0 ||
    momentumResults.length === 0 ||
    !(trendScore > 0.2 && momentumScore < -0.15) &&
      !(trendScore < -0.2 && momentumScore > 0.15);
  const adxStrongEnough = adxVal == null || adxVal >= 18 || Math.abs(combinedScore) >= 0.65;

  if (
    combinedScore >= 0.38 &&
    buyVotes.length >= Math.max(1, sellVotes.length * 2) &&
    majorityRatio >= 0.55 &&
    trendMomentumAligned &&
    adxStrongEnough
  ) {
    classification = 'BUY';
  } else if (
    combinedScore <= -0.38 &&
    sellVotes.length >= Math.max(1, buyVotes.length * 2) &&
    majorityRatio >= 0.55 &&
    trendMomentumAligned &&
    adxStrongEnough
  ) {
    classification = 'SELL';
  }

  const agreements: string[] = [];
  const conflicts: string[] = [];

  if (buyVotes.length > 0 && sellVotes.length === 0) {
    agreements.push(`All ${buyVotes.length} active directional indicators align upward (${buyVotes.map((r) => r.name).slice(0, 4).join(', ')}).`);
  } else if (sellVotes.length > 0 && buyVotes.length === 0) {
    agreements.push(`All ${sellVotes.length} active directional indicators align downward (${sellVotes.map((r) => r.name).slice(0, 4).join(', ')}).`);
  } else if (buyVotes.length > 0 && sellVotes.length > 0) {
    conflicts.push(
      `Split readings: ${buyVotes.length} bullish (${buyVotes.map((r) => r.name).slice(0, 3).join(', ')}) vs ${sellVotes.length} bearish (${sellVotes.map((r) => r.name).slice(0, 3).join(', ')}).`
    );
  }

  if (holdVotes.length > 0) {
    agreements.push(`${holdVotes.length} indicator(s) currently register neutral/non-directional readings.`);
  }

  if (trendScore > 0.2 && momentumScore < -0.15) {
    conflicts.push('Trend indicators point upward while Momentum oscillators warn of cooling or pullback pressure.');
  } else if (trendScore < -0.2 && momentumScore > 0.15) {
    conflicts.push('Trend indicators point downward while Momentum oscillators show counter-trend bounce.');
  }

  if (adxVal != null && adxVal < 18) {
    conflicts.push(`ADX(14) at ${adxVal.toFixed(1)} (< 18) flags low-conviction / choppy range conditions.`);
  }

  const atrRes = volatilityResults.find((r) => r.id === 'atr');
  const bbWidthRes = volatilityResults.find((r) => r.id === 'bollinger_width');
  const volatilityState = atrRes
    ? `${atrRes.primaryValue} (${atrRes.secondaryValues?.State ?? 'Active'})`
    : bbWidthRes
    ? `BB Width ${bbWidthRes.primaryValue}`
    : volatilityResults[0]?.primaryValue ?? 'Not selected';

  const volRes = volumeResults[0];
  const volumeState = volRes
    ? `${volRes.primaryValue}${volRes.volumeType === 'TICK_PROXY' ? ' [Tick Proxy]' : ''}`
    : dataset.hasExchangeVolume
    ? 'Exchange volume available (not selected)'
    : 'Centralized volume unavailable';

  const latestClose = dataset.candles[dataset.candles.length - 1].close;
  const freshness = dataset.freshness === 'UNAVAILABLE' ? 'DELAYED' : dataset.freshness;

  const summary =
    classification === 'BUY'
      ? `${dataset.timeframe} confirms strong upward alignment (score ${combinedScore.toFixed(2)}, ${buyVotes.length} BUY vs ${sellVotes.length} SELL).`
      : classification === 'SELL'
      ? `${dataset.timeframe} confirms strong downward alignment (score ${combinedScore.toFixed(2)}, ${sellVotes.length} SELL vs ${buyVotes.length} BUY).`
      : `${dataset.timeframe} filtered to HOLD (score ${combinedScore.toFixed(2)}) — ${
          !adxStrongEnough
            ? `low ADX trend strength (${adxVal?.toFixed(1)})`
            : !trendMomentumAligned
            ? 'Trend vs Momentum conflict'
            : 'insufficient directional dominance'
        }.`;

  return {
    timeframe: dataset.timeframe,
    classification,
    candleCount: dataset.candles.length,
    latestClose,
    latestTimestamp: dataset.latestTimestamp,
    freshness,
    candleSource: dataset.candleSource,
    volumeNote: dataset.volumeNote,
    combinedScore: Number(combinedScore.toFixed(3)),
    trendScore: Number(trendScore.toFixed(3)),
    momentumScore: Number(momentumScore.toFixed(3)),
    volatilityState,
    volumeState,
    supportLevels,
    resistanceLevels,
    indicatorResults: results,
    agreements,
    conflicts,
    summary,
  };
}

export async function runFullAnalysis(
  rawTimeframes: Timeframe[],
  rawIndicators: SelectedIndicatorConfig[]
): Promise<AnalysisReport> {
  const uniqueTimeframes = Array.from(new Set(rawTimeframes)).sort(
    (a, b) => TIMEFRAME_ORDER[a] - TIMEFRAME_ORDER[b]
  );

  if (uniqueTimeframes.length === 0) {
    throw new Error('At least one timeframe must be selected for analysis.');
  }

  const enabledIndicators = rawIndicators.filter((i) => i.enabled);
  if (enabledIndicators.length === 0) {
    throw new Error('At least one technical indicator must be enabled for analysis.');
  }

  const [quote, datasets] = await Promise.all([
    fetchLiveXauUsdQuote(),
    Promise.all(
      uniqueTimeframes.map(async (tf) => {
        try {
          return await fetchCandles(tf);
        } catch (err) {
          throw new DataUnavailableError(
            `Unable to fetch real XAUUSD candle history for ${tf}: ${err instanceof Error ? err.message : 'Network failure'}`
          );
        }
      })
    ),
  ]);

  if (datasets.some((d) => d.freshness === 'UNAVAILABLE' || d.candles.length < 20)) {
    throw new DataUnavailableError('Market candle feed returned stale or unavailable data. Analysis aborted.');
  }

  const timeframeAnalyses = datasets.map((ds) => analyzeSingleTimeframe(ds, enabledIndicators));

  // Weighted multi-timeframe combination & anti-fake-signal gates
  let weightedSum = 0;
  let weightTotal = 0;
  let weightedTrend = 0;
  let weightedMomentum = 0;
  let adxWeightedSum = 0;
  let adxWeightTotal = 0;

  for (let i = 0; i < timeframeAnalyses.length; i++) {
    const tfAnalysis = timeframeAnalyses[i];
    const w = TIMEFRAME_WEIGHTS[tfAnalysis.timeframe] ?? 1;
    weightedSum += tfAnalysis.combinedScore * w;
    weightedTrend += tfAnalysis.trendScore * w;
    weightedMomentum += tfAnalysis.momentumScore * w;
    weightTotal += w;

    const adxReading = getLatestAdx(datasets[i].candles, 14).adx;
    if (adxReading != null) {
      adxWeightedSum += adxReading * w;
      adxWeightTotal += w;
    }
  }
  const combinedScore = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const avgTrendScore = weightTotal > 0 ? weightedTrend / weightTotal : 0;
  const avgMomentumScore = weightTotal > 0 ? weightedMomentum / weightTotal : 0;
  const avgAdx = adxWeightTotal > 0 ? adxWeightedSum / adxWeightTotal : null;

  const tfBuyCount = timeframeAnalyses.filter((t) => t.classification === 'BUY').length;
  const tfSellCount = timeframeAnalyses.filter((t) => t.classification === 'SELL').length;
  const tfHoldCount = timeframeAnalyses.filter((t) => t.classification === 'HOLD').length;

  const shortTfs = timeframeAnalyses.filter((t) => ['1m', '5m', '15m', '30m'].includes(t.timeframe));
  const longTfs = timeframeAnalyses.filter((t) => ['1H', '4H', '1D', '1W'].includes(t.timeframe));
  const shortAvg = shortTfs.length > 0 ? shortTfs.reduce((s, t) => s + t.combinedScore, 0) / shortTfs.length : 0;
  const longAvg = longTfs.length > 0 ? longTfs.reduce((s, t) => s + t.combinedScore, 0) / longTfs.length : 0;

  // Anti-fake-signal quality gates
  const scoreConvictionPass = Math.abs(combinedScore) >= 0.40;
  const noTfConflictPass = !(tfBuyCount > 0 && tfSellCount > 0);
  const horizonAlignedPass =
    shortTfs.length === 0 ||
    longTfs.length === 0 ||
    !((shortAvg >= 0.2 && longAvg <= -0.2) || (shortAvg <= -0.2 && longAvg >= 0.2));
  const trendMomentumPass =
    !((avgTrendScore >= 0.2 && avgMomentumScore <= -0.18) || (avgTrendScore <= -0.2 && avgMomentumScore >= 0.18));
  const adxChopPass = avgAdx == null || avgAdx >= 18 || Math.abs(combinedScore) >= 0.68;

  const signalQualityChecks: SignalGateCheck[] = [
    {
      label: 'Weighted Score Conviction (>= 0.40)',
      passed: scoreConvictionPass,
      detail: `Composite score ${combinedScore >= 0 ? '+' : ''}${combinedScore.toFixed(3)} ${scoreConvictionPass ? 'clears' : 'falls below'} the ±0.400 threshold.`,
    },
    {
      label: 'Zero Timeframe Conflict',
      passed: noTfConflictPass,
      detail: noTfConflictPass
        ? `No opposing BUY vs SELL timeframes (${tfBuyCount} BUY, ${tfSellCount} SELL, ${tfHoldCount} HOLD).`
        : `Blocked: ${tfBuyCount} timeframe(s) signal BUY while ${tfSellCount} signal SELL.`,
    },
    {
      label: 'Short vs Long Horizon Alignment',
      passed: horizonAlignedPass,
      detail:
        shortTfs.length > 0 && longTfs.length > 0
          ? horizonAlignedPass
            ? `Intraday (${shortAvg.toFixed(2)}) and higher-timeframe (${longAvg.toFixed(2)}) horizons do not oppose.`
            : `Blocked: Intraday (${shortAvg.toFixed(2)}) opposes higher-timeframe structure (${longAvg.toFixed(2)}).`
          : 'Single horizon selected; no inter-horizon contradiction.',
    },
    {
      label: 'Trend & Momentum Confluence',
      passed: trendMomentumPass,
      detail: trendMomentumPass
        ? `Trend (${avgTrendScore.toFixed(2)}) and Momentum (${avgMomentumScore.toFixed(2)}) are aligned or neutral.`
        : `Blocked: Trend (${avgTrendScore.toFixed(2)}) diverges from Momentum (${avgMomentumScore.toFixed(2)}).`,
    },
    {
      label: 'ADX(14) Anti-Chop Trend Filter (>= 18)',
      passed: adxChopPass,
      detail:
        avgAdx != null
          ? `Weighted ADX(14) is ${avgAdx.toFixed(1)} (${adxChopPass ? 'trending strength confirmed' : 'below 18 — ranging/choppy price action'}).`
          : 'Insufficient bars for ADX(14) reading.',
    },
  ];

  let classification: SignalClassification = 'HOLD';
  const allGatesPassed =
    scoreConvictionPass && noTfConflictPass && horizonAlignedPass && trendMomentumPass && adxChopPass;

  if (allGatesPassed && combinedScore >= 0.40 && tfBuyCount > 0 && tfSellCount === 0) {
    classification = 'BUY';
  } else if (allGatesPassed && combinedScore <= -0.40 && tfSellCount > 0 && tfBuyCount === 0) {
    classification = 'SELL';
  }

  // Short-term vs Long-term comparison
  let shortVsLongComparison = '';
  if (shortTfs.length > 0 && longTfs.length > 0) {
    const shortBias = shortAvg >= 0.2 ? 'bullish' : shortAvg <= -0.2 ? 'bearish' : 'neutral/mixed';
    const longBias = longAvg >= 0.2 ? 'bullish' : longAvg <= -0.2 ? 'bearish' : 'neutral/mixed';
    shortVsLongComparison =
      shortBias === longBias
        ? `Short-term timeframes (${shortTfs.map((t) => t.timeframe).join(', ')}) and higher-timeframe structure (${longTfs.map((t) => t.timeframe).join(', ')}) are both ${shortBias} (${shortAvg.toFixed(2)} vs ${longAvg.toFixed(2)}).`
        : `Divergence detected: short-term timeframes (${shortTfs.map((t) => t.timeframe).join(', ')}) lean ${shortBias} (${shortAvg.toFixed(2)}), whereas higher timeframes (${longTfs.map((t) => t.timeframe).join(', ')}) lean ${longBias} (${longAvg.toFixed(2)}).`;
  } else if (shortTfs.length > 0) {
    shortVsLongComparison = `Analysis covers intraday short-term horizon (${shortTfs.map((t) => t.timeframe).join(', ')}) only; add 1H–1W timeframes for macro structural confirmation.`;
  } else {
    shortVsLongComparison = `Analysis covers swing/macro timeframes (${longTfs.map((t) => t.timeframe).join(', ')}) only; add 1m–30m timeframes for intraday timing context.`;
  }

  const reasons: string[] = [];
  reasons.push(
    `Combined weighted score across ${uniqueTimeframes.length} timeframe(s) is ${combinedScore >= 0 ? '+' : ''}${combinedScore.toFixed(3)} (strict strong-signal threshold: >= +0.400 BUY, <= -0.400 SELL with all 5 quality gates passed).`
  );
  reasons.push(
    `Timeframe distribution: ${tfBuyCount} BUY, ${tfSellCount} SELL, ${tfHoldCount} HOLD across [${uniqueTimeframes.join(', ')}].`
  );
  const blockedGates = signalQualityChecks.filter((g) => !g.passed);
  if (blockedGates.length > 0) {
    reasons.push(
      `Anti-fake-signal filter enforced HOLD: ${blockedGates.map((g) => g.label).join('; ')}.`
    );
  } else if (classification !== 'HOLD') {
    reasons.push(`All 5 anti-fake-signal conviction gates passed for ${classification}.`);
  }

  for (const tf of timeframeAnalyses) {
    const topDrivers = tf.indicatorResults
      .filter((r) => Math.abs(r.score) >= 0.5)
      .slice(0, 3)
      .map((r) => `${r.name}: ${r.primaryValue} (${r.bias})`);
    if (topDrivers.length > 0) {
      reasons.push(`${tf.timeframe} key drivers — ${topDrivers.join('; ')}.`);
    }
  }

  const agreements: string[] = [];
  const conflicts: string[] = [];

  if (tfBuyCount === timeframeAnalyses.length) {
    agreements.push(`Unanimous upward alignment across all ${timeframeAnalyses.length} selected timeframes.`);
  } else if (tfSellCount === timeframeAnalyses.length) {
    agreements.push(`Unanimous downward alignment across all ${timeframeAnalyses.length} selected timeframes.`);
  } else if (tfBuyCount > 0 && tfSellCount > 0) {
    conflicts.push(
      `Inter-timeframe conflict: ${timeframeAnalyses
        .filter((t) => t.classification === 'BUY')
        .map((t) => t.timeframe)
        .join(', ')} lean BUY while ${timeframeAnalyses
        .filter((t) => t.classification === 'SELL')
        .map((t) => t.timeframe)
        .join(', ')} lean SELL.`
    );
  }

  for (const tf of timeframeAnalyses) {
    for (const c of tf.conflicts) conflicts.push(`[${tf.timeframe}] ${c}`);
    for (const a of tf.agreements) {
      if (agreements.length < 6) agreements.push(`[${tf.timeframe}] ${a}`);
    }
  }

  const primaryTf =
    timeframeAnalyses.find((t) => t.timeframe === '15m') ?? timeframeAnalyses[timeframeAnalyses.length - 1];

  const validSpotPrice = quote.freshness !== 'UNAVAILABLE' && quote.mid > 0 ? quote.mid : primaryTf.latestClose;
  const spotSource =
    quote.freshness !== 'UNAVAILABLE' && quote.mid > 0
      ? quote.source
      : 'COMEX GC=F Latest Close (Live Spot Quote Temporarily Unavailable)';

  const allSupports = Array.from(new Set(timeframeAnalyses.flatMap((t) => t.supportLevels)))
    .filter((s) => s < validSpotPrice * 0.9998)
    .sort((a, b) => b - a)
    .slice(0, 4);
  const allResistances = Array.from(new Set(timeframeAnalyses.flatMap((t) => t.resistanceLevels)))
    .filter((r) => r > validSpotPrice * 1.0002)
    .sort((a, b) => a - b)
    .slice(0, 4);

  const overallFreshness: 'LIVE' | 'DELAYED' =
    quote.freshness === 'LIVE' && timeframeAnalyses.every((t) => t.freshness === 'LIVE') ? 'LIVE' : 'DELAYED';

  const latestMarketTs = Math.max(
    quote.freshness !== 'UNAVAILABLE' ? quote.timestamp : 0,
    ...timeframeAnalyses.map((t) => t.latestTimestamp)
  );

  const combinedMethodology = `Each selected timeframe was evaluated independently across ${enabledIndicators.length} enabled indicator(s) in Trend, Momentum, Volatility, and Volume categories. Timeframe scores were weighted by structural horizon (${uniqueTimeframes
    .map((tf) => `${tf}: ${TIMEFRAME_WEIGHTS[tf]}x`)
    .join(', ')}) and normalized to [-1.00, +1.00].`;

  const uncertaintyExplanation =
    `Market conditions are probabilistic, not guaranteed. ${
      overallFreshness === 'DELAYED'
        ? 'Current feed status is DELAYED (e.g., off-hours or exchange lag), increasing execution gap uncertainty. '
        : ''
    }${
      conflicts.length > 0
        ? `Detected ${conflicts.length} technical conflict(s) between indicators or timeframes, reducing directional conviction. `
        : ''
    }Gold (XAU/USD) reacts rapidly to macro releases, USD yields, and liquidity shifts; classifications (BUY, SELL, HOLD) summarize calculated indicator alignment for educational analysis only.`;

  let tradeLevels: TradeLevelsAnalysis | undefined;
  if (classification === 'BUY' || classification === 'SELL') {
    const primaryDataset =
      datasets.find((d) => d.timeframe === primaryTf.timeframe) ?? datasets[datasets.length - 1];
    const rawAtr = getLatestAtr(primaryDataset.candles, 14);
    const fallbackRange =
      primaryDataset.candles
        .slice(-14)
        .reduce((sum, c) => sum + (c.high - c.low), 0) / Math.min(14, primaryDataset.candles.length);
    const atrValue = Number(Math.max(0.5, rawAtr ?? fallbackRange).toFixed(2));

    let stopLoss: number;
    let slBasis: string;

    if (classification === 'BUY') {
      const candidateSupport = allSupports.find(
        (s) => s < validSpotPrice - atrValue * 0.7 && s >= validSpotPrice - atrValue * 2.8
      );
      if (candidateSupport != null) {
        stopLoss = Number((candidateSupport - atrValue * 0.35).toFixed(2));
        slBasis = `swing support ($${candidateSupport.toFixed(2)}) minus 0.35×ATR buffer`;
      } else {
        stopLoss = Number((validSpotPrice - atrValue * 1.5).toFixed(2));
        slBasis = `1.5×ATR(${primaryDataset.timeframe}) below spot`;
      }

      const risk = Math.max(0.5, Number((validSpotPrice - stopLoss).toFixed(2)));
      const res1 = allResistances.find(
        (r) => r >= validSpotPrice + risk * 1.2 && r <= validSpotPrice + risk * 2.2
      );
      const takeProfit1 = Number((res1 ?? validSpotPrice + risk * 1.5).toFixed(2));
      const res2 = allResistances.find(
        (r) => r > takeProfit1 + risk * 0.4 && r >= validSpotPrice + risk * 2.0
      );
      const takeProfit2 = Number((res2 ?? validSpotPrice + risk * 2.5).toFixed(2));

      const rr1 = ((takeProfit1 - validSpotPrice) / risk).toFixed(2);
      const rr2 = ((takeProfit2 - validSpotPrice) / risk).toFixed(2);

      tradeLevels = {
        referencePrice: Number(validSpotPrice.toFixed(2)),
        atrValue,
        referenceTimeframe: primaryDataset.timeframe,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskPoints: risk,
        rewardRiskRatio1: `1 : ${rr1}`,
        rewardRiskRatio2: `1 : ${rr2}`,
        methodology: `SL anchored to ${slBasis} (ATR = $${atrValue.toFixed(2)}). TP1 (${res1 ? `resistance $${res1.toFixed(2)}` : '1.5R projection'}) and TP2 (${res2 ? `resistance $${res2.toFixed(2)}` : '2.5R projection'}) derived from calculated volatility and structural levels.`,
      };
      reasons.push(
        `SL/TP Reference (${primaryDataset.timeframe} ATR $${atrValue.toFixed(2)}): SL $${stopLoss.toFixed(2)}, TP1 $${takeProfit1.toFixed(2)} (${tradeLevels.rewardRiskRatio1}), TP2 $${takeProfit2.toFixed(2)} (${tradeLevels.rewardRiskRatio2}).`
      );
    } else {
      const candidateResistance = allResistances.find(
        (r) => r > validSpotPrice + atrValue * 0.7 && r <= validSpotPrice + atrValue * 2.8
      );
      if (candidateResistance != null) {
        stopLoss = Number((candidateResistance + atrValue * 0.35).toFixed(2));
        slBasis = `swing resistance ($${candidateResistance.toFixed(2)}) plus 0.35×ATR buffer`;
      } else {
        stopLoss = Number((validSpotPrice + atrValue * 1.5).toFixed(2));
        slBasis = `1.5×ATR(${primaryDataset.timeframe}) above spot`;
      }

      const risk = Math.max(0.5, Number((stopLoss - validSpotPrice).toFixed(2)));
      const sup1 = allSupports.find(
        (s) => s <= validSpotPrice - risk * 1.2 && s >= validSpotPrice - risk * 2.2
      );
      const takeProfit1 = Number((sup1 ?? validSpotPrice - risk * 1.5).toFixed(2));
      const sup2 = allSupports.find(
        (s) => s < takeProfit1 - risk * 0.4 && s <= validSpotPrice - risk * 2.0
      );
      const takeProfit2 = Number((sup2 ?? validSpotPrice - risk * 2.5).toFixed(2));

      const rr1 = ((validSpotPrice - takeProfit1) / risk).toFixed(2);
      const rr2 = ((validSpotPrice - takeProfit2) / risk).toFixed(2);

      tradeLevels = {
        referencePrice: Number(validSpotPrice.toFixed(2)),
        atrValue,
        referenceTimeframe: primaryDataset.timeframe,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskPoints: risk,
        rewardRiskRatio1: `1 : ${rr1}`,
        rewardRiskRatio2: `1 : ${rr2}`,
        methodology: `SL anchored to ${slBasis} (ATR = $${atrValue.toFixed(2)}). TP1 (${sup1 ? `support $${sup1.toFixed(2)}` : '1.5R projection'}) and TP2 (${sup2 ? `support $${sup2.toFixed(2)}` : '2.5R projection'}) derived from calculated volatility and structural levels.`,
      };
      reasons.push(
        `SL/TP Reference (${primaryDataset.timeframe} ATR $${atrValue.toFixed(2)}): SL $${stopLoss.toFixed(2)}, TP1 $${takeProfit1.toFixed(2)} (${tradeLevels.rewardRiskRatio1}), TP2 $${takeProfit2.toFixed(2)} (${tradeLevels.rewardRiskRatio2}).`
      );
    }
  }

  const report: AnalysisReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    marketDataTimestamp: latestMarketTs,
    freshness: overallFreshness,
    spotPrice: validSpotPrice,
    spotBid: quote.bid > 0 ? quote.bid : validSpotPrice,
    spotAsk: quote.ask > 0 ? quote.ask : validSpotPrice,
    spotSource,
    candleSource: primaryTf.candleSource,
    classification,
    combinedScore: Number(combinedScore.toFixed(3)),
    selectedTimeframes: uniqueTimeframes,
    selectedIndicators: enabledIndicators.map((cfg) => {
      const def = INDICATOR_CATALOG.find((d) => d.id === cfg.id)!;
      return {
        id: cfg.id,
        name: def.name,
        category: def.category,
        params: cfg.params,
      };
    }),
    timeframeAnalyses,
    combinedMethodology,
    reasons,
    agreements,
    conflicts,
    supportLevels: allSupports,
    resistanceLevels: allResistances,
    shortVsLongComparison,
    uncertaintyExplanation,
    tradeLevels,
    signalQualityChecks,
  };

  return await saveReport(report);
}
