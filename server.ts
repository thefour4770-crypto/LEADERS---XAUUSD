import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { ALL_TIMEFRAMES, type SelectedIndicatorConfig, type Timeframe } from './src/types/market.ts';
import { DataUnavailableError, runFullAnalysis } from './server/analyzer.ts';
import { computeChartOverlays, computeHourlySentiment24h, computeSupportResistance } from './server/indicators.ts';
import { fetchCandles, fetchLiveXauUsdQuote, subscribeLiveQuotes } from './server/marketData.ts';
import { deleteReportById, getReportById, listReports } from './server/reportsStore.ts';

interface CachedJpgExport {
  buffer: Buffer;
  filename: string;
  expiresAt: number;
}

const jpgExportCache = new Map<string, CachedJpgExport>();

function pruneJpgExportCache() {
  const now = Date.now();
  for (const [key, entry] of jpgExportCache.entries()) {
    if (entry.expiresAt <= now) {
      jpgExportCache.delete(key);
    }
  }
  while (jpgExportCache.size > 20) {
    const oldestKey = jpgExportCache.keys().next().value;
    if (!oldestKey) break;
    jpgExportCache.delete(oldestKey);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'LEADERS XAUUSD', time: new Date().toISOString() });
  });

  app.get('/api/market/quote', async (_req, res) => {
    const quote = await fetchLiveXauUsdQuote();
    if (quote.freshness === 'UNAVAILABLE') {
      res.status(503).json({ status: 'DATA UNAVAILABLE', quote });
      return;
    }
    res.json({ status: quote.freshness, quote });
  });

  app.get('/api/market/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendQuote = (quote: Awaited<ReturnType<typeof fetchLiveXauUsdQuote>>) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ status: quote.freshness, quote })}\n\n`);
    };

    const unsubscribe = subscribeLiveQuotes(sendQuote);
    void fetchLiveXauUsdQuote().then((q) => {
      if (q.freshness !== 'UNAVAILABLE') {
        sendQuote(q);
      }
    });

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 15_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    });
  });

  app.get('/api/market/sentiment', async (_req, res) => {
    try {
      const dataset = await fetchCandles('1H');
      const sentiment = computeHourlySentiment24h(
        dataset.candles,
        dataset.latestTimestamp,
        dataset.freshness,
        dataset.candleSource
      );
      res.json({ status: dataset.freshness, sentiment });
    } catch (err) {
      res.status(503).json({
        status: 'DATA UNAVAILABLE',
        error: err instanceof Error ? err.message : 'Unable to compute 24h market sentiment',
      });
    }
  });

  app.get('/api/market/candles', async (req, res) => {
    const tf = String(req.query.timeframe ?? '15m') as Timeframe;
    if (!ALL_TIMEFRAMES.includes(tf)) {
      res.status(400).json({ status: 'INVALID TIMEFRAME', error: `Unsupported timeframe: ${tf}` });
      return;
    }

    try {
      const dataset = await fetchCandles(tf);
      const levels = computeSupportResistance(dataset.candles);
      res.json({
        status: dataset.freshness,
        dataset,
        supportLevels: levels.supportLevels,
        resistanceLevels: levels.resistanceLevels,
      });
    } catch (err) {
      res.status(503).json({
        status: 'DATA UNAVAILABLE',
        error: err instanceof Error ? err.message : 'Unable to fetch market candle data',
      });
    }
  });

  app.post('/api/market/overlays', async (req, res) => {
    const tf = String(req.body?.timeframe ?? '15m') as Timeframe;
    const indicators = Array.isArray(req.body?.indicators)
      ? (req.body.indicators as SelectedIndicatorConfig[])
      : [];

    if (!ALL_TIMEFRAMES.includes(tf)) {
      res.status(400).json({ error: `Unsupported timeframe: ${tf}` });
      return;
    }

    try {
      const dataset = await fetchCandles(tf);
      const overlays = computeChartOverlays(dataset.candles, indicators);
      res.json({ overlays });
    } catch (err) {
      res.status(503).json({
        status: 'DATA UNAVAILABLE',
        error: err instanceof Error ? err.message : 'Failed to compute chart overlays',
      });
    }
  });

  app.post('/api/analyze', async (req, res) => {
    const timeframes = Array.isArray(req.body?.timeframes) ? (req.body.timeframes as Timeframe[]) : [];
    const indicators = Array.isArray(req.body?.indicators)
      ? (req.body.indicators as SelectedIndicatorConfig[])
      : [];

    const validTimeframes = timeframes.filter((t) => ALL_TIMEFRAMES.includes(t));
    if (validTimeframes.length === 0) {
      res.status(400).json({ error: 'Select at least one valid timeframe before running analysis.' });
      return;
    }
    if (indicators.filter((i) => i.enabled).length === 0) {
      res.status(400).json({ error: 'Enable at least one technical indicator before running analysis.' });
      return;
    }

    try {
      const report = await runFullAnalysis(validTimeframes, indicators);
      res.json({ status: 'OK', report });
    } catch (err) {
      if (err instanceof DataUnavailableError) {
        res.status(503).json({ status: 'DATA UNAVAILABLE', error: err.message });
        return;
      }
      res.status(500).json({
        status: 'ANALYSIS ERROR',
        error: err instanceof Error ? err.message : 'Analysis calculation failed',
      });
    }
  });

  app.get('/api/reports', async (_req, res) => {
    try {
      const reports = await listReports();
      res.json({ reports });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load reports' });
    }
  });

  app.get('/api/reports/:id', async (req, res) => {
    const report = await getReportById(req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    res.json({ report });
  });

  app.delete('/api/reports/:id', async (req, res) => {
    const deleted = await deleteReportById(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }
    res.json({ deleted: true, id: req.params.id });
  });

  app.post('/api/export/jpg', express.json({ limit: '8mb' }), (req, res) => {
    const rawDataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    const rawFilename = typeof req.body?.filename === 'string' ? req.body.filename : 'LEADERS-XAUUSD-report.jpg';

    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(rawDataUrl);
    if (!match) {
      res.status(400).json({ error: 'Invalid JPEG payload' });
      return;
    }

    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'JPEG payload exceeds allowed size' });
      return;
    }

    const safeFilename =
      rawFilename.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) || 'LEADERS-XAUUSD-report.jpg';
    const token = crypto.randomUUID();

    pruneJpgExportCache();
    jpgExportCache.set(token, {
      buffer,
      filename: safeFilename.endsWith('.jpg') ? safeFilename : `${safeFilename}.jpg`,
      expiresAt: Date.now() + 5 * 60_000,
    });

    res.json({ downloadUrl: `/api/export/jpg/${encodeURIComponent(token)}` });
  });

  app.get('/api/export/jpg/:token', (req, res) => {
    pruneJpgExportCache();
    const entry = jpgExportCache.get(req.params.token);
    if (!entry) {
      res.status(404).send('Exported image expired or not found');
      return;
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
    res.setHeader('Content-Length', String(entry.buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(entry.buffer);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
      plugins: [
        {
          name: 'disable-vite-hmr-client-ws',
          enforce: 'post',
          transform(code, id) {
            const cleanId = id.split('?', 1)[0];
            if (
              cleanId.endsWith('/vite/dist/client/client.mjs') ||
              cleanId.endsWith('\\vite\\dist\\client\\client.mjs')
            ) {
              return {
                code: code.replace(
                  /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
                  'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });'
                ),
                map: null,
              };
            }
          },
        },
      ],
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LEADERS XAUUSD server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LEADERS XAUUSD server:', err);
  process.exit(1);
});
