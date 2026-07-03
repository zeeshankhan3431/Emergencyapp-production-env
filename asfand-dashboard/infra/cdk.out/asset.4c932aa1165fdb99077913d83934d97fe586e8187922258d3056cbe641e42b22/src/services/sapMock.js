/**
 * Mock SAP PM responses. Replace with OData/BAPI integration when SAP is available.
 * Shape matches Milestone 3: general info, specs, passport, maintenance, TORO orders.
 */

const CATALOG = {
  'EQ-1001': {
    equipmentNumber: 'EQ-1001',
    sapEquipmentId: '40000123',
    description: 'HV Transformer T1 — Substation North',
    functionalLocation: 'SUB-NORTH-TR01',
    plant: 'PLANT-01',
    branchCode: 'SUB-NORTH',
    branchName: 'North Substation',
    manufacturer: 'Siemens',
    model: 'TT-400-220',
    serialNumber: 'SN-889921',
    yearInstalled: 2018,
  },
  'EQ-2002': {
    equipmentNumber: 'EQ-2002',
    sapEquipmentId: '40000456',
    description: 'Circuit Breaker CB-A — Substation East',
    functionalLocation: 'SUB-EAST-CB01',
    plant: 'PLANT-02',
    branchCode: 'SUB-EAST',
    branchName: 'East Substation',
    manufacturer: 'ABB',
    model: 'HPL 550B2',
    serialNumber: 'SN-771100',
    yearInstalled: 2020,
  },
};

function baseFor(eq) {
  const b = CATALOG[eq];
  if (!b) return null;
  return { ...b };
}

export function listKnownEquipmentNumbers() {
  return Object.keys(CATALOG);
}

export function getGeneralInfo(equipmentNumber) {
  const b = baseFor(equipmentNumber);
  if (!b) return null;
  return {
    equipmentNumber: b.equipmentNumber,
    sapEquipmentId: b.sapEquipmentId,
    description: b.description,
    functionalLocation: b.functionalLocation,
    plant: b.plant,
    branchCode: b.branchCode,
    branchName: b.branchName,
    status: 'Active',
    lastUpdated: new Date().toISOString(),
  };
}

export function getTechnicalSpecifications(equipmentNumber) {
  const b = baseFor(equipmentNumber);
  if (!b) return null;
  return {
    equipmentNumber: b.equipmentNumber,
    manufacturer: b.manufacturer,
    model: b.model,
    serialNumber: b.serialNumber,
    yearInstalled: b.yearInstalled,
    ratedVoltageKv: 220,
    ratedPowerMva: 250,
    insulationClass: 'F',
    cooling: 'ONAN',
    weightKg: 128000,
  };
}

export function getPassportData(equipmentNumber) {
  const b = baseFor(equipmentNumber);
  if (!b) return null;
  return {
    equipmentNumber: b.equipmentNumber,
    passportId: `PP-${b.sapEquipmentId}`,
    commissioningDate: '2018-06-15',
    warrantyUntil: '2023-06-15',
    inspectionDue: '2026-09-01',
    certifications: ['ISO 9001', 'Grid Code 2024'],
    documents: [
      { id: 'DOC-1', title: 'Factory test report', type: 'PDF' },
      { id: 'DOC-2', title: 'As-built drawings', type: 'DWG' },
    ],
  };
}

export function getMaintenanceHistory(equipmentNumber) {
  const b = baseFor(equipmentNumber);
  if (!b) return null;
  return {
    equipmentNumber: b.equipmentNumber,
    entries: [
      {
        orderId: 'MO-900100',
        type: 'Preventive',
        date: '2025-11-10',
        description: 'Annual oil analysis & bushings inspection',
        status: 'Completed',
        technician: 'J. Smith',
      },
      {
        orderId: 'MO-900088',
        type: 'Corrective',
        date: '2025-08-02',
        description: 'Replaced gasket on conservator',
        status: 'Completed',
        technician: 'A. Morgan',
      },
      {
        orderId: 'MO-900120',
        type: 'Preventive',
        date: '2026-02-01',
        description: 'Scheduled tap changer service',
        status: 'Planned',
        technician: null,
      },
    ],
  };
}

export function getToroWorkOrders(equipmentNumber) {
  const b = baseFor(equipmentNumber);
  if (!b) return null;
  return {
    equipmentNumber: b.equipmentNumber,
    orders: [
      {
        toroId: 'TORO-2026-0142',
        sapOrderId: '4007890',
        priority: 'High',
        openedAt: '2026-03-28T08:15:00.000Z',
        shortText: 'Investigate abnormal DGA trend',
        status: 'In Progress',
        assignedTo: b.branchName,
      },
      {
        toroId: 'TORO-2026-0098',
        sapOrderId: '4007650',
        priority: 'Medium',
        openedAt: '2026-02-14T11:00:00.000Z',
        shortText: 'Thermography follow-up',
        status: 'Completed',
        assignedTo: 'Central Maintenance',
      },
    ],
  };
}

/**
 * Full bundle for Milestone 3 — fetched together after a valid QR resolution.
 */
export function getEquipmentBundle(equipmentNumber) {
  if (!baseFor(equipmentNumber)) return null;
  return {
    generalInfo: getGeneralInfo(equipmentNumber),
    technicalSpecifications: getTechnicalSpecifications(equipmentNumber),
    passportData: getPassportData(equipmentNumber),
    maintenanceHistory: getMaintenanceHistory(equipmentNumber),
    toroWorkOrders: getToroWorkOrders(equipmentNumber),
  };
}

/**
 * Resolve QR payload to an equipment number (Milestone 2).
 * Accepts raw equipment code or JSON { equipmentId | equipmentNumber }.
 */
export function resolveQrToEquipmentNumber(raw) {
  if (raw == null) return { ok: false, error: 'EMPTY_QR' };
  const s = String(raw).trim();
  if (!s) return { ok: false, error: 'EMPTY_QR' };

  try {
    const parsed = JSON.parse(s);
    const id = parsed.equipmentId ?? parsed.equipmentNumber ?? parsed.eq;
    if (id && CATALOG[String(id).trim()]) {
      return { ok: true, equipmentNumber: String(id).trim(), sapEquipmentId: CATALOG[String(id).trim()].sapEquipmentId };
    }
  } catch {
    // not JSON
  }

  if (CATALOG[s]) {
    return { ok: true, equipmentNumber: s, sapEquipmentId: CATALOG[s].sapEquipmentId };
  }

  return { ok: false, error: 'UNKNOWN_EQUIPMENT', message: 'QR does not map to a valid EquipmentID in SAP PM (mock).' };
}
