const defaultCategories = [
  { label: 'Fire', percent: 45, color: 'bg-red-500' },
  { label: 'Medical', percent: 30, color: 'bg-orange-500' },
  { label: 'Traffic', percent: 15, color: 'bg-blue-500' },
  { label: 'Public Order', percent: 10, color: 'bg-purple-500' },
];

export default function IncidentTypeCard({ categories } = {}) {
  const list = categories?.length ? categories : defaultCategories;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="mb-5">
        <h3 className="font-semibold text-gray-900">Incident Type</h3>
        <p className="text-sm text-gray-500">Distribution by Category</p>
      </div>
      <div className="space-y-4">
        {list.map(({ label, percent, color }) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="text-gray-500">{percent}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all duration-500`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
