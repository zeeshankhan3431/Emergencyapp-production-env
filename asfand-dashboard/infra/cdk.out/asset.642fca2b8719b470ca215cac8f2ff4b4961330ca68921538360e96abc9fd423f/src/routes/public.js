import { Router } from 'express';
import { listPublishedCommunityReports } from '../services/communityReportsRepository.js';
import { listSafetyTips } from '../services/safetyTipsService.js';

const router = Router();

/**
 * GET /api/public/community-reports — published summaries only, no auth
 */
router.get('/community-reports', async (_req, res) => {
  const items = await listPublishedCommunityReports();
  return res.json({ items });
});

/**
 * GET /api/public/safety-tips — CMS content, no auth
 */
router.get('/safety-tips', async (_req, res) => {
  const tips = await listSafetyTips();
  return res.json({ tips });
});

export default router;
