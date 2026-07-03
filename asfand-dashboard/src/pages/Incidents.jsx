import { useEffect, useState } from 'react';
import {
  HiOutlineBellAlert,
  HiOutlineHeart,
  HiOutlineTruck,
  HiOutlineShieldCheck,
  HiOutlineMagnifyingGlass,
} from 'react-icons/hi2';
import { getIncidents } from '../lib/api';

const ICONS = {
  fire: HiOutlineBellAlert,
  medical: HiOutlineHeart,
  traffic: HiOutlineTruck,
  public_order: HiOutlineShieldCheck,
};

const STATUSES = ['', 'Dispatching', 'On Scene', 'Resolved', 'Open'];

function statusBadge(status) {
  if (status === 'Dispatching') return 'bg-red-100 text-primary';
  if (status === 'On Scene') return 'bg-blue-100 text-blue-700';
  if (status === 'Resolved') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
}

export default function Incidents() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
      let fetchTimer;
      const fetchIncidents = async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        setError('');
        const p = {};
        if (status) p.status = status;
        if (q.trim()) p.q = q.trim();
        try {
          const data = await getIncidents(p);
          if (!cancelled) setItems(data.items ?? []);
        } catch (e) {
          if (!cancelled) {
            setError(e.data?.message || e.message || 'Could not load incidents. Is the API running?');
            setItems([]);
          }
        } finally {
          if (!cancelled && !isBackground) setLoading(false);
        }
      };

      fetchIncidents();
      fetchTimer = setInterval(() => fetchIncidents(true), 5000);

    return () => {
      cancelled = true;
      if (fetchTimer) clearInterval(fetchTimer);
    };
  }, [status, q]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Incidents</h1>
          <p className="text-gray-500 mt-1 text-sm">
            All emergency incidents with real-time escalation and dispatch status.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ID, type, or location…"
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              {STATUSES.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s || 'All'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
            {error}
          </div>
        ) : null}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No incidents match your filters.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const Icon = ICONS[row.typeKey] ?? HiOutlineBellAlert;
                    return (
                      <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-900">{row.type}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{row.id}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {(row.lat && row.lng) ? `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}` : (row.ai_summary ? row.ai_summary.slice(0, 40) : 'Unknown')}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {row.openedAt
                            ? new Date(row.openedAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
