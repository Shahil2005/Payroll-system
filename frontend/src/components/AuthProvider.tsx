"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi, type SignupPayload } from "@/utils/api";
import {
  clearSession,
  getStoredUser,
  getToken,
  setSession,
  userCan,
  type AuthUser,
  type Permission,
} from "@/utils/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore + revalidate the session against the backend.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setUser(getStoredUser());
    authApi
      .me()
      .then((u) => setUser(u))
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setSession(res.access_token, res.user);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (payload: SignupPayload) => {
    const res = await authApi.signup(payload);
    setSession(res.access_token, res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* best effort — token may already be invalid */
    }
    clearSession();
    setUser(null);
    if (typeof window !== "undefined") window.location.href = "/login";
  }, []);

  const can = useCallback((permission: Permission) => userCan(user, permission), [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
