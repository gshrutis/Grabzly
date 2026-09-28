/**
 * Admin Panel context — token + admin profile, persisted to secure storage.
 * Uses email/password auth via /api/admin/auth/login. Kept separate from the
 * customer `useAuth()` so an admin session doesn't override a customer one.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "hh_admin_token";
const ADMIN_KEY = "hh_admin_profile";
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type AdminProfile = { id: string; email: string; name?: string; role: "admin" | "super_admin" };

async function readKey(k: string): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(k) ?? null;
  return SecureStore.getItemAsync(k);
}
async function writeKey(k: string, v: string | null) {
  if (Platform.OS === "web") {
    if (v) globalThis.localStorage?.setItem(k, v);
    else globalThis.localStorage?.removeItem(k);
    return;
  }
  if (v) await SecureStore.setItemAsync(k, v);
  else await SecureStore.deleteItemAsync(k);
}

type Ctx = {
  admin: AdminProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  request: <T = any>(path: string, init?: RequestInit & { query?: Record<string, any> }) => Promise<T>;
};
const AdminCtx = createContext<Ctx | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await readKey(KEY);
      const p = await readKey(ADMIN_KEY);
      if (t) setToken(t);
      if (p) try { setAdmin(JSON.parse(p)); } catch {}
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE}/api/admin/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.detail || `Login failed (${res.status})`);
    await writeKey(KEY, body.access_token);
    await writeKey(ADMIN_KEY, JSON.stringify(body.admin));
    setToken(body.access_token); setAdmin(body.admin);
  }, []);

  const logout = useCallback(async () => {
    await writeKey(KEY, null); await writeKey(ADMIN_KEY, null);
    setToken(null); setAdmin(null);
  }, []);

  const request = useCallback(async <T = any>(path: string, init?: RequestInit & { query?: Record<string, any> }): Promise<T> => {
    let url = `${BASE}${path}`;
    if (init?.query) {
      const p = new URLSearchParams();
      Object.entries(init.query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.append(k, String(v)); });
      const qs = p.toString(); if (qs) url += `?${qs}`;
    }
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as any || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (res.status === 401 || res.status === 403) {
      // token invalid → drop
      await writeKey(KEY, null); await writeKey(ADMIN_KEY, null);
      setToken(null); setAdmin(null);
    }
    if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : `Request failed (${res.status})`);
    return data as T;
  }, [token]);

  const value = useMemo(() => ({ admin, token, loading, login, logout, request }), [admin, token, loading, login, logout, request]);
  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminAuthProvider>");
  return ctx;
}
