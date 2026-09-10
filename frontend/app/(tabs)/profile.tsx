import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Share, Platform, Modal,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@/src/context/auth";
import { useLocation } from "@/src/context/location";
import { api } from "@/src/api/client";
import { CATEGORY_META, colors, radius, spacing, shadow } from "@/src/theme";
import LocationPickerModal from "@/src/components/LocationPickerModal";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const { loc } = useLocation();
  const [cats, setCats] = useState<any[]>([]);
  const [preferred, setPreferred] = useState<Set<string>>(new Set());
  const [notifDeals, setNotifDeals] = useState(true);
  const [notifExpiring, setNotifExpiring] = useState(true);
  const [notifFollowed, setNotifFollowed] = useState(true);
  const [quietHours, setQuietHours] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loyalty, setLoyalty] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.categories();
        setCats(c);
      } catch {}
    })();
    if (user?.preferred_categories) setPreferred(new Set(user.preferred_categories));
  }, [user]);

  const loadLoyalty = useCallback(async () => {
    if (!user) return;
    try {
      const l = await api.loyalty();
      setLoyalty(l);
    } catch {}
  }, [user]);

  useFocusEffect(useCallback(() => { loadLoyalty(); }, [loadLoyalty]));

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

  const shareReferral = async () => {
    if (!user?.referral_code) return;
    const message = `Come get local deals with me on HappyHour! Use my code ${user.referral_code} when you sign up — we both get points on your first redemption. happyhour://join?ref=${user.referral_code}`;
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        await Share.share({ message });
      }
    } catch {}
  };

  const copyCode = async () => {
    if (!user?.referral_code) return;
    await Clipboard.setStringAsync(user.referral_code);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => setCopied(false), 2000);
  };

  const [showLocPicker, setShowLocPicker] = useState(false);
  const [showPreciseLocPicker, setShowPreciseLocPicker] = useState(false);
  const { setManual } = useLocation();

  const pickCity = async (city: { name: string; lat: number; lng: number }) => {
    Haptics.selectionAsync().catch(() => {});
    await setManual(city.lat, city.lng, city.name);
    // Re-seed backend around new anchor so demo has nearby merchants there too
    try {
      await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/seed?lat=${city.lat}&lng=${city.lng}&force=true`, { method: "POST" });
    } catch {}
    setShowLocPicker(false);
  };

  const doSignOut = async () => {
    Haptics.selectionAsync().catch(() => {});
    await signOut();
    router.replace("/(tabs)");
  };

  const CITIES = [
    { name: "San Francisco, CA", lat: 37.7749, lng: -122.4194 },
    { name: "New York, NY", lat: 40.7128, lng: -74.0060 },
    { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
    { name: "London, UK", lat: 51.5074, lng: -0.1278 },
    { name: "Tokyo, JP", lat: 35.6762, lng: 139.6503 },
    { name: "Mumbai, IN", lat: 19.0760, lng: 72.8777 },
    { name: "Bengaluru, IN", lat: 12.9716, lng: 77.5946 },
    { name: "Delhi, IN", lat: 28.6139, lng: 77.2090 },
  ];

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
            {user.role === "merchant" && (
              <View style={styles.roleBadge}>
                <Ionicons name="storefront" size={12} color={colors.white} />
                <Text style={styles.roleBadgeText}>MERCHANT</Text>
              </View>
            )}
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

      {/* LOYALTY */}
      {user && (
        <View style={styles.section}>
          <View style={styles.loyaltyCard}>
            <LinearGradient
              colors={[colors.brand, "#FF8A66"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.loyaltyContent}>
              <View style={styles.loyaltyTop}>
                <View>
                  <Text style={styles.loyaltyLabel}>Points balance</Text>
                  <Text style={styles.loyaltyValue} testID="points-balance">{loyalty?.points ?? user.points ?? 0}</Text>
                </View>
                <Ionicons name="ribbon" size={40} color="rgba(255,255,255,0.35)" />
              </View>
              <Text style={styles.loyaltyHint}>Earn 25 pts per redemption. Redeem for early access & bonus discounts.</Text>
            </View>
          </View>

          {/* Referral */}
          <View style={styles.referCard}>
            <View style={styles.referHeader}>
              <Ionicons name="gift" size={18} color={colors.brand} />
              <Text style={styles.referTitle}>Invite friends, both earn</Text>
            </View>
            <Text style={styles.referSub}>You get 200 pts. They get 100 pts on their first redemption.</Text>
            <View style={styles.referCodeRow}>
              <TouchableOpacity onPress={copyCode} testID="referral-copy" activeOpacity={0.85} style={styles.referCodeBox}>
                <Text style={styles.referCode}>{user.referral_code}</Text>
                <Ionicons name={copied ? "checkmark" : "copy"} size={16} color={copied ? colors.success : colors.brand} />
              </TouchableOpacity>
              <TouchableOpacity testID="referral-share" style={styles.shareBtn} onPress={shareReferral} activeOpacity={0.85}>
                <Ionicons name="share-social" size={16} color={colors.white} />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Merchant CTA */}
          <TouchableOpacity
            testID="become-merchant-btn"
            style={styles.merchantCta}
            onPress={() => router.push(user.role === "merchant" ? "/merchant" : "/merchant/onboarding")}
            activeOpacity={0.9}
          >
            <View style={styles.merchantCtaIcon}>
              <Ionicons name="storefront" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.merchantCtaTitle}>
                {user.role === "merchant" ? "Open your merchant panel" : "Become a merchant"}
              </Text>
              <Text style={styles.merchantCtaSub}>
                {user.role === "merchant" ? "Manage deals, scan QRs, view insights." : "Post your first deal in under 3 minutes."}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}

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
          <View style={styles.locBtnRow}>
            <TouchableOpacity
              testID="pick-precise-location-btn"
              style={styles.inlineBtn}
              onPress={() => setShowPreciseLocPicker(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="locate" size={13} color={colors.brand} />
              <Text style={styles.inlineBtnText}>Pick precise location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="change-location-btn"
              style={[styles.inlineBtn, { backgroundColor: colors.info }]}
              onPress={() => setShowLocPicker(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="business" size={13} color={colors.white} />
              <Text style={[styles.inlineBtnText, { color: colors.white }]}>Quick city switch</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* PREFERRED CATEGORIES */}
      <View style={styles.section}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.sectionTitle}>Preferred categories</Text>
          {saving && <ActivityIndicator size="small" color={colors.brand} />}
        </View>
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
        {!user && (
          <TouchableOpacity
            testID="notif-signin-hint"
            onPress={() => router.push("/sign-in")}
            activeOpacity={0.85}
            style={styles.notifGuestBanner}
          >
            <Ionicons name="lock-closed" size={14} color={colors.info} />
            <Text style={styles.notifGuestText}>Sign in to enable</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.card, !user && styles.cardDisabled, !user && { pointerEvents: "none" }]}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Nearby new deals</Text>
              <Text style={styles.rowSubtitle}>Alert when merchants nearby post a hot offer.</Text>
            </View>
            <Switch value={user ? notifDeals : false} onValueChange={setNotifDeals} disabled={!user} trackColor={{ true: colors.brand }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Expiring-soon reminders</Text>
              <Text style={styles.rowSubtitle}>Get pinged 15 & 5 minutes before your claim expires.</Text>
            </View>
            <Switch value={user ? notifExpiring : false} onValueChange={setNotifExpiring} disabled={!user} trackColor={{ true: colors.brand }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Followed merchants</Text>
              <Text style={styles.rowSubtitle}>Get notified when merchants you follow post deals.</Text>
            </View>
            <Switch value={user ? notifFollowed : false} onValueChange={setNotifFollowed} disabled={!user} trackColor={{ true: colors.brand }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Quiet hours 10pm–8am</Text>
              <Text style={styles.rowSubtitle}>No notifications during your set-and-forget quiet window.</Text>
            </View>
            <Switch value={user ? quietHours : false} onValueChange={setQuietHours} disabled={!user} trackColor={{ true: colors.brand }} />
          </View>
        </View>
      </View>

      {/* Points ledger */}
      {loyalty?.ledger?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Points activity</Text>
          <View style={styles.card}>
            {loyalty.ledger.slice(0, 8).map((entry: any) => (
              <View key={entry.id} style={styles.ledgerRow}>
                <View style={[styles.ledgerIcon, { backgroundColor: entry.delta > 0 ? "#D1F5E0" : colors.surfaceTertiary }]}>
                  <Ionicons
                    name={entry.delta > 0 ? "add" : "remove"}
                    size={14}
                    color={entry.delta > 0 ? colors.success : colors.muted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerReason}>{humanReason(entry.reason)}</Text>
                  <Text style={styles.ledgerTime}>{new Date(entry.created_at).toLocaleString()}</Text>
                </View>
                <Text style={[styles.ledgerAmount, { color: entry.delta > 0 ? colors.success : colors.muted }]}>
                  {entry.delta > 0 ? "+" : ""}{entry.delta}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {user && (
        <View style={styles.section}>
          <TouchableOpacity
            testID="signout-btn"
            style={styles.signOutBtn}
            onPress={doSignOut}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.footer}>HappyHour · v1.0</Text>

      {/* Location picker modal */}
      <Modal transparent animationType="slide" visible={showLocPicker} onRequestClose={() => setShowLocPicker(false)}>
        <View style={styles.locModalOverlay}>
          <View style={[styles.locModalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.locSheetHeader}>
              <Text style={styles.locSheetTitle}>Change city</Text>
              <TouchableOpacity onPress={() => setShowLocPicker(false)}>
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <Text style={styles.locSheetSub}>Pick a demo city — nearby merchants will be regenerated around it.</Text>
            {CITIES.map((c) => (
              <TouchableOpacity
                key={c.name}
                testID={`city-${c.name}`}
                style={styles.cityRow}
                onPress={() => pickCity(c)}
                activeOpacity={0.85}
              >
                <Ionicons name="location" size={18} color={colors.brand} />
                <Text style={styles.cityName}>{c.name}</Text>
                {loc.label === c.name && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Precise Location Picker (search + GPS + pin) */}
      <LocationPickerModal
        visible={showPreciseLocPicker}
        onClose={() => setShowPreciseLocPicker(false)}
        onConfirm={async (picked) => {
          await setManual(picked.lat, picked.lng, picked.label);
          setShowPreciseLocPicker(false);
          // Optionally re-seed merchants around new anchor for demo continuity
          try {
            await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/seed?lat=${picked.lat}&lng=${picked.lng}&force=false`, { method: "POST" });
          } catch {}
        }}
        initialLat={loc.lat}
        initialLng={loc.lng}
        initialLabel={loc.label}
        title="Set precise location"
      />
    </ScrollView>
  );
}

function humanReason(r: string): string {
  if (r === "redemption") return "Deal redemption reward";
  if (r === "redemption_and_referral") return "Redemption + first-claim bonus";
  if (r === "referral_referrer") return "Friend redeemed their first claim";
  return r;
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
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.info,
  },
  roleBadgeText: { color: colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
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
  },

  loyaltyCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.cardStrong,
  },
  loyaltyContent: { padding: spacing.lg },
  loyaltyTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  loyaltyLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  loyaltyValue: { color: colors.white, fontSize: 36, fontWeight: "800", marginTop: 4 },
  loyaltyHint: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: spacing.sm, fontWeight: "600" },

  referCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm,
    ...shadow.card,
  },
  referHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  referTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  referSub: { fontSize: 12, color: colors.muted },
  referCodeRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  referCodeBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1.5, borderColor: colors.brand,
    borderStyle: "dashed",
  },
  referCode: { color: colors.brand, fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 16, height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  shareBtnText: { color: colors.white, fontSize: 13, fontWeight: "800" },

  merchantCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  merchantCtaIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  merchantCtaTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  merchantCtaSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  notifGuestBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#E4F1FA",
  },
  notifGuestText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
  inlineBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  inlineBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
  locBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  locModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  locModalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "80%",
  },
  locSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  locSheetTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  locSheetSub: { fontSize: 12, color: colors.muted, marginBottom: spacing.sm },
  cityRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  cityName: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.onSurface },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  catChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic" },

  ledgerRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: 6,
  },
  ledgerIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  ledgerReason: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  ledgerTime: { fontSize: 10, color: colors.muted, marginTop: 2, fontWeight: "600" },
  ledgerAmount: { fontSize: 14, fontWeight: "800" },

  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: radius.pill,
    backgroundColor: "#FFE4E4",
  },
  signOutText: { color: colors.error, fontSize: 14, fontWeight: "800" },
  footer: { textAlign: "center", fontSize: 11, color: colors.muted, marginTop: spacing.lg },
});
