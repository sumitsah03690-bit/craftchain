// ──────────────────────────────────────────────
// AuthContext — JWT auth state for CraftChain
//
// Enhanced with:
// - 401 auto-logout + redirect in authFetch
// ──────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const API = "/api";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("cc_token"));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Centralized logout (also used by authFetch on 401) ──
  const doLogout = useCallback(() => {
    localStorage.removeItem("cc_token");
    setToken(null);
    setUser(null);
  }, []);

  // ── authFetch: fetch wrapper that injects Bearer token ──
  // Automatically handles 401 by logging out + redirecting.
  const authFetch = useCallback(
    async (url, options = {}) => {
      const headers = { "Content-Type": "application/json", ...options.headers };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(url, { ...options, headers });

      // ── 401 interception: auto-logout + redirect ──
      if (res.status === 401) {
        doLogout();
        // Redirect to login — safe even during render
        window.location.replace("/login");
        // Return the response so callers don't crash
        return res;
      }

      return res;
    },
    [token, doLogout]
  );

  // ── On mount / token change: validate token via /api/me ──
  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();

        if (!cancelled) {
          if (json.success) {
            setUser(json.data.user);
          } else {
            // Token invalid → clear
            localStorage.removeItem("cc_token");
            setToken(null);
            setUser(null);
          }
        }
      } catch {
        if (!cancelled) {
          // Network error — keep token, clear user
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── login ──────────────────────────────────────
  const login = async (emailOrUsername, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrUsername, password }),
    });
    const json = await res.json();

    if (!json.success) {
      throw new Error(json.message || "Login failed.");
    }

    localStorage.setItem("cc_token", json.data.token);
    setToken(json.data.token);
    setUser(json.data.user);
    return json.data;
  };

  // ── signup ─────────────────────────────────────
  const signup = async (username, email, password) => {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const json = await res.json();

    if (!json.success) {
      throw new Error(json.message || "Signup failed.");
    }

    // Auto-login after signup
    await login(email, password);
    return json.data;
  };

  // ── logout ─────────────────────────────────────
  const logout = doLogout;

  const value = { token, user, loading, login, signup, logout, authFetch };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
