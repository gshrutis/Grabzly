import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator,
  ScrollView, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import LeafletMap from "@/src/components/LeafletMap";
import { colors, radius, spacing, shadow } from "@/src/theme";

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number | string;
};

export type PickedLocation = { lat: number; lng: number; label: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (loc: PickedLocation) => void;
  initialLat: number;
  initialLng: number;
  initialLabel?: string;
  title?: string;
};

/**
 * Universal location picker: search-by-name (OpenStreetMap Nominatim),
 * use-my-GPS, and tap-to-drop-pin. Zero-key, works offline-degraded (search
 * simply fails silently if no network).
 */
export default function LocationPickerModal({
  visible, onClose, onConfirm, initialLat, initialLng, initialLabel, title = "Choose location",
}: Props) {
  const insets = useSafeAreaInsets();
  const [lat, setLat] = useState(initialLat);
  const [lng, setLng] = useState(initialLng);
  const [label, setLabel] = useState(initialLabel || "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setLat(initialLat);
      setLng(initialLng);
      setLabel(initialLabel || "");
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [visible, initialLat, initialLng, initialLabel]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q.trim())}`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const data = await res.json();
      if (Array.isArray(data)) setResults(data);
      else setResults([]);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  const onChangeQuery = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 350);
  };

  const pickResult = (r: SearchResult) => {
    const nlat = parseFloat(r.lat);
    const nlng = parseFloat(r.lon);
    if (Number.isFinite(nlat) && Number.isFinite(nlng)) {
      setLat(nlat);
      setLng(nlng);
      setLabel(r.display_name);
      setResults([]);
      setQuery(r.display_name);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const useMyGps = async () => {
    setError(null);
    setLocating(true);
    try {
      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && (navigator as any).geolocation) {
          await new Promise<void>((resolve) => {
            (navigator as any).geolocation.getCurrentPosition(
              (p: any) => {
                setLat(p.coords.latitude);
                setLng(p.coords.longitude);
                setLabel("Current location");
                resolve();
              },
              () => { setError("Location permission denied in this browser."); resolve(); },
              { timeout: 8000, enableHighAccuracy: true },
            );
          });
        } else {
          setError("Geolocation is not available in this browser.");
        }
      } else {
        const perm = await Location.getForegroundPermissionsAsync();
        let status = perm.status;
        let canAsk = perm.canAskAgain;
        if (status !== "granted" && canAsk) {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
          canAsk = req.canAskAgain;
        }
        if (status !== "granted") {
          setError(canAsk ? "Enable location permission and try again." : "Location denied. Open Settings to enable.");
        } else {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
          setLabel("Current location");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    } catch (e: any) {
      setError(e?.message || "Could not read GPS.");
    }
    setLocating(false);
  };

  const confirm = () => {
    Haptics.selectionAsync().catch(() => {});
    onConfirm({ lat, lng, label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  };

  const mapMarkers = useMemo(() => ([] as any[]), []);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheet}
        >
          <View style={[styles.sheetInner, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity testID="loc-picker-close" onPress={onClose} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                testID="loc-picker-search"
                value={query}
                onChangeText={onChangeQuery}
                placeholder="Search address, area, city…"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={() => runSearch(query)}
              />
              {searching && <ActivityIndicator size="small" color={colors.brand} />}
            </View>

            {results.length > 0 && (
              <View style={styles.resultsBox}>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
                  {results.map((r) => (
                    <TouchableOpacity
                      key={String(r.place_id)}
                      testID={`loc-result-${r.place_id}`}
                      style={styles.resultRow}
                      onPress={() => pickResult(r)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location-outline" size={16} color={colors.brand} />
                      <Text style={styles.resultText} numberOfLines={2}>{r.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                testID="loc-picker-gps"
                style={styles.gpsBtn}
                onPress={useMyGps}
                disabled={locating}
                activeOpacity={0.85}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <>
                    <Ionicons name="locate" size={14} color={colors.brand} />
                    <Text style={styles.gpsBtnText}>Use my GPS</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.pinInfo}>Pin: {lat.toFixed(4)}, {lng.toFixed(4)}</Text>
            </View>

            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.mapWrap}>
              <LeafletMap
                center={{ lat, lng }}
                zoom={15}
                tappable
                showUser={false}
                markers={mapMarkers}
                onTap={(la, lo) => { setLat(la); setLng(lo); setLabel(""); Haptics.selectionAsync().catch(() => {}); }}
                height="100%"
              />
            </View>

            <TouchableOpacity
              testID="loc-picker-confirm"
              style={styles.confirmBtn}
              onPress={confirm}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={18} color={colors.white} />
              <Text style={styles.confirmBtnText}>Confirm location</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { flex: 1, justifyContent: "flex-end" },
  sheetInner: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    height: "92%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface, flex: 1 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface },
  resultsBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  resultText: { flex: 1, fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  gpsBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
  pinInfo: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    marginBottom: spacing.sm,
    backgroundColor: "#FFE4E4",
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 12, fontWeight: "700" },
  mapWrap: { flex: 1, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  confirmBtn: {
    marginTop: spacing.md,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    ...shadow.cardStrong,
  },
  confirmBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
});
