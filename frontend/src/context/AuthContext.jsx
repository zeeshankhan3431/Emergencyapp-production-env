import { createContext, useContext, useState, useEffect } from 'react';

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

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const login = (email, password) => {
    // Demo: accept admin@example.com / admin123 (or admin / admin123)
    const isAdmin =
      (email === 'admin@example.com' && password === 'admin123') ||
      (email === 'admin' && password === 'admin123');
    if (!isAdmin) return false;
    const userData = {
      name: 'Alex Morgan',
      email: email === 'admin' ? 'admin@example.com' : email,
      role: 'Admin',
    };
    setUser(userData);
    setStoredUser(userData);
    return true;
  };

  const logout = () => {
    setUser(null);
    setStoredUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
