const markers = [
  { left: '18%', top: '32%', color: 'bg-red-500' },
  { left: '45%', top: '25%', color: 'bg-blue-500' },
  { left: '72%', top: '45%', color: 'bg-orange-500' },
  { left: '30%', top: '60%', color: 'bg-red-500' },
  { left: '58%', top: '70%', color: 'bg-blue-500' },
  { left: '80%', top: '28%', color: 'bg-orange-500' },
];

export default function LiveMap() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Live Map</h3>
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
        >
          Expand View
        </button>
      </div>
      <div className="h-72 rounded-lg overflow-hidden bg-gray-200 relative">
        {/* Placeholder map background - grid pattern */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(to right, #9ca3af 1px, transparent 1px),
              linear-gradient(to bottom, #9ca3af 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
          }}
        />
        {markers.map((m, i) => (
          <div
            key={i}
            className={`absolute w-3 h-3 rounded-full ${m.color} border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2`}
            style={{ left: m.left, top: m.top }}
          />
        ))}
        <button
          type="button"
          className="absolute bottom-3 right-3 w-9 h-9 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 z-10 text-lg font-medium"
          aria-label="Zoom"
        >
          +
        </button>
      </div>
    </div>
  );
}
