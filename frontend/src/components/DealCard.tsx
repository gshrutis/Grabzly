import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import Countdown from "./Countdown";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { formatMoney } from "@/src/utils/format";

type Deal = {
  id: string;
  title: string;
  merchant_name?: string;
  merchant_logo?: string;
  image_url?: string;
  before_price?: number;
  after_price?: number;
  discount_pct?: number;
  expires_at?: string;
  deal_type?: string;
  is_live_now?: boolean;
  distance_km?: number;
  quantity_remaining?: number | null;
  rating?: number;
  verified?: boolean;
};

export default function DealCard({ deal, compact = false }: { deal: Deal; compact?: boolean }) {
  const router = useRouter();
  const hasCountdown = deal.deal_type !== "regular" && deal.expires_at;

  return (
    <TouchableOpacity
      testID={`deal-card-${deal.id}`}
      activeOpacity={0.9}
      style={[styles.card, compact && styles.cardCompact]}
      onPress={() => router.push(`/deal/${deal.id}`)}
    >
      <View style={styles.imageWrap}>
        {deal.image_url ? (
          <Image
            source={{ uri: deal.image_url }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(45,36,34,0.75)"]}
          style={styles.scrim}
        />
        {typeof deal.discount_pct === "number" && deal.discount_pct > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{Math.round(deal.discount_pct)}% OFF</Text>
          </View>
        )}
        {deal.is_live_now && (
          <View style={styles.liveBadge} testID="live-now-badge">
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE NOW</Text>
          </View>
        )}
        {deal.deal_type === "video" && (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={12} color={colors.white} />
          </View>
        )}
        <View style={styles.imageFooter}>
          <Text style={styles.title} numberOfLines={2}>{deal.title}</Text>
          {deal.merchant_name && (
            <View style={styles.merchantRow}>
              <Text style={styles.merchant} numberOfLines={1}>{deal.merchant_name}</Text>
              {deal.verified && (
                <Ionicons name="checkmark-circle" size={12} color={colors.info} style={{ marginLeft: 4 }} />
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.priceRow}>
          {typeof deal.before_price === "number" && (
            <Text style={styles.beforePrice}>{formatMoney(deal.before_price)}</Text>
          )}
          {typeof deal.after_price === "number" && (
            <Text style={styles.afterPrice}>{formatMoney(deal.after_price)}</Text>
          )}
        </View>
        <View style={styles.metaRow}>
          {typeof deal.distance_km === "number" && (
            <View style={styles.metaItem}>
              <Ionicons name="location" size={12} color={colors.muted} />
              <Text style={styles.metaText}>{deal.distance_km.toFixed(1)} km</Text>
            </View>
          )}
          {hasCountdown && (
            <View style={[styles.metaItem, styles.metaUrgent]}>
              <Ionicons name="time" size={12} color={colors.brand} />
              <Countdown
                expiresAt={deal.expires_at!}
                style={styles.metaTextUrgent}
                testID={`countdown-${deal.id}`}
              />
            </View>
          )}
          {typeof deal.quantity_remaining === "number" && deal.quantity_remaining <= 10 && (
            <View style={styles.metaItem}>
              <Ionicons name="flame" size={12} color={colors.warning} />
              <Text style={[styles.metaText, { color: colors.warning }]}>
                {deal.quantity_remaining} left
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  cardCompact: {
    marginBottom: spacing.md,
  },
  imageWrap: {
    position: "relative",
    aspectRatio: 16 / 10,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    backgroundColor: colors.surfaceTertiary,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  discountBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  discountText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  liveBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.error,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  liveText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  videoBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  imageFooter: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
  },
  title: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  merchantRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  merchant: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "600",
  },
  footer: {
    padding: spacing.md,
    gap: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  beforePrice: {
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: "line-through",
    fontWeight: "500",
  },
  afterPrice: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
  },
  metaUrgent: {},
  metaTextUrgent: {
    fontSize: 12,
    color: colors.brand,
    fontWeight: "700",
  },
});
