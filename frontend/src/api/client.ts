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
  // Media upload — used by merchant deal form for image + video attachment.
  // Accepts a local file URI (file:///, blob:, or web File) and returns a
  // hosted URL like `/api/media/<uuid>.mp4` that any client can consume.
  uploadMedia: async (fileUri: string, mimeType: string, name?: string) => {
    const form = new FormData();
    // On web we may be handed a File object; on native the URI-based shape works.
    if (typeof fileUri === "object" && (fileUri as any) instanceof File) {
      form.append("file", fileUri as any);
    } else {
      form.append("file", { uri: fileUri, name: name || `upload_${Date.now()}`, type: mimeType } as any);
    }
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    const res = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form as any,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const detail = data?.detail ?? `Upload failed (${res.status})`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    // Return an absolute URL so <Image>/<Video> can render across clients
    return { ...data, url: `${BASE_URL}${data.url}` } as { url: string; filename: string; bytes: number; content_type: string };
  },

  // Auth
  register: (email: string, password: string, name: string, referral_code?: string) =>
    request<{ access_token: string; user: any }>("/auth/register", {
      method: "POST",
      body: { email, password, name, referral_code },
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: any }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  resetPassword: (email: string, new_password: string) =>
    request<{ reset: boolean }>("/auth/reset-password", {
      method: "POST",
      body: { email, new_password },
    }),
  otpRequest: (phone: string) =>
    request<{ sent: boolean; demo_code?: string }>("/auth/otp/request", {
      method: "POST",
      body: { phone },
    }),
  otpVerify: (phone: string, code: string, name?: string, referral_code?: string) =>
    request<{ access_token: string; user: any }>("/auth/otp/verify", {
      method: "POST",
      body: { phone, code, name, referral_code },
    }),
  me: () => request("/auth/me", { auth: true }),
  updateMe: (patch: { name?: string; preferred_categories?: string[] }) =>
    request("/auth/me", { method: "PATCH", body: patch, auth: true }),

  // Categories & sample videos
  categories: () => request<any[]>("/categories"),
  sampleVideos: () => request<any[]>("/sample-videos"),

  // Merchants (public)
  listMerchants: (query?: { lat?: number; lng?: number; category?: string; q?: string }) =>
    request<any[]>("/merchants", { query }),
  getMerchant: (id: string, query?: { lat?: number; lng?: number }) =>
    request<any>(`/merchants/${id}`, { query }),
  toggleFollow: (id: string) =>
    request<{ following: boolean; favorited_merchants: string[] }>(`/merchants/${id}/follow`, {
      method: "POST",
      auth: true,
    }),

  // Deals (public)
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

  // Claims (customer)
  myClaims: (status?: string) =>
    request<any[]>("/claims/me", { auth: true, query: status ? { status } : undefined }),
  getClaim: (id: string) => request<any>(`/claims/${id}`, { auth: true }),
  cancelClaim: (id: string) =>
    request<any>(`/claims/${id}/cancel`, { method: "POST", auth: true }),

  // Merchant onboarding & profile
  merchantOnboard: (body: any) =>
    request<any>("/merchant/onboard", { method: "POST", body, auth: true }),
  merchantMe: () => request<any>("/merchant/me", { auth: true }),
  merchantUpdate: (patch: any) =>
    request<any>("/merchant/me", { method: "PATCH", body: patch, auth: true }),

  // Merchant deals
  merchantDeals: (include_drafts = true) =>
    request<any[]>("/merchant/deals", { auth: true, query: { include_drafts } }),
  merchantCreateDeal: (body: any) =>
    request<any>("/merchant/deals", { method: "POST", body, auth: true }),
  merchantPatchDeal: (id: string, patch: any) =>
    request<any>(`/merchant/deals/${id}`, { method: "PATCH", body: patch, auth: true }),
  merchantEndDeal: (id: string) =>
    request<any>(`/merchant/deals/${id}/end`, { method: "POST", auth: true }),
  merchantDuplicateDeal: (id: string) =>
    request<any>(`/merchant/deals/${id}/duplicate`, { method: "POST", auth: true }),
  merchantDeleteDeal: (id: string) =>
    request<any>(`/merchant/deals/${id}`, { method: "DELETE", auth: true }),

  // Merchant redemption
  merchantClaims: (status?: string) =>
    request<any[]>("/merchant/claims", { auth: true, query: status ? { status } : undefined }),
  merchantValidateCode: (code: string) =>
    request<any>("/merchant/redeem/validate", { method: "POST", body: { code }, auth: true }),
  merchantRedeem: (claim_id: string) =>
    request<any>("/merchant/redeem", { method: "POST", body: { claim_id }, auth: true }),
  merchantVoidClaim: (claim_id: string, reason: string) =>
    request<any>(`/merchant/claims/${claim_id}/void`, { method: "POST", body: { reason }, auth: true }),

  // Merchant analytics
  merchantAnalytics: () => request<any>("/merchant/analytics/summary", { auth: true }),

  // Merchant promos & chat
  merchantPromos: () => request<any[]>("/merchant/promo-codes", { auth: true }),
  merchantCreatePromo: (body: any) =>
    request<any>("/merchant/promo-codes", { method: "POST", body, auth: true }),
  merchantThreads: () => request<any[]>("/merchant/chat/threads", { auth: true }),
  chatSend: (merchant_id: string, text: string) =>
    request<any>("/chat/send", { method: "POST", body: { merchant_id, text }, auth: true }),
  chatThread: (merchant_id: string) =>
    request<any[]>(`/chat/thread/${merchant_id}`, { auth: true }),

  // Loyalty
  loyalty: () => request<any>("/loyalty/me", { auth: true }),

  // Notifications (in-app)
  notifications: (limit = 50) =>
    request<any[]>("/notifications", { auth: true, query: { limit } }),
  notificationsUnreadCount: () =>
    request<{ count: number }>("/notifications/unread-count", { auth: true }),
  markNotificationRead: (id: string) =>
    request<any>(`/notifications/${id}/read`, { method: "POST", auth: true }),
  markAllNotificationsRead: () =>
    request<any>("/notifications/read-all", { method: "POST", auth: true }),
  deleteNotification: (id: string) =>
    request<any>(`/notifications/${id}`, { method: "DELETE", auth: true }),
};
