import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
} from 'react-icons/hi2';
import MetricCard from '../components/MetricCard';
import IncidentsOverTimeChart from '../components/IncidentsOverTimeChart';
import IncidentTypeCard from '../components/IncidentTypeCard';
import RecentIncidents from '../components/RecentIncidents';
import { getDashboardSummary, getIncidentsOverTimeRange } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const ICON_BY_KEY = {
  active: HiOutlineExclamationTriangle,
  today: HiOutlineCalendarDays,
  resolved: HiOutlineCheckCircle,
  avgResponse: HiOutlineClock,
};

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState([]);
  const [recentIncidents, setRecentIncidents] = useState(null);
  const [chartData, setChartData] = useState(null);     // null = loading, [] = empty
  const [typeBreakdown, setTypeBreakdown] = useState(null);
  const [chartRange, setChartRange] = useState('7days');
  const timerRef = useRef(null);

  // Fetch chart data separately when range changes
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setChartData(null); // reset to loading state
    getIncidentsOverTimeRange(chartRange)
      .then((d) => { if (!cancelled) setChartData(d ?? []); })
      .catch(() => { if (!cancelled) setChartData([]); });
    return () => { cancelled = true; };
  }, [chartRange, user, authLoading]);

  const fetchDashboard = useCallback(async (isBackground = false) => {
    setError('');
    try {
      const data = await getDashboardSummary();
      const mapped = (data.metrics ?? [])
        .filter((m) => m.key !== 'avgResponse' && m.key !== 'resolved')
        .map((m) => ({
          ...m,
          icon: ICON_BY_KEY[m.key] ?? HiOutlineExclamationTriangle,
        }));
      setMetrics(mapped);
      setRecentIncidents(data.recentIncidents ?? []);
      setTypeBreakdown(data.incidentTypeBreakdown ?? []);
    } catch (e) {
      if (!isBackground) {
        const apiMsg = e?.data?.message || e?.message || 'Unknown error';
        setError(`Dashboard API failed (${apiMsg}). Check API URL and authentication.`);
      }
      // On background poll failure — DO NOT wipe existing data
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchDashboard(false);
    timerRef.current = setInterval(() => fetchDashboard(true), 30000);

    // Listen for incident deletions from Incidents page to refresh metrics immediately
    const onDeleted = () => fetchDashboard(true);
    window.addEventListener('incident-deleted', onDeleted);

    return () => {
      clearInterval(timerRef.current);
      window.removeEventListener('incident-deleted', onDeleted);
    };
  }, [user, authLoading, fetchDashboard]);

  if (authLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-8"><div className="text-sm text-gray-500">Loading dashboard…</div></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-8">
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
            Please log in to view the dashboard.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
      <div className="p-8 space-y-6">
        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="text-sm text-gray-500" aria-live="polite">Loading dashboard…</div>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <MetricCard
              key={m.key ?? m.title}
              title={m.title}
              value={m.value}
              change={m.change}
              changePositive={m.changePositive}
              icon={m.icon}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IncidentsOverTimeChart
            data={chartData}
            onRangeChange={setChartRange}
          />
          <IncidentTypeCard categories={typeBreakdown} />
        </div>
        <div className="grid grid-cols-1 gap-6">
          <RecentIncidents items={recentIncidents} />
        </div>
      </div>
    </div>
  );
}