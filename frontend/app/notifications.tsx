import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, shadow } from "@/src/theme";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  meta?: any;
};

const TYPE_META: Record<string, { icon: string; color: string }> = {
  claim_created: { icon: "ticket", color: colors.brand },
  claim_received: { icon: "storefront", color: colors.info },
  redemption_confirmed: { icon: "checkmark-circle", color: colors.success },
  redemption_completed: { icon: "cash", color: colors.warning },
};

function timeAgo(iso: string): string {
  const dt = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - dt);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const list = await api.notifications();
      setItems(list);
    } catch {}
  }, [user]);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openItem = async (n: Notification) => {
    Haptics.selectionAsync().catch(() => {});
    if (!n.read) {
      try { await api.markNotificationRead(n.id); } catch {}
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    // Deep-link where relevant
    if (n.meta?.claim_id && (n.type === "claim_created" || n.type === "redemption_confirmed")) {
      router.push(`/claim/${n.meta.claim_id}`);
    } else if (n.meta?.deal_id) {
      router.push(`/deal/${n.meta.deal_id}`);
    }
  };

  const markAll = async () => {
    try { await api.markAllNotificationsRead(); } catch {}
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  if (!user) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.emptyIcon}>
          <Ionicons name="notifications-off" size={28} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>Sign in to see your notifications</Text>
        <Text style={styles.emptySub}>We&apos;ll ping you when your claims move & merchants respond.</Text>
        <TouchableOpacity
          testID="notif-signin"
          style={styles.signinBtn}
          onPress={() => router.push("/sign-in")}
          activeOpacity={0.85}
        >
          <Text style={styles.signinBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity testID="notif-back" onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity testID="mark-all-read" onPress={markAll} activeOpacity={0.7}>
          <Text style={styles.markAll}>Mark all</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type] || { icon: "notifications", color: colors.muted };
            return (
              <TouchableOpacity
                testID={`notif-${item.id}`}
                onPress={() => openItem(item)}
                activeOpacity={0.85}
                style={[styles.card, !item.read && styles.cardUnread]}
              >
                <View style={[styles.cardIcon, { backgroundColor: meta.color + "22" }]}>
                  <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    {!item.read && <View style={styles.dot} />}
                  </View>
                  <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text>
                  <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={[styles.center, { paddingTop: 60 }]}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={28} color={colors.muted} />
              </View>
              <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
              <Text style={styles.emptySub}>New claims and redemptions will show up here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.onSurface },
  markAll: { fontSize: 13, fontWeight: "800", color: colors.brand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  cardUnread: {
    borderLeftWidth: 3, borderLeftColor: colors.brand,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  cardBody: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 4, lineHeight: 18 },
  cardTime: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: "700" },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  emptySub: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" },
  signinBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: 24, height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  signinBtnText: { color: colors.white, fontSize: 14, fontWeight: "800" },
});
