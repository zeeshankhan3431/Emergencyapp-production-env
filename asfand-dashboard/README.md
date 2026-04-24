# Emergency Response System Dashboard

A React dashboard that matches the Emergency Response System overview UI: sidebar navigation, metrics, charts, incident types, live map placeholder, and recent incidents table.

## Stack

- **React 19** + **Vite**
- **Tailwind CSS** – layout and styling
- **React Router** – navigation
- **React Icons** – sidebar and UI icons
- **Recharts** – “Incidents Over Time” bar chart
- **Map** – static placeholder with colored markers (no Leaflet)

## Setup

If `npm install` fails with `EACCES` on the cache:

```bash
sudo chown -R $(whoami) ~/.npm
```

Then:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Optional: real map

To use a real map (e.g. OpenStreetMap with **react-leaflet** and **leaflet**):

1. Install: `npm install leaflet react-leaflet --legacy-peer-deps`
2. In `src/index.css` add: `@import 'leaflet/dist/leaflet.css';`
3. Replace the contents of `src/components/LiveMap.jsx` with a `MapContainer` + `TileLayer` + `CircleMarker` implementation (see [react-leaflet](https://react-leaflet.js.org/) docs).

## Project structure

- `src/App.jsx` – layout (sidebar + main), routes
- `src/components/` – Sidebar, Header, MetricCard, IncidentsOverTimeChart, IncidentTypeCard, LiveMap, RecentIncidents
- `src/pages/Dashboard.jsx` – overview page with all widgets
