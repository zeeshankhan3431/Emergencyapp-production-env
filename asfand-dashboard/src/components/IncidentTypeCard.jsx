const TYPE_COLORS = {
  fire:         'bg-red-500',
  medical:      'bg-orange-500',
  traffic:      'bg-blue-500',
  public_order: 'bg-purple-500',
};

function toDisplayList(categories) {
  if (!categories?.length) return null;

  // Support both API format { name, value, label, percent, color }
  // and legacy { label, percent, color }
  const hasPercent = categories[0]?.percent != null;
  if (hasPercent) return categories;

  // Compute percent from raw counts
  const total = categories.reduce((s, c) => s + (c.value ?? 0), 0) || 1;
  return categories.map((c, i) => ({
    label:   c.label ?? c.name ?? 'Unknown',
    percent: Math.round(((c.value ?? 0) / total) * 100),
    color:   c.color ?? TYPE_COLORS[c.name] ?? ['bg-teal-500', 'bg-yellow-500', 'bg-pink-500'][i % 3],
  }));
}

export default function IncidentTypeCard({ categories } = {}) {
  const list = toDisplayList(categories);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="mb-5">
        <h3 className="font-semibold text-gray-900">Incident Type</h3>
        <p className="text-sm text-gray-500">Distribution by Category</p>
      </div>
      
      {!list || list.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          No incident data available
        </div>
      ) : (
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
      )}
    </div>
  );
}
