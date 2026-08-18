import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { formatMoney } from "@/src/utils/format";
import Countdown from "@/src/components/Countdown";
import EmptyState from "@/src/components/EmptyState";

type Filter = "all" | "active" | "scheduled" | "paused" | "expired" | "drafts";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "scheduled", label: "Scheduled" },
  { id: "paused", label: "Paused" },
  { id: "expired", label: "Expired" },
  { id: "drafts", label: "Drafts" },
];

export default function MerchantDeals() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [deals, setDeals] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.merchantDeals(true);
      setDeals(d);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = deals.filter((d) => {
    switch (filter) {
      case "active": return !d.is_draft && !d.is_paused && !d.expired;
      case "scheduled": return !d.is_draft && !d.expired && d.start_time && new Date(d.start_time) > new Date();
      case "paused": return d.is_paused;
      case "expired": return d.expired;
      case "drafts": return d.is_draft;
      default: return true;
    }
  });

  const togglePause = async (id: string, current: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      await api.merchantPatchDeal(id, { is_paused: !current });
      await load();
    } catch (e) { console.warn(e); }
  };

  const endDeal = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      await api.merchantEndDeal(id);
      await load();
    } catch (e) { console.warn(e); }
  };

  const duplicate = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const d = await api.merchantDuplicateDeal(id);
      router.push({ pathname: "/merchant/deal-form", params: { id: d.id } });
    } catch (e) { console.warn(e); }
  };

  const remove = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      await api.merchantDeleteDeal(id);
      await load();
    } catch (e) { console.warn(e); }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>My deals</Text>
          <TouchableOpacity
            testID="new-deal-btn"
            style={styles.addBtn}
            onPress={() => router.push("/merchant/deal-form")}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count = deals.filter((d) => {
              switch (f.id) {
                case "active": return !d.is_draft && !d.is_paused && !d.expired;
                case "scheduled": return !d.is_draft && !d.expired && d.start_time && new Date(d.start_time) > new Date();
                case "paused": return d.is_paused;
                case "expired": return d.expired;
                case "drafts": return d.is_draft;
                default: return true;
              }
            }).length;
            return (
              <TouchableOpacity
                key={f.id}
                testID={`filter-${f.id}`}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label} · {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => (
            <View style={styles.dealCard} testID={`deal-item-${item.id}`}>
              <View style={styles.dealTop}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.dealImage} contentFit="cover" />
                ) : (
                  <View style={[styles.dealImage, { backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="pricetag" size={20} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.dealTypeRow}>
                    <View style={[styles.typePill, item.deal_type === "flash" && { backgroundColor: colors.brandTertiary },
                                                    item.deal_type === "video" && { backgroundColor: "#E4E9FF" },
                                                    item.deal_type === "regular" && { backgroundColor: colors.surfaceTertiary }]}>
                      <Ionicons
                        name={item.deal_type === "flash" ? "flash" : item.deal_type === "video" ? "videocam" : "pricetag"}
                        size={10}
                        color={item.deal_type === "flash" ? colors.brand : item.deal_type === "video" ? "#3F51B5" : colors.muted}
                      />
                      <Text style={[styles.typeText, { color: item.deal_type === "flash" ? colors.brand : item.deal_type === "video" ? "#3F51B5" : colors.muted }]}>
                        {String(item.deal_type).toUpperCase()}
                      </Text>
                    </View>
                    {item.is_draft && <StatusBadge label="DRAFT" color={colors.warning} />}
                    {item.is_paused && <StatusBadge label="PAUSED" color={colors.muted} />}
                    {item.expired && <StatusBadge label="ENDED" color={colors.error} />}
                  </View>
                  <Text style={styles.dealTitle} numberOfLines={2}>{item.title}</Text>
                  <View style={styles.dealMetaRow}>
                    <Text style={styles.priceAfter}>{formatMoney(item.after_price)}</Text>
                    {item.before_price && (
                      <Text style={styles.priceBefore}>{formatMoney(item.before_price)}</Text>
                    )}
                    {typeof item.discount_pct === "number" && (
                      <View style={styles.discPill}>
                        <Text style={styles.discPillText}>{Math.round(item.discount_pct)}%</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.dealStats}>
                <StatChip icon="eye" label={`${item.total_views || 0}`} sub="views" />
                <StatChip icon="ticket" label={`${item.quantity_claimed || 0}`} sub="claims" />
                {typeof item.quantity_remaining === "number" && (
                  <StatChip
                    icon="cube"
                    label={`${item.quantity_remaining}`}
                    sub={`/${item.quantity ?? "∞"}`}
                    urgent={item.quantity_remaining <= 3}
                  />
                )}
                {item.deal_type !== "regular" && !item.expired && item.expires_at && (
                  <View style={styles.timeChip}>
                    <Ionicons name="time" size={12} color={colors.brand} />
                    <Countdown expiresAt={item.expires_at} style={styles.timeChipText} />
                  </View>
                )}
              </View>

              <View style={styles.actionsRow}>
                <ActionBtn
                  icon="eye"
                  label="View"
                  onPress={() => router.push(`/deal/${item.id}`)}
                />
                <ActionBtn
                  icon="create" label="Edit"
                  onPress={() => router.push({ pathname: "/merchant/deal-form", params: { id: item.id } })}
                />
                {!item.is_paused && !item.expired ? (
                  <ActionBtn icon="pause" label="Pause" onPress={() => togglePause(item.id, false)} />
                ) : (
                  !item.expired && (
                    <ActionBtn icon="play" label="Resume" onPress={() => togglePause(item.id, true)} />
                  )
                )}
                {!item.expired && !item.is_draft && (
                  <ActionBtn icon="stop-circle" label="End" onPress={() => endDeal(item.id)} />
                )}
                <ActionBtn icon="copy" label="Copy" onPress={() => duplicate(item.id)} />
                <ActionBtn icon="trash" label="Delete" color={colors.error} onPress={() => remove(item.id)} />
              </View>
            </View>
          )}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyState
              icon="pricetag-outline"
              title="No deals here yet"
              subtitle="Create your first flash deal, regular item, or promo video."
              action={
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push("/merchant/deal-form")}
                  testID="empty-new-deal"
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={18} color={colors.white} />
                  <Text style={styles.emptyBtnText}>New deal</Text>
                </TouchableOpacity>
              }
            />
          }
        />
      )}
    </View>
  );
}

function StatusBadge({ label, color }: any) {
  return (
    <View style={[styles.statusBadge, { backgroundColor: `${color}22`, borderColor: color }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function StatChip({ icon, label, sub, urgent }: any) {
  return (
    <View style={[styles.statChip, urgent && { backgroundColor: colors.brandTertiary }]}>
      <Ionicons name={icon} size={12} color={urgent ? colors.brand : colors.muted} />
      <Text style={[styles.statChipLabel, urgent && { color: colors.brand }]}>{label}</Text>
      {sub && <Text style={styles.statChipSub}>{sub}</Text>}
    </View>
  );
}

function ActionBtn({ icon, label, color, onPress }: any) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon} size={16} color={color ?? colors.onSurface} />
      <Text style={[styles.actionBtnText, color && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    ...shadow.card,
  },
  filterRow: { gap: 6, alignItems: "center", paddingRight: spacing.lg, height: 44 },
  filterChip: {
    flexShrink: 0,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  filterChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  filterTextActive: { color: colors.white },

  dealCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm,
    ...shadow.card,
  },
  dealTop: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  dealImage: { width: 60, height: 60, borderRadius: 12 },
  dealTypeRow: { flexDirection: "row", gap: 4, alignItems: "center", flexWrap: "wrap" },
  typePill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: radius.pill,
  },
  typeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  dealTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  dealMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  priceAfter: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  priceBefore: { fontSize: 11, color: colors.muted, textDecorationLine: "line-through" },
  discPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  discPillText: { color: colors.white, fontSize: 10, fontWeight: "800" },

  statusBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },

  dealStats: {
    flexDirection: "row", gap: 6, flexWrap: "wrap",
  },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  statChipLabel: { fontSize: 11, fontWeight: "800", color: colors.onSurface },
  statChipSub: { fontSize: 10, color: colors.muted, fontWeight: "600" },
  timeChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  timeChipText: { fontSize: 11, fontWeight: "800", color: colors.brand },

  actionsRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 4 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  actionBtnText: { fontSize: 11, fontWeight: "700", color: colors.onSurface },

  emptyBtn: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    gap: 6, height: 48, paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  emptyBtnText: { color: colors.white, fontSize: 14, fontWeight: "800" },
});
