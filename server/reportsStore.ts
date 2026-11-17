import fs from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisReport } from '../src/types/market.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

async function ensureStoreFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(REPORTS_FILE);
  } catch {
    await fs.writeFile(REPORTS_FILE, '[]', 'utf8');
  }
}

async function readAllReports(): Promise<AnalysisReport[]> {
  await ensureStoreFile();
  try {
    const raw = await fs.readFile(REPORTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnalysisReport[]) : [];
  } catch {
    return [];
  }
}

async function writeAllReports(reports: AnalysisReport[]): Promise<void> {
  await ensureStoreFile();
  const tmpFile = `${REPORTS_FILE}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(reports, null, 2), 'utf8');
  await fs.rename(tmpFile, REPORTS_FILE);
}

export async function listReports(): Promise<AnalysisReport[]> {
  const reports = await readAllReports();
  return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getReportById(id: string): Promise<AnalysisReport | null> {
  const reports = await readAllReports();
  return reports.find((r) => r.id === id) ?? null;
}

export async function saveReport(report: AnalysisReport): Promise<AnalysisReport> {
  if (!report.id || !report.classification || !report.timeframeAnalyses?.length) {
    throw new Error('Refusing to save incomplete analysis report');
  }

  const reports = await readAllReports();

  // Deduplication guard: prevent duplicate report with same timeframes, indicators & marketDataTimestamp within 4 seconds
  const nowMs = new Date(report.createdAt).getTime();
  const tfKey = report.selectedTimeframes.join(',');
  const indKey = report.selectedIndicators.map((i) => `${i.id}:${JSON.stringify(i.params)}`).join('|');

  const duplicate = reports.find((existing) => {
    const diff = Math.abs(nowMs - new Date(existing.createdAt).getTime());
    const exTf = existing.selectedTimeframes.join(',');
    const exInd = existing.selectedIndicators.map((i) => `${i.id}:${JSON.stringify(i.params)}`).join('|');
    return diff < 4000 && exTf === tfKey && exInd === indKey && existing.classification === report.classification;
  });

  if (duplicate) {
    return duplicate;
  }

  const updated = [report, ...reports].slice(0, 200);
  await writeAllReports(updated);
  return report;
}

export async function deleteReportById(id: string): Promise<boolean> {
  const reports = await readAllReports();
  const filtered = reports.filter((r) => r.id !== id);
  if (filtered.length === reports.length) {
    return false;
  }
  await writeAllReports(filtered);
  return true;
}
