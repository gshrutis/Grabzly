import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { formatMoney } from "@/src/utils/format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MerchantAnalytics() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await api.merchantAnalytics();
      setData(a);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  const maxDaily = Math.max(1, ...(data.daily || []).map((d: any) => Math.max(d.claims, d.redemptions)));
  const maxHeat = Math.max(1, ...data.heatmap.flat());

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Insights</Text>
        <Text style={styles.subtitle}>Last 7 days</Text>
      </View>

      {/* Totals grid */}
      <View style={styles.statGrid}>
        <StatCard label="Views" value={data.totals.views} icon="eye" color={colors.info} />
        <StatCard label="Claims" value={data.totals.claims} icon="ticket" color={colors.brand} />
        <StatCard label="Redemptions" value={data.totals.redemptions} icon="checkmark-circle" color={colors.success} />
        <StatCard label="No-shows" value={data.totals.no_shows} icon="close-circle" color={colors.muted} />
        <StatCard label="Redemption rate" value={`${data.totals.redemption_rate}%`} icon="trending-up" color={colors.brand} />
        <StatCard label="Est. GMV" value={formatMoney(data.totals.gmv, { withDecimals: false })} icon="cash" color={colors.success} />
      </View>

      {/* Daily chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Claims vs redemptions</Text>
        <View style={styles.chartCard}>
          <View style={styles.legendRow}>
            <LegendDot color={colors.brand} label="Claims" />
            <LegendDot color={colors.success} label="Redeemed" />
          </View>
          <View style={styles.barChart}>
            {(data.daily || []).map((d: any, idx: number) => {
              const claimsH = (d.claims / maxDaily) * 100;
              const redH = (d.redemptions / maxDaily) * 100;
              const day = new Date(d.date).getDay();
              return (
                <View key={d.date} style={styles.barGroup}>
                  <View style={styles.barStackRow}>
                    <View style={[styles.bar, { height: `${claimsH}%`, backgroundColor: colors.brand }]} />
                    <View style={[styles.bar, { height: `${redH}%`, backgroundColor: colors.success }]} />
                  </View>
                  <Text style={styles.barLabel}>{DAYS[(day + 6) % 7]}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Heatmap */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Peak hours heatmap</Text>
        <Text style={styles.sectionSub}>Engagement by day × hour (last 30 days, estimated)</Text>
        <View style={styles.heatmapCard}>
          <View style={styles.heatmapHeader}>
            <View style={{ width: 32 }} />
            {[0, 6, 12, 18, 23].map((h) => (
              <Text key={h} style={styles.heatHeaderText}>{h}h</Text>
            ))}
          </View>
          {data.heatmap.map((row: number[], di: number) => (
            <View key={di} style={styles.heatRow}>
              <Text style={styles.heatDayLabel}>{DAYS[di]}</Text>
              {row.map((v, hi) => {
                const intensity = v / maxHeat;
                return (
                  <View
                    key={hi}
                    style={[
                      styles.heatCell,
                      { backgroundColor: `rgba(255,90,54,${0.08 + intensity * 0.85})` },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Video performance */}
      {(data.video_performance || []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Video performance</Text>
          {data.video_performance.map((v: any) => (
            <View key={v.id} style={styles.videoRow}>
              <Ionicons name="videocam" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoTitle} numberOfLines={1}>{v.title}</Text>
                <View style={styles.videoMetaRow}>
                  <Text style={styles.videoMeta}>{v.total_views || 0} views</Text>
                  <Text style={styles.videoMeta}>· {v.watch_through_rate}% watch-through</Text>
                  <Text style={styles.videoMeta}>· {v.shares} shares</Text>
                </View>
              </View>
              <View style={styles.videoClaims}>
                <Text style={styles.videoClaimsCount}>{v.quantity_claimed || 0}</Text>
                <Text style={styles.videoClaimsLabel}>claims</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Benchmark */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vs. similar merchants nearby</Text>
        <Text style={styles.sectionSub}>Anonymized peer benchmark</Text>
        <View style={styles.benchCard}>
          <BenchRow
            label="Redemption rate"
            you={`${data.benchmark.your_redemption_rate}%`}
            them={`${data.benchmark.category_avg_redemption_rate}%`}
            good={data.benchmark.your_redemption_rate >= data.benchmark.category_avg_redemption_rate}
          />
          <View style={styles.divider} />
          <BenchRow
            label="Avg claims per deal"
            you={data.benchmark.your_avg_claim_per_deal}
            them={data.benchmark.category_avg_claim_per_deal}
            good={data.benchmark.your_avg_claim_per_deal >= data.benchmark.category_avg_claim_per_deal}
          />
        </View>
      </View>

      {/* Export CTA */}
      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} activeOpacity={0.85} testID="export-csv">
          <Ionicons name="download" size={16} color={colors.brand} />
          <Text style={styles.exportBtnText}>Export CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} activeOpacity={0.85} testID="export-pdf">
          <Ionicons name="document" size={16} color={colors.brand} />
          <Text style={styles.exportBtnText}>Export PDF</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, icon, color }: any) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <View style={styles.statTop}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }: any) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function BenchRow({ label, you, them, good }: any) {
  return (
    <View style={styles.benchRow}>
      <Text style={styles.benchLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.benchYou, { color: good ? colors.success : colors.error }]}>{you}</Text>
          <Text style={styles.benchWho}>You</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.benchThem}>{them}</Text>
          <Text style={styles.benchWho}>Peers</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },

  statGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row", flexWrap: "wrap", gap: spacing.md,
  },
  statCard: {
    width: "47%",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    ...shadow.card,
  },
  statTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  statLabel: { fontSize: 11, color: colors.muted, fontWeight: "700", textTransform: "uppercase" },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: 4 },

  section: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  sectionSub: { fontSize: 12, color: colors.muted, marginTop: -8 },

  chartCard: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  legendRow: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: colors.onSurface, fontWeight: "700" },
  barChart: {
    flexDirection: "row",
    height: 160,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  barGroup: { alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end" },
  barStackRow: { flexDirection: "row", gap: 2, alignItems: "flex-end", height: 140 },
  bar: { width: 12, minHeight: 4, borderRadius: 4 },
  barLabel: { fontSize: 10, color: colors.muted, fontWeight: "700", marginTop: 4 },

  heatmapCard: {
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  heatmapHeader: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 32, marginBottom: 4 },
  heatHeaderText: { fontSize: 10, color: colors.muted, fontWeight: "700" },
  heatRow: { flexDirection: "row", alignItems: "center", gap: 1, marginBottom: 2 },
  heatDayLabel: { width: 32, fontSize: 10, color: colors.onSurface, fontWeight: "700" },
  heatCell: { flex: 1, height: 14, borderRadius: 2, minWidth: 4 },

  videoRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  videoTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  videoMetaRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 4 },
  videoMeta: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  videoClaims: { alignItems: "center" },
  videoClaimsCount: { fontSize: 18, fontWeight: "800", color: colors.brand },
  videoClaimsLabel: { fontSize: 10, color: colors.muted, fontWeight: "700" },

  benchCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  benchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  benchLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface, flex: 1 },
  benchYou: { fontSize: 20, fontWeight: "800" },
  benchThem: { fontSize: 20, fontWeight: "800", color: colors.muted },
  benchWho: { fontSize: 10, color: colors.muted, fontWeight: "700", marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },

  exportRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  exportBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  exportBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
});
