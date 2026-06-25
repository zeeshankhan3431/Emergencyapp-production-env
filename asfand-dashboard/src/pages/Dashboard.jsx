import { useEffect, useState } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
} from 'react-icons/hi2';
import MetricCard from '../components/MetricCard';
import IncidentsOverTimeChart from '../components/IncidentsOverTimeChart';
import IncidentTypeCard from '../components/IncidentTypeCard';
import LiveMap from '../components/LiveMap';
import RecentIncidents from '../components/RecentIncidents';
import { getDashboardSummary } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const ICON_BY_KEY = {
  active: HiOutlineExclamationTriangle,
  today: HiOutlineCalendarDays,
  resolved: HiOutlineCheckCircle,
  avgResponse: HiOutlineClock,
};

const FALLBACK_METRICS = [
  {
    key: 'active',
    title: 'Active Incidents',
    value: '12',
    change: '20%',
    changePositive: false,
    icon: HiOutlineExclamationTriangle,
  },
  {
    key: 'today',
    title: "Today's Incidents",
    value: '45',
    change: '5%',
    changePositive: true,
    icon: HiOutlineCalendarDays,
  },
  {
    key: 'resolved',
    title: 'Resolved Cases',
    value: '38',
    change: '12%',
    changePositive: true,
    icon: HiOutlineCheckCircle,
  },
  {
    key: 'avgResponse',
    title: 'Avg Response Time',
    value: '4m 12s',
    change: '8%',
    changePositive: true,
    icon: HiOutlineClock,
  },
];

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState(FALLBACK_METRICS);
  const [recentIncidents, setRecentIncidents] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [typeBreakdown, setTypeBreakdown] = useState(null);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    let fetchTimer;
    const fetchDashboard = async (isBackground = false) => {
      setError('');
      try {
        const data = await getDashboardSummary();
        if (cancelled) return;
        const mapped = (data.metrics ?? []).map((m) => ({
          ...m,
          icon: ICON_BY_KEY[m.key] ?? HiOutlineExclamationTriangle,
        }));
        setMetrics(mapped.length ? mapped : FALLBACK_METRICS);
        setRecentIncidents(data.recentIncidents ?? null);
        setChartData(data.incidentsOverTime ?? null);
        setTypeBreakdown(data.incidentTypeBreakdown ?? null);
      } catch (e) {
        if (!cancelled) {
          const apiMsg = e?.data?.message || e?.message || 'Unknown error';
          setError(`Dashboard API failed (${apiMsg}). Check API_URL and authentication.`);
          setMetrics(FALLBACK_METRICS);
          setRecentIncidents(null);
          setChartData(null);
          setTypeBreakdown(null);
        }
      } finally {
        if (!cancelled && !isBackground) setLoading(false);
      }
    };

    fetchDashboard();
    fetchTimer = setInterval(() => fetchDashboard(true), 5000);

    return () => {
      cancelled = true;
      if (fetchTimer) clearInterval(fetchTimer);
    };
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-8 space-y-6">
          <div className="text-sm text-gray-500">Loading dashboard…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-8 space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
            Please log in to view the dashboard.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6">
        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="text-sm text-gray-500" aria-live="polite">
            Loading dashboard…
          </div>
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
          <IncidentsOverTimeChart data={chartData} />
          <IncidentTypeCard categories={typeBreakdown} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LiveMap />
          <RecentIncidents items={recentIncidents} />
        </div>
      </div>
    </div>
  );
}