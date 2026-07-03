import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateMonthlyReport, __clearReportsMemory, getMonthlyReportJson } from '../../src/services/reportsService.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';

describe('monthly report idempotency', () => {
  beforeEach(async () => {
    await initTestDatabase();
    __clearReportsMemory();
  });
  afterEach(teardownTestDatabase);

  it('re-trigger same month returns cached without duplicating work', async () => {
    const a = await generateMonthlyReport(2026, 4);
    expect(a.cached).toBe(false);

    const b = await generateMonthlyReport(2026, 4);
    expect(b.cached).toBe(true);

    const json = await getMonthlyReportJson(2026, 4);
    expect(json).toBeTruthy();
    expect(json.statistics?.year).toBe(2026);
  });
});
