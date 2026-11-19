import assert from 'node:assert/strict';
import test from 'node:test';
import type { Candle, MarketQuote, NewsProtectionConfig } from '../src/types/market.ts';
import {
  buildNewsEvent,
  buildRollingIstWindowDays,
  evaluateNewsProtectionFromEvents,
  extractFfCoveredIstDateKeysFromXml,
  getIstDateParts,
  isForexFactoryUsdRedTitle,
  mergeAndDeduplicateEvents,
  parseFfXmlUtcTimestamp,
  parseForexFactoryJson,
  parseForexFactoryXml,
  parseTradingViewEvents,
} from '../server/newsCalendar.ts';

const TEST_CONFIG: NewsProtectionConfig = {
  warningLeadMinutes: 60,
  preEventBlockMinutes: 15,
  minPostEventBlockMinutes: 15,
  maxPostEventBlockMinutes: 45,
  maxNewsCacheAgeMinutes: 60,
};

function makeCalmQuote(nowMs: number, spread = 0.35, freshness: MarketQuote['freshness'] = 'LIVE'): MarketQuote {
  const mid = 2645.5;
  return {
    symbol: 'XAU/USD',
    bid: Number((mid - spread / 2).toFixed(2)),
    ask: Number((mid + spread / 2).toFixed(2)),
    mid,
    spread,
    timestamp: nowMs - 2_000,
    freshness,
    source: 'Test Spot Feed',
  };
}

function makeStableCandles(params: {
  count: number;
  tfSec: number;
  nowMs: number;
  basePrice?: number;
  barRange?: number;
  lastBarRange?: number;
}): Candle[] {
  const { count, tfSec, nowMs, basePrice = 2640, barRange = 1.6, lastBarRange = 1.6 } = params;
  const endSec = Math.floor(nowMs / 1000) - tfSec;
  const startSec = endSec - (count - 1) * tfSec;
  const out: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const range = isLast ? lastBarRange : barRange;
    const open = basePrice + (i % 2 === 0 ? -0.2 : 0.2);
    const close = open + (i % 3 === 0 ? 0.35 : -0.25);
    const high = Math.max(open, close) + range * 0.45;
    const low = Math.min(open, close) - range * 0.45;
    out.push({
      time: startSec + i * tfSec,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1200,
    });
  }
  return out;
}

test('IST timezone conversion handles US EST (-05:00) and EDT (-04:00) daylight saving changes accurately', () => {
  // Summer EDT (-04:00): 8:30 AM EDT = 12:30 UTC = 6:00 PM IST (+5:30)
  const edtReleaseMs = Date.parse('2026-07-15T08:30:00-04:00');
  const edtParts = getIstDateParts(edtReleaseMs);
  assert.equal(edtParts.dateKey, '2026-07-15');
  assert.equal(edtParts.timeLabel, '6:00 PM');

  // Winter EST (-05:00): 8:30 AM EST = 13:30 UTC = 7:00 PM IST (+5:30)
  const estReleaseMs = Date.parse('2026-11-19T08:30:00-05:00');
  const estParts = getIstDateParts(estReleaseMs);
  assert.equal(estParts.dateKey, '2026-11-19');
  assert.equal(estParts.timeLabel, '7:00 PM');

  // Forex Factory XML UTC format: 11-19-2026 1:30pm UTC -> 7:00 PM IST
  const ffUtcMs = parseFfXmlUtcTimestamp('11-19-2026', '1:30pm');
  assert.equal(ffUtcMs, estReleaseMs);
  assert.equal(parseFfXmlUtcTimestamp('11-19-2026', 'Tentative'), null);
});

test('Rolling 7-day IST window crosses month and year boundaries cleanly', () => {
  // Month boundary: Nov 28, 2026 20:00 IST -> Dec 5, 2026 (8 inclusive day headers)
  const novNowMs = Date.parse('2026-11-28T14:30:00Z');
  const novDays = buildRollingIstWindowDays(novNowMs, 7);
  assert.equal(novDays.length, 8);
  assert.equal(novDays[0].dateKey, '2026-11-28');
  assert.equal(novDays[0].isToday, true);
  assert.equal(novDays[3].dateKey, '2026-12-01');
  assert.equal(novDays[7].dateKey, '2026-12-05');

  // Year boundary: Dec 29, 2026 10:00 IST -> Jan 5, 2027
  const decNowMs = Date.parse('2026-12-29T04:30:00Z');
  const decDays = buildRollingIstWindowDays(decNowMs, 7);
  assert.equal(decDays.length, 8);
  assert.equal(decDays[0].dateKey, '2026-12-29');
  assert.equal(decDays[0].year, '2026');
  assert.equal(decDays[3].dateKey, '2027-01-01');
  assert.equal(decDays[3].year, '2027');
  assert.equal(decDays[7].dateKey, '2027-01-05');
});

test('Strict USD + HIGH impact filtering excludes medium/low/non-USD events and preserves missing values as null', () => {
  const xml = `
    <weeklyevents>
      <event>
        <title>Core Retail Sales m/m</title>
        <country>USD</country>
        <date>11-19-2026</date>
        <time>1:30pm</time>
        <impact>High</impact>
        <forecast>0.4%</forecast>
        <previous>0.3%</previous>
      </event>
      <event>
        <title>Crude Oil Inventories</title>
        <country>USD</country>
        <date>11-19-2026</date>
        <time>3:30pm</time>
        <impact>Medium</impact>
        <forecast>1.1M</forecast>
        <previous>2.0M</previous>
      </event>
      <event>
        <title>ECB Monetary Policy Statement</title>
        <country>EUR</country>
        <date>11-19-2026</date>
        <time>1:15pm</time>
        <impact>High</impact>
        <forecast></forecast>
        <previous></previous>
      </event>
      <event>
        <title>Fed Chair Powell Speaks</title>
        <country>USD</country>
        <date>11-19-2026</date>
        <time>6:00pm</time>
        <impact>High</impact>
        <forecast></forecast>
        <previous></previous>
      </event>
    </weeklyevents>
  `;
  const ffParsed = parseForexFactoryXml(xml);
  assert.equal(ffParsed.length, 2);
  assert.equal(ffParsed[0].title, 'Core Retail Sales m/m');
  assert.equal(ffParsed[0].currency, 'USD');
  assert.equal(ffParsed[0].impact, 'HIGH');
  assert.equal(ffParsed[0].actual, null); // Never invented
  assert.equal(ffParsed[0].forecast, '0.4%');
  assert.equal(ffParsed[1].title, 'Fed Chair Powell Speaks');
  assert.equal(ffParsed[1].forecast, null);
  assert.equal(ffParsed[1].previous, null);

  const tvParsed = parseTradingViewEvents([
    {
      id: 101,
      title: 'Core Retail Sales MoM',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-19T13:30:00.000Z',
      actual: 0.6,
      forecast: 0.4,
      previous: 0.3,
      unit: '%',
    },
    {
      id: 102,
      title: 'Redbook YoY',
      country: 'US',
      currency: 'USD',
      importance: 0, // Medium -> excluded
      date: '2026-11-19T13:55:00.000Z',
      actual: 5.1,
      unit: '%',
    },
    {
      id: 103,
      title: 'UK CPI YoY',
      country: 'GB',
      currency: 'GBP',
      importance: 1, // Non-USD -> excluded
      date: '2026-11-19T07:00:00.000Z',
    },
  ]);
  assert.equal(tvParsed.length, 1);
  assert.equal(tvParsed[0].actual, '0.6%');

  const merged = mergeAndDeduplicateEvents(ffParsed, tvParsed);
  assert.equal(merged.length, 2); // Core Retail Sales deduped into 1 + Fed Chair Powell Speaks
  assert.equal(merged[0].actual, '0.6%');
  assert.equal(merged[0].forecast, '0.4%');

  const ffJsonParsed = parseForexFactoryJson([
    {
      title: 'CPI m/m',
      country: 'USD',
      date: '2026-11-20T13:30:00Z',
      impact: 'High',
      forecast: '0.2%',
      previous: '0.2%',
    },
    {
      title: 'Low Event',
      country: 'USD',
      date: '2026-11-20T14:00:00Z',
      impact: 'Low',
    },
  ]);
  assert.equal(ffJsonParsed.length, 1);
  assert.equal(ffJsonParsed[0].title, 'CPI m/m');
});

test('Centralized news blocking enforces pre-event block, post-event cooldown, volatility hold, and unverified safe fallback', () => {
  const eventMs = Date.parse('2026-11-19T13:30:00Z');
  const nfpEvent = buildNewsEvent({
    id: 'test-nfp',
    title: 'Non-Farm Payrolls',
    timestampMs: eventMs,
    actual: null,
    forecast: '180K',
    previous: '150K',
    source: 'TradingView Calendar',
  });

  // 1. Warning window: 40m before release -> warningActive=true, blocked=false, HIGH IMPACT NEWS COMING
  const tWarn = eventMs - 40 * 60_000;
  const warnState = evaluateNewsProtectionFromEvents({
    events: [nfpEvent],
    feedStatus: 'LIVE',
    lastVerifiedMs: tWarn - 15_000,
    nowMs: tWarn,
    quote: makeCalmQuote(tWarn),
    candles5m: makeStableCandles({ count: 30, tfSec: 300, nowMs: tWarn }),
    candles1m: makeStableCandles({ count: 30, tfSec: 60, nowMs: tWarn }),
    config: TEST_CONFIG,
  });
  assert.equal(warnState.status, 'WARNING_UPCOMING');
  assert.equal(warnState.warningActive, true);
  assert.equal(warnState.blocked, false);
  assert.equal(warnState.headline, 'HIGH IMPACT NEWS COMING');

  // 2. Pre-event block: 12m before release -> blocked=true
  const tPre = eventMs - 12 * 60_000;
  const preState = evaluateNewsProtectionFromEvents({
    events: [nfpEvent],
    feedStatus: 'LIVE',
    lastVerifiedMs: tPre - 10_000,
    nowMs: tPre,
    quote: makeCalmQuote(tPre),
    candles5m: makeStableCandles({ count: 30, tfSec: 300, nowMs: tPre }),
    candles1m: makeStableCandles({ count: 30, tfSec: 60, nowMs: tPre }),
    config: TEST_CONFIG,
  });
  assert.equal(preState.status, 'BLOCKED_NEWS');
  assert.equal(preState.blocked, true);
  assert.equal(preState.reasonCode, 'PRE_EVENT_WINDOW');
  assert.equal(preState.headline, 'HIGH IMPACT NEWS');

  // 3. Mandatory post-event cooldown: 10m after release -> still blocked even with calm quote
  const tCooldown = eventMs + 10 * 60_000;
  const cooldownState = evaluateNewsProtectionFromEvents({
    events: [nfpEvent],
    feedStatus: 'LIVE',
    lastVerifiedMs: tCooldown - 10_000,
    nowMs: tCooldown,
    quote: makeCalmQuote(tCooldown),
    candles5m: makeStableCandles({ count: 30, tfSec: 300, nowMs: tCooldown }),
    candles1m: makeStableCandles({ count: 30, tfSec: 60, nowMs: tCooldown }),
    config: TEST_CONFIG,
  });
  assert.equal(cooldownState.blocked, true);
  assert.equal(cooldownState.reasonCode, 'POST_EVENT_COOLDOWN');

  // 4. Volatility hold after mandatory cooldown: 20m after release, elevated 1m candle spike -> stays paused
  const tVolatile = eventMs + 20 * 60_000;
  const volatileState = evaluateNewsProtectionFromEvents({
    events: [nfpEvent],
    feedStatus: 'LIVE',
    lastVerifiedMs: tVolatile - 10_000,
    nowMs: tVolatile,
    quote: makeCalmQuote(tVolatile),
    candles5m: makeStableCandles({ count: 30, tfSec: 300, nowMs: tVolatile }),
    candles1m: makeStableCandles({
      count: 30,
      tfSec: 60,
      nowMs: tVolatile,
      barRange: 1.5,
      lastBarRange: 9.5, // > 2.2x ATR
    }),
    config: TEST_CONFIG,
  });
  assert.equal(volatileState.blocked, true);
  assert.equal(volatileState.reasonCode, 'POST_EVENT_VOLATILITY');

  // 5. Market normalizes 20m after release -> automatically unblocks to CLEAR
  const clearState = evaluateNewsProtectionFromEvents({
    events: [nfpEvent],
    feedStatus: 'LIVE',
    lastVerifiedMs: tVolatile - 10_000,
    nowMs: tVolatile,
    quote: makeCalmQuote(tVolatile, 0.35, 'LIVE'),
    candles5m: makeStableCandles({ count: 30, tfSec: 300, nowMs: tVolatile }),
    candles1m: makeStableCandles({ count: 30, tfSec: 60, nowMs: tVolatile }),
    config: TEST_CONFIG,
  });
  assert.equal(clearState.blocked, false);
  assert.equal(clearState.status, 'CLEAR');

  // 6. Unavailable / stale news feed -> safe fallback activates (does NOT silently allow normal trading)
  const fallbackState = evaluateNewsProtectionFromEvents({
    events: [],
    feedStatus: 'UNAVAILABLE',
    lastVerifiedMs: null,
    nowMs: tWarn,
    quote: makeCalmQuote(tWarn),
    candles5m: makeStableCandles({ count: 30, tfSec: 300, nowMs: tWarn }),
    candles1m: makeStableCandles({ count: 30, tfSec: 60, nowMs: tWarn }),
    config: TEST_CONFIG,
  });
  assert.equal(fallbackState.blocked, true);
  assert.equal(fallbackState.safeFallbackActive, true);
  assert.equal(fallbackState.status, 'BLOCKED_UNVERIFIED');
  assert.equal(fallbackState.reasonCode, 'NEWS_DATA_UNVERIFIED');
  assert.ok(fallbackState.dataStatusWarning);
});

test('TradingView fallback strictly matches Forex Factory USD RED events (e.g. Nov 25 shows 2 RED events instead of 5)', () => {
  const nov25TvRaw = [
    {
      id: 1001653914702,
      title: 'Personal Spending MoM',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-25T13:30:00.000Z',
      previous: 0.5,
      unit: '%',
    },
    {
      id: 1001653914707,
      title: 'Core PCE Price Index MoM',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-25T13:30:00.000Z',
      forecast: 0.3,
      previous: 0.3,
      unit: '%',
    },
    {
      id: 1001653916101,
      title: 'Personal Income MoM',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-25T13:30:00.000Z',
      previous: 0.2,
      unit: '%',
    },
    {
      id: 1001661639103,
      title: 'GDP Growth Rate QoQ 2nd Est',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-25T13:30:00.000Z',
      forecast: 3.4,
      previous: 1.5,
      unit: '%',
    },
    {
      id: 1001663743402,
      title: 'Durable Goods Orders MoM',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-25T13:30:00.000Z',
      forecast: 0,
      previous: 1.8,
      unit: '%',
    },
    {
      id: 1001661345001,
      title: 'Housing Starts',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-18T13:30:00.000Z',
    },
    {
      id: 1001661345901,
      title: 'Building Permits Prel',
      country: 'US',
      currency: 'USD',
      importance: 1,
      date: '2026-11-18T13:30:00.000Z',
    },
  ];

  const parsed = parseTradingViewEvents(nov25TvRaw);
  assert.deepEqual(
    parsed.map((e) => e.title),
    ['Core PCE Price Index MoM', 'GDP Growth Rate QoQ 2nd Est']
  );

  assert.equal(isForexFactoryUsdRedTitle('PCE Price Index MoM'), false);
  assert.equal(isForexFactoryUsdRedTitle('GDP Price Index QoQ'), false);
  assert.equal(isForexFactoryUsdRedTitle('ISM Manufacturing Prices'), false);
  assert.equal(isForexFactoryUsdRedTitle('ISM Manufacturing PMI'), true);
  assert.equal(isForexFactoryUsdRedTitle('ISM Services PMI'), true);
  assert.equal(isForexFactoryUsdRedTitle('Non-Farm Payrolls'), true);
  assert.equal(isForexFactoryUsdRedTitle('Core CPI MoM'), true);
  assert.equal(isForexFactoryUsdRedTitle('CB Consumer Confidence'), true);

  // On dates covered by Forex Factory XML, unmatched TradingView fallback events are suppressed,
  // while future FF-uncovered dates (Nov 25) still surface the 2 USD RED events.
  const ffXml = `
    <weeklyevents>
      <event>
        <title>Building Permits</title>
        <country>USD</country>
        <date>11-18-2026</date>
        <time>1:30pm</time>
        <impact>Medium</impact>
      </event>
      <event>
        <title>FOMC Meeting Minutes</title>
        <country>USD</country>
        <date>11-18-2026</date>
        <time>7:00pm</time>
        <impact>High</impact>
      </event>
    </weeklyevents>
  `;
  const ffEvents = parseForexFactoryXml(ffXml);
  const coveredKeys = extractFfCoveredIstDateKeysFromXml(ffXml);
  const extraTvSameDay = [
    buildNewsEvent({
      id: 'tv-extra-nov18',
      title: 'Flash Manufacturing PMI',
      timestampMs: Date.parse('2026-11-18T14:45:00Z'),
      actual: null,
      forecast: '50.1',
      previous: '49.8',
      source: 'TradingView Calendar',
    }),
    ...parsed,
  ];
  const merged = mergeAndDeduplicateEvents(ffEvents, extraTvSameDay, coveredKeys);
  assert.deepEqual(
    merged.map((e) => e.title),
    ['FOMC Meeting Minutes', 'Core PCE Price Index MoM', 'GDP Growth Rate QoQ 2nd Est']
  );
});

