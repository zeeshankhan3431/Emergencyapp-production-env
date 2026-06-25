import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, fetchCurrentUser, getAccessToken, setAccessToken } from '../lib/api';

const AUTH_KEY = 'ers_admin_auth';

const AuthContext = createContext(null);

function getStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setStoredUser(user) {
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_KEY);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback((userData) => {
    setUser(userData);
    setStoredUser(userData);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const stored = getStoredUser();
      const token = getAccessToken();

      if (!token && !stored) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (token) {
        try {
          const { user: me } = await fetchCurrentUser();
          if (!cancelled) {
            applyUser({
              id: me.id,
              name: me.fullName || me.email,
              email: me.email,
              role: me.role,
            });
          }
        } catch {
          // Token might be expired — try refresh via /auth/refresh
          try {
            const refreshed = await fetch('/api/auth/refresh', {
              method: 'POST',
              credentials: 'include',
            });
            if (refreshed.ok) {
              const data = await refreshed.json();
              if (data.accessToken) {
                setAccessToken(data.accessToken);
                const { user: me } = await fetchCurrentUser();
                if (!cancelled && me) {
                  applyUser({
                    id: me.id,
                    name: me.fullName || me.email,
                    email: me.email,
                    role: me.role,
                  });
                } else if (!cancelled) {
                  setAccessToken(null);
                  setUser(null);
                  setStoredUser(null);
                }
              } else {
                setAccessToken(null);
                setUser(null);
                setStoredUser(null);
              }
            } else {
              setAccessToken(null);
              setUser(null);
              setStoredUser(null);
            }
          } catch {
            setAccessToken(null);
            setUser(null);
            setStoredUser(null);
          }
        }
      } else if (stored) {
        if (!cancelled) setUser(stored);
      }

      if (!cancelled) setLoading(false);
    }

    restore();
    return () => { cancelled = true; };
  }, [applyUser]);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    const u = data.user;
    applyUser({
      id: u.id,
      name: u.fullName || u.email,
      email: u.email,
      role: u.role,
    });
    return true;
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setStoredUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}