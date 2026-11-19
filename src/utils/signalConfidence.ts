import type {
  AnalysisReport,
  SignalClassification,
  SignalConfidenceBreakdown,
  SignalGateCheck,
  TimeframeAnalysis,
} from '../types/market.ts';

function clampPct(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function computeTimeframeConfidencePct(
  classification: SignalClassification,
  buyVotes: number,
  sellVotes: number,
  holdVotes: number
): number {
  const total = buyVotes + sellVotes + holdVotes;
  if (total <= 0) return 0;

  if (classification === 'BUY') {
    return clampPct(((buyVotes - sellVotes * 0.5) / total) * 100);
  }
  if (classification === 'SELL') {
    return clampPct(((sellVotes - buyVotes * 0.5) / total) * 100);
  }

  // For HOLD, show net directional spread (capped at 60%) so users see how close or split the timeframe was
  const netSpread = Math.abs(buyVotes - sellVotes) / total;
  return clampPct(netSpread * 100, 0, 60);
}

export function computeSignalConfidence(params: {
  classification: SignalClassification;
  timeframeAnalyses: TimeframeAnalysis[];
  signalQualityChecks?: SignalGateCheck[];
}): SignalConfidenceBreakdown {
  const { classification, timeframeAnalyses, signalQualityChecks = [] } = params;

  let buyVotes = 0;
  let sellVotes = 0;
  let holdVotes = 0;

  const TREND_CLUSTER_IDS = new Set(['ema', 'sma', 'supertrend']);

  for (const tf of timeframeAnalyses) {
    const directional = tf.indicatorResults.filter(
      (r) => r.id !== 'atr' && r.id !== 'bollinger_width'
    );
    const pool = directional.length > 0 ? directional : tf.indicatorResults;

    const clusterItems = pool.filter((r) => TREND_CLUSTER_IDS.has(r.id));
    if (clusterItems.length > 0) {
      const clusterAvg =
        clusterItems.reduce((sum, r) => sum + r.score, 0) / clusterItems.length;
      if (clusterAvg >= 0.35) buyVotes++;
      else if (clusterAvg <= -0.35) sellVotes++;
      else holdVotes++;
    }

    for (const r of pool) {
      if (TREND_CLUSTER_IDS.has(r.id)) continue;
      if (r.bias === 'BUY') buyVotes++;
      else if (r.bias === 'SELL') sellVotes++;
      else holdVotes++;
    }
  }

  const totalVotes = buyVotes + sellVotes + holdVotes;
  const totalTimeframes = timeframeAnalyses.length;
  const alignedTimeframes = timeframeAnalyses.filter(
    (t) => t.classification === classification
  ).length;

  if (totalVotes === 0 || totalTimeframes === 0) {
    return {
      scorePct: 0,
      tier: 'LOW',
      agreeingVotes: 0,
      opposingVotes: 0,
      neutralVotes: 0,
      totalVotes: 0,
      buyVotes: 0,
      sellVotes: 0,
      holdVotes: 0,
      alignedTimeframes,
      totalTimeframes,
      summary: 'Insufficient indicator readings to compute multi-timeframe confidence.',
    };
  }

  const passedGates = signalQualityChecks.filter((g) => g.passed).length;
  const blockedGates = signalQualityChecks.filter((g) => !g.passed);
  const gatesRatio =
    signalQualityChecks.length > 0 ? passedGates / signalQualityChecks.length : 1;

  let agreeingVotes = 0;
  let opposingVotes = 0;
  const neutralVotes = holdVotes;
  let scorePct = 0;
  let summary = '';

  if (classification === 'BUY') {
    agreeingVotes = buyVotes;
    opposingVotes = sellVotes;
    const agreementRatio = (buyVotes / totalVotes) * 100;
    const netMargin = ((buyVotes - sellVotes) / totalVotes) * 100;
    const tfAlignment = (alignedTimeframes / totalTimeframes) * 100;
    scorePct = clampPct(agreementRatio * 0.55 + netMargin * 0.25 + tfAlignment * 0.2);

    summary = `${buyVotes} of ${totalVotes} directional readings (${Math.round(
      agreementRatio
    )}%) agree BUY vs ${sellVotes} SELL and ${holdVotes} HOLD across ${alignedTimeframes}/${totalTimeframes} BUY-aligned timeframe(s).`;
  } else if (classification === 'SELL') {
    agreeingVotes = sellVotes;
    opposingVotes = buyVotes;
    const agreementRatio = (sellVotes / totalVotes) * 100;
    const netMargin = ((sellVotes - buyVotes) / totalVotes) * 100;
    const tfAlignment = (alignedTimeframes / totalTimeframes) * 100;
    scorePct = clampPct(agreementRatio * 0.55 + netMargin * 0.25 + tfAlignment * 0.2);

    summary = `${sellVotes} of ${totalVotes} directional readings (${Math.round(
      agreementRatio
    )}%) agree SELL vs ${buyVotes} BUY and ${holdVotes} HOLD across ${alignedTimeframes}/${totalTimeframes} SELL-aligned timeframe(s).`;
  } else {
    agreeingVotes = holdVotes;
    opposingVotes = buyVotes + sellVotes;

    const dominantCount = Math.max(buyVotes, sellVotes);
    const dominantBias =
      buyVotes > sellVotes ? 'BUY' : sellVotes > buyVotes ? 'SELL' : 'NEUTRAL';
    const dominantShare = (dominantCount / totalVotes) * 100;
    const netSpread = (Math.abs(buyVotes - sellVotes) / totalVotes) * 100;
    const leanStrength = netSpread >= 40 ? 'strong' : 'slight';

    scorePct = clampPct(
      (dominantShare * 0.4 + netSpread * 0.6) * (0.45 + 0.55 * gatesRatio),
      0,
      49
    );

    const blockerNote =
      blockedGates.length > 0
        ? ` Blocked by ${blockedGates.map((g) => g.label).join(', ')}.`
        : ' Indicator consensus remained below directional threshold.';

    summary = `HOLD selected with ${scorePct}% directional conviction (${buyVotes} BUY · ${holdVotes} HOLD · ${sellVotes} SELL across ${totalTimeframes} timeframe(s)${
      dominantBias !== 'NEUTRAL' ? `, ${leanStrength} ${dominantBias} lean` : ''
    }).${blockerNote}`;
  }

  const tier: 'HIGH' | 'MODERATE' | 'LOW' =
    scorePct >= 70 ? 'HIGH' : scorePct >= 40 ? 'MODERATE' : 'LOW';

  return {
    scorePct,
    tier,
    agreeingVotes,
    opposingVotes,
    neutralVotes,
    totalVotes,
    buyVotes,
    sellVotes,
    holdVotes,
    alignedTimeframes,
    totalTimeframes,
    summary,
  };
}

export function getReportSignalConfidence(report: AnalysisReport): SignalConfidenceBreakdown {
  if (report.signalConfidence) {
    return report.signalConfidence;
  }
  return computeSignalConfidence({
    classification: report.classification,
    timeframeAnalyses: report.timeframeAnalyses,
    signalQualityChecks: report.signalQualityChecks,
  });
}
