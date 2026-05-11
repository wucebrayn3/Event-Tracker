import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { request } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadMe = async (activeToken = token) => {
    if (!activeToken) {
      setUser(null);
      return;
    }
    const me = await request("/auth/me/", { token: activeToken });
    setUser(me);
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    loadMe(token).catch(() => {
      setToken("");
      localStorage.removeItem("token");
    });
  }, [token]);

  const login = async (payload) => {
    setLoading(true);
    try {
      const data = await request("/auth/login/", { method: "POST", body: payload });
      setToken(data.token);
      localStorage.setItem("token", data.token);
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload) => {
    setLoading(true);
    try {
      const data = await request("/auth/register/", { method: "POST", body: payload });
      setToken(data.token);
      localStorage.setItem("token", data.token);
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
  };

  const value = useMemo(
    () => ({ token, user, loading, login, register, logout, refreshMe: loadMe }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return ctx;
}
