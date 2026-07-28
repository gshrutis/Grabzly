import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useLocation } from "@/src/context/location";
import { colors, radius, spacing, shadow } from "@/src/theme";
import CategoryChips from "@/src/components/CategoryChips";
import DealCard from "@/src/components/DealCard";
import Countdown from "@/src/components/Countdown";
import EmptyState from "@/src/components/EmptyState";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

type SortKey = "distance" | "discount" | "expiring" | "rating" | "price_low";

const DEAL_TYPES: { id: string | null; label: string; icon: string }[] = [
  { id: null, label: "All", icon: "sparkles" },
  { id: "flash", label: "Flash", icon: "flash" },
  { id: "regular", label: "Regular", icon: "pricetag" },
  { id: "video", label: "Video", icon: "videocam" },
];

const RADIUS_OPTIONS = [
  { label: "0.5km", value: 0.5 },
  { label: "1km", value: 1 },
  { label: "3km", value: 3 },
  { label: "5km", value: 5 },
  { label: "10km+", value: 999 },
];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "distance", label: "Nearest" },
  { id: "discount", label: "Biggest discount" },
  { id: "expiring", label: "Expiring soon" },
  { id: "rating", label: "Top rated" },
  { id: "price_low", label: "Price: low→high" },
];

export default function HomeFeed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loc } = useLocation();
  const [cats, setCats] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [maxKm, setMaxKm] = useState<number>(999);
  const [sort, setSort] = useState<SortKey | null>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [liveDeals, setLiveDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [c, d, l] = await Promise.all([
        api.categories(),
        api.listDeals({
          lat: loc.lat, lng: loc.lng,
          category: selectedCat || undefined,
          deal_type: selectedType || undefined,
          max_km: maxKm < 999 ? maxKm : undefined,
          sort: sort || undefined,
        }),
        api.liveNow({ lat: loc.lat, lng: loc.lng }),
      ]);
      setCats(c);
      setDeals(d);
      setLiveDeals(l);
    } catch (e) {
      console.warn("fetch feed error", e);
    }
  }, [loc.lat, loc.lng, selectedCat, selectedType, maxKm, sort]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const listHeader = useMemo(() => (
    <View>
      {/* LIVE NOW */}
      {liveDeals.length > 0 && (
        <View style={styles.liveSection}>
          <View style={styles.liveHeader}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTitle}>Live now</Text>
            <Text style={styles.liveSub}>expires within 60 min</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRow}>
            {liveDeals.map((d) => (
              <TouchableOpacity
                key={d.id}
                testID={`live-card-${d.id}`}
                style={styles.liveCard}
                onPress={() => router.push(`/deal/${d.id}`)}
                activeOpacity={0.9}
              >
                {d.image_url && (
                  <Image source={{ uri: d.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                )}
                <LinearGradient
                  colors={["transparent", "rgba(45,36,34,0.9)"]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.livePill}>
                  <Ionicons name="flash" size={12} color={colors.white} />
                  <Countdown expiresAt={d.expires_at} style={styles.livePillText} />
                </View>
                <View style={styles.liveContent}>
                  <Text style={styles.liveDiscount}>{Math.round(d.discount_pct || 0)}% OFF</Text>
                  <Text style={styles.liveDealTitle} numberOfLines={2}>{d.title}</Text>
                  <Text style={styles.liveMerchant} numberOfLines={1}>{d.merchant_name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* DEAL TYPE FILTER */}
      <View style={styles.typeRow}>
        {DEAL_TYPES.map((t) => (
          <TouchableOpacity
            key={t.label}
            testID={`type-${t.id ?? "all"}`}
            style={[styles.typeChip, selectedType === t.id && styles.typeChipActive]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSelectedType(t.id);
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name={t.icon as any}
              size={14}
              color={selectedType === t.id ? colors.white : colors.brand}
            />
            <Text
              style={[styles.typeChipText, selectedType === t.id && styles.typeChipTextActive]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* FILTERS SUMMARY */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterHeading}>Distance</Text>
          <View style={styles.filterRow}>
            {RADIUS_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r.label}
                testID={`radius-${r.value}`}
                style={[styles.filterPill, maxKm === r.value && styles.filterPillActive]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMaxKm(r.value);
                }}
              >
                <Text style={[styles.filterPillText, maxKm === r.value && styles.filterPillTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterHeading}>Sort by</Text>
          <View style={styles.filterRow}>
            {SORT_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s.id}
                testID={`sort-${s.id}`}
                style={[styles.filterPill, sort === s.id && styles.filterPillActive]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSort(sort === s.id ? null : s.id);
                }}
              >
                <Text style={[styles.filterPillText, sort === s.id && styles.filterPillTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {selectedCat
          ? `${cats.find(c => c.id === selectedCat)?.name ?? "Category"} deals`
          : "All deals near you"}
      </Text>
    </View>
  ), [liveDeals, selectedType, showFilters, maxKm, sort, selectedCat, cats, router]);

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.headerWrap, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Deals near you</Text>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/profile")}
              style={styles.locChip}
              activeOpacity={0.7}
              testID="location-chip"
            >
              <Ionicons name="location" size={12} color={colors.brand} />
              <Text style={styles.locText} numberOfLines={1}>{loc.label}</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            testID="search-open-btn"
            style={styles.iconBtn}
            onPress={() => router.push("/search")}
            activeOpacity={0.7}
          >
            <Ionicons name="search" size={20} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="filters-toggle-btn"
            style={[styles.iconBtn, showFilters && { backgroundColor: colors.brandTertiary }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setShowFilters((v) => !v);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="options" size={20} color={showFilters ? colors.brand : colors.onSurface} />
          </TouchableOpacity>
        </View>
        <CategoryChips
          categories={cats}
          selected={selectedCat}
          onChange={setSelectedCat}
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={deals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DealCard deal={item} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="basket-outline"
              title="No deals match your filters"
              subtitle="Try widening your radius or clearing filters."
            />
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xxl,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  hello: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
  },
  locChip: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  locText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    maxWidth: 200,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },

  liveSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  liveHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: spacing.md,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.error,
  },
  liveTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
  },
  liveSub: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
  },
  liveRow: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  liveCard: {
    width: 220,
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    ...shadow.card,
  },
  livePill: {
    position: "absolute",
    top: 12, left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.error,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  livePillText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "800",
  },
  liveContent: {
    position: "absolute",
    bottom: 14, left: 14, right: 14,
  },
  liveDiscount: {
    color: colors.warning,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  liveDealTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
  },
  liveMerchant: {
    marginTop: 4,
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "600",
  },

  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.surface,
  },
  typeChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
  },
  typeChipTextActive: {
    color: colors.white,
  },

  filtersPanel: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  filterHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurface,
  },
  filterPillTextActive: {
    color: colors.white,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
