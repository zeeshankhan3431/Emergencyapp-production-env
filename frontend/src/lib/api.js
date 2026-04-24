const BASE = '/api';

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function getHealth() {
  return request('/health');
}

/** Full SAP PM bundle (Milestone 3). */
export function getEquipmentBundle(equipmentNumber) {
  return request(`/equipment/${encodeURIComponent(equipmentNumber)}`);
}

/** QR resolve (Milestone 2) — optional full bundle. */
export function resolveQr(raw, { includeBundle = false } = {}) {
  const q = includeBundle ? '?bundle=1' : '';
  return request(`/qr/resolve${q}`, {
    method: 'POST',
    body: JSON.stringify({ raw, includeBundle }),
  });
}

/** Admin dashboard summary (metrics, recent incidents, chart series, type breakdown). */
export function getDashboardSummary() {
  return request('/dashboard/summary');
}

/** All incidents (optional query: status, q). */
export function getIncidents(params = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  const qs = search.toString();
  return request(`/incidents${qs ? `?${qs}` : ''}`);
}
