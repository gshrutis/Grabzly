import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api/client";

type User = {
  id: string;
  email: string;
  name: string;
  role?: "customer" | "merchant" | "admin" | "super_admin";
  roles?: string[];
  active_role?: string;
  preferred_categories?: string[];
  favorited_merchants?: string[];
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, referral_code?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setSession: (token: string, user: User) => Promise<void>;
  switchRole: (role: "customer" | "merchant") => Promise<void>;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await storage.secureGet<string>(TOKEN_KEY, "");
      if (stored) {
        setToken(stored);
        try {
          const me = await api.me();
          setUser(me as User);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
          setToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string, referral_code?: string) => {
    const res = await api.register(email, password, name, referral_code);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    // Read latest token from secure storage in case an out-of-band flow (e.g. OTP)
    // wrote a token but didn't call setSession. Falls back to the in-memory token.
    let activeToken = token;
    if (!activeToken) {
      const stored = await storage.secureGet<string>(TOKEN_KEY, "");
      if (stored) {
        activeToken = stored;
        setToken(stored);
      }
    }
    if (!activeToken) return;
    try {
      const me = await api.me();
      setUser(me as User);
    } catch {}
  }, [token]);

  const setSession = useCallback(async (nextToken: string, nextUser: User) => {
    await storage.secureSet(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const switchRole = useCallback(async (role: "customer" | "merchant") => {
    const res = await api.switchRole(role);
    if (res?.user) setUser(res.user as User);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, signIn, signUp, signOut, refresh, setSession, switchRole }),
    [user, token, loading, signIn, signUp, signOut, refresh, setSession, switchRole],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
