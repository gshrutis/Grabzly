import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api/client";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { formatMoney } from "@/src/utils/format";

export default function MerchantDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [merchant, setMerchant] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [activeDeals, setActiveDeals] = useState<number>(0);
  const [totalDeals, setTotalDeals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, a, deals] = await Promise.all([
        api.merchantMe(),
        api.merchantAnalytics(),
        api.merchantDeals(false),
      ]);
      setMerchant(m);
      setAnalytics(a);
      const dealList = deals as any[];
      setActiveDeals(dealList.filter((d: any) => !d.expired && !d.is_paused && !d.is_draft).length);
      setTotalDeals(dealList.filter((d: any) => !d.deleted).length);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !merchant || !analytics) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  const stats = analytics.totals;
  const completionSteps = [
    { done: !!merchant.name, label: "Business info" },
    { done: !!merchant.logo && !!merchant.cover_image, label: "Store branding" },
    { done: stats.active_deals > 0, label: "Post your first deal" },
    { done: (analytics.video_performance || []).length > 0, label: "Post your first video" },
    { done: stats.redemptions > 0, label: "First redemption" },
  ];
  const completeCount = completionSteps.filter(s => s.done).length;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={colors.brand}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.headerRow}>
            {merchant.logo ? (
              <Image source={{ uri: merchant.logo }} style={styles.logo} contentFit="cover" />
            ) : (
              <View style={[styles.logo, { backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="storefront" size={22} color={colors.white} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.headerHello}>Good day,</Text>
              <Text style={styles.headerName} numberOfLines={1}>{merchant.name}</Text>
            </View>
            <TouchableOpacity
              testID="switch-to-customer"
              style={styles.switchBtn}
              onPress={() => router.replace("/(tabs)")}
              activeOpacity={0.85}
            >
              <Ionicons name="swap-horizontal" size={14} color={colors.brand} />
              <Text style={styles.switchText}>Customer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction
            icon="add-circle" label="New deal" color={colors.brand}
            onPress={() => router.push("/merchant/deal-form")}
            testID="qa-new-deal"
          />
          <QuickAction
            icon="qr-code" label="Scan" color={colors.info}
            onPress={() => router.push("/merchant/(tabs)/redeem")}
            testID="qa-scan"
          />
          <QuickAction
            icon="stats-chart" label="Insights" color={colors.success}
            onPress={() => router.push("/merchant/(tabs)/analytics")}
            testID="qa-insights"
          />
        </View>

        {/* Progress checklist */}
        {completeCount < completionSteps.length && (
          <View style={[styles.card, { margin: spacing.lg, marginTop: 0 }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Get discovered</Text>
              <Text style={styles.progressText}>{completeCount}/{completionSteps.length}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(completeCount / completionSteps.length) * 100}%` }]} />
            </View>
            {completionSteps.map((s, i) => (
              <View key={i} style={styles.checkRow}>
                <Ionicons
                  name={s.done ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={s.done ? colors.success : colors.muted}
                />
                <Text style={[styles.checkText, s.done && { color: colors.muted, textDecorationLine: "line-through" }]}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Today snapshot */}
        <Text style={styles.sectionTitle}>Today at a glance</Text>
        <View style={styles.statGrid}>
          <StatCard label="Views" value={stats.views} icon="eye" color={colors.info} />
          <StatCard label="Claims" value={stats.claims} icon="ticket" color={colors.brand} />
          <StatCard label="Redeemed" value={stats.redemptions} icon="checkmark-circle" color={colors.success} />
          <StatCard label="Redemption %" value={`${stats.redemption_rate}%`} icon="trending-up" color={colors.warning} />
          <StatCard label="Est. GMV" value={formatMoney(stats.gmv, { withDecimals: false })} icon="cash" color={colors.success} />
          <StatCard label="Active deals" value={activeDeals} icon="flame" color={colors.brand} />
          <StatCard label="Total posted" value={totalDeals} icon="albums" color={colors.info} />
          <StatCard label="No-shows" value={stats.no_shows} icon="close-circle" color={colors.muted} />
        </View>

        {/* Hero cover */}
        {merchant.cover_image && (
          <View style={styles.coverWrap}>
            <Image source={{ uri: merchant.cover_image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient
              colors={["transparent", "rgba(45,36,34,0.85)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.coverBottom}>
              <Text style={styles.coverTitle}>Your storefront is live</Text>
              <Text style={styles.coverSub}>Customers can find and follow you.</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress, testID }: any) {
  return (
    <TouchableOpacity style={styles.quickTile} onPress={onPress} testID={testID} activeOpacity={0.85}>
      <View style={[styles.quickIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={22} color={colors.white} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  logo: { width: 48, height: 48, borderRadius: 14 },
  headerHello: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  headerName: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  switchBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  switchText: { fontSize: 11, fontWeight: "800", color: colors.brand },

  quickRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  quickTile: {
    flex: 1, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    alignItems: "center",
    gap: 8,
    ...shadow.card,
  },
  quickIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  quickLabel: { fontSize: 12, fontWeight: "800", color: colors.onSurface },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  progressText: { fontSize: 13, fontWeight: "800", color: colors.brand },
  progressBar: {
    height: 6, borderRadius: 3,
    backgroundColor: colors.divider,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  progressFill: {
    height: "100%", borderRadius: 3, backgroundColor: colors.brand,
  },
  checkRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6,
  },
  checkText: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },

  sectionTitle: {
    fontSize: 15, fontWeight: "800", color: colors.onSurface,
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  statGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  statCard: {
    width: "47%",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    ...shadow.card,
  },
  statTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statLabel: { fontSize: 11, color: colors.muted, fontWeight: "700", textTransform: "uppercase" },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: 4 },

  coverWrap: {
    height: 160, marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  coverBottom: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
  },
  coverTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  coverSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 },
});
