import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function PromoCodes() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [pct, setPct] = useState("");
  const [maxUses, setMaxUses] = useState("100");
  const [firstOnly, setFirstOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const p = await api.merchantPromos();
      setPromos(p);
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setError(null);
    if (!code || !pct) {
      setError("Code and discount % required.");
      return;
    }
    setSaving(true);
    try {
      await api.merchantCreatePromo({
        code: code.toUpperCase(),
        discount_pct: Number(pct),
        max_uses: Number(maxUses) || 100,
        first_time_only: firstOnly,
      });
      setCode(""); setPct(""); setMaxUses("100");
      await load();
    } catch (e: any) {
      setError(e.message || "Save failed");
    }
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Promo codes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Create new code</Text>

          <Text style={styles.label}>Code</Text>
          <TextInput
            testID="promo-code-input"
            value={code} onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="WELCOME10" placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            style={styles.input}
          />

          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Discount %</Text>
              <TextInput
                testID="promo-pct-input"
                value={pct} onChangeText={setPct}
                placeholder="10" placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Max uses</Text>
              <TextInput
                value={maxUses} onChangeText={setMaxUses}
                placeholder="100" placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setFirstOnly(!firstOnly)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={firstOnly ? "checkbox" : "square-outline"}
              size={22}
              color={firstOnly ? colors.brand : colors.muted}
            />
            <Text style={styles.toggleLabel}>First-time customers only</Text>
          </TouchableOpacity>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            testID="promo-save-btn"
            style={styles.primaryBtn}
            onPress={create}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnText}>Create promo code</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Existing codes</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : promos.length === 0 ? (
          <Text style={styles.empty}>No promo codes yet.</Text>
        ) : (
          promos.map((p) => (
            <View key={p.id} style={styles.promoRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.promoCode}>{p.code}</Text>
                <Text style={styles.promoMeta}>
                  {p.discount_pct}% off · {p.uses}/{p.max_uses} used
                  {p.first_time_only ? " · first-time only" : ""}
                </Text>
              </View>
              <View style={styles.promoBadge}>
                <Text style={styles.promoBadgeText}>{p.discount_pct}%</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

  formCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm,
    ...shadow.card,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  label: { fontSize: 12, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: 15, color: colors.onSurface,
  },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: spacing.md,
  },
  toggleLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10, borderRadius: radius.md,
    backgroundColor: "#FFE4E4",
    marginTop: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700" },
  primaryBtn: {
    marginTop: spacing.md,
    height: 52, borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    ...shadow.card,
  },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },

  empty: { fontSize: 13, color: colors.muted, textAlign: "center", padding: spacing.xl },
  promoRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  promoCode: { fontSize: 15, fontWeight: "800", color: colors.brand, letterSpacing: 1.5 },
  promoMeta: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: "600" },
  promoBadge: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  promoBadgeText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
});
