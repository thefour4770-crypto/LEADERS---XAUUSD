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
  confidencePct?: number; // 0 to 100
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

export interface SignalConfidenceBreakdown {
  scorePct: number; // 0 to 100
  tier: 'HIGH' | 'MODERATE' | 'LOW';
  agreeingVotes: number;
  opposingVotes: number;
  neutralVotes: number;
  totalVotes: number;
  buyVotes: number;
  sellVotes: number;
  holdVotes: number;
  alignedTimeframes: number;
  totalTimeframes: number;
  summary: string;
}

export type SetupScoreCategory = 'STRONG SIGNAL' | 'VALID SIGNAL' | 'WAIT' | 'NO TRADE';
export type StrictSignalAction = 'BUY' | 'SELL' | 'WAIT' | 'NO TRADE';

export interface ScoreBreakdownItem {
  category: string;
  score: number;
  maxScore: number;
  detail: string;
  passed: boolean;
}

export interface FeedIntegrityReport {
  valid: boolean;
  spotSource: string;
  candleSource: string;
  priceBasis: string;
  spotPrice: number | null;
  futuresPrice: number | null;
  basisDiffUsd: number | null;
  basisDiffPct: number | null;
  spreadUsd: number | null;
  spreadAcceptable: boolean;
  staleFeeds: string[];
  ohlcErrors: string[];
  gapWarnings: string[];
  closedCandlesVerified: boolean;
  blockingReasons: string[];
}

export interface Trend1HSummary {
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  emaAlignment: string;
  smaAlignment: string;
  supertrendDir: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  adxValue: number | null;
  plusDI: number | null;
  minusDI: number | null;
  summary: string;
}

export interface Structure15MSummary {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bosDetected: 'BULLISH' | 'BEARISH' | 'NONE';
  chochDetected: 'BULLISH' | 'BEARISH' | 'NONE';
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  agreesWith1H: boolean;
  rsiValue: number | null;
  macdHist: number | null;
  bollingerContext: string;
  summary: string;
}

export interface Setup5MSummary {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  liquiditySweep: 'BULLISH_SWEEP' | 'BEARISH_SWEEP' | 'NONE';
  retestConfirmed: boolean;
  nearestSupport: number | null;
  nearestResistance: number | null;
  demandZone: [number, number] | null;
  supplyZone: [number, number] | null;
  volatilityRegime: 'VALID' | 'TOO_LOW' | 'TOO_HIGH';
  atrValue: number | null;
  volumeConfirmed: boolean;
  obvAligned: boolean;
  setupComplete: boolean;
  summary: string;
}

export interface Confirmation1MSummary {
  direction: 'BUY' | 'SELL' | 'WAIT';
  closedCandleTime: number | null;
  closedCandleBullish: boolean | null;
  emaAligned: boolean;
  supertrendAligned: boolean;
  rsiMomentumOk: boolean;
  macdMomentumOk: boolean;
  dmiAligned: boolean;
  volumeOk: boolean;
  confirmed: boolean;
  summary: string;
}

export interface StrictStrategyEvaluation {
  mode: 'ANALYSIS' | 'SURE';
  action: StrictSignalAction;
  direction: 'BUY' | 'SELL' | 'NONE';
  totalScore: number; // 0 to 100
  scoreCategory: SetupScoreCategory;
  scoreBreakdown: ScoreBreakdownItem[];
  overallDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend1H: Trend1HSummary;
  structure15M: Structure15MSummary;
  setup5M: Setup5MSummary;
  confirmation1M: Confirmation1MSummary;
  all11Indicators: IndicatorResult[];
  mandatoryGates: SignalGateCheck[];
  confirmations: string[];
  blockers: string[];
  generatedAt: string;
  validUntil: string;
  feedIntegrity: FeedIntegrityReport;
  newsProtection?: NewsProtectionState;
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
  signalConfidence?: SignalConfidenceBreakdown;
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
  strategyEvaluation?: StrictStrategyEvaluation;
  newsProtection?: NewsProtectionState;
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

export interface SureSignalCheckItem {
  label: string;
  passed: boolean;
  detail: string;
}

export type SureSignalStatus = 'ACTIVE' | 'TP_HIT' | 'SL_HIT' | 'AMBIGUOUS';

export interface SureSignalEntry {
  id: string;
  createdAt: string; // ISO timestamp
  direction: 'BUY' | 'SELL';
  spotPrice: number;
  confidencePct: number;
  combinedScore: number;
  setupScore: number; // 0 to 100 strict setup score
  scoreCategory: SetupScoreCategory;
  adxValue: number;
  timeframes: Timeframe[];
  tradeLevels: TradeLevelsAnalysis;
  riskRewardRatio: string;
  summary: string;
  checks: SureSignalCheckItem[];
  status: SureSignalStatus;
  closedAt?: string;
  closePrice?: number;
  pnlPoints?: number;
  durationMs?: number;
  lastCheckedAt?: string;
  lastCheckedPrice?: number;
}

export interface SureHistoryStats {
  totalSignals: number;
  tpHits: number;
  slHits: number;
  ambiguousOutcomes: number;
  activeSignals: number;
  winRatePct: number | null;
  avgRiskReward: number | null;
  avgDurationMs: number | null;
}

export interface SureSignalScanStatus {
  scanning: boolean;
  tradeLocked: boolean;
  lastScannedAt: string | null;
  nextScanAt: string | null;
  scanIntervalMs: number;
  monitoringMode: 'REALTIME_SPOT_BBO' | 'DELAYED_POLL' | 'UNAVAILABLE';
  marketState: 'SURE_BUY' | 'SURE_SELL' | 'NO_SURE_SIGNAL' | 'NEWS_PAUSED' | 'UNAVAILABLE';
  latestPrice: number | null;
  latestConfidencePct: number;
  latestScore: number;
  latestSetupScore: number;
  latestAdx: number | null;
  reason: string;
  checks: SureSignalCheckItem[];
  activeSignal: SureSignalEntry | null;
  history: SureSignalEntry[];
  stats: SureHistoryStats;
  feedIntegrity?: FeedIntegrityReport;
  strategyEvaluation?: StrictStrategyEvaluation;
  newsProtection?: NewsProtectionState;
}

export type NewsImpact = 'HIGH';
export type NewsFeedStatus = 'LIVE' | 'CACHED' | 'STALE' | 'UNAVAILABLE';
export type NewsBlockingReason =
  | 'PRE_EVENT_WINDOW'
  | 'EVENT_LIVE'
  | 'POST_EVENT_COOLDOWN'
  | 'POST_EVENT_VOLATILITY'
  | 'NEWS_DATA_UNVERIFIED'
  | 'NONE';

export interface EconomicNewsEvent {
  id: string;
  title: string;
  currency: 'USD';
  impact: NewsImpact;
  timestampMs: number;
  isoUtc: string;
  istDateKey: string; // YYYY-MM-DD in Asia/Kolkata
  istDateLabel: string; // e.g. Wednesday, November 18
  istYear: string; // e.g. 2026
  istTimeLabel: string; // e.g. 7:00 PM
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string;
}

export interface NewsCalendarDayGroup {
  dateKey: string;
  dayLabel: string;
  year: string;
  isToday: boolean;
  events: EconomicNewsEvent[];
}

export interface NewsProtectionConfig {
  warningLeadMinutes: number;
  preEventBlockMinutes: number;
  minPostEventBlockMinutes: number;
  maxPostEventBlockMinutes: number;
  maxNewsCacheAgeMinutes: number;
}

export interface NewsMarketStability {
  quoteLive: boolean;
  spreadOk: boolean;
  spreadUsd: number | null;
  volatilityOk: boolean;
  volatilityDetail: string;
}

export interface NewsProtectionState {
  status: 'CLEAR' | 'WARNING_UPCOMING' | 'BLOCKED_NEWS' | 'BLOCKED_UNVERIFIED';
  warningActive: boolean;
  blocked: boolean;
  safeFallbackActive: boolean;
  reasonCode: NewsBlockingReason;
  headline: string;
  subtext: string;
  activeEvent: EconomicNewsEvent | null;
  upcomingEvent: EconomicNewsEvent | null;
  minutesToEvent: number | null;
  minutesSinceEvent: number | null;
  marketStability: NewsMarketStability;
  feedStatus: NewsFeedStatus;
  dataStatusWarning: string | null;
  evaluatedAt: string;
  config: NewsProtectionConfig;
}

export interface EconomicCalendarPayload {
  yearHeader: string;
  timezone: 'Asia/Kolkata';
  timezoneDisplay: 'IST (Asia/Kolkata)';
  currencyFilter: 'USD';
  impactFilter: 'HIGH';
  startDateKey: string;
  endDateKey: string;
  days: NewsCalendarDayGroup[];
  eventsCount: number;
  feedStatus: NewsFeedStatus;
  lastUpdatedAt: string | null;
  sources: string[];
  dataStatusWarning: string | null;
  protection: NewsProtectionState;
}



