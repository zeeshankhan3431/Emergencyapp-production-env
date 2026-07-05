import { useEffect, useState, useRef } from 'react';
import {
  HiOutlineBellAlert,
  HiOutlineHeart,
  HiOutlineTruck,
  HiOutlineShieldCheck,
  HiOutlineMagnifyingGlass,
  HiOutlineExclamationCircle,
} from 'react-icons/hi2';
import { getIncidents, deleteIncident } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const ICONS = {
  fire: HiOutlineBellAlert,
  medical: HiOutlineHeart,
  traffic: HiOutlineTruck,
  public_order: HiOutlineShieldCheck,
  assault: HiOutlineExclamationCircle,
};

function statusBadge(status) {
  if (status === 'dispatching') return 'bg-red-100 text-primary';
  if (status === 'on_scene') return 'bg-blue-100 text-blue-700';
  if (status === 'resolved') return 'bg-green-100 text-green-700';
  if (status === 'triggered') return 'bg-orange-100 text-orange-700';
  return 'bg-gray-100 text-gray-700';
}

function formatLocation(row) {
  if (row.lat && row.lng && (row.lat !== 0 || row.lng !== 0)) {
    return `${Number(row.lat).toFixed(4)}, ${Number(row.lng).toFixed(4)}`;
  }
  if (row.ai_summary) return row.ai_summary.slice(0, 40);
  return 'No GPS data';
}

export default function Incidents() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  // Track locally deleted IDs so polling doesn't bring them back
  const deletedIdsRef = useRef(new Set());
  const fetchTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const fetchIncidents = async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      setError('');
      const p = {};
      if (q.trim()) p.q = q.trim();
      try {
        const data = await getIncidents(p);
        if (!cancelled) {
          // Filter out any IDs we've already deleted locally
          const fresh = (data.items ?? []).filter(
            (item) => !deletedIdsRef.current.has(item.id)
          );
          setItems(fresh);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.data?.message || e.message || 'Could not load incidents.');
          if (!isBackground) setItems([]);
        }
      } finally {
        if (!cancelled && !isBackground) setLoading(false);
      }
    };

    fetchIncidents();
    fetchTimerRef.current = setInterval(() => fetchIncidents(true), 10000);

    return () => {
      cancelled = true;
      if (fetchTimerRef.current) clearInterval(fetchTimerRef.current);
    };
  }, [q]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this incident?')) return;

    // 1. Immediately remove from UI
    setItems((prev) => prev.filter((item) => item.id !== id));
    // 2. Track this ID so polls don't bring it back
    deletedIdsRef.current.add(id);

    try {
      await deleteIncident(id);
      // Tell Dashboard to refresh its metrics immediately
      window.dispatchEvent(new CustomEvent('incident-deleted', { detail: { id } }));
    } catch (err) {
      // If delete failed, remove from deletedIds and restore
      deletedIdsRef.current.delete(id);
      alert('Failed to delete incident: ' + err.message);
      // Re-fetch to restore correct state
      try {
        const data = await getIncidents({});
        setItems(
          (data.items ?? []).filter((item) => !deletedIdsRef.current.has(item.id))
        );
      } catch (_) { /* ignore */ }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Incidents</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ID, type…"
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
          </div>
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
                  {user?.role === 'Admin' && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No incidents found.
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
                            <span className="font-medium text-gray-900 capitalize">{row.type}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{row.id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-gray-700">{formatLocation(row)}</td>
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
                        {user?.role === 'Admin' && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                            >
                              Delete
                            </button>
                          </td>
                        )}
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
