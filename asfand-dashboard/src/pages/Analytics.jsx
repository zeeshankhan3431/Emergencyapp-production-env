import { useCallback, useEffect, useState } from 'react';
import IncidentsOverTimeChart from '../components/IncidentsOverTimeChart';
import IncidentTypeCard from '../components/IncidentTypeCard';
import { getDashboardSummary, getIncidentsOverTimeRange } from '../lib/api';

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState(null);
  const [typeBreakdown, setTypeBreakdown] = useState(null);

  // Fetch type breakdown once
  useEffect(() => {
    let cancelled = false;
    getDashboardSummary()
      .then((data) => {
        if (cancelled) return;
        setTypeBreakdown(data.incidentTypeBreakdown ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.data?.message || e.message || 'Could not load analytics.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Fetch chart data by selected range
  const handleRangeChange = useCallback((range) => {
    setChartData(null); // show loading
    getIncidentsOverTimeRange(range)
      .then((d) => setChartData(d ?? []))
      .catch(() => setChartData([]));
  }, []);

  // Load default (today) on mount
  useEffect(() => {
    handleRangeChange('today');
  }, [handleRangeChange]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Incident volume and type distribution — live data from your database.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
        ) : null}

        {loading ? (
          <div className="text-sm text-gray-500" aria-live="polite">Loading analytics…</div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IncidentsOverTimeChart
            data={chartData}
            onRangeChange={handleRangeChange}
          />
          <IncidentTypeCard categories={typeBreakdown} />
        </div>
      </div>
    </div>
  );
}
