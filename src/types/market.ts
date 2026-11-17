export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | '1W';

export const ALL_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W'];

export type IndicatorCategory = 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'VOLUME';

export type IndicatorId =
  // TREND (13)
  | 'ema'
  | 'sma'
  | 'wma'
  | 'ma_cross'
  | 'supertrend'
  | 'ichimoku'
  | 'parabolic_sar'
  | 'vwap'
  | 'pivot_points'
  | 'alligator'
  | 'adx'
  | 'dmi'
  | 'aroon'
  // MOMENTUM (10)
  | 'rsi'
  | 'macd'
  | 'stochastic'
  | 'stoch_rsi'
  | 'cci'
  | 'williams_r'
  | 'momentum'
  | 'roc'
  | 'awesome_oscillator'
  | 'trix'
  // VOLATILITY (4)
  | 'bollinger_bands'
  | 'atr'
  | 'bollinger_width'
  | 'bollinger_pct_b'
  // VOLUME (5)
  | 'volume'
  | 'obv'
  | 'mfi'
  | 'cmf'
  | 'ad_line';

export type SignalClassification = 'BUY' | 'SELL' | 'HOLD';
export type FreshnessStatus = 'LIVE' | 'DELAYED' | 'UNAVAILABLE';

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface IndicatorDefinition {
  id: IndicatorId;
  name: string;
  category: IndicatorCategory;
  description: string;
  overlayOnChart: boolean;
  defaultEnabled: boolean;
  paramSpecs: ParamSpec[];
}

export interface SelectedIndicatorConfig {
  id: IndicatorId;
  enabled: boolean;
  params: Record<string, number>;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketQuote {
  symbol: 'XAU/USD';
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  timestamp: number; // unix ms
  freshness: FreshnessStatus;
  source: string;
  previousClose?: number;
  changeAbs?: number;
  changePct?: number;
}

export interface CandleDataset {
  symbol: string;
  candleSource: string;
  timeframe: Timeframe;
  candles: Candle[];
  latestTimestamp: number; // unix ms
  freshness: FreshnessStatus;
  hasExchangeVolume: boolean;
  nonZeroVolumeRatio: number;
  volumeNote: string;
}

export interface ChartOverlayPoint {
  time: number;
  value: number;
}

export interface ChartOverlaySeries {
  id: string;
  indicatorId: IndicatorId;
  label: string;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  data: ChartOverlayPoint[];
}

export interface IndicatorResult {
  id: IndicatorId;
  name: string;
  category: IndicatorCategory;
  bias: SignalClassification;
  primaryValue: string;
  secondaryValues?: Record<string, string | number>;
  explanation: string;
  score: number; // -1 to +1
  volumeType?: 'EXCHANGE' | 'TICK_PROXY' | 'UNAVAILABLE';
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  classification: SignalClassification;
  candleCount: number;
  latestClose: number;
  latestTimestamp: number; // unix ms
  freshness: 'LIVE' | 'DELAYED';
  candleSource: string;
  volumeNote: string;
  combinedScore: number; // -1 to +1
  trendScore: number;
  momentumScore: number;
  volatilityState: string;
  volumeState: string;
  supportLevels: number[];
  resistanceLevels: number[];
  indicatorResults: IndicatorResult[];
  agreements: string[];
  conflicts: string[];
  summary: string;
}

export interface AnalysisReport {
  id: string;
  createdAt: string; // ISO timestamp
  marketDataTimestamp: number; // unix ms
  freshness: 'LIVE' | 'DELAYED';
  spotPrice: number;
  spotBid: number;
  spotAsk: number;
  spotSource: string;
  candleSource: string;
  classification: SignalClassification;
  combinedScore: number;
  selectedTimeframes: Timeframe[];
  selectedIndicators: {
    id: IndicatorId;
    name: string;
    category: IndicatorCategory;
    params: Record<string, number>;
  }[];
  timeframeAnalyses: TimeframeAnalysis[];
  combinedMethodology: string;
  reasons: string[];
  agreements: string[];
  conflicts: string[];
  supportLevels: number[];
  resistanceLevels: number[];
  shortVsLongComparison: string;
  uncertaintyExplanation: string;
  tradeLevels?: TradeLevelsAnalysis;
  signalQualityChecks?: SignalGateCheck[];
}

export interface SignalGateCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface TradeLevelsAnalysis {
  referencePrice: number;
  atrValue: number;
  referenceTimeframe: Timeframe;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskPoints: number;
  rewardRiskRatio1: string;
  rewardRiskRatio2: string;
  methodology: string;
}

export interface MarketSentiment24h {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  directionalTrendPct: number;
  bullishSharePct: number;
  bearishSharePct: number;
  priceChange24hPct: number;
  avgHourlyVolatilityUsd: number;
  latestHourlyAtrUsd: number;
  volatilityRegime: 'EXPANDING' | 'MODERATE' | 'COMPRESSED';
  upHours: number;
  downHours: number;
  hoursAnalyzed: number;
  latestTimestamp: number;
  freshness: FreshnessStatus;
  source: string;
}
