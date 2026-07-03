import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { HiOutlineChevronDown } from 'react-icons/hi2';

const RANGES = [
  { label: 'Today (24h)', value: 'today' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
];

export default function IncidentsOverTimeChart({ data: chartData, onRangeChange } = {}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(RANGES[0]);

  // While loading (null), show empty placeholder — never show dummy data
  const data = Array.isArray(chartData) ? chartData : [];
  const isLoading = chartData === null;

  function handleSelect(range) {
    setSelected(range);
    setOpen(false);
    if (onRangeChange) onRangeChange(range.value);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Incidents Over Time</h3>
          <p className="text-sm text-gray-500">
            {selected.label}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {selected.label}
            <HiOutlineChevronDown className="w-4 h-4" />
          </button>
          {open && (
            <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selected.value === r.value ? 'font-semibold text-red-600' : 'text-gray-700'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="h-64">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading chart data…</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">No incidents in this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                formatter={(value) => [`${value} incidents`, 'Count']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Bar
                dataKey="incidents"
                fill="#dc2626"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
