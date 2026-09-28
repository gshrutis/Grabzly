/**
 * Live system settings — sourced from `/api/settings` (admin-controlled).
 * A tiny always-on provider so the whole app can react to admin changes without
 * a rebuild. Cached in AsyncStorage so first render doesn't flicker.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

export type SystemSettings = {
  brand_name: string;
  brand_logo_url: string | null;
  support_email: string | null;
  default_deal_radius_km: number;
  loyalty_points_per_redemption: number;
  referral_referrer_reward: number;
  referral_referee_reward: number;
  guest_browsing_enabled: boolean;
  reels_tab_enabled: boolean;
};

const DEFAULTS: SystemSettings = {
  brand_name: "Happy Hour",
  brand_logo_url: null,
  support_email: null,
  default_deal_radius_km: 5,
  loyalty_points_per_redemption: 25,
  referral_referrer_reward: 200,
  referral_referee_reward: 100,
  guest_browsing_enabled: true,
  reels_tab_enabled: true,
};

const CACHE_KEY = "hh_settings_cache";

type Ctx = {
  settings: SystemSettings;
  refresh: () => Promise<void>;
};
const SettingsCtx = createContext<Ctx>({ settings: DEFAULTS, refresh: async () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULTS);

  const refresh = useCallback(async () => {
    try {
      const s = await api.readPublicSettings();
      const next = { ...DEFAULTS, ...(s || {}) } as SystemSettings;
      setSettings(next);
      await storage.setItem(CACHE_KEY, next);
    } catch {
      // Keep last known values on failure.
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await storage.getItem<SystemSettings | null>(CACHE_KEY, null);
      if (cached && typeof cached === "object") setSettings({ ...DEFAULTS, ...cached });
      await refresh();
    })();
  }, [refresh]);

  const value = useMemo(() => ({ settings, refresh }), [settings, refresh]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  return useContext(SettingsCtx);
}
