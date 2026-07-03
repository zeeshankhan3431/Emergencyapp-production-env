import { Router } from 'express';

/**
 * Milestone 4 placeholder — persist defects (DB) and link to equipment / branch.
 */
const router = Router();

const memory = [];

router.get('/', (req, res) => {
  const { equipmentNumber, branch, status, from, to } = req.query;
  let list = [...memory];
  if (equipmentNumber) list = list.filter((d) => d.equipmentNumber === equipmentNumber);
  if (branch) list = list.filter((d) => d.branch === branch);
  if (status) list = list.filter((d) => d.status === status);
  if (from) list = list.filter((d) => d.createdAt >= from);
  if (to) list = list.filter((d) => d.createdAt <= to);
  res.json({ items: list });
});

router.post('/', (req, res) => {
  const {
    equipmentNumber,
    branch,
    description,
    photos = [],
    videos = [],
    comments = [],
  } = req.body ?? {};
  if (!description || String(description).trim() === '') {
    return res.status(400).json({ error: 'VALIDATION', message: 'description is required' });
  }
  const row = {
    id: `DEF-${Date.now()}`,
    equipmentNumber: equipmentNumber ?? null,
    branch: branch ?? req.user?.branch ?? null,
    description: String(description).trim(),
    photos,
    videos,
    comments,
    employeeId: req.user?.sub ?? req.user?.preferred_username ?? 'unknown',
    status: 'Open',
    createdAt: new Date().toISOString(),
  };
  memory.unshift(row);
  res.status(201).json(row);
});

export default router;
