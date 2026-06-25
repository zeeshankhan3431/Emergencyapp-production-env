/**
 * Mobile JWT auth — caches access token for incidents/evidence API calls.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_BASE,
  MOBILE_SERVICE_EMAIL,
  MOBILE_SERVICE_PASSWORD,
} from '../config/apiConfig';

const TOKEN_KEY = 'era_mobile_access_token';

class AuthService {
  private token: string | null = null;

  async getToken(): Promise<string | null> {
    if (this.token) return this.token;
    try {
      this.token = await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
    return this.token;
  }

  async login(
    email = MOBILE_SERVICE_EMAIL,
    password = MOBILE_SERVICE_PASSWORD,
  ): Promise<string | null> {
    try {
      console.log('[AuthService] Attempting login to:', `${API_BASE}/auth/login`);
      console.log('[AuthService] Email:', email);
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      console.log('[AuthService] Login response status:', res.status);
      if (!res.ok) {
        console.error('[AuthService] Login failed with status:', res.status);
        return null;
      }
      const data = await res.json();
      console.log('[AuthService] Login response data:', data);
      const token = data.accessToken as string | undefined;
      if (!token) {
        console.error('[AuthService] No token in response');
        return null;
      }
      this.token = token;
      await AsyncStorage.setItem(TOKEN_KEY, token);
      console.log('[AuthService] Login successful, token stored');
      return token;
    } catch (err: any) {
      console.error('[AuthService] Login error:', err?.message ?? err);
      return null;
    }
  }

  async refreshToken(): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      const token = data.accessToken as string | undefined;
      if (!token) return null;
      this.token = token;
      await AsyncStorage.setItem(TOKEN_KEY, token);
      return token;
    } catch {
      return null;
    }
  }

  /** Ensure a valid token exists (login/refresh if needed). Returns null when API unreachable. */
  async ensureAuthenticated(): Promise<string | null> {
    const existing = await this.getToken();
    if (existing) return existing;
    const refreshed = await this.refreshToken();
    if (refreshed) return refreshed;
    return this.login();
  }

  async clear(): Promise<void> {
    this.token = null;
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export const authService = new AuthService();