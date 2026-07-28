import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function MerchantRoot() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, loading } = useAuth();
  const [routing, setRouting] = useState(true);

  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!token) {
        // Show landing instead of silently pushing to customer sign-in
        setRouting(false);
        return;
      }
      if (user?.role === "merchant") {
        try {
          await api.merchantMe();
          router.replace("/merchant/(tabs)");
          return;
        } catch {
          router.replace("/merchant/onboarding");
          return;
        }
      }
      // Signed in but not a merchant yet → onboarding wizard
      router.replace("/merchant/onboarding");
    })();
  }, [loading, token, user, router]);

  if (routing) {
    return (
      <View style={styles.spinnerWrap}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200" }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
        <LinearGradient
          colors={["rgba(45,36,34,0.2)", "rgba(45,36,34,0.85)", "rgba(45,36,34,0.98)"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            testID="merchant-landing-back"
            style={styles.iconBtn}
            onPress={() => router.replace("/(tabs)")}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xxxl }]}>
          <View style={styles.logoBadge}>
            <Ionicons name="storefront" size={26} color={colors.white} />
          </View>
          <Text style={styles.brandRow}>HappyHour <Text style={styles.brandAccent}>Merchants</Text></Text>
          <Text style={styles.hero1}>Fill your store,{"\n"}every hour.</Text>
          <Text style={styles.hero2}>
            Publish flash deals, promo videos, and standing offers in minutes. Track every claim, scan every redemption, grow every week.
          </Text>
        </View>
      </View>

      {/* Value props */}
      <View style={styles.perksWrap}>
        <Perk icon="flash" title="Flash deals in 60 seconds" subtitle="Set a discount, quantity, and duration — done." />
        <Perk icon="qr-code" title="One-tap in-store redemption" subtitle="Scan customer QR or type the code. Works offline." />
        <Perk icon="stats-chart" title="Real-time insights" subtitle="See views, claims, GMV, peak hours, and peer benchmarks." />
        <Perk icon="videocam" title="Short-form video reels" subtitle="Attach 15–60s videos to any offer for higher intent." />
      </View>

      {/* CTAs */}
      <View style={styles.ctaWrap}>
        <TouchableOpacity
          testID="merchant-signin-btn"
          style={styles.primaryBtn}
          onPress={() => router.push("/merchant/sign-in")}
          activeOpacity={0.85}
        >
          <Ionicons name="log-in" size={18} color={colors.white} />
          <Text style={styles.primaryBtnText}>Merchant sign in</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="merchant-signup-btn"
          style={styles.secondaryBtn}
          onPress={() => router.push("/merchant/sign-up")}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Create a merchant account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="back-to-customer-btn"
          style={styles.ghostBtn}
          onPress={() => router.replace("/(tabs)")}
          activeOpacity={0.7}
        >
          <Text style={styles.ghostBtnText}>Continue as a customer instead</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Perk({ icon, title, subtitle }: any) {
  return (
    <View style={styles.perkRow}>
      <View style={styles.perkIcon}>
        <Ionicons name={icon} size={22} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.perkTitle}>{title}</Text>
        <Text style={styles.perkSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  spinnerWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  hero: {
    height: 380,
    position: "relative",
  },
  heroTop: {
    position: "absolute", left: 0, right: 0, top: 0,
    padding: spacing.md,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  heroContent: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "flex-end",
  },
  logoBadge: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.cardStrong,
  },
  brandRow: { color: colors.white, fontSize: 16, fontWeight: "700", letterSpacing: 0.3, marginBottom: spacing.sm },
  brandAccent: { color: colors.brandSecondary, fontWeight: "800" },
  hero1: {
    fontSize: 32, fontWeight: "800", color: colors.white, lineHeight: 38,
    marginBottom: spacing.md,
  },
  hero2: {
    fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20,
  },

  perksWrap: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  perkIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  perkTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  perkSub: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },

  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  primaryBtn: {
    height: 56,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    ...shadow.cardStrong,
  },
  primaryBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  secondaryBtn: {
    height: 56,
    alignItems: "center", justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { color: colors.brand, fontSize: 15, fontWeight: "800" },
  ghostBtn: {
    height: 44, alignItems: "center", justifyContent: "center",
  },
  ghostBtnText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
});
