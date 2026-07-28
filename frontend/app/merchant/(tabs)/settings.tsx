import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function MerchantSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [merchant, setMerchant] = useState<any | null>(null);
  const [promos, setPromos] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, p, t] = await Promise.all([
        api.merchantMe(),
        api.merchantPromos(),
        api.merchantThreads(),
      ]);
      setMerchant(m);
      setPromos(p);
      setThreads(t);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !merchant) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        {merchant.cover_image && (
          <Image source={{ uri: merchant.cover_image }} style={styles.cover} contentFit="cover" />
        )}
        <View style={styles.storeMeta}>
          {merchant.logo && <Image source={{ uri: merchant.logo }} style={styles.storeLogo} contentFit="cover" />}
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.storeName}>{merchant.name}</Text>
              {merchant.verified && <Ionicons name="checkmark-circle" size={16} color={colors.info} />}
            </View>
            <Text style={styles.storeCat}>{String(merchant.category).toUpperCase()} · {merchant.price_range}</Text>
          </View>
        </View>
      </View>

      {/* Verification */}
      <View style={styles.section}>
        <View style={styles.verifyCard}>
          <View style={[styles.verifyIcon, { backgroundColor: colors.success }]}>
            <Ionicons name="shield-checkmark" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.verifyTitle}>Verification: {merchant.verification_status?.toUpperCase() || "PENDING"}</Text>
            <Text style={styles.verifySub}>Your business is verified and visible to customers.</Text>
          </View>
        </View>
      </View>

      {/* Store profile */}
      <SectionRow label="STORE" />
      <Row
        icon="storefront"
        label="Edit store profile"
        sub="Name, category, hours, address, description"
        onPress={() => router.push("/merchant/onboarding")}
        testID="edit-profile"
      />

      {/* Promo codes */}
      <SectionRow label="MARKETING" />
      <Row
        icon="pricetags"
        label="Promo codes"
        sub={`${promos.length} active`}
        onPress={() => router.push("/merchant/promo-codes")}
        testID="promo-codes"
      />
      <Row
        icon="megaphone"
        label="Push to followers"
        sub="Send a broadcast when a hot deal drops"
        onPress={() => {}}
        badge="Rate-limited"
        testID="push-followers"
      />
      <Row
        icon="share-social"
        label="Invite other merchants"
        sub={`Referral: ${user?.referral_code}`}
        onPress={() => {}}
        testID="invite-merchants"
      />

      {/* Chat */}
      <SectionRow label="CUSTOMER SUPPORT" />
      <Row
        icon="chatbubbles"
        label="Message inbox"
        sub={`${threads.length} thread${threads.length === 1 ? "" : "s"}`}
        onPress={() => router.push("/merchant/threads")}
        testID="chat-inbox"
      />
      <Row
        icon="star"
        label="Reviews & ratings"
        sub={`${merchant.rating} ★ · ${merchant.review_count} reviews`}
        onPress={() => {}}
        testID="reviews"
      />

      {/* Data */}
      <SectionRow label="ACCOUNT" />
      <Row
        icon="swap-horizontal"
        label="Switch to customer view"
        sub="Browse deals as a customer"
        onPress={() => router.replace("/(tabs)")}
        testID="switch-to-customer-settings"
      />
      <Row
        icon="log-out-outline"
        label="Sign out"
        onPress={signOut}
        danger
        testID="merchant-signout"
      />

      <Text style={styles.footer}>HappyHour Merchant · v1.0</Text>
    </ScrollView>
  );
}

function SectionRow({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function Row({ icon, label, sub, onPress, danger, badge, testID }: any) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85} testID={testID}>
      <View style={[styles.rowIcon, danger && { backgroundColor: "#FFE4E4" }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.error : colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.error }]}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: spacing.lg, gap: spacing.md },
  cover: {
    height: 100, borderRadius: radius.lg,
    ...shadow.card,
  },
  storeMeta: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  storeLogo: { width: 48, height: 48, borderRadius: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  storeName: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  storeCat: { fontSize: 11, color: colors.muted, fontWeight: "800", letterSpacing: 0.5 },

  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1.2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  verifyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  verifyIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  verifyTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  verifySub: { fontSize: 11, color: colors.muted, marginTop: 2 },

  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    backgroundColor: colors.surfaceSecondary,
    marginHorizontal: spacing.lg,
    marginBottom: 4,
    borderRadius: radius.md,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: "600" },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  badgeText: { fontSize: 10, color: colors.muted, fontWeight: "800" },
  footer: { textAlign: "center", fontSize: 11, color: colors.muted, marginTop: spacing.xl },
});
