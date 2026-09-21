import React, { createContext, useContext, useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=guest, object=user
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  useEffect(() => {
    const hash = window.location.hash || "";
    if (hash.includes("session_id=")) {
      const sid = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
      api
        .post("/auth/session", { session_id: sid })
        .then(({ data }) => {
          localStorage.setItem("apex_token", data.token);
          setUser(data.user);
        })
        .catch(() => setUser(false))
        .finally(() => {
          window.history.replaceState({}, "", window.location.pathname);
        });
      return;
    }
    const token = localStorage.getItem("apex_token");
    if (!token) {
      setUser(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {
        localStorage.removeItem("apex_token");
        setUser(false);
      });
  }, []);

  const loginWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("apex_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    localStorage.setItem("apex_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("apex_token");
    setUser(false);
  };

  const openAuth = (mode = "login") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, register, logout, loginWithGoogle, authOpen, setAuthOpen, authMode, setAuthMode, openAuth, formatApiErrorDetail }}
    >
      {children}
    </AuthContext.Provider>
  );
}
