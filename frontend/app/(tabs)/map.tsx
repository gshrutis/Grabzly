import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api } from "@/src/api/client";
import { useLocation } from "@/src/context/location";
import { CATEGORY_META, colors, radius, spacing, shadow } from "@/src/theme";
import LeafletMap from "@/src/components/LeafletMap";

export default function MapView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loc, requestPermission } = useLocation();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const m = await api.listMerchants({ lat: loc.lat, lng: loc.lng, category: activeCat || undefined });
        setMerchants(m);
      } catch (e) { console.warn(e); }
      setLoading(false);
    })();
  }, [loc.lat, loc.lng, activeCat]);

  const markers = merchants.map((m: any) => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    color: CATEGORY_META[m.category]?.color || colors.brand,
    label: (m.name?.charAt(0) || "").toUpperCase(),
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Nearby merchants</Text>
            <Text style={styles.subtitle}>{merchants.length} in {loc.label}</Text>
          </View>
          <TouchableOpacity
            testID="use-my-location-btn"
            style={styles.gpsBtn}
            onPress={requestPermission}
            activeOpacity={0.85}
          >
            <Ionicons name="locate" size={16} color={colors.white} />
            <Text style={styles.gpsBtnText}>My location</Text>
          </TouchableOpacity>
        </View>
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
              <Text style={[styles.filterChipText, activeCat === id && styles.filterChipTextActive]}>{meta.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <View style={styles.mapWrap}>
          <LeafletMap
            center={{ lat: loc.lat, lng: loc.lng }}
            zoom={13}
            markers={markers}
            onMarkerPress={(id) => setSelected(merchants.find((m) => m.id === id))}
            height="100%"
          />
        </View>
      )}

      {selected && (
        <TouchableOpacity
          testID="selected-merchant-card"
          style={[styles.cardWrap, { bottom: insets.bottom + 76 }]}
          onPress={() => router.push(`/store/${selected.id}`)}
          activeOpacity={0.9}
        >
          <Image source={{ uri: selected.cover_image }} style={styles.cardImage} contentFit="cover" />
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={styles.cardName} numberOfLines={1}>{selected.name}</Text>
              {selected.verified && <Ionicons name="checkmark-circle" size={14} color={colors.info} />}
            </View>
            <Text style={styles.cardMeta}>
              {selected.category.toUpperCase()} · {selected.distance_km?.toFixed(1) ?? "-"} km · ★ {selected.rating}
            </Text>
            <Text style={styles.cardAddress} numberOfLines={1}>{selected.address}</Text>
          </View>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeSel}>
            <Ionicons name="close" size={16} color={colors.muted} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2, marginBottom: spacing.md, fontWeight: "600" },
  gpsBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  gpsBtnText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  filterRow: { gap: 8, alignItems: "center", paddingRight: spacing.lg },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary, flexShrink: 0,
  },
  filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  filterChipTextActive: { color: colors.white },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapWrap: { flex: 1, margin: spacing.md, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  cardWrap: {
    position: "absolute", left: spacing.lg, right: spacing.lg,
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadow.cardStrong,
  },
  cardImage: { width: 56, height: 56, borderRadius: 12 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { fontSize: 15, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  cardMeta: { fontSize: 11, color: colors.muted, fontWeight: "600", marginTop: 2 },
  cardAddress: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  closeSel: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
});
