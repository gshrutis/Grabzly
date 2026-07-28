import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius, spacing, shadow } from "@/src/theme";
import EmptyState from "@/src/components/EmptyState";

export default function MerchantThreads() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const t = await api.merchantThreads();
      setThreads(t);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.user_id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.threadRow}
              onPress={() => router.push({ pathname: "/merchant/thread/[userId]", params: { userId: item.user_id, name: item.user_name } })}
              activeOpacity={0.85}
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.user_name || "Customer"}</Text>
                <Text style={styles.lastText} numberOfLines={1}>{item.last_text}</Text>
              </View>
              <Text style={styles.time}>{new Date(item.last_at).toLocaleDateString()}</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No conversations yet"
              subtitle="Customer messages will land here when they reach out."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  threadRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  userName: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  lastText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  time: { fontSize: 11, color: colors.muted, fontWeight: "700" },
});
