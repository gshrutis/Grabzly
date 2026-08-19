import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

type LocationState = {
  lat: number;
  lng: number;
  label: string;
  isFallback: boolean;
};

type Ctx = {
  loc: LocationState;
  granted: boolean;
  canAskAgain: boolean;
  requesting: boolean;
  requestPermission: () => Promise<boolean>;
  setManual: (lat: number, lng: number, label: string) => Promise<void>;
};

// Default anchor: San Francisco (matches backend seed).
const DEFAULT_LOC: LocationState = {
  lat: 37.7749,
  lng: -122.4194,
  label: "San Francisco, CA (default)",
  isFallback: true,
};

const LOC_KEY = "hh_last_location";

const LocationCtx = createContext<Ctx | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState<LocationState>(DEFAULT_LOC);
  const [granted, setGranted] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    (async () => {
      const cached = await storage.getItem<string>(LOC_KEY, "");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setLoc(parsed);
        } catch {}
      }
    })();
  }, []);

  const requestPermission = useCallback(async () => {
    setRequesting(true);
    try {
      if (Platform.OS === "web") {
        // Use browser geolocation on web
        if (typeof navigator !== "undefined" && (navigator as any).geolocation) {
          const pos: any = await new Promise((resolve, reject) => {
            (navigator as any).geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          }).catch(() => null);
          if (pos && pos.coords) {
            const next: LocationState = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              label: "Current location",
              isFallback: false,
            };
            setLoc(next);
            setGranted(true);
            await storage.setItem(LOC_KEY, JSON.stringify(next));
            setRequesting(false);
            return true;
          }
        }
        setRequesting(false);
        return false;
      }
      const perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      let canAsk = perm.canAskAgain;
      if (status !== "granted" && canAsk) {
        const res = await Location.requestForegroundPermissionsAsync();
        status = res.status;
        canAsk = res.canAskAgain;
      }
      setCanAskAgain(canAsk);
      if (status === "granted") {
        setGranted(true);
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const next: LocationState = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Current location",
          isFallback: false,
        };
        setLoc(next);
        await storage.setItem(LOC_KEY, JSON.stringify(next));
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setRequesting(false);
    }
  }, []);

  const setManual = useCallback(async (lat: number, lng: number, label: string) => {
    const next: LocationState = { lat, lng, label, isFallback: true };
    setLoc(next);
    await storage.setItem(LOC_KEY, JSON.stringify(next));
  }, []);

  const value = useMemo(
    () => ({ loc, granted, canAskAgain, requesting, requestPermission, setManual }),
    [loc, granted, canAskAgain, requesting, requestPermission, setManual],
  );

  return <LocationCtx.Provider value={value}>{children}</LocationCtx.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationCtx);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
