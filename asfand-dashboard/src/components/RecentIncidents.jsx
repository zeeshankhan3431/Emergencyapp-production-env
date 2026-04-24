import { Link } from 'react-router-dom';
import {
  HiOutlineBellAlert,
  HiOutlineHeart,
  HiOutlineTruck,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';

const ICONS = {
  fire: HiOutlineBellAlert,
  medical: HiOutlineHeart,
  traffic: HiOutlineTruck,
  public_order: HiOutlineShieldCheck,
};

const defaultRows = [
  {
    id: '#9201',
    type: 'Fire Alarm',
    typeKey: 'fire',
    location: '1284 Market St',
    status: 'Dispatching',
  },
  {
    id: '#9198',
    type: 'Medical',
    typeKey: 'medical',
    location: '450 Sutter St',
    status: 'On Scene',
  },
  {
    id: '#9195',
    type: 'Traffic',
    typeKey: 'traffic',
    location: 'Hwy 101 N Exit 4',
    status: 'Resolved',
  },
];

function statusClass(status) {
  if (status === 'Dispatching') return 'bg-red-100 text-primary';
  if (status === 'On Scene') return 'bg-blue-100 text-blue-700';
  if (status === 'Resolved') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
}

export default function RecentIncidents({ items } = {}) {
  const rows = items?.length ? items : defaultRows;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Recent Incidents</h3>
        <Link
          to="/incidents"
          className="text-sm font-medium text-primary hover:underline"
        >
          View All
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-3 font-medium">TYPE</th>
              <th className="pb-3 font-medium">LOCATION</th>
              <th className="pb-3 font-medium">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const Icon = ICONS[row.typeKey] ?? HiOutlineBellAlert;
              const id = row.id;
              return (
                <tr key={id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-900">
                        {row.type} <span className="text-gray-400">(ID: {id})</span>
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-600">{row.location}</td>
                  <td className="py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusClass(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
