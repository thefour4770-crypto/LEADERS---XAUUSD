import type {
  IndicatorDefinition,
  IndicatorId,
  SelectedIndicatorConfig,
  Timeframe,
} from '../types/market.ts';

export const MANDATORY_STRATEGY_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1H'];
export const AUTO_PERFECT_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1H'];

export const AUTO_PERFECT_INDICATOR_IDS: IndicatorId[] = [
  'ema',
  'sma',
  'supertrend',
  'adx',
  'dmi',
  'rsi',
  'macd',
  'bollinger_bands',
  'atr',
  'volume',
  'obv',
];

export const INDICATOR_CATALOG: IndicatorDefinition[] = [
  // ======================== TREND (13) ========================
  {
    id: 'ema',
    name: 'EMA',
    category: 'TREND',
    description: 'Exponential Moving Average weighted toward recent price action.',
    overlayOnChart: true,
    defaultEnabled: true,
    paramSpecs: [{ key: 'period', label: 'Period', min: 2, max: 200, step: 1, defaultValue: 20 }],
  },
  {
    id: 'sma',
    name: 'SMA',
    category: 'TREND',
    description: 'Simple Moving Average over closing prices.',
    overlayOnChart: true,
    defaultEnabled: true,
    paramSpecs: [{ key: 'period', label: 'Period', min: 2, max: 200, step: 1, defaultValue: 50 }],
  },
  {
    id: 'wma',
    name: 'WMA',
    category: 'TREND',
    description: 'Weighted Moving Average emphasizing newer candles linearly.',
    overlayOnChart: true,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 2, max: 200, step: 1, defaultValue: 20 }],
  },
  {
    id: 'ma_cross',
    name: 'MA Cross',
    category: 'TREND',
    description: 'Fast and slow EMA crossover directional trend detector.',
    overlayOnChart: true,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'fast', label: 'Fast Period', min: 2, max: 100, step: 1, defaultValue: 9 },
      { key: 'slow', label: 'Slow Period', min: 5, max: 250, step: 1, defaultValue: 21 },
    ],
  },
  {
    id: 'supertrend',
    name: 'Supertrend',
    category: 'TREND',
    description: 'ATR-based dynamic trend-following stop and direction band.',
    overlayOnChart: true,
    defaultEnabled: true,
    paramSpecs: [
      { key: 'period', label: 'ATR Period', min: 5, max: 50, step: 1, defaultValue: 10 },
      { key: 'multiplier', label: 'Multiplier', min: 1, max: 6, step: 0.5, defaultValue: 3 },
    ],
  },
  {
    id: 'ichimoku',
    name: 'Ichimoku Cloud',
    category: 'TREND',
    description: 'Tenkan, Kijun, and Senkou Span equilibrium trend system.',
    overlayOnChart: true,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'tenkan', label: 'Tenkan', min: 5, max: 30, step: 1, defaultValue: 9 },
      { key: 'kijun', label: 'Kijun', min: 10, max: 60, step: 1, defaultValue: 26 },
      { key: 'senkouB', label: 'Senkou B', min: 20, max: 120, step: 1, defaultValue: 52 },
    ],
  },
  {
    id: 'parabolic_sar',
    name: 'Parabolic SAR',
    category: 'TREND',
    description: 'Stop and Reverse trailing trend inflection points.',
    overlayOnChart: true,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'step', label: 'Step', min: 0.01, max: 0.1, step: 0.01, defaultValue: 0.02 },
      { key: 'max', label: 'Max Step', min: 0.1, max: 0.5, step: 0.05, defaultValue: 0.2 },
    ],
  },
  {
    id: 'vwap',
    name: 'VWAP',
    category: 'TREND',
    description: 'Volume Weighted Average Price benchmark across active session.',
    overlayOnChart: true,
    defaultEnabled: false,
    paramSpecs: [{ key: 'lookback', label: 'Session Bars', min: 10, max: 200, step: 5, defaultValue: 48 }],
  },
  {
    id: 'pivot_points',
    name: 'Pivot Points',
    category: 'TREND',
    description: 'Classic floor pivot equilibrium and R1/R2/S1/S2 reference levels.',
    overlayOnChart: true,
    defaultEnabled: false,
    paramSpecs: [{ key: 'lookback', label: 'Anchor Bars', min: 12, max: 100, step: 4, defaultValue: 24 }],
  },
  {
    id: 'alligator',
    name: 'Alligator',
    category: 'TREND',
    description: 'Williams smoothed moving averages (Jaw 13, Teeth 8, Lips 5).',
    overlayOnChart: true,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'jaw', label: 'Jaw', min: 8, max: 30, step: 1, defaultValue: 13 },
      { key: 'teeth', label: 'Teeth', min: 5, max: 20, step: 1, defaultValue: 8 },
      { key: 'lips', label: 'Lips', min: 3, max: 15, step: 1, defaultValue: 5 },
    ],
  },
  {
    id: 'adx',
    name: 'ADX',
    category: 'TREND',
    description: 'Average Directional Index measuring trend intensity (non-directional).',
    overlayOnChart: false,
    defaultEnabled: true,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 50, step: 1, defaultValue: 14 }],
  },
  {
    id: 'dmi',
    name: 'DMI',
    category: 'TREND',
    description: 'Directional Movement Index comparing +DI and -DI buyer/seller pressure.',
    overlayOnChart: false,
    defaultEnabled: true,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 50, step: 1, defaultValue: 14 }],
  },
  {
    id: 'aroon',
    name: 'Aroon',
    category: 'TREND',
    description: 'Measures time since highest high and lowest low within lookback.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 60, step: 1, defaultValue: 25 }],
  },

  // ======================== MOMENTUM (10) ========================
  {
    id: 'rsi',
    name: 'RSI',
    category: 'MOMENTUM',
    description: 'Relative Strength Index oscillator (0–100) for overbought/oversold balance.',
    overlayOnChart: false,
    defaultEnabled: true,
    paramSpecs: [
      { key: 'period', label: 'Period', min: 5, max: 50, step: 1, defaultValue: 14 },
      { key: 'overbought', label: 'Overbought', min: 60, max: 85, step: 1, defaultValue: 70 },
      { key: 'oversold', label: 'Oversold', min: 15, max: 40, step: 1, defaultValue: 30 },
    ],
  },
  {
    id: 'macd',
    name: 'MACD',
    category: 'MOMENTUM',
    description: 'Moving Average Convergence Divergence histogram and signal cross.',
    overlayOnChart: false,
    defaultEnabled: true,
    paramSpecs: [
      { key: 'fast', label: 'Fast EMA', min: 4, max: 30, step: 1, defaultValue: 12 },
      { key: 'slow', label: 'Slow EMA', min: 10, max: 60, step: 1, defaultValue: 26 },
      { key: 'signal', label: 'Signal', min: 3, max: 20, step: 1, defaultValue: 9 },
    ],
  },
  {
    id: 'stochastic',
    name: 'Stochastic',
    category: 'MOMENTUM',
    description: 'Stochastic %K and %D close location oscillator.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'kPeriod', label: '%K Period', min: 5, max: 30, step: 1, defaultValue: 14 },
      { key: 'dPeriod', label: '%D Period', min: 2, max: 10, step: 1, defaultValue: 3 },
      { key: 'smooth', label: 'Smooth', min: 1, max: 10, step: 1, defaultValue: 3 },
    ],
  },
  {
    id: 'stoch_rsi',
    name: 'Stochastic RSI',
    category: 'MOMENTUM',
    description: 'Stochastic normalization applied directly to RSI readings.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'rsiPeriod', label: 'RSI Period', min: 5, max: 30, step: 1, defaultValue: 14 },
      { key: 'stochPeriod', label: 'Stoch Period', min: 5, max: 30, step: 1, defaultValue: 14 },
    ],
  },
  {
    id: 'cci',
    name: 'CCI',
    category: 'MOMENTUM',
    description: 'Commodity Channel Index deviation from statistical mean price.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 60, step: 1, defaultValue: 20 }],
  },
  {
    id: 'williams_r',
    name: 'Williams %R',
    category: 'MOMENTUM',
    description: 'Close position relative to lookback high-low range (-100 to 0).',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 50, step: 1, defaultValue: 14 }],
  },
  {
    id: 'momentum',
    name: 'Momentum',
    category: 'MOMENTUM',
    description: 'Net price velocity difference over lookback periods.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 2, max: 50, step: 1, defaultValue: 10 }],
  },
  {
    id: 'roc',
    name: 'ROC',
    category: 'MOMENTUM',
    description: 'Percentage Rate of Change over lookback window.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 2, max: 50, step: 1, defaultValue: 12 }],
  },
  {
    id: 'awesome_oscillator',
    name: 'Awesome Oscillator',
    category: 'MOMENTUM',
    description: 'Difference between 5-period and 34-period median price SMAs.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'fast', label: 'Fast', min: 3, max: 15, step: 1, defaultValue: 5 },
      { key: 'slow', label: 'Slow', min: 15, max: 60, step: 1, defaultValue: 34 },
    ],
  },
  {
    id: 'trix',
    name: 'TRIX',
    category: 'MOMENTUM',
    description: 'Triple-smoothed EMA rate of change filtering minor noise.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 40, step: 1, defaultValue: 15 }],
  },

  // ======================== VOLATILITY (4) ========================
  {
    id: 'bollinger_bands',
    name: 'Bollinger Bands',
    category: 'VOLATILITY',
    description: 'Standard deviation volatility envelope around moving average.',
    overlayOnChart: true,
    defaultEnabled: true,
    paramSpecs: [
      { key: 'period', label: 'Period', min: 5, max: 60, step: 1, defaultValue: 20 },
      { key: 'stdDev', label: 'Std Dev', min: 1, max: 4, step: 0.5, defaultValue: 2 },
    ],
  },
  {
    id: 'atr',
    name: 'ATR',
    category: 'VOLATILITY',
    description: 'Average True Range measuring absolute price volatility per candle.',
    overlayOnChart: false,
    defaultEnabled: true,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 50, step: 1, defaultValue: 14 }],
  },
  {
    id: 'bollinger_width',
    name: 'Bollinger Width',
    category: 'VOLATILITY',
    description: 'Normalized band spread identifying compression or expansion.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'period', label: 'Period', min: 5, max: 60, step: 1, defaultValue: 20 },
      { key: 'stdDev', label: 'Std Dev', min: 1, max: 4, step: 0.5, defaultValue: 2 },
    ],
  },
  {
    id: 'bollinger_pct_b',
    name: 'Bollinger %B',
    category: 'VOLATILITY',
    description: 'Price position normalized between lower (0) and upper (1) bands.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [
      { key: 'period', label: 'Period', min: 5, max: 60, step: 1, defaultValue: 20 },
      { key: 'stdDev', label: 'Std Dev', min: 1, max: 4, step: 0.5, defaultValue: 2 },
    ],
  },

  // ======================== VOLUME (5) ========================
  {
    id: 'volume',
    name: 'Volume',
    category: 'VOLUME',
    description: 'Candle volume vs moving average (labeled Exchange or Tick Proxy).',
    overlayOnChart: true,
    defaultEnabled: true,
    paramSpecs: [{ key: 'maPeriod', label: 'MA Period', min: 5, max: 60, step: 1, defaultValue: 20 }],
  },
  {
    id: 'obv',
    name: 'OBV',
    category: 'VOLUME',
    description: 'On-Balance Volume cumulative directional flow vs EMA.',
    overlayOnChart: false,
    defaultEnabled: true,
    paramSpecs: [{ key: 'emaPeriod', label: 'Signal EMA', min: 5, max: 50, step: 1, defaultValue: 20 }],
  },
  {
    id: 'mfi',
    name: 'MFI',
    category: 'VOLUME',
    description: 'Money Flow Index volume-weighted RSI oscillator (0–100).',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 40, step: 1, defaultValue: 14 }],
  },
  {
    id: 'cmf',
    name: 'Chaikin Money Flow',
    category: 'VOLUME',
    description: 'Volume-weighted accumulation/distribution pressure over lookback.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'period', label: 'Period', min: 5, max: 50, step: 1, defaultValue: 20 }],
  },
  {
    id: 'ad_line',
    name: 'Accumulation / Distribution',
    category: 'VOLUME',
    description: 'Cumulative money flow multiplier line measuring buying/selling flow.',
    overlayOnChart: false,
    defaultEnabled: false,
    paramSpecs: [{ key: 'emaPeriod', label: 'Signal EMA', min: 5, max: 50, step: 1, defaultValue: 20 }],
  },
];

export function createDefaultIndicators(): SelectedIndicatorConfig[] {
  return INDICATOR_CATALOG.map((def) => {
    const params: Record<string, number> = {};
    for (const spec of def.paramSpecs) {
      params[spec.key] = spec.defaultValue;
    }
    return {
      id: def.id,
      enabled: def.defaultEnabled,
      params,
    };
  });
}

export function createAutoPerfectIndicators(): SelectedIndicatorConfig[] {
  const autoSet = new Set<IndicatorId>(AUTO_PERFECT_INDICATOR_IDS);
  return INDICATOR_CATALOG.map((def) => {
    const params: Record<string, number> = {};
    for (const spec of def.paramSpecs) {
      params[spec.key] = spec.defaultValue;
    }
    return {
      id: def.id,
      enabled: autoSet.has(def.id),
      params,
    };
  });
}

export function isAutoPerfectPresetSelected(
  timeframes: Timeframe[],
  indicators: SelectedIndicatorConfig[]
): boolean {
  if (timeframes.length !== AUTO_PERFECT_TIMEFRAMES.length) return false;
  const tfMatch = AUTO_PERFECT_TIMEFRAMES.every((tf) => timeframes.includes(tf));
  if (!tfMatch) return false;

  const autoSet = new Set<IndicatorId>(AUTO_PERFECT_INDICATOR_IDS);
  const enabledIds = indicators.filter((i) => i.enabled).map((i) => i.id);
  if (enabledIds.length !== autoSet.size) return false;
  return enabledIds.every((id) => autoSet.has(id));
}
