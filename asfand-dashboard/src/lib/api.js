const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'ers_access_token';

export function getAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' });
  
  // Auto-refresh on 401
  if (res.status === 401 && token) {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.accessToken) {
          setAccessToken(data.accessToken);
          headers.Authorization = `Bearer ${data.accessToken}`;
          const retryRes = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' });
          const text = await retryRes.text();
          let data;
          try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
          if (!retryRes.ok) {
            const err = new Error(data?.message || data?.error || retryRes.statusText);
            err.status = retryRes.status;
            err.data = data;
            throw err;
          }
          return data;
        }
      }
    } catch {
      // Refresh failed, clear token and redirect will handle login
      setAccessToken(null);
    }
  }
  
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

export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.accessToken) {
    setAccessToken(data.accessToken);
  }
  return data;
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    // ignore — clear local state regardless
  }
  setAccessToken(null);
}

export async function fetchCurrentUser() {
  return request('/auth/me');
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
  return request(`/dashboard/incidents${qs ? `?${qs}` : ''}`);
}

/** Delete incident (Admin) — returns { ok, active_incidents, created_today } */
export function deleteIncident(id) {
  return request(`/dashboard/incidents/${id}`, { method: 'DELETE' });
}

/** Dashboard anonymised map points */
export function getMapPoints(days = 30) {
  return request(`/dashboard/map?days=${days}`);
}

/** Incidents over time for a given range: 'today' | '7days' | '30days' */
export function getIncidentsOverTimeRange(range = 'today') {
  return request(`/dashboard/incidents-over-time?range=${range}`);
}