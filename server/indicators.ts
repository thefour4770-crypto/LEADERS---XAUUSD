import { INDICATOR_CATALOG } from '../src/constants/indicators.ts';
import type {
  Candle,
  ChartOverlaySeries,
  FreshnessStatus,
  IndicatorId,
  IndicatorResult,
  MarketSentiment24h,
  SelectedIndicatorConfig,
  SignalClassification,
} from '../src/types/market.ts';

export function smaArray(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function emaArray(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function wmaArray(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let weighted = 0;
    for (let j = 0; j < period; j++) {
      weighted += values[i - period + 1 + j] * (j + 1);
    }
    out[i] = weighted / denom;
  }
  return out;
}

function smmaArray(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

function trueRangeArray(candles: Candle[]): number[] {
  const tr: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr[i] = candles[i].high - candles[i].low;
    } else {
      const prevClose = candles[i - 1].close;
      tr[i] = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose)
      );
    }
  }
  return tr;
}

export function atrArray(candles: Candle[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  const tr = trueRangeArray(candles);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function supertrendSeries(candles: Candle[], period: number, multiplier: number) {
  const atr = atrArray(candles, period);
  const line: Array<number | null> = new Array(candles.length).fill(null);
  const dir: Array<number> = new Array(candles.length).fill(0);

  let prevFinalUpper = 0;
  let prevFinalLower = 0;
  let prevDir = 1;

  for (let i = 0; i < candles.length; i++) {
    const a = atr[i];
    if (a == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + multiplier * a;
    const basicLower = hl2 - multiplier * a;

    if (prevFinalUpper === 0 && prevFinalLower === 0) {
      prevFinalUpper = basicUpper;
      prevFinalLower = basicLower;
      prevDir = candles[i].close >= hl2 ? 1 : -1;
      line[i] = prevDir === 1 ? prevFinalLower : prevFinalUpper;
      dir[i] = prevDir;
      continue;
    }

    const prevClose = candles[i - 1].close;
    const finalUpper = basicUpper < prevFinalUpper || prevClose > prevFinalUpper ? basicUpper : prevFinalUpper;
    const finalLower = basicLower > prevFinalLower || prevClose < prevFinalLower ? basicLower : prevFinalLower;

    let currentDir = prevDir;
    if (prevDir === -1 && candles[i].close > finalUpper) {
      currentDir = 1;
    } else if (prevDir === 1 && candles[i].close < finalLower) {
      currentDir = -1;
    }

    line[i] = currentDir === 1 ? finalLower : finalUpper;
    dir[i] = currentDir;
    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevDir = currentDir;
  }

  return { line, dir };
}

function psarSeries(candles: Candle[], step: number, maxStep: number): { sar: Array<number | null>; dir: number[] } {
  const sar: Array<number | null> = new Array(candles.length).fill(null);
  const dir: number[] = new Array(candles.length).fill(0);
  if (candles.length < 3) return { sar, dir };

  let isUp = candles[1].close >= candles[0].close;
  let af = step;
  let ep = isUp ? Math.max(candles[0].high, candles[1].high) : Math.min(candles[0].low, candles[1].low);
  let currentSar = isUp ? Math.min(candles[0].low, candles[1].low) : Math.max(candles[0].high, candles[1].high);

  sar[1] = currentSar;
  dir[1] = isUp ? 1 : -1;

  for (let i = 2; i < candles.length; i++) {
    currentSar = currentSar + af * (ep - currentSar);
    if (isUp) {
      currentSar = Math.min(currentSar, candles[i - 1].low, candles[i - 2].low);
      if (candles[i].low < currentSar) {
        isUp = false;
        currentSar = ep;
        ep = candles[i].low;
        af = step;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(maxStep, af + step);
        }
      }
    } else {
      currentSar = Math.max(currentSar, candles[i - 1].high, candles[i - 2].high);
      if (candles[i].high > currentSar) {
        isUp = true;
        currentSar = ep;
        ep = candles[i].high;
        af = step;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(maxStep, af + step);
        }
      }
    }
    sar[i] = currentSar;
    dir[i] = isUp ? 1 : -1;
  }

  return { sar, dir };
}

export function rsiArray(closes: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function dmiAdxSeries(candles: Candle[], period: number) {
  const n = candles.length;
  const plusDI: Array<number | null> = new Array(n).fill(null);
  const minusDI: Array<number | null> = new Array(n).fill(null);
  const adx: Array<number | null> = new Array(n).fill(null);
  if (n < period * 2 + 2) return { plusDI, minusDI, adx };

  const tr = trueRangeArray(candles);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smTR = 0;
  let smPlusDM = 0;
  let smMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smTR += tr[i];
    smPlusDM += plusDM[i];
    smMinusDM += minusDM[i];
  }

  const dxArr: number[] = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    if (i > period) {
      smTR = smTR - smTR / period + tr[i];
      smPlusDM = smPlusDM - smPlusDM / period + plusDM[i];
      smMinusDM = smMinusDM - smMinusDM / period + minusDM[i];
    }
    const pdi = smTR === 0 ? 0 : (smPlusDM / smTR) * 100;
    const mdi = smTR === 0 ? 0 : (smMinusDM / smTR) * 100;
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const sumDI = pdi + mdi;
    dxArr[i] = sumDI === 0 ? 0 : (Math.abs(pdi - mdi) / sumDI) * 100;
  }

  let dxSum = 0;
  for (let i = period; i < period * 2; i++) dxSum += dxArr[i];
  let prevAdx = dxSum / period;
  adx[period * 2 - 1] = prevAdx;
  for (let i = period * 2; i < n; i++) {
    prevAdx = (prevAdx * (period - 1) + dxArr[i]) / period;
    adx[i] = prevAdx;
  }

  return { plusDI, minusDI, adx };
}

export function bollingerArrays(closes: number[], period: number, stdDevMult: number) {
  const mid = smaArray(closes, period);
  const upper: Array<number | null> = new Array(closes.length).fill(null);
  const lower: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i];
    if (m == null) continue;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - m;
      sqSum += diff * diff;
    }
    const sd = Math.sqrt(sqSum / period);
    upper[i] = m + stdDevMult * sd;
    lower[i] = m - stdDevMult * sd;
  }
  return { upper, mid, lower };
}

export function macdSeries(closes: number[], fast = 12, slow = 26, signal = 9) {
  const fArr = emaArray(closes, fast);
  const sArr = emaArray(closes, slow);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fArr[i] != null && sArr[i] != null) {
      macdLine.push(fArr[i]! - sArr[i]!);
    }
  }
  if (macdLine.length < signal + 2) {
    return { macd: null as number | null, signal: null as number | null, hist: null as number | null, prevHist: null as number | null };
  }
  const sigArr = emaArray(macdLine, signal);
  const lastM = macdLine[macdLine.length - 1];
  const lastS = sigArr[sigArr.length - 1];
  const prevS = sigArr[sigArr.length - 2];
  if (lastS == null) {
    return { macd: null, signal: null, hist: null, prevHist: null };
  }
  const hist = lastM - lastS;
  const prevHist = macdLine[macdLine.length - 2] - (prevS ?? lastS);
  return { macd: lastM, signal: lastS, hist, prevHist };
}

export function getEffectiveVolumes(candles: Candle[]): { volumes: number[]; volumeType: 'EXCHANGE' | 'TICK_PROXY' } {
  const nonZero = candles.filter((c) => c.volume > 0).length;
  const hasExchange = nonZero >= Math.max(5, candles.length * 0.4);
  if (hasExchange) {
    return {
      volumes: candles.map((c) => c.volume),
      volumeType: 'EXCHANGE',
    };
  }
  return {
    volumes: candles.map((c) => Math.max(1, Math.round((c.high - c.low) * 100 + Math.abs(c.close - c.open) * 50))),
    volumeType: 'TICK_PROXY',
  };
}

export function obvSeries(candles: Candle[], signalPeriod = 20) {
  if (candles.length < signalPeriod + 2) {
    return { obv: null as number | null, signal: null as number | null, prevObv: null as number | null, volumeType: 'TICK_PROXY' as const };
  }
  const { volumes, volumeType } = getEffectiveVolumes(candles);
  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv.push(obv[i - 1] + volumes[i]);
    else if (candles[i].close < candles[i - 1].close) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  const emaObv = emaArray(obv, signalPeriod);
  const lastSig = lastNonNull(emaObv).value;
  return {
    obv: obv[obv.length - 1],
    prevObv: obv[obv.length - 2] ?? obv[obv.length - 1],
    signal: lastSig,
    volumeType,
  };
}

export function lastNonNull(arr: Array<number | null>): { value: number | null; prev: number | null; index: number } {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && Number.isFinite(arr[i])) {
      let prev: number | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (arr[j] != null && Number.isFinite(arr[j])) {
          prev = arr[j];
          break;
        }
      }
      return { value: arr[i], prev, index: i };
    }
  }
  return { value: null, prev: null, index: -1 };
}

function biasFromScore(score: number, threshold = 0.2): SignalClassification {
  if (score >= threshold) return 'BUY';
  if (score <= -threshold) return 'SELL';
  return 'HOLD';
}

export function getLatestAtr(candles: Candle[], period = 14): number | null {
  const arr = atrArray(candles, period);
  return lastNonNull(arr).value;
}

export function getLatestAdx(
  candles: Candle[],
  period = 14
): { adx: number | null; plusDI: number | null; minusDI: number | null } {
  const { adx, plusDI, minusDI } = dmiAdxSeries(candles, period);
  return {
    adx: lastNonNull(adx).value,
    plusDI: lastNonNull(plusDI).value,
    minusDI: lastNonNull(minusDI).value,
  };
}

export function computeHourlySentiment24h(
  candles: Candle[],
  latestTimestamp: number,
  freshness: FreshnessStatus,
  source: string
): MarketSentiment24h {
  const win = candles.slice(-24);
  const trAll = trueRangeArray(candles);
  const trWin = trAll.slice(-win.length);
  const latestAtr = getLatestAtr(candles, 14) ?? (trWin.reduce((a, b) => a + b, 0) / Math.max(1, trWin.length));

  let weightedEffSum = 0;
  let weightSum = 0;
  let trSum = 0;
  let upHours = 0;
  let downHours = 0;

  for (let i = 0; i < win.length; i++) {
    const c = win[i];
    const barRange = Math.max(0.01, c.high - c.low);
    const eff = Math.max(-1, Math.min(1, (c.close - c.open) / barRange));
    const tr = Math.max(0.01, trWin[i] ?? barRange);
    // Weight recent hourly volatility patterns more strongly than 24h-old hours
    const recencyWeight = 0.7 + 0.6 * (win.length > 1 ? i / (win.length - 1) : 1);
    const w = tr * recencyWeight;

    weightedEffSum += eff * w;
    weightSum += w;
    trSum += tr;

    if (c.close > c.open) upHours++;
    else if (c.close < c.open) downHours++;
  }

  const netStrength = weightSum > 0 ? Math.max(-1, Math.min(1, weightedEffSum / weightSum)) : 0;
  const directionalTrendPct = Number((netStrength * 100).toFixed(1));
  const bullishSharePct = Math.round(((netStrength + 1) / 2) * 100);
  const bearishSharePct = 100 - bullishSharePct;

  const avgHourlyVolatilityUsd = Number((trSum / Math.max(1, win.length)).toFixed(2));
  const latestHourlyAtrUsd = Number(latestAtr.toFixed(2));
  const volRatio = avgHourlyVolatilityUsd > 0 ? latestHourlyAtrUsd / avgHourlyVolatilityUsd : 1;
  const volatilityRegime: 'EXPANDING' | 'MODERATE' | 'COMPRESSED' =
    volRatio >= 1.12 ? 'EXPANDING' : volRatio <= 0.88 ? 'COMPRESSED' : 'MODERATE';

  const firstOpen = win[0]?.open ?? 1;
  const lastClose = win[win.length - 1]?.close ?? firstOpen;
  const priceChange24hPct = Number((((lastClose - firstOpen) / firstOpen) * 100).toFixed(2));

  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    directionalTrendPct >= 12 ? 'BULLISH' : directionalTrendPct <= -12 ? 'BEARISH' : 'NEUTRAL';

  return {
    direction,
    directionalTrendPct,
    bullishSharePct,
    bearishSharePct,
    priceChange24hPct,
    avgHourlyVolatilityUsd,
    latestHourlyAtrUsd,
    volatilityRegime,
    upHours,
    downHours,
    hoursAnalyzed: win.length,
    latestTimestamp,
    freshness,
    source,
  };
}

export function computeSupportResistance(candles: Candle[]): { supportLevels: number[]; resistanceLevels: number[] } {
  if (candles.length < 15) return { supportLevels: [], resistanceLevels: [] };
  const lastPrice = candles[candles.length - 1].close;
  const lookback = candles.slice(-160);
  const rawHighs: number[] = [];
  const rawLows: number[] = [];

  for (let i = 2; i < lookback.length - 2; i++) {
    const h = lookback[i].high;
    const l = lookback[i].low;
    if (
      h > lookback[i - 1].high &&
      h > lookback[i - 2].high &&
      h > lookback[i + 1].high &&
      h > lookback[i + 2].high
    ) {
      rawHighs.push(h);
    }
    if (
      l < lookback[i - 1].low &&
      l < lookback[i - 2].low &&
      l < lookback[i + 1].low &&
      l < lookback[i + 2].low
    ) {
      rawLows.push(l);
    }
  }

  const clusterLevels = (levels: number[], isResistance: boolean): number[] => {
    const filtered = levels.filter((lvl) => (isResistance ? lvl > lastPrice * 1.0002 : lvl < lastPrice * 0.9998));
    filtered.sort((a, b) => (isResistance ? a - b : b - a));
    const clustered: number[] = [];
    const minGap = lastPrice * 0.0018;
    for (const lvl of filtered) {
      if (!clustered.some((c) => Math.abs(c - lvl) < minGap)) {
        clustered.push(Number(lvl.toFixed(2)));
      }
      if (clustered.length >= 3) break;
    }
    return clustered;
  };

  return {
    supportLevels: clusterLevels(rawLows, false),
    resistanceLevels: clusterLevels(rawHighs, true),
  };
}

export function calculateIndicator(
  candles: Candle[],
  config: SelectedIndicatorConfig
): IndicatorResult {
  const def = INDICATOR_CATALOG.find((d) => d.id === config.id)!;
  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] ?? lastClose;
  const p = config.params;

  const insufficient = (needed: number): IndicatorResult => ({
    id: config.id,
    name: def.name,
    category: def.category,
    bias: 'HOLD',
    primaryValue: 'N/A',
    explanation: `Insufficient bars (${candles.length}/${needed} required) to compute ${def.name}.`,
    score: 0,
  });

  switch (config.id) {
    case 'ema': {
      const period = Math.max(2, Math.round(p.period ?? 20));
      const arr = emaArray(closes, period);
      const { value, prev } = lastNonNull(arr);
      if (value == null) return insufficient(period);
      const distPct = ((lastClose - value) / value) * 100;
      const rising = prev != null ? value > prev : false;
      const score = lastClose > value ? (rising ? 0.85 : 0.45) : lastClose < value ? (!rising ? -0.85 : -0.45) : 0;
      return {
        id: 'ema',
        name: `EMA (${period})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `$${value.toFixed(2)}`,
        secondaryValues: { 'vs Price': `${distPct >= 0 ? '+' : ''}${distPct.toFixed(2)}%` },
        explanation:
          lastClose > value
            ? `Price ($${lastClose.toFixed(2)}) trades above EMA(${period}) at $${value.toFixed(2)}, reflecting upward trend alignment.`
            : `Price ($${lastClose.toFixed(2)}) trades below EMA(${period}) at $${value.toFixed(2)}, reflecting downward pressure.`,
        score,
      };
    }

    case 'sma': {
      const period = Math.max(2, Math.round(p.period ?? 50));
      const arr = smaArray(closes, period);
      const { value, prev } = lastNonNull(arr);
      if (value == null) return insufficient(period);
      const distPct = ((lastClose - value) / value) * 100;
      const rising = prev != null ? value > prev : false;
      const score = lastClose > value ? (rising ? 0.8 : 0.45) : lastClose < value ? (!rising ? -0.8 : -0.45) : 0;
      return {
        id: 'sma',
        name: `SMA (${period})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `$${value.toFixed(2)}`,
        secondaryValues: { 'vs Price': `${distPct >= 0 ? '+' : ''}${distPct.toFixed(2)}%` },
        explanation:
          lastClose > value
            ? `Spot close holds above SMA(${period}) baseline ($${value.toFixed(2)}).`
            : `Spot close remains beneath SMA(${period}) baseline ($${value.toFixed(2)}).`,
        score,
      };
    }

    case 'wma': {
      const period = Math.max(2, Math.round(p.period ?? 20));
      const arr = wmaArray(closes, period);
      const { value, prev } = lastNonNull(arr);
      if (value == null) return insufficient(period);
      const rising = prev != null ? value > prev : false;
      const score = lastClose > value ? (rising ? 0.8 : 0.4) : !rising ? -0.8 : -0.4;
      return {
        id: 'wma',
        name: `WMA (${period})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `$${value.toFixed(2)}`,
        explanation:
          lastClose > value
            ? `Price sits above linearly weighted WMA(${period}) ($${value.toFixed(2)}).`
            : `Price sits below linearly weighted WMA(${period}) ($${value.toFixed(2)}).`,
        score,
      };
    }

    case 'ma_cross': {
      const fast = Math.max(2, Math.round(p.fast ?? 9));
      const slow = Math.max(fast + 1, Math.round(p.slow ?? 21));
      const fastArr = emaArray(closes, fast);
      const slowArr = emaArray(closes, slow);
      const f = lastNonNull(fastArr);
      const s = lastNonNull(slowArr);
      if (f.value == null || s.value == null) return insufficient(slow);
      const spread = f.value - s.value;
      const freshBull = f.prev != null && s.prev != null && f.prev <= s.prev && f.value > s.value;
      const freshBear = f.prev != null && s.prev != null && f.prev >= s.prev && f.value < s.value;
      const score = freshBull ? 1.0 : freshBear ? -1.0 : spread > 0 ? 0.7 : spread < 0 ? -0.7 : 0;
      return {
        id: 'ma_cross',
        name: `MA Cross (${fast}/${slow})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `${spread >= 0 ? '+' : ''}${spread.toFixed(2)}`,
        secondaryValues: { Fast: `$${f.value.toFixed(2)}`, Slow: `$${s.value.toFixed(2)}` },
        explanation: freshBull
          ? `Bullish EMA(${fast}) crossover above EMA(${slow}).`
          : freshBear
          ? `Bearish EMA(${fast}) crossunder below EMA(${slow}).`
          : spread > 0
          ? `Fast EMA(${fast}) remains aligned above Slow EMA(${slow}).`
          : `Fast EMA(${fast}) remains aligned below Slow EMA(${slow}).`,
        score,
      };
    }

    case 'supertrend': {
      const period = Math.max(5, Math.round(p.period ?? 10));
      const mult = Math.max(1, Number(p.multiplier ?? 3));
      if (candles.length < period + 5) return insufficient(period + 5);
      const { line, dir } = supertrendSeries(candles, period, mult);
      const lastLine = line[line.length - 1];
      const lastDir = dir[dir.length - 1];
      if (lastLine == null || lastDir === 0) return insufficient(period + 5);
      const score = lastDir === 1 ? 0.9 : -0.9;
      return {
        id: 'supertrend',
        name: `Supertrend (${period}, ${mult})`,
        category: 'TREND',
        bias: lastDir === 1 ? 'BUY' : 'SELL',
        primaryValue: `$${lastLine.toFixed(2)} (${lastDir === 1 ? 'Bullish' : 'Bearish'})`,
        explanation:
          lastDir === 1
            ? `Supertrend support floor active at $${lastLine.toFixed(2)} below current price.`
            : `Supertrend resistance ceiling active at $${lastLine.toFixed(2)} above current price.`,
        score,
      };
    }

    case 'ichimoku': {
      const tP = Math.max(5, Math.round(p.tenkan ?? 9));
      const kP = Math.max(10, Math.round(p.kijun ?? 26));
      const sB = Math.max(20, Math.round(p.senkouB ?? 52));
      if (candles.length < sB + kP) return insufficient(sB + kP);

      const midHL = (idx: number, len: number) => {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = idx - len + 1; j <= idx; j++) {
          if (candles[j].high > hi) hi = candles[j].high;
          if (candles[j].low < lo) lo = candles[j].low;
        }
        return (hi + lo) / 2;
      };

      const idx = candles.length - 1;
      const tenkan = midHL(idx, tP);
      const kijun = midHL(idx, kP);
      const cloudIdx = idx - kP;
      const spanA = (midHL(cloudIdx, tP) + midHL(cloudIdx, kP)) / 2;
      const spanB = midHL(cloudIdx, sB);
      const cloudTop = Math.max(spanA, spanB);
      const cloudBottom = Math.min(spanA, spanB);

      let score = 0;
      if (lastClose > cloudTop) score += 0.55;
      else if (lastClose < cloudBottom) score -= 0.55;
      if (tenkan > kijun) score += 0.35;
      else if (tenkan < kijun) score -= 0.35;

      return {
        id: 'ichimoku',
        name: 'Ichimoku Cloud',
        category: 'TREND',
        bias: biasFromScore(score, 0.3),
        primaryValue: lastClose > cloudTop ? 'Above Cloud' : lastClose < cloudBottom ? 'Below Cloud' : 'Inside Cloud',
        secondaryValues: {
          Tenkan: `$${tenkan.toFixed(2)}`,
          Kijun: `$${kijun.toFixed(2)}`,
          SpanA: `$${spanA.toFixed(2)}`,
          SpanB: `$${spanB.toFixed(2)}`,
        },
        explanation:
          lastClose > cloudTop
            ? `Price trades above Kumo cloud ($${cloudTop.toFixed(2)}) with Tenkan ${tenkan > kijun ? 'above' : 'below'} Kijun.`
            : lastClose < cloudBottom
            ? `Price trades below Kumo cloud ($${cloudBottom.toFixed(2)}) with Tenkan ${tenkan < kijun ? 'below' : 'above'} Kijun.`
            : `Price is consolidating inside the Kumo cloud ($${cloudBottom.toFixed(2)}–$${cloudTop.toFixed(2)}), indicating indecision.`,
        score,
      };
    }

    case 'parabolic_sar': {
      const step = Number(p.step ?? 0.02);
      const max = Number(p.max ?? 0.2);
      if (candles.length < 10) return insufficient(10);
      const { sar, dir } = psarSeries(candles, step, max);
      const val = sar[sar.length - 1];
      const d = dir[dir.length - 1];
      if (val == null || d === 0) return insufficient(10);
      const score = d === 1 ? 0.75 : -0.75;
      return {
        id: 'parabolic_sar',
        name: 'Parabolic SAR',
        category: 'TREND',
        bias: d === 1 ? 'BUY' : 'SELL',
        primaryValue: `$${val.toFixed(2)}`,
        explanation:
          d === 1
            ? `Parabolic SAR dot sits beneath price at $${val.toFixed(2)}, tracking upward trend.`
            : `Parabolic SAR dot sits above price at $${val.toFixed(2)}, tracking downward trend.`,
        score,
      };
    }

    case 'vwap': {
      const lookback = Math.max(10, Math.round(p.lookback ?? 48));
      const slice = candles.slice(-lookback);
      if (slice.length < 5) return insufficient(5);
      const { volumes, volumeType } = getEffectiveVolumes(slice);
      let pvSum = 0;
      let vSum = 0;
      for (let i = 0; i < slice.length; i++) {
        const tp = (slice[i].high + slice[i].low + slice[i].close) / 3;
        const vol = volumes[i] > 0 ? volumes[i] : 1;
        pvSum += tp * vol;
        vSum += vol;
      }
      const vwapVal = pvSum / vSum;
      const diffPct = ((lastClose - vwapVal) / vwapVal) * 100;
      const score = Math.abs(diffPct) < 0.05 ? 0 : diffPct > 0 ? 0.65 : -0.65;
      return {
        id: 'vwap',
        name: `VWAP (${lookback})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `$${vwapVal.toFixed(2)}`,
        secondaryValues: { Deviation: `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%` },
        volumeType,
        explanation: `Price ($${lastClose.toFixed(2)}) is ${diffPct >= 0 ? 'above' : 'below'} ${lookback}-bar ${volumeType === 'TICK_PROXY' ? 'Tick-Weighted ' : ''}VWAP ($${vwapVal.toFixed(2)}).`,
        score,
      };
    }

    case 'pivot_points': {
      const lookback = Math.max(10, Math.round(p.lookback ?? 24));
      if (candles.length < lookback * 2) return insufficient(lookback * 2);
      const anchor = candles.slice(-lookback * 2, -lookback);
      const H = Math.max(...anchor.map((c) => c.high));
      const L = Math.min(...anchor.map((c) => c.low));
      const C = anchor[anchor.length - 1].close;
      const P = (H + L + C) / 3;
      const R1 = 2 * P - L;
      const S1 = 2 * P - H;
      const R2 = P + (H - L);
      const S2 = P - (H - L);

      const score = lastClose > P * 1.001 ? 0.6 : lastClose < P * 0.999 ? -0.6 : 0;
      return {
        id: 'pivot_points',
        name: 'Pivot Points',
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `P $${P.toFixed(2)}`,
        secondaryValues: {
          R1: `$${R1.toFixed(2)}`,
          R2: `$${R2.toFixed(2)}`,
          S1: `$${S1.toFixed(2)}`,
          S2: `$${S2.toFixed(2)}`,
        },
        explanation:
          lastClose > P
            ? `Price trades above Central Pivot ($${P.toFixed(2)}), eyeing R1 ($${R1.toFixed(2)}).`
            : `Price trades below Central Pivot ($${P.toFixed(2)}), near S1 ($${S1.toFixed(2)}).`,
        score,
      };
    }

    case 'alligator': {
      const jawP = Math.round(p.jaw ?? 13);
      const teethP = Math.round(p.teeth ?? 8);
      const lipsP = Math.round(p.lips ?? 5);
      if (candles.length < jawP + 10) return insufficient(jawP + 10);
      const medians = candles.map((c) => (c.high + c.low) / 2);
      const jawArr = smmaArray(medians, jawP);
      const teethArr = smmaArray(medians, teethP);
      const lipsArr = smmaArray(medians, lipsP);

      const jaw = jawArr[jawArr.length - 1 - 8] ?? jawArr[jawArr.length - 1];
      const teeth = teethArr[teethArr.length - 1 - 5] ?? teethArr[teethArr.length - 1];
      const lips = lipsArr[lipsArr.length - 1 - 3] ?? lipsArr[lipsArr.length - 1];
      if (jaw == null || teeth == null || lips == null) return insufficient(jawP + 10);

      let score = 0;
      if (lips > teeth && teeth > jaw && lastClose > lips) score = 0.85;
      else if (lips < teeth && teeth < jaw && lastClose < lips) score = -0.85;

      return {
        id: 'alligator',
        name: 'Alligator',
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: score > 0 ? 'Bullish Awake' : score < 0 ? 'Bearish Awake' : 'Sleeping / Tangled',
        secondaryValues: {
          Lips: `$${lips.toFixed(2)}`,
          Teeth: `$${teeth.toFixed(2)}`,
          Jaw: `$${jaw.toFixed(2)}`,
        },
        explanation:
          score > 0
            ? 'Alligator lines aligned upward (Lips > Teeth > Jaw).'
            : score < 0
            ? 'Alligator lines aligned downward (Lips < Teeth < Jaw).'
            : 'Alligator lines intertwined — trend currently resting.',
        score,
      };
    }

    case 'adx': {
      const period = Math.max(5, Math.round(p.period ?? 14));
      const { plusDI, minusDI, adx } = dmiAdxSeries(candles, period);
      const a = lastNonNull(adx).value;
      const pdi = lastNonNull(plusDI).value;
      const mdi = lastNonNull(minusDI).value;
      if (a == null || pdi == null || mdi == null) return insufficient(period * 2 + 2);
      const strong = a >= 25;
      const score = a < 20 ? 0 : pdi > mdi ? (strong ? 0.75 : 0.35) : (strong ? -0.75 : -0.35);
      return {
        id: 'adx',
        name: `ADX (${period})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: a.toFixed(2),
        secondaryValues: { Regime: a >= 25 ? 'Strong Trend' : a >= 20 ? 'Developing' : 'Weak / Range' },
        explanation:
          a < 20
            ? `ADX at ${a.toFixed(1)} indicates weak directional trend strength (ranging conditions).`
            : `ADX at ${a.toFixed(1)} confirms active trend strength with ${pdi > mdi ? '+DI' : '-DI'} leading.`,
        score,
      };
    }

    case 'dmi': {
      const period = Math.max(5, Math.round(p.period ?? 14));
      const { plusDI, minusDI } = dmiAdxSeries(candles, period);
      const pdi = lastNonNull(plusDI).value;
      const mdi = lastNonNull(minusDI).value;
      if (pdi == null || mdi == null) return insufficient(period * 2 + 2);
      const diff = pdi - mdi;
      const score = Math.abs(diff) < 3 ? 0 : diff > 0 ? 0.75 : -0.75;
      return {
        id: 'dmi',
        name: `DMI (${period})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `+DI ${pdi.toFixed(1)} / -DI ${mdi.toFixed(1)}`,
        explanation:
          Math.abs(diff) < 3
            ? `Directional buyers (+DI ${pdi.toFixed(1)}) and sellers (-DI ${mdi.toFixed(1)}) are nearly balanced.`
            : diff > 0
            ? `+DI (${pdi.toFixed(1)}) leads -DI (${mdi.toFixed(1)}), indicating net upward directional movement.`
            : `-DI (${mdi.toFixed(1)}) leads +DI (${pdi.toFixed(1)}), indicating net downward directional movement.`,
        score,
      };
    }

    case 'aroon': {
      const period = Math.max(5, Math.round(p.period ?? 25));
      if (candles.length < period + 1) return insufficient(period + 1);
      const win = candles.slice(-period - 1);
      let hiIdx = 0;
      let loIdx = 0;
      for (let i = 1; i < win.length; i++) {
        if (win[i].high >= win[hiIdx].high) hiIdx = i;
        if (win[i].low <= win[loIdx].low) loIdx = i;
      }
      const aroonUp = (hiIdx / period) * 100;
      const aroonDown = (loIdx / period) * 100;
      const osc = aroonUp - aroonDown;
      const score = osc >= 30 ? 0.75 : osc <= -30 ? -0.75 : 0;
      return {
        id: 'aroon',
        name: `Aroon (${period})`,
        category: 'TREND',
        bias: biasFromScore(score),
        primaryValue: `Up ${aroonUp.toFixed(0)} / Dn ${aroonDown.toFixed(0)}`,
        explanation:
          osc >= 30
            ? `Aroon Up (${aroonUp.toFixed(0)}) dominates Aroon Down (${aroonDown.toFixed(0)}).`
            : osc <= -30
            ? `Aroon Down (${aroonDown.toFixed(0)}) dominates Aroon Up (${aroonUp.toFixed(0)}).`
            : `Aroon Up (${aroonUp.toFixed(0)}) and Down (${aroonDown.toFixed(0)}) show mixed recency of highs/lows.`,
        score,
      };
    }

    // ======================== MOMENTUM (10) ========================
    case 'rsi': {
      const period = Math.max(5, Math.round(p.period ?? 14));
      const ob = Number(p.overbought ?? 70);
      const os = Number(p.oversold ?? 30);
      const arr = rsiArray(closes, period);
      const { value } = lastNonNull(arr);
      if (value == null) return insufficient(period + 1);
      let score = 0;
      if (value >= ob) score = -0.55; // stretched overbought
      else if (value <= os) score = 0.55; // stretched oversold
      else if (value > 55) score = 0.65;
      else if (value < 45) score = -0.65;
      return {
        id: 'rsi',
        name: `RSI (${period})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: value.toFixed(2),
        secondaryValues: { Zone: value >= ob ? 'Overbought' : value <= os ? 'Oversold' : 'Neutral-Active' },
        explanation:
          value >= ob
            ? `RSI(${period}) at ${value.toFixed(1)} is in overbought territory (>= ${ob}), risking pullback.`
            : value <= os
            ? `RSI(${period}) at ${value.toFixed(1)} is in oversold territory (<= ${os}), watching for mean reversion.`
            : `RSI(${period}) at ${value.toFixed(1)} reflects ${value > 55 ? 'bullish' : value < 45 ? 'bearish' : 'balanced'} momentum.`,
        score,
      };
    }

    case 'macd': {
      const fast = Math.max(3, Math.round(p.fast ?? 12));
      const slow = Math.max(fast + 2, Math.round(p.slow ?? 26));
      const sig = Math.max(2, Math.round(p.signal ?? 9));
      const fArr = emaArray(closes, fast);
      const sArr = emaArray(closes, slow);
      const macdLine: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (fArr[i] != null && sArr[i] != null) macdLine.push(fArr[i]! - sArr[i]!);
      }
      if (macdLine.length < sig + 2) return insufficient(slow + sig);
      const sigArr = emaArray(macdLine, sig);
      const lastM = macdLine[macdLine.length - 1];
      const lastS = sigArr[sigArr.length - 1];
      if (lastS == null) return insufficient(slow + sig);
      const hist = lastM - lastS;
      const prevHist = macdLine[macdLine.length - 2] - (sigArr[sigArr.length - 2] ?? lastS);
      const score = hist > 0 ? (hist > prevHist ? 0.9 : 0.55) : hist < 0 ? (hist < prevHist ? -0.9 : -0.55) : 0;
      return {
        id: 'macd',
        name: `MACD (${fast},${slow},${sig})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: `${hist >= 0 ? '+' : ''}${hist.toFixed(2)}`,
        secondaryValues: { MACD: lastM.toFixed(2), Signal: lastS.toFixed(2) },
        explanation:
          hist > 0
            ? `MACD (${lastM.toFixed(2)}) sits above Signal (${lastS.toFixed(2)}) with positive histogram (${hist.toFixed(2)}).`
            : `MACD (${lastM.toFixed(2)}) sits below Signal (${lastS.toFixed(2)}) with negative histogram (${hist.toFixed(2)}).`,
        score,
      };
    }

    case 'stochastic': {
      const kP = Math.max(3, Math.round(p.kPeriod ?? 14));
      const dP = Math.max(2, Math.round(p.dPeriod ?? 3));
      const smooth = Math.max(1, Math.round(p.smooth ?? 3));
      if (candles.length < kP + smooth + dP) return insufficient(kP + smooth + dP);
      const rawK: number[] = [];
      for (let i = kP - 1; i < candles.length; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - kP + 1; j <= i; j++) {
          if (candles[j].high > hi) hi = candles[j].high;
          if (candles[j].low < lo) lo = candles[j].low;
        }
        rawK.push(hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100);
      }
      const slowK = smaArray(rawK, smooth).filter((v): v is number => v != null);
      const slowD = smaArray(slowK, dP);
      const kVal = slowK[slowK.length - 1];
      const dVal = slowD[slowD.length - 1];
      if (kVal == null || dVal == null) return insufficient(kP + smooth + dP);
      let score = 0;
      if (kVal > dVal && kVal < 80) score = 0.65;
      else if (kVal < dVal && kVal > 20) score = -0.65;
      else if (kVal >= 80 && kVal < dVal) score = -0.7;
      else if (kVal <= 20 && kVal > dVal) score = 0.7;
      return {
        id: 'stochastic',
        name: `Stochastic (${kP},${dP},${smooth})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: `%K ${kVal.toFixed(1)} / %D ${dVal.toFixed(1)}`,
        explanation:
          kVal > dVal
            ? `%K (${kVal.toFixed(1)}) holds above %D (${dVal.toFixed(1)}).`
            : `%K (${kVal.toFixed(1)}) holds below %D (${dVal.toFixed(1)}).`,
        score,
      };
    }

    case 'stoch_rsi': {
      const rP = Math.max(5, Math.round(p.rsiPeriod ?? 14));
      const sP = Math.max(5, Math.round(p.stochPeriod ?? 14));
      const rsis = rsiArray(closes, rP).filter((v): v is number => v != null);
      if (rsis.length < sP + 3) return insufficient(rP + sP + 3);
      const slice = rsis.slice(-sP);
      const minR = Math.min(...slice);
      const maxR = Math.max(...slice);
      const k = maxR === minR ? 50 : ((rsis[rsis.length - 1] - minR) / (maxR - minR)) * 100;
      const score = k > 60 ? 0.5 : k < 40 ? -0.5 : 0;
      return {
        id: 'stoch_rsi',
        name: `Stoch RSI (${rP},${sP})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: k.toFixed(1),
        explanation: `Stochastic RSI at ${k.toFixed(1)} (${k >= 80 ? 'Overbought' : k <= 20 ? 'Oversold' : 'Mid-range'}).`,
        score,
      };
    }

    case 'cci': {
      const period = Math.max(5, Math.round(p.period ?? 20));
      if (candles.length < period) return insufficient(period);
      const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
      const slice = tp.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const md = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
      const cci = md === 0 ? 0 : (tp[tp.length - 1] - mean) / (0.015 * md);
      const score = cci > 100 ? 0.75 : cci < -100 ? -0.75 : cci > 25 ? 0.35 : cci < -25 ? -0.35 : 0;
      return {
        id: 'cci',
        name: `CCI (${period})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: cci.toFixed(1),
        explanation:
          cci > 100
            ? `CCI(${period}) at ${cci.toFixed(1)} shows strong upward price deviation (> +100).`
            : cci < -100
            ? `CCI(${period}) at ${cci.toFixed(1)} shows strong downward deviation (< -100).`
            : `CCI(${period}) at ${cci.toFixed(1)} remains inside normal equilibrium band (-100 to +100).`,
        score,
      };
    }

    case 'williams_r': {
      const period = Math.max(5, Math.round(p.period ?? 14));
      if (candles.length < period) return insufficient(period);
      const win = candles.slice(-period);
      const hi = Math.max(...win.map((c) => c.high));
      const lo = Math.min(...win.map((c) => c.low));
      const wr = hi === lo ? -50 : ((hi - lastClose) / (hi - lo)) * -100;
      const score = wr > -20 ? -0.3 : wr < -80 ? 0.3 : wr > -45 ? 0.55 : wr < -55 ? -0.55 : 0;
      return {
        id: 'williams_r',
        name: `Williams %R (${period})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: wr.toFixed(1),
        explanation: `Williams %R(${period}) reads ${wr.toFixed(1)} (${wr > -20 ? 'Overbought upper extreme' : wr < -80 ? 'Oversold lower extreme' : 'Mid-channel'}).`,
        score,
      };
    }

    case 'momentum': {
      const period = Math.max(2, Math.round(p.period ?? 10));
      if (closes.length <= period) return insufficient(period + 1);
      const mom = lastClose - closes[closes.length - 1 - period];
      const pct = (mom / closes[closes.length - 1 - period]) * 100;
      const score = pct > 0.15 ? 0.7 : pct < -0.15 ? -0.7 : 0;
      return {
        id: 'momentum',
        name: `Momentum (${period})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: `${mom >= 0 ? '+' : ''}$${mom.toFixed(2)}`,
        secondaryValues: { Change: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` },
        explanation: `${period}-bar net price velocity is ${mom >= 0 ? '+' : ''}$${mom.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%).`,
        score,
      };
    }

    case 'roc': {
      const period = Math.max(2, Math.round(p.period ?? 12));
      if (closes.length <= period) return insufficient(period + 1);
      const base = closes[closes.length - 1 - period];
      const roc = ((lastClose - base) / base) * 100;
      const score = roc > 0.15 ? 0.7 : roc < -0.15 ? -0.7 : 0;
      return {
        id: 'roc',
        name: `ROC (${period})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: `${roc >= 0 ? '+' : ''}${roc.toFixed(2)}%`,
        explanation: `Rate of Change over ${period} bars is ${roc >= 0 ? '+' : ''}${roc.toFixed(2)}%.`,
        score,
      };
    }

    case 'awesome_oscillator': {
      const fast = Math.max(2, Math.round(p.fast ?? 5));
      const slow = Math.max(fast + 2, Math.round(p.slow ?? 34));
      if (candles.length < slow + 2) return insufficient(slow + 2);
      const med = candles.map((c) => (c.high + c.low) / 2);
      const fSma = smaArray(med, fast);
      const sSma = smaArray(med, slow);
      const ao = fSma[fSma.length - 1]! - sSma[sSma.length - 1]!;
      const prevAo = fSma[fSma.length - 2]! - sSma[sSma.length - 2]!;
      const score = ao > 0 ? (ao > prevAo ? 0.8 : 0.45) : ao < 0 ? (ao < prevAo ? -0.8 : -0.45) : 0;
      return {
        id: 'awesome_oscillator',
        name: `Awesome Osc (${fast}/${slow})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: `${ao >= 0 ? '+' : ''}${ao.toFixed(2)}`,
        explanation: `AO at ${ao.toFixed(2)} (${ao > prevAo ? 'rising' : 'falling'}) relative to zero equilibrium.`,
        score,
      };
    }

    case 'trix': {
      const period = Math.max(4, Math.round(p.period ?? 15));
      if (closes.length < period * 3 + 2) return insufficient(period * 3 + 2);
      const e1 = emaArray(closes, period).filter((v): v is number => v != null);
      const e2 = emaArray(e1, period).filter((v): v is number => v != null);
      const e3 = emaArray(e2, period).filter((v): v is number => v != null);
      if (e3.length < 2) return insufficient(period * 3 + 2);
      const trix = ((e3[e3.length - 1] - e3[e3.length - 2]) / e3[e3.length - 2]) * 100;
      const score = trix > 0.005 ? 0.7 : trix < -0.005 ? -0.7 : 0;
      return {
        id: 'trix',
        name: `TRIX (${period})`,
        category: 'MOMENTUM',
        bias: biasFromScore(score),
        primaryValue: `${trix >= 0 ? '+' : ''}${trix.toFixed(4)}%`,
        explanation: `Triple-smoothed EMA slope is ${trix >= 0 ? 'positive' : 'negative'} (${trix.toFixed(4)}%).`,
        score,
      };
    }

    // ======================== VOLATILITY (4) ========================
    case 'bollinger_bands': {
      const period = Math.max(5, Math.round(p.period ?? 20));
      const stdDev = Number(p.stdDev ?? 2);
      const bb = bollingerArrays(closes, period, stdDev);
      const u = lastNonNull(bb.upper).value;
      const m = lastNonNull(bb.mid).value;
      const l = lastNonNull(bb.lower).value;
      if (u == null || m == null || l == null) return insufficient(period);
      const pctB = (lastClose - l) / (u - l || 1);
      const score = lastClose > m ? (pctB > 0.98 ? 0.25 : 0.55) : lastClose < m ? (pctB < 0.02 ? -0.25 : -0.55) : 0;
      return {
        id: 'bollinger_bands',
        name: `Bollinger Bands (${period}, ${stdDev})`,
        category: 'VOLATILITY',
        bias: biasFromScore(score),
        primaryValue: `$${l.toFixed(2)} – $${u.toFixed(2)}`,
        secondaryValues: { Middle: `$${m.toFixed(2)}`, '%B': `${(pctB * 100).toFixed(1)}%` },
        explanation: `Price sits in the ${lastClose >= m ? 'upper' : 'lower'} Bollinger half (Mid $${m.toFixed(2)}, Band $${l.toFixed(2)}–$${u.toFixed(2)}).`,
        score,
      };
    }

    case 'atr': {
      const period = Math.max(5, Math.round(p.period ?? 14));
      const arr = atrArray(candles, period);
      const { value, prev } = lastNonNull(arr);
      if (value == null) return insufficient(period + 1);
      const atrPct = (value / lastClose) * 100;
      return {
        id: 'atr',
        name: `ATR (${period})`,
        category: 'VOLATILITY',
        bias: 'HOLD',
        primaryValue: `$${value.toFixed(2)} (${atrPct.toFixed(2)}%)`,
        secondaryValues: { State: prev != null && value > prev ? 'Expanding' : 'Contracting' },
        explanation: `Average True Range is $${value.toFixed(2)} per bar (${atrPct.toFixed(2)}% of spot), indicating ${atrPct > 0.6 ? 'elevated' : 'moderate'} volatility.`,
        score: 0,
      };
    }

    case 'bollinger_width': {
      const period = Math.max(5, Math.round(p.period ?? 20));
      const stdDev = Number(p.stdDev ?? 2);
      const bb = bollingerArrays(closes, period, stdDev);
      const u = lastNonNull(bb.upper).value;
      const m = lastNonNull(bb.mid).value;
      const l = lastNonNull(bb.lower).value;
      if (u == null || m == null || l == null) return insufficient(period);
      const width = ((u - l) / m) * 100;
      return {
        id: 'bollinger_width',
        name: `Bollinger Width (${period})`,
        category: 'VOLATILITY',
        bias: 'HOLD',
        primaryValue: `${width.toFixed(2)}%`,
        explanation: `Band width of ${width.toFixed(2)}% measures ${width < 0.8 ? 'tight compression (breakout watch)' : 'normal/active volatility expansion'}.`,
        score: 0,
      };
    }

    case 'bollinger_pct_b': {
      const period = Math.max(5, Math.round(p.period ?? 20));
      const stdDev = Number(p.stdDev ?? 2);
      const bb = bollingerArrays(closes, period, stdDev);
      const u = lastNonNull(bb.upper).value;
      const l = lastNonNull(bb.lower).value;
      if (u == null || l == null) return insufficient(period);
      const pctB = (lastClose - l) / (u - l || 1);
      const score = pctB > 0.6 && pctB < 1.0 ? 0.55 : pctB < 0.4 && pctB > 0.0 ? -0.55 : 0;
      return {
        id: 'bollinger_pct_b',
        name: `Bollinger %B (${period})`,
        category: 'VOLATILITY',
        bias: biasFromScore(score),
        primaryValue: pctB.toFixed(3),
        explanation: `%B at ${pctB.toFixed(2)} places price ${pctB >= 1 ? 'above upper band' : pctB <= 0 ? 'below lower band' : 'within volatility envelope'}.`,
        score,
      };
    }

    // ======================== VOLUME (5) ========================
    case 'volume': {
      const maP = Math.max(5, Math.round(p.maPeriod ?? 20));
      if (candles.length < maP + 1) return insufficient(maP + 1);
      const { volumes, volumeType } = getEffectiveVolumes(candles);
      // If latest forming bar has 0 exchange volume, evaluate last completed bar with volume
      let evalIdx = candles.length - 1;
      if (volumeType === 'EXCHANGE' && volumes[evalIdx] === 0 && volumes[evalIdx - 1] > 0) {
        evalIdx = evalIdx - 1;
      }
      const volSma = smaArray(volumes, maP);
      const avgVol = volSma[evalIdx] ?? 1;
      const curVol = volumes[evalIdx];
      const ratio = avgVol > 0 ? curVol / avgVol : 1;
      const barUp = candles[evalIdx].close >= candles[evalIdx].open;
      const score = ratio >= 1.2 ? (barUp ? 0.6 : -0.6) : 0;
      return {
        id: 'volume',
        name: volumeType === 'TICK_PROXY' ? `Tick Volume (${maP})` : `Volume (${maP})`,
        category: 'VOLUME',
        bias: biasFromScore(score),
        primaryValue: `${curVol.toLocaleString()} (${ratio.toFixed(2)}x avg)`,
        volumeType,
        explanation: `${volumeType === 'TICK_PROXY' ? 'Centralized volume unavailable; tick/range activity proxy' : 'COMEX GC=F exchange volume'} is ${ratio.toFixed(2)}x its ${maP}-bar average on a ${barUp ? 'bullish' : 'bearish'} bar.`,
        score,
      };
    }

    case 'obv': {
      const sigP = Math.max(5, Math.round(p.emaPeriod ?? 20));
      if (candles.length < sigP + 2) return insufficient(sigP + 2);
      const { volumes, volumeType } = getEffectiveVolumes(candles);
      const obv: number[] = [0];
      for (let i = 1; i < candles.length; i++) {
        if (candles[i].close > candles[i - 1].close) obv.push(obv[i - 1] + volumes[i]);
        else if (candles[i].close < candles[i - 1].close) obv.push(obv[i - 1] - volumes[i]);
        else obv.push(obv[i - 1]);
      }
      const emaObv = emaArray(obv, sigP);
      const lastObv = obv[obv.length - 1];
      const lastSig = lastNonNull(emaObv).value;
      if (lastSig == null) return insufficient(sigP + 2);
      const score = lastObv > lastSig ? 0.65 : lastObv < lastSig ? -0.65 : 0;
      return {
        id: 'obv',
        name: volumeType === 'TICK_PROXY' ? 'OBV (Tick Proxy)' : 'OBV',
        category: 'VOLUME',
        bias: biasFromScore(score),
        primaryValue: lastObv.toLocaleString(),
        volumeType,
        explanation: `OBV (${lastObv.toLocaleString()}) tracks ${lastObv >= lastSig ? 'above' : 'below'} its ${sigP}-EMA (${Math.round(lastSig).toLocaleString()}) using ${volumeType === 'TICK_PROXY' ? 'tick proxy' : 'exchange volume'}.`,
        score,
      };
    }

    case 'mfi': {
      const period = Math.max(5, Math.round(p.period ?? 14));
      if (candles.length < period + 2) return insufficient(period + 2);
      const { volumes, volumeType } = getEffectiveVolumes(candles);
      let posMF = 0;
      let negMF = 0;
      const start = candles.length - period;
      for (let i = start; i < candles.length; i++) {
        const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
        const prevTp = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
        const mf = tp * (volumes[i] > 0 ? volumes[i] : 1);
        if (tp > prevTp) posMF += mf;
        else if (tp < prevTp) negMF += mf;
      }
      const mfi = negMF === 0 ? 100 : 100 - 100 / (1 + posMF / negMF);
      const score = mfi > 80 ? -0.45 : mfi < 20 ? 0.45 : mfi > 55 ? 0.55 : mfi < 45 ? -0.55 : 0;
      return {
        id: 'mfi',
        name: volumeType === 'TICK_PROXY' ? `MFI (${period}) [Tick]` : `MFI (${period})`,
        category: 'VOLUME',
        bias: biasFromScore(score),
        primaryValue: mfi.toFixed(1),
        volumeType,
        explanation: `Money Flow Index at ${mfi.toFixed(1)} reflects ${mfi > 55 ? 'net inflow' : mfi < 45 ? 'net outflow' : 'balanced flow'} (${volumeType === 'TICK_PROXY' ? 'tick proxy' : 'exchange volume'}).`,
        score,
      };
    }

    case 'cmf': {
      const period = Math.max(5, Math.round(p.period ?? 20));
      if (candles.length < period) return insufficient(period);
      const slice = candles.slice(-period);
      const { volumes, volumeType } = getEffectiveVolumes(slice);
      let mfvSum = 0;
      let vSum = 0;
      for (let i = 0; i < slice.length; i++) {
        const c = slice[i];
        const range = c.high - c.low;
        const mfm = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
        const v = volumes[i];
        mfvSum += mfm * v;
        vSum += v;
      }
      const cmf = vSum === 0 ? 0 : mfvSum / vSum;
      const score = cmf > 0.08 ? 0.7 : cmf < -0.08 ? -0.7 : 0;
      return {
        id: 'cmf',
        name: volumeType === 'TICK_PROXY' ? `CMF (${period}) [Tick]` : `CMF (${period})`,
        category: 'VOLUME',
        bias: biasFromScore(score),
        primaryValue: `${cmf >= 0 ? '+' : ''}${cmf.toFixed(3)}`,
        volumeType,
        explanation: `Chaikin Money Flow at ${cmf.toFixed(3)} shows ${cmf > 0.08 ? 'accumulation buying pressure' : cmf < -0.08 ? 'distribution selling pressure' : 'neutral volume balance'}.`,
        score,
      };
    }

    case 'ad_line': {
      const sigP = Math.max(5, Math.round(p.emaPeriod ?? 20));
      if (candles.length < sigP + 2) return insufficient(sigP + 2);
      const { volumes, volumeType } = getEffectiveVolumes(candles);
      const ad: number[] = [];
      let running = 0;
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const range = c.high - c.low;
        const mfm = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
        running += mfm * volumes[i];
        ad.push(running);
      }
      const sigArr = emaArray(ad, sigP);
      const lastAd = ad[ad.length - 1];
      const lastSig = lastNonNull(sigArr).value;
      if (lastSig == null) return insufficient(sigP + 2);
      const score = lastAd > lastSig ? 0.65 : lastAd < lastSig ? -0.65 : 0;
      return {
        id: 'ad_line',
        name: volumeType === 'TICK_PROXY' ? 'A/D Line [Tick]' : 'A/D Line',
        category: 'VOLUME',
        bias: biasFromScore(score),
        primaryValue: Math.round(lastAd).toLocaleString(),
        volumeType,
        explanation: `Accumulation/Distribution line sits ${lastAd >= lastSig ? 'above' : 'below'} its ${sigP}-bar signal EMA (${volumeType === 'TICK_PROXY' ? 'tick proxy' : 'exchange volume'}).`,
        score,
      };
    }
  }
}

export function computeChartOverlays(
  candles: Candle[],
  selectedIndicators: SelectedIndicatorConfig[]
): ChartOverlaySeries[] {
  const overlays: ChartOverlaySeries[] = [];
  const closes = candles.map((c) => c.close);

  const toPoints = (arr: Array<number | null>) =>
    candles
      .map((c, idx) => (arr[idx] != null && Number.isFinite(arr[idx]) ? { time: c.time, value: Number(arr[idx]!.toFixed(2)) } : null))
      .filter((pt): pt is { time: number; value: number } => pt !== null);

  for (const cfg of selectedIndicators) {
    if (!cfg.enabled) continue;
    const p = cfg.params;

    switch (cfg.id) {
      case 'ema': {
        const period = Math.max(2, Math.round(p.period ?? 20));
        overlays.push({
          id: `ema-${period}`,
          indicatorId: 'ema',
          label: `EMA ${period}`,
          color: '#F5D061',
          lineWidth: 2,
          data: toPoints(emaArray(closes, period)),
        });
        break;
      }
      case 'sma': {
        const period = Math.max(2, Math.round(p.period ?? 50));
        overlays.push({
          id: `sma-${period}`,
          indicatorId: 'sma',
          label: `SMA ${period}`,
          color: '#60A5FA',
          lineWidth: 2,
          data: toPoints(smaArray(closes, period)),
        });
        break;
      }
      case 'wma': {
        const period = Math.max(2, Math.round(p.period ?? 20));
        overlays.push({
          id: `wma-${period}`,
          indicatorId: 'wma',
          label: `WMA ${period}`,
          color: '#A78BFA',
          lineWidth: 1,
          data: toPoints(wmaArray(closes, period)),
        });
        break;
      }
      case 'ma_cross': {
        const fast = Math.max(2, Math.round(p.fast ?? 9));
        const slow = Math.max(fast + 1, Math.round(p.slow ?? 21));
        overlays.push({
          id: `mac-fast-${fast}`,
          indicatorId: 'ma_cross',
          label: `EMA ${fast}`,
          color: '#34D399',
          lineWidth: 1,
          data: toPoints(emaArray(closes, fast)),
        });
        overlays.push({
          id: `mac-slow-${slow}`,
          indicatorId: 'ma_cross',
          label: `EMA ${slow}`,
          color: '#F87171',
          lineWidth: 1,
          data: toPoints(emaArray(closes, slow)),
        });
        break;
      }
      case 'supertrend': {
        const period = Math.max(5, Math.round(p.period ?? 10));
        const mult = Number(p.multiplier ?? 3);
        const { line } = supertrendSeries(candles, period, mult);
        overlays.push({
          id: 'supertrend',
          indicatorId: 'supertrend',
          label: `Supertrend (${period},${mult})`,
          color: '#F59E0B',
          lineWidth: 2,
          data: toPoints(line),
        });
        break;
      }
      case 'bollinger_bands': {
        const period = Math.max(5, Math.round(p.period ?? 20));
        const stdDev = Number(p.stdDev ?? 2);
        const bb = bollingerArrays(closes, period, stdDev);
        overlays.push({
          id: 'bb-upper',
          indicatorId: 'bollinger_bands',
          label: 'BB Upper',
          color: 'rgba(212, 175, 55, 0.55)',
          lineStyle: 'dashed',
          lineWidth: 1,
          data: toPoints(bb.upper),
        });
        overlays.push({
          id: 'bb-lower',
          indicatorId: 'bollinger_bands',
          label: 'BB Lower',
          color: 'rgba(212, 175, 55, 0.55)',
          lineStyle: 'dashed',
          lineWidth: 1,
          data: toPoints(bb.lower),
        });
        break;
      }
      case 'parabolic_sar': {
        const step = Number(p.step ?? 0.02);
        const max = Number(p.max ?? 0.2);
        const { sar } = psarSeries(candles, step, max);
        overlays.push({
          id: 'psar',
          indicatorId: 'parabolic_sar',
          label: 'PSAR',
          color: '#E879F9',
          lineStyle: 'dotted',
          lineWidth: 2,
          data: toPoints(sar),
        });
        break;
      }
      case 'vwap': {
        const lookback = Math.max(10, Math.round(p.lookback ?? 48));
        const { volumes } = getEffectiveVolumes(candles);
        const vwapArr: Array<number | null> = new Array(candles.length).fill(null);
        for (let i = 0; i < candles.length; i++) {
          const start = Math.max(0, i - lookback + 1);
          let pv = 0;
          let vs = 0;
          for (let j = start; j <= i; j++) {
            const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
            const v = volumes[j] > 0 ? volumes[j] : 1;
            pv += tp * v;
            vs += v;
          }
          vwapArr[i] = pv / vs;
        }
        overlays.push({
          id: 'vwap',
          indicatorId: 'vwap',
          label: 'VWAP',
          color: '#38BDF8',
          lineWidth: 2,
          data: toPoints(vwapArr),
        });
        break;
      }
      case 'ichimoku': {
        const tP = Math.max(5, Math.round(p.tenkan ?? 9));
        const kP = Math.max(10, Math.round(p.kijun ?? 26));
        const midHL = (idx: number, len: number) => {
          if (idx < len - 1) return null;
          let hi = -Infinity;
          let lo = Infinity;
          for (let j = idx - len + 1; j <= idx; j++) {
            if (candles[j].high > hi) hi = candles[j].high;
            if (candles[j].low < lo) lo = candles[j].low;
          }
          return (hi + lo) / 2;
        };
        const tenkanArr = candles.map((_, i) => midHL(i, tP));
        const kijunArr = candles.map((_, i) => midHL(i, kP));
        overlays.push({
          id: 'ichi-tenkan',
          indicatorId: 'ichimoku',
          label: 'Tenkan',
          color: '#2DD4BF',
          lineWidth: 1,
          data: toPoints(tenkanArr),
        });
        overlays.push({
          id: 'ichi-kijun',
          indicatorId: 'ichimoku',
          label: 'Kijun',
          color: '#FB7185',
          lineWidth: 1,
          data: toPoints(kijunArr),
        });
        break;
      }
      case 'alligator': {
        const medians = candles.map((c) => (c.high + c.low) / 2);
        overlays.push({
          id: 'alli-jaw',
          indicatorId: 'alligator',
          label: 'Jaw',
          color: '#3B82F6',
          lineWidth: 1,
          data: toPoints(smmaArray(medians, Math.round(p.jaw ?? 13))),
        });
        overlays.push({
          id: 'alli-teeth',
          indicatorId: 'alligator',
          label: 'Teeth',
          color: '#EF4444',
          lineWidth: 1,
          data: toPoints(smmaArray(medians, Math.round(p.teeth ?? 8))),
        });
        overlays.push({
          id: 'alli-lips',
          indicatorId: 'alligator',
          label: 'Lips',
          color: '#22C55E',
          lineWidth: 1,
          data: toPoints(smmaArray(medians, Math.round(p.lips ?? 5))),
        });
        break;
      }
      case 'pivot_points': {
        const lookback = Math.max(10, Math.round(p.lookback ?? 24));
        if (candles.length >= lookback * 2) {
          const anchor = candles.slice(-lookback * 2, -lookback);
          const H = Math.max(...anchor.map((c) => c.high));
          const L = Math.min(...anchor.map((c) => c.low));
          const C = anchor[anchor.length - 1].close;
          const P = (H + L + C) / 3;
          const R1 = 2 * P - L;
          const S1 = 2 * P - H;
          const recent = candles.slice(-lookback);
          overlays.push({
            id: 'pivot-p',
            indicatorId: 'pivot_points',
            label: 'Pivot P',
            color: '#D4AF37',
            lineStyle: 'dotted',
            lineWidth: 1,
            data: recent.map((c) => ({ time: c.time, value: Number(P.toFixed(2)) })),
          });
          overlays.push({
            id: 'pivot-r1',
            indicatorId: 'pivot_points',
            label: 'Pivot R1',
            color: '#EF4444',
            lineStyle: 'dotted',
            lineWidth: 1,
            data: recent.map((c) => ({ time: c.time, value: Number(R1.toFixed(2)) })),
          });
          overlays.push({
            id: 'pivot-s1',
            indicatorId: 'pivot_points',
            label: 'Pivot S1',
            color: '#10B981',
            lineStyle: 'dotted',
            lineWidth: 1,
            data: recent.map((c) => ({ time: c.time, value: Number(S1.toFixed(2)) })),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return overlays;
}
