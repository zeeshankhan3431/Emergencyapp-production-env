import { useState, useCallback } from 'react';
import { HiOutlineQrCode, HiOutlineArrowPath } from 'react-icons/hi2';
import { getEquipmentBundle, resolveQr } from '../lib/api';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'specs', label: 'Technical specs' },
  { id: 'passport', label: 'Passport' },
  { id: 'maintenance', label: 'Maintenance history' },
  { id: 'toro', label: 'TORO work orders' },
];

function KeyValue({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-2 border-b border-gray-100 last:border-0">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="sm:col-span-2 text-sm text-gray-900 break-words">{String(value)}</div>
    </div>
  );
}

export default function Equipment() {
  const [qrInput, setQrInput] = useState('EQ-1001');
  const [activeTab, setActiveTab] = useState('general');
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadBundle = useCallback(async (equipmentNumber) => {
    setError('');
    setLoading(true);
    try {
      const data = await getEquipmentBundle(equipmentNumber);
      setBundle(data);
    } catch (e) {
      setBundle(null);
      setError(e.data?.message || e.message || 'Failed to load equipment');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleResolveQr = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await resolveQr(qrInput.trim(), { includeBundle: true });
      if (res.ok && res.bundle) {
        setBundle(res.bundle);
        return;
      }
      if (res.ok && res.equipmentNumber) {
        await loadBundle(res.equipmentNumber);
        return;
      }
      setError('Unexpected response');
    } catch (err) {
      setBundle(null);
      setError(err.data?.message || err.message || 'Invalid QR or equipment');
    } finally {
      setLoading(false);
    }
  };

  const g = bundle?.generalInfo;
  const specs = bundle?.technicalSpecifications;
  const passport = bundle?.passportData;
  const maint = bundle?.maintenanceHistory;
  const toro = bundle?.toroWorkOrders;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Equipment (SAP PM)</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Enter a QR payload or equipment code. Demo codes: <code className="bg-gray-100 px-1 rounded">EQ-1001</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">EQ-2002</code>.
          </p>
        </div>

        <form onSubmit={handleResolveQr} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
            <span className="pl-3 flex items-center text-gray-400" aria-hidden>
              <HiOutlineQrCode className="w-5 h-5" />
            </span>
            <input
              type="text"
              value={qrInput}
              onChange={(ev) => setQrInput(ev.target.value)}
              placeholder='e.g. EQ-1001 or {"equipmentId":"EQ-1001"}'
              className="flex-1 min-w-0 px-3 py-2.5 text-sm outline-none"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60"
          >
            {loading ? <HiOutlineArrowPath className="w-5 h-5 animate-spin" /> : null}
            Resolve & load
          </button>
        </form>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
        ) : null}

        {bundle && g ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">Equipment</div>
              <div className="text-lg font-semibold text-gray-900 mt-0.5">{g.description}</div>
              <div className="text-sm text-gray-600 mt-1">
                {g.equipmentNumber} · SAP {g.sapEquipmentId} · {g.branchName}
              </div>
            </div>

            <div className="border-b border-gray-200">
              <nav className="flex flex-wrap gap-1 -mb-px" aria-label="Equipment sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      activeTab === t.id
                        ? 'border-primary text-primary bg-white'
                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm min-h-[240px]">
              {activeTab === 'general' && (
                <div>
                  <KeyValue label="Description" value={g.description} />
                  <KeyValue label="Equipment number" value={g.equipmentNumber} />
                  <KeyValue label="SAP equipment ID" value={g.sapEquipmentId} />
                  <KeyValue label="Functional location" value={g.functionalLocation} />
                  <KeyValue label="Plant" value={g.plant} />
                  <KeyValue label="Branch" value={`${g.branchName} (${g.branchCode})`} />
                  <KeyValue label="Status" value={g.status} />
                  <KeyValue label="Last updated" value={g.lastUpdated} />
                </div>
              )}
              {activeTab === 'specs' && specs && (
                <div>
                  <KeyValue label="Manufacturer" value={specs.manufacturer} />
                  <KeyValue label="Model" value={specs.model} />
                  <KeyValue label="Serial number" value={specs.serialNumber} />
                  <KeyValue label="Year installed" value={specs.yearInstalled} />
                  <KeyValue label="Rated voltage (kV)" value={specs.ratedVoltageKv} />
                  <KeyValue label="Rated power (MVA)" value={specs.ratedPowerMva} />
                  <KeyValue label="Insulation class" value={specs.insulationClass} />
                  <KeyValue label="Cooling" value={specs.cooling} />
                  <KeyValue label="Weight (kg)" value={specs.weightKg} />
                </div>
              )}
              {activeTab === 'passport' && passport && (
                <div>
                  <KeyValue label="Passport ID" value={passport.passportId} />
                  <KeyValue label="Commissioning" value={passport.commissioningDate} />
                  <KeyValue label="Warranty until" value={passport.warrantyUntil} />
                  <KeyValue label="Inspection due" value={passport.inspectionDue} />
                  <div className="mt-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Certifications</div>
                    <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
                      {(passport.certifications ?? []).map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Documents</div>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                      {(passport.documents ?? []).map((d) => (
                        <li key={d.id} className="px-3 py-2 text-sm flex justify-between gap-4">
                          <span>{d.title}</span>
                          <span className="text-gray-500 shrink-0">{d.type}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {activeTab === 'maintenance' && maint && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="py-2 pr-4 font-medium">Order</th>
                        <th className="py-2 pr-4 font-medium">Type</th>
                        <th className="py-2 pr-4 font-medium">Date</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(maint.entries ?? []).map((row) => (
                        <tr key={row.orderId} className="border-b border-gray-50">
                          <td className="py-2 pr-4 whitespace-nowrap">{row.orderId}</td>
                          <td className="py-2 pr-4">{row.type}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{row.date}</td>
                          <td className="py-2 pr-4">{row.status}</td>
                          <td className="py-2 text-gray-700">{row.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {activeTab === 'toro' && toro && (
                <div className="space-y-3">
                  {(toro.orders ?? []).map((o) => (
                    <div
                      key={o.toroId}
                      className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{o.shortText}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {o.toroId} · SAP {o.sapOrderId}
                        </div>
                      </div>
                      <div className="text-sm text-right shrink-0">
                        <div className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {o.status}
                        </div>
                        <div className="text-gray-500 mt-1">{o.priority} priority</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          !loading &&
          !error && (
            <p className="text-sm text-gray-500">
              Resolve a QR code or equipment ID to load SAP PM data into the tabs above.
            </p>
          )
        )}
      </div>
    </div>
  );
}
