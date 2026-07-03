/**
 * Lambda: monthly-report-generator
 * Triggered by API POST /api/analytics/reports/generate or EventBridge schedule.
 * Delegates to reportsService.generateMonthlyReport (idempotent).
 */
import { generateMonthlyReport } from '../services/reportsService.js';

/**
 * @param {{ year?: number, month?: number }} event
 */
export async function handler(event) {
  const year = Number(event.year ?? event.yearMonth?.year);
  const month = Number(event.month ?? event.yearMonth?.month);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'year and month required' }) };
  }
  const result = await generateMonthlyReport(year, month);
  return { statusCode: 200, body: JSON.stringify(result) };
}
