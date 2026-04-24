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

const defaultData = [
  { time: '12am', incidents: 4 },
  { time: '2am', incidents: 2 },
  { time: '4am', incidents: 1 },
  { time: '6am', incidents: 5 },
  { time: '8am', incidents: 8 },
  { time: '10am', incidents: 6 },
  { time: '12pm', incidents: 12 },
  { time: '2pm', incidents: 9 },
  { time: '4pm', incidents: 7 },
  { time: '6pm', incidents: 11 },
  { time: '8pm', incidents: 6 },
  { time: '10pm', incidents: 4 },
  { time: '11pm', incidents: 3 },
];

export default function IncidentsOverTimeChart({ data: chartData } = {}) {
  const data = chartData?.length ? chartData : defaultData;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Incidents Over Time</h3>
          <p className="text-sm text-gray-500">Last 24 Hours</p>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Today
          <HiOutlineChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="h-64">
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
      </div>
    </div>
  );
}
