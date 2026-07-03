/**
 * Mock emergency incidents for the admin dashboard (PDF web slice).
 * Replace with DB + mobile-ingested events when available.
 */

export const INCIDENTS = [
  {
    id: 'ERS-9201',
    type: 'Fire Alarm',
    typeKey: 'fire',
    location: '1284 Market St',
    status: 'Dispatching',
    openedAt: '2026-04-06T09:12:00.000Z',
    responseTimeMinutes: 6,
  },
  {
    id: 'ERS-9198',
    type: 'Medical',
    typeKey: 'medical',
    location: '450 Sutter St',
    status: 'On Scene',
    openedAt: '2026-04-06T08:45:00.000Z',
    responseTimeMinutes: 4,
  },
  {
    id: 'ERS-9195',
    type: 'Traffic',
    typeKey: 'traffic',
    location: 'Hwy 101 N Exit 4',
    status: 'Resolved',
    openedAt: '2026-04-05T22:30:00.000Z',
    responseTimeMinutes: 12,
  },
  {
    id: 'ERS-9192',
    type: 'Public Order',
    typeKey: 'public_order',
    location: 'Union Square',
    status: 'Resolved',
    openedAt: '2026-04-05T18:00:00.000Z',
    responseTimeMinutes: 9,
  },
  {
    id: 'ERS-9188',
    type: 'Medical',
    typeKey: 'medical',
    location: '22nd St Station',
    status: 'Dispatching',
    openedAt: '2026-04-06T10:02:00.000Z',
    responseTimeMinutes: null,
  },
  {
    id: 'ERS-9185',
    type: 'Fire Alarm',
    typeKey: 'fire',
    location: 'Pier 39',
    status: 'Resolved',
    openedAt: '2026-04-04T14:20:00.000Z',
    responseTimeMinutes: 15,
  },
];

const CHART_SERIES = [
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

const TYPE_BREAKDOWN = [
  { label: 'Fire', percent: 45, color: 'bg-red-500' },
  { label: 'Medical', percent: 30, color: 'bg-orange-500' },
  { label: 'Traffic', percent: 15, color: 'bg-blue-500' },
  { label: 'Public Order', percent: 10, color: 'bg-purple-500' },
];

function isActive(status) {
  return ['Dispatching', 'On Scene', 'Open'].includes(status);
}

function startOfTodayUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export function listIncidents({ status, q } = {}) {
  let list = [...INCIDENTS];
  if (status) list = list.filter((i) => i.status === status);
  if (q && String(q).trim()) {
    const s = String(q).toLowerCase();
    list = list.filter(
      (i) =>
        i.id.toLowerCase().includes(s) ||
        i.type.toLowerCase().includes(s) ||
        i.location.toLowerCase().includes(s)
    );
  }
  return list.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
}

export function getDashboardSummary() {
  const today = startOfTodayUtc();
  const todayCount = INCIDENTS.filter((i) => i.openedAt >= today).length;
  const active = INCIDENTS.filter((i) => isActive(i.status)).length;
  const resolved = INCIDENTS.filter((i) => i.status === 'Resolved').length;
  const withRt = INCIDENTS.filter((i) => i.responseTimeMinutes != null);
  const avgMins =
    withRt.length === 0
      ? 0
      : Math.round(withRt.reduce((a, i) => a + i.responseTimeMinutes, 0) / withRt.length);

  const metrics = [
    {
      key: 'active',
      title: 'Active Incidents',
      value: String(active),
      change: '20%',
      changePositive: false,
    },
    {
      key: 'today',
      title: "Today's Incidents",
      value: String(todayCount),
      change: '5%',
      changePositive: true,
    },
    {
      key: 'resolved',
      title: 'Resolved Cases',
      value: String(resolved),
      change: '12%',
      changePositive: true,
    },
    {
      key: 'avgResponse',
      title: 'Avg Response Time',
      value: `${avgMins}m`,
      change: '8%',
      changePositive: true,
    },
  ];

  const recentIncidents = [...INCIDENTS]
    .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
    .slice(0, 5)
    .map((i) => ({
      id: i.id,
      type: i.type,
      typeKey: i.typeKey,
      location: i.location,
      status: i.status,
      openedAt: i.openedAt,
    }));

  return {
    metrics,
    recentIncidents,
    incidentsOverTime: CHART_SERIES,
    incidentTypeBreakdown: TYPE_BREAKDOWN,
  };
}
