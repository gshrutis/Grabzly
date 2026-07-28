import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "hh_session_token";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; query?: Record<string, any> } = {},
): Promise<T> {
  const { method = "GET", body, auth = false, query } = opts;
  let url = `${BASE_URL}/api${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
    });
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) Object.assign(headers, await authHeaders());

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail ?? `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export const api = {
  // Auth
  register: (email: string, password: string, name: string) =>
    request<{ access_token: string; user: any }>("/auth/register", {
      method: "POST",
      body: { email, password, name },
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: any }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  me: () => request("/auth/me", { auth: true }),
  updateMe: (patch: { name?: string; preferred_categories?: string[] }) =>
    request("/auth/me", { method: "PATCH", body: patch, auth: true }),

  // Categories
  categories: () => request<any[]>("/categories"),

  // Merchants
  listMerchants: (query?: { lat?: number; lng?: number; category?: string; q?: string }) =>
    request<any[]>("/merchants", { query }),
  getMerchant: (id: string, query?: { lat?: number; lng?: number }) =>
    request<any>(`/merchants/${id}`, { query }),
  toggleFollow: (id: string) =>
    request<{ following: boolean; favorited_merchants: string[] }>(`/merchants/${id}/follow`, {
      method: "POST",
      auth: true,
    }),

  // Deals
  listDeals: (query?: {
    lat?: number; lng?: number; category?: string; deal_type?: string;
    live_now?: boolean; q?: string; max_km?: number; sort?: string;
  }) => request<any[]>("/deals", { query }),
  liveNow: (query?: { lat?: number; lng?: number }) =>
    request<any[]>("/deals/live-now", { query }),
  reels: () => request<any[]>("/deals/reels"),
  getDeal: (id: string, query?: { lat?: number; lng?: number }) =>
    request<any>(`/deals/${id}`, { query }),
  claimDeal: (id: string) =>
    request<any>(`/deals/${id}/claim`, { method: "POST", auth: true }),

  // Claims
  myClaims: (status?: string) =>
    request<any[]>("/claims/me", { auth: true, query: status ? { status } : undefined }),
  getClaim: (id: string) => request<any>(`/claims/${id}`, { auth: true }),
  cancelClaim: (id: string) =>
    request<any>(`/claims/${id}/cancel`, { method: "POST", auth: true }),

  // Seed (idempotent)
  seed: () => request("/seed", { method: "POST" }),
};
