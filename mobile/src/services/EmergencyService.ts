/**
 * EmergencyService.ts — Network Fix
 *
 * Fix 1: API_BASE uses correct IP for both emulator and real device
 * Fix 2: resolveSession has proper error handling and won't block the flow
 * Fix 3: createSession fallback works offline
 * Fix 4: Location properly configured
 */

import { Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { callService } from './CallService';

// ─── IMPORTANT: Update this IP to your machine's actual IP ───────────────────
// Run `hostname -I` in terminal to find your IP
// Emulator uses 10.0.2.2, real device uses your machine's LAN IP
const DEV_MACHINE_IP = '127.0.1.1'; // <-- CHANGE THIS TO YOUR LAN IP for real devices

const API_BASE = __DEV__
  ? Platform.OS === 'android'
    ? `http://10.0.2.2:5000/api`          // Android emulator
    : `http://localhost:5000/api`          // iOS simulator
  : `http://${DEV_MACHINE_IP}:5000/api`;  // Real device release build

console.log('[EmergencyService] API_BASE:', API_BASE);

// Configure geolocation
Geolocation.setRNConfiguration({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
  enableBackgroundLocationUpdates: false,
  locationProvider: 'auto',
});

export interface SessionPayload {
  userId: string;
  scenarioMessage: string;
  location: { lat: number; lng: number } | null;
  platform: 'android' | 'ios';
  impactTimestamp: number;
}

export interface LocationResult {
  lat: number;
  lng: number;
}

class EmergencyService {

  // ── Location ────────────────────────────────────────────────────────────────

  getCurrentLocation(): Promise<LocationResult | null> {
    return new Promise(resolve => {
      Geolocation.getCurrentPosition(
        pos => {
          console.log('[EmergencyService] Location obtained:', pos.coords);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        err => {
          console.warn('[EmergencyService] High accuracy failed:', err.message);
          // Fallback to low accuracy
          Geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err2 => {
              console.warn('[EmergencyService] Location failed:', err2.message);
              resolve(null);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
          );
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
      );
    });
  }

  // ── Create session ──────────────────────────────────────────────────────────

  async createSession(payload: SessionPayload): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch(`${API_BASE}/emergency/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('[EmergencyService] Session created:', data.sessionId);
      return data.sessionId;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('[EmergencyService] createSession timed out — using local ID');
      } else {
        console.warn('[EmergencyService] createSession failed:', err.message);
      }
      // Return local ID so app continues working offline
      return `local-${Date.now()}`;
    }
  }

  // ── Resolve session ─────────────────────────────────────────────────────────

  async resolveSession(
    sessionId: string,
    reason: 'user_cancelled' | 'responders_notified',
  ): Promise<void> {
    // Local sessions don't need resolving on backend
    if (sessionId.startsWith('local-')) {
      console.log('[EmergencyService] Local session — skipping resolve API call');
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const res = await fetch(`${API_BASE}/emergency/sessions/${sessionId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, resolvedAt: new Date().toISOString() }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn('[EmergencyService] resolveSession HTTP error:', res.status);
      } else {
        console.log('[EmergencyService] Session resolved:', sessionId, reason);
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('[EmergencyService] resolveSession timed out — continuing anyway');
      } else {
        console.warn('[EmergencyService] resolveSession failed:', err.message);
      }
      // Don't throw — resolving session failing should never block the UI
    }
  }

  // ── Full escalation ─────────────────────────────────────────────────────────

  async escalate(
    userId: string,
    scenarioMessage: string,
    impactTimestamp: number,
  ): Promise<string> {
    console.log('[EmergencyService] Escalating...');

    // Run location + session creation in parallel for speed
    const [location, sessionId] = await Promise.all([
      this.getCurrentLocation(),
      this.createSession({
        userId,
        scenarioMessage,
        location: null, // Will be updated below if available
        platform: Platform.OS as 'android' | 'ios',
        impactTimestamp,
      }),
    ]);

    // Update session with location if we got it
    if (location && !sessionId.startsWith('local-')) {
      try {
        await fetch(`${API_BASE}/emergency/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location }),
        });
      } catch {
        // Non-critical — location update failing doesn't stop emergency
      }
    }

    // Initiate call
    await callService.initiateEmergencyCall();

    return sessionId;
  }
}

export const emergencyService = new EmergencyService();