import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { CATEGORY_META, colors, radius, spacing, shadow } from "@/src/theme";

const ONBOARDED_KEY = "hh_onboarded_v1";
const PREFS_KEY = "hh_preferred_categories";

export default function OnboardingCategories() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.categories();
        setCats(c);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const toggle = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finish = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await storage.setItem(PREFS_KEY, JSON.stringify(Array.from(selected)));
    await storage.setItem(ONBOARDED_KEY, true);
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>Pick a few. We&apos;ll tune your feed to what you love. You can change this anytime.</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {cats.map((c) => {
            const meta = CATEGORY_META[c.id] || { color: colors.brand };
            const active = selected.has(c.id);
            return (
              <TouchableOpacity
                key={c.id}
                testID={`cat-tile-${c.id}`}
                onPress={() => toggle(c.id)}
                activeOpacity={0.85}
                style={[
                  styles.tile,
                  active && { borderColor: meta.color, backgroundColor: `${meta.color}18` },
                ]}
              >
                <View style={[styles.tileIcon, { backgroundColor: meta.color }]}>
                  <Ionicons name={(meta.icon || "pricetag") as any} size={24} color={colors.white} />
                </View>
                <Text style={styles.tileLabel}>{c.name}</Text>
                {active && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          testID="finish-onboarding-btn"
          style={styles.primaryBtn}
          onPress={finish}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>
            {selected.size > 0 ? `Continue with ${selected.size} selected` : "Skip for now"}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, lineHeight: 32 },
  subtitle: { marginTop: spacing.sm, fontSize: 15, color: colors.muted, lineHeight: 21 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  tile: {
    width: "47%",
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "flex-start",
    minHeight: 130,
    position: "relative",
    ...shadow.card,
  },
  tileIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  tileLabel: {
    fontSize: 16, fontWeight: "700", color: colors.onSurface,
  },
  checkBadge: {
    position: "absolute", top: 12, right: 12,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    ...shadow.cardStrong,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "800" },
});
