import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { useLocation } from "@/src/context/location";
import { colors, radius, spacing, shadow } from "@/src/theme";
import Countdown from "@/src/components/Countdown";

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { loc } = useLocation();
  const [deal, setDeal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoMuted, setVideoMuted] = useState(true);

  const player = useVideoPlayer(deal?.video_url ?? null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    (async () => {
      try {
        const d = await api.getDeal(id, { lat: loc.lat, lng: loc.lng });
        setDeal(d);
      } catch (e: any) {
        setError(e.message || "Failed to load deal");
      }
      setLoading(false);
    })();
  }, [id, loc.lat, loc.lng]);

  const handleClaim = async () => {
    if (!token) {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: "/sign-in", params: { returnTo: `/deal/${id}` } });
      return;
    }
    setClaiming(true);
    setError(null);
    try {
      const claim = await api.claimDeal(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/claim/${claim.id}`);
    } catch (e: any) {
      setError(e.message || "Claim failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setClaiming(false);
  };

  const openDirections = () => {
    if (!deal?.merchant) return;
    const { lat, lng } = deal.merchant;
    const label = encodeURIComponent(deal.merchant.name);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      default: `https://maps.google.com/?q=${lat},${lng}`,
    })!;
    Linking.openURL(url).catch(() => {});
  };

  const toggleVideoMute = () => {
    const next = !videoMuted;
    setVideoMuted(next);
    if (player) player.muted = next;
  };

  if (loading) {
    return (
      <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>
    );
  }

  if (!deal) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: colors.muted }}>Deal not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnFallback}>
          <Text style={{ color: colors.brand, fontWeight: "700" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isSoldOut = deal.deal_type === "flash" && deal.quantity_remaining === 0;
  const isExpired = deal.expired;
  const canClaim = !isSoldOut && !isExpired;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* HERO */}
        <View style={styles.hero}>
          {deal.video_url ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <Image source={{ uri: deal.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          )}
          <LinearGradient
            colors={["rgba(45,36,34,0.6)", "transparent", "rgba(45,36,34,0.85)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + spacing.sm }]}>
            <TouchableOpacity
              testID="deal-back-btn"
              style={styles.iconCircle}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {deal.video_url && (
              <TouchableOpacity
                style={styles.iconCircle}
                onPress={toggleVideoMute}
                activeOpacity={0.8}
              >
                <Ionicons name={videoMuted ? "volume-mute" : "volume-high"} size={20} color={colors.onSurface} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.heroBottom}>
            {typeof deal.discount_pct === "number" && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{Math.round(deal.discount_pct)}% OFF</Text>
              </View>
            )}
            <Text style={styles.dealTitle}>{deal.title}</Text>
            <Text style={styles.dealMerchant}>{deal.merchant_name}</Text>
          </View>
        </View>

        {/* KEY META */}
        <View style={styles.metaCards}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Now</Text>
            <Text style={styles.metaValue}>${(deal.after_price ?? 0).toFixed(2)}</Text>
            {typeof deal.before_price === "number" && (
              <Text style={styles.metaWas}>was ${deal.before_price.toFixed(2)}</Text>
            )}
          </View>
          {deal.deal_type !== "regular" && deal.expires_at ? (
            <View style={[styles.metaCard, styles.metaCardUrgent]}>
              <Text style={[styles.metaLabel, { color: colors.brand }]}>Expires in</Text>
              <Countdown expiresAt={deal.expires_at} style={styles.metaValueUrgent} />
              {typeof deal.quantity_remaining === "number" && (
                <Text style={styles.metaWas}>{deal.quantity_remaining} left of {deal.quantity}</Text>
              )}
            </View>
          ) : (
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Availability</Text>
              <Text style={styles.metaValueSmall}>Any time during store hours</Text>
            </View>
          )}
        </View>

        {/* DESCRIPTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About this deal</Text>
          <Text style={styles.body}>{deal.description}</Text>
        </View>

        {/* MERCHANT */}
        {deal.merchant && (
          <TouchableOpacity
            testID="open-store-btn"
            style={styles.merchantCard}
            onPress={() => router.push(`/store/${deal.merchant.id}`)}
            activeOpacity={0.9}
          >
            <Image source={{ uri: deal.merchant.logo }} style={styles.merchantLogo} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <View style={styles.merchantTop}>
                <Text style={styles.merchantName}>{deal.merchant.name}</Text>
                {deal.merchant.verified && (
                  <Ionicons name="checkmark-circle" size={14} color={colors.info} />
                )}
              </View>
              <Text style={styles.merchantMeta}>
                ★ {deal.merchant.rating} · {typeof deal.distance_km === "number" ? `${deal.distance_km.toFixed(1)} km` : deal.merchant.address}
              </Text>
              <Text style={styles.merchantHours}>{deal.merchant.hours}</Text>
            </View>
            <TouchableOpacity
              testID="directions-btn"
              onPress={openDirections}
              style={styles.dirBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={16} color={colors.brand} />
              <Text style={styles.dirBtnText}>Directions</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* TERMS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms & conditions</Text>
          <Text style={styles.body}>{deal.terms}</Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* STICKY CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          testID="claim-deal-btn"
          style={[
            styles.claimBtn,
            !canClaim && { backgroundColor: colors.muted },
          ]}
          onPress={handleClaim}
          disabled={!canClaim || claiming}
          activeOpacity={0.85}
        >
          {claiming ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name={isSoldOut ? "close-circle" : isExpired ? "time" : "ticket"} size={20} color={colors.white} />
              <Text style={styles.claimBtnText}>
                {isSoldOut ? "Sold out" : isExpired ? "Deal expired" : "Claim deal"}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.footerHint}>Pay in-store at redemption. Show your QR code.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, gap: spacing.md,
  },
  backBtnFallback: { padding: spacing.md },
  hero: {
    height: 380, position: "relative",
  },
  heroTop: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: spacing.md,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  heroBottom: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
  },
  discountBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  discountText: { color: colors.white, fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  dealTitle: { color: colors.white, fontSize: 24, fontWeight: "800", lineHeight: 28 },
  dealMerchant: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600", marginTop: 4 },

  metaCards: {
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.md,
  },
  metaCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  metaCardUrgent: {
    backgroundColor: colors.brandTertiary,
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  metaLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  metaValueUrgent: { fontSize: 22, fontWeight: "800", color: colors.brand, marginTop: 4 },
  metaValueSmall: { fontSize: 13, fontWeight: "600", color: colors.onSurface, marginTop: 4 },
  metaWas: { fontSize: 11, color: colors.muted, marginTop: 2 },

  section: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  body: { fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 },

  merchantCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  merchantLogo: { width: 52, height: 52, borderRadius: 12 },
  merchantTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  merchantName: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  merchantMeta: { fontSize: 12, color: colors.muted, fontWeight: "600", marginTop: 2 },
  merchantHours: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },
  dirBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  dirBtnText: { fontSize: 12, fontWeight: "800", color: colors.brand },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: spacing.md, marginHorizontal: spacing.lg,
    backgroundColor: "#FFE4E4",
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", flex: 1 },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    ...shadow.cardStrong,
  },
  claimBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  footerHint: { fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 6 },
});
