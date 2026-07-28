import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { useLocation } from "@/src/context/location";
import { colors, radius, spacing, shadow } from "@/src/theme";

const ONBOARDED_KEY = "hh_onboarded_v1";

export default function OnboardingPriming() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestPermission, requesting } = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const done = await storage.getItem<boolean>(ONBOARDED_KEY, false);
      if (done) {
        router.replace("/(tabs)");
      } else {
        setChecking(false);
      }
    })();
  }, [router]);

  const handleEnableLocation = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await requestPermission();
    router.push("/onboarding-categories");
  };

  const handleSkip = async () => {
    Haptics.selectionAsync().catch(() => {});
    router.push("/onboarding-categories");
  };

  if (checking) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1532634922-8fe0b757fb13?w=1200" }}
          style={styles.heroImage}
          contentFit="cover"
        />
        <LinearGradient
          colors={["rgba(45,36,34,0.1)", "rgba(45,36,34,0.75)", "rgba(45,36,34,0.95)"]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="flash" size={22} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brand}>HappyHour</Text>
          </View>
          <Text style={styles.hookline}>
            Real-time deals from{"\n"}your neighborhood.
          </Text>
          <Text style={styles.tagline}>
            Flash discounts, TikTok-style reels, and one-tap QR redemption at nearby restaurants, cafes, and shops.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.benefitRow}>
          <View style={styles.benefitIcon}>
            <Ionicons name="location" size={20} color={colors.brand} />
          </View>
          <View style={styles.benefitText}>
            <Text style={styles.benefitTitle}>Discover deals near you</Text>
            <Text style={styles.benefitSub}>See time-sensitive offers within walking distance.</Text>
          </View>
        </View>
        <View style={styles.benefitRow}>
          <View style={styles.benefitIcon}>
            <Ionicons name="notifications" size={20} color={colors.brand} />
          </View>
          <View style={styles.benefitText}>
            <Text style={styles.benefitTitle}>Never miss a flash deal</Text>
            <Text style={styles.benefitSub}>Get alerted when your favorite stores drop hot offers.</Text>
          </View>
        </View>
        <View style={styles.benefitRow}>
          <View style={styles.benefitIcon}>
            <Ionicons name="qr-code" size={20} color={colors.brand} />
          </View>
          <View style={styles.benefitText}>
            <Text style={styles.benefitTitle}>Redeem in-store instantly</Text>
            <Text style={styles.benefitSub}>Show your QR code, walk out with the deal.</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          testID="enable-location-btn"
          style={styles.primaryBtn}
          onPress={handleEnableLocation}
          disabled={requesting}
          activeOpacity={0.85}
        >
          {requesting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="navigate" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.primaryBtnText}>Enable location</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          testID="skip-location-btn"
          style={styles.secondaryBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryBtnText}>Browse without location</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  hero: {
    height: 380,
    position: "relative",
  },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroContent: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "flex-end",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: spacing.lg,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: 0.3,
  },
  hookline: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.white,
    lineHeight: 38,
    marginBottom: spacing.md,
  },
  tagline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 21,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  benefitRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: { flex: 1 },
  benefitTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  benefitSub: {
    marginTop: 2,
    fontSize: 13,
    color: colors.muted,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
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
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryBtn: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
});
