import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, shadow } from "@/src/theme";
import EmptyState from "@/src/components/EmptyState";
import Countdown from "@/src/components/Countdown";

type Status = "active" | "redeemed" | "expired" | "cancelled";

const TABS: { id: Status; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "redeemed", label: "Redeemed" },
  { id: "expired", label: "Expired" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  active: { bg: colors.brandTertiary, fg: colors.brand },
  redeemed: { bg: "#D1F5E0", fg: colors.success },
  expired: { bg: "#F2EBE5", fg: colors.muted },
  cancelled: { bg: "#F2EBE5", fg: colors.muted },
};

export default function MyClaims() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();
  const [status, setStatus] = useState<Status>("active");
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setClaims([]);
      setLoading(false);
      return;
    }
    try {
      const c = await api.myClaims(status);
      setClaims(c);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, [status, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>My Claims</Text>
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="ticket-outline"
            title="Sign in to see your claims"
            subtitle="Log in to view your active QR codes, redemption history and expiring deals."
            action={
              <TouchableOpacity
                testID="claims-signin-btn"
                onPress={() => router.push("/sign-in")}
                style={styles.primaryBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Sign in</Text>
              </TouchableOpacity>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.title}>My Claims</Text>
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            testID={`claims-tab-${t.id}`}
            style={[styles.tab, status === t.id && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setStatus(t.id);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, status === t.id && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`claim-row-${item.id}`}
              style={styles.claimCard}
              onPress={() => router.push(`/claim/${item.id}`)}
              activeOpacity={0.9}
            >
              {item.image_url && (
                <Image source={{ uri: item.image_url }} style={styles.claimImage} contentFit="cover" />
              )}
              <View style={styles.claimBody}>
                <View style={styles.claimTopRow}>
                  <Text style={styles.claimTitle} numberOfLines={1}>{item.deal_title}</Text>
                </View>
                <Text style={styles.claimMerchant} numberOfLines={1}>{item.merchant_name}</Text>
                <View style={styles.claimMetaRow}>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as Status].bg }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[item.status as Status].fg }]}>
                      {String(item.status).toUpperCase()}
                    </Text>
                  </View>
                  {item.status === "active" && item.redemption_deadline && (
                    <Countdown
                      expiresAt={item.redemption_deadline}
                      prefix="Redeem in "
                      style={styles.deadline}
                    />
                  )}
                </View>
                <View style={styles.codeRow}>
                  <Ionicons name="qr-code" size={14} color={colors.muted} />
                  <Text style={styles.codeText}>Code: {item.redemption_code}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
          ListEmptyComponent={
            <EmptyState
              icon="ticket-outline"
              title={`No ${status} claims`}
              subtitle="Start exploring nearby deals to build up your claims."
              action={
                <TouchableOpacity
                  onPress={() => router.push("/(tabs)")}
                  style={styles.primaryBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Discover deals</Text>
                </TouchableOpacity>
              }
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, paddingHorizontal: spacing.lg },
  tabsRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.pill,
  },
  tabActive: {
    backgroundColor: colors.brandPrimary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurfaceTertiary,
  },
  tabTextActive: {
    color: colors.white,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  claimCard: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    gap: spacing.md,
    alignItems: "center",
    ...shadow.card,
  },
  claimImage: { width: 64, height: 64, borderRadius: 12 },
  claimBody: { flex: 1, gap: 3 },
  claimTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  claimTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface, flex: 1 },
  claimMerchant: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  claimMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  deadline: { fontSize: 11, color: colors.brand, fontWeight: "700" },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  codeText: { fontSize: 11, color: colors.muted, fontWeight: "700", letterSpacing: 0.4 },

  primaryBtn: {
    marginTop: spacing.lg,
    height: 48, paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    ...shadow.card,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
});
