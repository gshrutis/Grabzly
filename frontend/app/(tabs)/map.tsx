import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api/client";
import { useLocation } from "@/src/context/location";
import { CATEGORY_META, colors, radius, spacing, shadow } from "@/src/theme";

/**
 * Stylized "map" view — since react-native-maps needs native builds and doesn't render
 * cleanly on Expo web preview, we render a playful pin-cluster canvas that positions
 * merchants relative to the user's anchor by lat/lng offset. This preserves the spatial
 * discovery UX while working everywhere the app runs.
 */

const CANVAS_W = 340;
const CANVAS_H = 460;
const SCALE = 8000; // degrees to pixels (roughly ~1 pixel per 12m)

export default function MapView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loc } = useLocation();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const m = await api.listMerchants({
          lat: loc.lat,
          lng: loc.lng,
          category: activeCat || undefined,
        });
        setMerchants(m);
      } catch (e) {
        console.warn(e);
      }
      setLoading(false);
    })();
  }, [loc.lat, loc.lng, activeCat]);

  const pins = merchants.map((m) => {
    const dx = (m.lng - loc.lng) * SCALE;
    const dy = (m.lat - loc.lat) * SCALE;
    const x = Math.max(20, Math.min(CANVAS_W - 40, CANVAS_W / 2 + dx));
    const y = Math.max(20, Math.min(CANVAS_H - 60, CANVAS_H / 2 - dy));
    const meta = CATEGORY_META[m.category] || { color: colors.brand, icon: "pricetag" };
    return { m, x, y, meta };
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Map view</Text>
        <Text style={styles.subtitle}>{merchants.length} merchants near {loc.label}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            testID="map-filter-all"
            onPress={() => setActiveCat(null)}
            style={[styles.filterChip, activeCat === null && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, activeCat === null && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {Object.entries(CATEGORY_META).map(([id, meta]) => (
            <TouchableOpacity
              key={id}
              testID={`map-filter-${id}`}
              onPress={() => setActiveCat(id)}
              style={[styles.filterChip, activeCat === id && { backgroundColor: meta.color, borderColor: meta.color }]}
            >
              <Ionicons name={meta.icon as any} size={12} color={activeCat === id ? colors.white : meta.color} />
              <Text style={[styles.filterChipText, activeCat === id && styles.filterChipTextActive]}>
                {meta.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <>
          <View style={styles.canvasWrap}>
            <View style={styles.canvas}>
              <LinearGradient
                colors={["#F2EBE5", "#FFE3D9"]}
                style={StyleSheet.absoluteFillObject}
              />
              {/* Grid lines */}
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={`h-${i}`} style={[styles.gridLine, { top: (i + 1) * (CANVAS_H / 6) }]} />
              ))}
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={`v-${i}`} style={[styles.gridLineV, { left: (i + 1) * (CANVAS_W / 5) }]} />
              ))}

              {/* User pin (center) */}
              <View style={[styles.youPin, { left: CANVAS_W / 2 - 12, top: CANVAS_H / 2 - 12 }]}>
                <View style={styles.youDot} />
                <View style={styles.youRing} />
              </View>

              {/* Merchant pins */}
              {pins.map(({ m, x, y, meta }) => (
                <TouchableOpacity
                  key={m.id}
                  testID={`pin-${m.id}`}
                  style={[styles.pin, { left: x - 18, top: y - 18, backgroundColor: meta.color }]}
                  onPress={() => setSelected(m)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={meta.icon as any} size={16} color={colors.white} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {selected ? (
            <TouchableOpacity
              testID="selected-merchant-card"
              style={styles.cardWrap}
              onPress={() => router.push(`/store/${selected.id}`)}
              activeOpacity={0.9}
            >
              <Image source={{ uri: selected.cover_image }} style={styles.cardImage} contentFit="cover" />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>{selected.name}</Text>
                  {selected.verified && (
                    <Ionicons name="checkmark-circle" size={14} color={colors.info} />
                  )}
                </View>
                <Text style={styles.cardMeta}>
                  {selected.category.toUpperCase()} · {selected.distance_km?.toFixed(1) ?? "-"} km · ★ {selected.rating}
                </Text>
                <Text style={styles.cardAddress} numberOfLines={1}>{selected.address}</Text>
              </View>
              <View style={styles.cardArrow}>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.hint}>
              <Text style={styles.hintText}>Tap a pin to see the store details.</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  filterRow: { gap: 8, alignItems: "center", paddingRight: spacing.lg },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  canvasWrap: {
    alignItems: "center",
    padding: spacing.lg,
  },
  canvas: {
    width: CANVAS_W,
    height: CANVAS_H,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridLine: {
    position: "absolute", left: 0, right: 0, height: 1,
    backgroundColor: "rgba(45,36,34,0.06)",
  },
  gridLineV: {
    position: "absolute", top: 0, bottom: 0, width: 1,
    backgroundColor: "rgba(45,36,34,0.06)",
  },
  youPin: {
    position: "absolute",
    width: 24, height: 24,
    alignItems: "center", justifyContent: "center",
  },
  youDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.info,
    borderWidth: 3, borderColor: colors.white,
  },
  youRing: {
    position: "absolute",
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: colors.info,
    opacity: 0.35,
  },
  pin: {
    position: "absolute",
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.white,
    ...shadow.cardStrong,
  },
  cardWrap: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.md,
    ...shadow.card,
  },
  cardImage: {
    width: 60, height: 60, borderRadius: 12,
  },
  cardBody: { flex: 1 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.onSurface,
    flexShrink: 1,
  },
  cardMeta: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2,
  },
  cardAddress: {
    fontSize: 12,
    color: colors.onSurfaceTertiary,
    marginTop: 2,
  },
  cardArrow: { paddingRight: spacing.sm },
  hint: {
    alignItems: "center",
    padding: spacing.lg,
  },
  hintText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
});
