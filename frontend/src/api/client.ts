import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "hh_session_token";

/**
 * Resolve any media URL to an absolute path the phone/web client can render.
 * - `/api/media/xyz.jpg` → `<BASE_URL>/api/media/xyz.jpg`
 * - `http(s)://…`        → passed through
 * - `data:…`             → passed through
 * - falsy                → returned as-is
 */
export function resolveMediaUrl<T extends string | null | undefined>(u: T): T {
  if (!u || typeof u !== "string") return u;
  if (u.startsWith("/api/") || u.startsWith("/media/")) {
    return (`${BASE_URL}${u.startsWith("/media/") ? "/api" : ""}${u}`) as T;
  }
  return u;
}

// Recursively rewrite common media-carrying fields so downstream code
// (Image, VideoView, etc.) always sees absolute URLs.
const MEDIA_FIELDS = new Set([
  "image_url", "video_url", "logo", "cover_image", "avatar", "photo", "thumbnail",
  "hero_image", "url",
]);

function rewriteMedia(value: any): any {
  if (Array.isArray(value)) return value.map(rewriteMedia);
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && MEDIA_FIELDS.has(k)) {
        out[k] = resolveMediaUrl(v);
      } else if (v && (Array.isArray(v) || typeof v === "object")) {
        out[k] = rewriteMedia(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return value;
}

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
  return rewriteMedia(data) as T;
}

export const api = {
  // Media upload — used by merchant deal form for image + video attachment.
  // Accepts a local file URI (file:///, blob:, or web object URL) and returns
  // a hosted URL like `/api/files/<path>` that any client can render.
  //
  // Platform handling:
  //   • Web: fetch the URI → Blob → append as a real File (multipart parser
  //     needs a Blob/File instance, NOT a `{uri,name,type}` plain object which
  //     JSON.stringify's into garbage and produces the ‑1KB "[object Object]"
  //     upload bug the merchant deal form was hitting).
  //   • Native (iOS/Android/Expo Go): the React Native FormData polyfill
  //     accepts `{uri,name,type}` and streams the file from disk; a Blob
  //     would fail to serialize on native.
  uploadMedia: async (fileUri: string, mimeType: string, name?: string) => {
    if (!fileUri || typeof fileUri !== "string") {
      throw new Error("uploadMedia requires a file URI string");
    }
    const filename = name || `upload_${Date.now()}.${(mimeType.split("/")[1] || "bin").split(";")[0]}`;
    const form = new FormData();

    if (Platform.OS === "web") {
      // Convert the (blob: / data: / http:) URL to an actual File/Blob before append.
      const blob = await (await fetch(fileUri)).blob();
      // Use File where possible so `filename` is preserved end-to-end.
      const file: any = typeof File !== "undefined"
        ? new File([blob], filename, { type: mimeType || blob.type })
        : blob;
      form.append("file", file, filename);
    } else {
      // Native: the RN FormData polyfill reads `{ uri, name, type }` and streams
      // the file from disk directly — DO NOT wrap this in JSON.
      form.append("file", { uri: fileUri, name: filename, type: mimeType } as any);
    }

    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    const res = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      headers: {
        // IMPORTANT: do NOT set Content-Type manually — fetch will set
        // `multipart/form-data; boundary=…` correctly from the FormData body.
        // Setting it here (e.g. `application/json`) is what caused the
        // previous "sending plain object" symptom.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form as any,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const detail = data?.detail ?? `Upload failed (${res.status})`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    // Return an absolute URL so <Image>/<Video> can render across clients
    return { ...data, url: resolveMediaUrl(data.url) } as { url: string; filename: string; bytes: number; content_type: string };
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
  switchRole: (role: "customer" | "merchant") =>
    request<any>("/auth/switch-role", { method: "POST", body: { role }, auth: true }),
  updateMe: (patch: { name?: string; preferred_categories?: string[] }) =>
    request("/auth/me", { method: "PATCH", body: patch, auth: true }),

  // Categories & sample videos
  categories: () => request<any[]>("/categories"),
  sampleVideos: () => request<any[]>("/sample-videos"),

  // Public system settings (admin-managed)
  readPublicSettings: () => request<any>("/settings"),

  // Cities (admin-managed, read-only public)
  listCities: (query?: { lat?: number; lng?: number }) =>
    request<any[]>("/cities", { query }),

  // Merchants (public)
  listMerchants: (query?: { lat?: number; lng?: number; category?: string; q?: string; city?: string }) =>
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
    live_now?: boolean; q?: string; max_km?: number; sort?: string; city?: string;
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
