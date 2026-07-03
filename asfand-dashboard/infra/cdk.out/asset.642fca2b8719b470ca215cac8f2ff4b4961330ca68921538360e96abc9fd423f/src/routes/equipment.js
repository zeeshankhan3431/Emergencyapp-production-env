import { Router } from 'express';
import {
  getEquipmentBundle,
  getGeneralInfo,
  getTechnicalSpecifications,
  getPassportData,
  getMaintenanceHistory,
  getToroWorkOrders,
} from '../services/sapMock.js';

const router = Router();

function param(req) {
  return decodeURIComponent(req.params.equipmentNumber);
}

router.get('/:equipmentNumber/general', (req, res) => {
  const data = getGeneralInfo(param(req));
  if (!data) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(data);
});

router.get('/:equipmentNumber/specifications', (req, res) => {
  const data = getTechnicalSpecifications(param(req));
  if (!data) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(data);
});

router.get('/:equipmentNumber/passport', (req, res) => {
  const data = getPassportData(param(req));
  if (!data) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(data);
});

router.get('/:equipmentNumber/maintenance', (req, res) => {
  const data = getMaintenanceHistory(param(req));
  if (!data) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(data);
});

router.get('/:equipmentNumber/toro', (req, res) => {
  const data = getToroWorkOrders(param(req));
  if (!data) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(data);
});

router.get('/:equipmentNumber', (req, res) => {
  const bundle = getEquipmentBundle(param(req));
  if (!bundle) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown equipment number' });
  }
  res.json(bundle);
});

export default router;
