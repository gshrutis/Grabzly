import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/auth";
import { useLocation } from "@/src/context/location";
import { api } from "@/src/api/client";
import { CATEGORY_META, colors, radius, spacing, shadow } from "@/src/theme";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const { loc, granted, requestPermission } = useLocation();
  const [cats, setCats] = useState<any[]>([]);
  const [preferred, setPreferred] = useState<Set<string>>(new Set());
  const [notifDeals, setNotifDeals] = useState(true);
  const [notifExpiring, setNotifExpiring] = useState(true);
  const [notifFollowed, setNotifFollowed] = useState(true);
  const [quietHours, setQuietHours] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.categories();
        setCats(c);
      } catch {}
    })();
    if (user?.preferred_categories) setPreferred(new Set(user.preferred_categories));
  }, [user]);

  const toggleCat = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    const next = new Set(preferred);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPreferred(next);
    if (user) {
      setSaving(true);
      try {
        await api.updateMe({ preferred_categories: Array.from(next) });
        await refresh();
      } catch {}
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={colors.white} />
        </View>
        {user ? (
          <>
            <Text style={styles.name} testID="profile-name">{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </>
        ) : (
          <>
            <Text style={styles.name}>Guest</Text>
            <Text style={styles.email}>Sign in to save deals and view claims.</Text>
            <View style={styles.authRow}>
              <TouchableOpacity
                testID="signin-btn"
                style={[styles.authBtn, styles.authBtnPrimary]}
                onPress={() => router.push("/sign-in")}
                activeOpacity={0.85}
              >
                <Text style={styles.authBtnPrimaryText}>Sign in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="signup-btn"
                style={[styles.authBtn, styles.authBtnSecondary]}
                onPress={() => router.push("/sign-up")}
                activeOpacity={0.85}
              >
                <Text style={styles.authBtnSecondaryText}>Create account</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* LOCATION */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="location" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Current location</Text>
              <Text style={styles.rowSubtitle}>{loc.label}</Text>
            </View>
          </View>
          {!granted && (
            <TouchableOpacity
              testID="enable-loc-in-profile"
              style={styles.inlineBtn}
              onPress={requestPermission}
              activeOpacity={0.85}
            >
              <Text style={styles.inlineBtnText}>Enable precise location</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* PREFERRED CATEGORIES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferred categories {saving && <ActivityIndicator size="small" color={colors.brand} />}</Text>
        <View style={styles.catGrid}>
          {cats.map((c) => {
            const meta = CATEGORY_META[c.id] || { color: colors.brand, icon: "pricetag" };
            const active = preferred.has(c.id);
            return (
              <TouchableOpacity
                key={c.id}
                testID={`pref-${c.id}`}
                style={[styles.catChip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
                onPress={() => toggleCat(c.id)}
                disabled={!user}
                activeOpacity={0.85}
              >
                <Ionicons name={meta.icon as any} size={14} color={active ? colors.white : meta.color} />
                <Text style={[styles.catChipText, active && { color: colors.white }]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!user && <Text style={styles.hint}>Sign in to save preferences.</Text>}
      </View>

      {/* NOTIFICATIONS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Nearby new deals</Text>
              <Text style={styles.rowSubtitle}>Alert when merchants nearby post a hot offer.</Text>
            </View>
            <Switch value={notifDeals} onValueChange={setNotifDeals} trackColor={{ true: colors.brand }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Expiring-soon reminders</Text>
              <Text style={styles.rowSubtitle}>Get pinged 15 & 5 minutes before your claim expires.</Text>
            </View>
            <Switch value={notifExpiring} onValueChange={setNotifExpiring} trackColor={{ true: colors.brand }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Followed merchants</Text>
              <Text style={styles.rowSubtitle}>Get notified when merchants you follow post deals.</Text>
            </View>
            <Switch value={notifFollowed} onValueChange={setNotifFollowed} trackColor={{ true: colors.brand }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Quiet hours 10pm–8am</Text>
              <Text style={styles.rowSubtitle}>No notifications during your set-and-forget quiet window.</Text>
            </View>
            <Switch value={quietHours} onValueChange={setQuietHours} trackColor={{ true: colors.brand }} />
          </View>
        </View>
      </View>

      {user && (
        <View style={styles.section}>
          <TouchableOpacity
            testID="signout-btn"
            style={styles.signOutBtn}
            onPress={signOut}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.footer}>HappyHour · v1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.cardStrong,
  },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  email: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" },
  authRow: { flexDirection: "row", gap: 8, marginTop: spacing.lg },
  authBtn: {
    paddingHorizontal: 20, height: 42,
    borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center",
  },
  authBtnPrimary: { backgroundColor: colors.brandPrimary },
  authBtnPrimaryText: { color: colors.white, fontWeight: "800", fontSize: 14 },
  authBtnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.brandPrimary,
  },
  authBtnSecondaryText: { color: colors.brand, fontWeight: "800", fontSize: 14 },

  section: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: {
    fontSize: 16, fontWeight: "800", color: colors.onSurface,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 6,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
  inlineBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  inlineBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  catChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic" },

  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: radius.pill,
    backgroundColor: "#FFE4E4",
  },
  signOutText: { color: colors.error, fontSize: 14, fontWeight: "800" },
  footer: { textAlign: "center", fontSize: 11, color: colors.muted, marginTop: spacing.lg },
});
