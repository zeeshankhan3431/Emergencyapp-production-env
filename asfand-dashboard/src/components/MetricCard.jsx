import { HiOutlineArrowTrendingUp } from 'react-icons/hi2';

export default function MetricCard({ title, value, change, trend, icon: Icon, changePositive }) {
  const changeColor = changePositive ? 'text-green-600' : 'text-primary';
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-primary-light text-primary">
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <span className={`flex items-center gap-0.5 text-sm font-medium ${changeColor}`}>
          <HiOutlineArrowTrendingUp className="w-4 h-4" />
          {change}
        </span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{title}</div>
    </div>
  );
}
