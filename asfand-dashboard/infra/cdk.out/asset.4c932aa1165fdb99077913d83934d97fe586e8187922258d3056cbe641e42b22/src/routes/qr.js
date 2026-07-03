import { Router } from 'express';
import { resolveQrToEquipmentNumber, getEquipmentBundle } from '../services/sapMock.js';

const router = Router();

/**
 * POST /api/qr/resolve
 * Body: { "raw": "<string from QR>" }
 * Milestone 2: validates QR → EquipmentID; Milestone 3: optional full bundle in same response.
 */
router.post('/resolve', (req, res) => {
  const raw = req.body?.raw ?? req.body?.payload ?? req.body?.data;
  const resolved = resolveQrToEquipmentNumber(raw);
  if (!resolved.ok) {
    return res.status(404).json({
      ok: false,
      error: resolved.error,
      message: resolved.message,
    });
  }
  const includeBundle = req.query.bundle === '1' || req.body?.includeBundle === true;
  const body = {
    ok: true,
    equipmentNumber: resolved.equipmentNumber,
    sapEquipmentId: resolved.sapEquipmentId,
  };
  if (includeBundle) {
    body.bundle = getEquipmentBundle(resolved.equipmentNumber);
  }
  return res.json(body);
});

export default router;
