import { useEffect, useState } from 'react';
import { getMapPoints } from '../lib/api';

const ICONS = {
  fire: 'bg-red-500',
  medical: 'bg-orange-500',
  traffic: 'bg-blue-500',
  public_order: 'bg-purple-500',
};

export default function LiveMap() {
  const [markers, setMarkers] = useState([]);
  
  useEffect(() => {
    let active = true;
    getMapPoints(7).then((data) => {
      if (!active || !data?.points) return;
      // Map arbitrary lat/lng to percentage bounds for visualization
      const bounded = data.points.map(p => {
        // Quick visual spread (mock mapping for the grid, usually you'd use Leaflet/Mapbox)
        const left = ((p.generalised_lng + 180) / 360 * 100);
        const top = ((90 - p.generalised_lat) / 180 * 100);
        // Bounding mock visual to center 60%
        const visualLeft = 20 + (left % 60);
        const visualTop = 20 + (top % 60);
        return {
          left: `${visualLeft}%`,
          top: `${visualTop}%`,
          color: ICONS[p.type] ?? 'bg-red-500'
        };
      });
      setMarkers(bounded.slice(0, 50)); // cap at 50 max for visual
    }).catch(() => {});
    return () => { active = false; };
  }, []);
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
