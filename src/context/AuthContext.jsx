import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { identifyUser, resetAnalytics } from '../analytics';

const TOKEN_KEY = 'pokewatch-token';
const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) identifyUser(user);
    else resetAnalytics();
  }, [user]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email, password) => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Registration failed');
    // No token yet — the account is pending approval, not logged in.
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  // Persisted server-side (not localStorage) so the one-time welcome splash
  // stays dismissed across devices/browsers, not just the one it was seen
  // on. Updates local state optimistically so the splash closes immediately
  // rather than waiting on the request.
  const markOnboarded = useCallback(() => {
    setUser((u) => (u ? { ...u, hasOnboarded: true } : u));
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch('/api/auth/onboarded', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, markOnboarded }}>
      {children}
    </AuthContext.Provider>
  );
}
