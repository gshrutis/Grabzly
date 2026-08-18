import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import QRCode from "react-native-qrcode-svg";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { api } from "@/src/api/client";
import Countdown from "@/src/components/Countdown";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { formatMoney } from "@/src/utils/format";

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [claim, setClaim] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!claim) return;
    await Clipboard.setStringAsync(claim.redemption_code);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    (async () => {
      try {
        const c = await api.getClaim(id);
        setClaim(c);
      } catch (e) { console.warn(e); }
      setLoading(false);
    })();
  }, [id]);

  const cancel = async () => {
    Haptics.selectionAsync().catch(() => {});
    setCancelling(true);
    try {
      await api.cancelClaim(id);
      const c = await api.getClaim(id);
      setClaim(c);
    } catch (e) { console.warn(e); }
    setCancelling(false);
  };

  if (loading || !claim) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  const isActive = claim.status === "active";
  const statusMeta =
    claim.status === "redeemed" ? { color: colors.success, icon: "checkmark-circle", label: "Redeemed" } :
    claim.status === "expired" ? { color: colors.muted, icon: "time", label: "Expired" } :
    claim.status === "cancelled" ? { color: colors.muted, icon: "close-circle", label: "Cancelled" } :
    { color: colors.brand, icon: "ticket", label: "Ready to redeem" };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            testID="claim-close"
            style={styles.iconBtn}
            onPress={() => router.replace("/(tabs)/claims")}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </TouchableOpacity>
        </View>

        <View style={styles.successHero}>
          <View style={styles.successCheck}>
            <Ionicons name={statusMeta.icon as any} size={44} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>{statusMeta.label}</Text>
          {isActive && claim.redemption_deadline && (
            <Countdown
              expiresAt={claim.redemption_deadline}
              prefix="Show at counter within "
              style={styles.deadline}
              expiredLabel="Time's up — deal expired"
            />
          )}
        </View>

        {isActive && (
          <View style={styles.qrCard}>
            <QRCode
              value={claim.qr_payload}
              size={220}
              backgroundColor={colors.white}
              color={colors.onSurface}
            />
            <Text style={styles.qrCodeLabel}>Redemption code</Text>
            <TouchableOpacity
              testID="claim-copy-code"
              onPress={copyCode}
              activeOpacity={0.75}
              style={styles.qrCodeCopyRow}
            >
              <Text style={styles.qrCode}>{claim.redemption_code}</Text>
              <View style={[styles.copyIcon, copied && { backgroundColor: colors.success }]}>
                <Ionicons name={copied ? "checkmark" : "copy"} size={14} color={colors.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.qrHint}>
              {copied ? "Copied ✓ — paste at the merchant counter" : "Tap the code to copy. Show QR to merchant."}
            </Text>
          </View>
        )}

        {/* Deal summary */}
        <View style={styles.summaryCard}>
          {claim.image_url && (
            <Image source={{ uri: claim.image_url }} style={styles.summaryImg} contentFit="cover" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle} numberOfLines={2}>{claim.deal_title}</Text>
            <Text style={styles.summaryMerchant}>{claim.merchant_name}</Text>
            <View style={styles.summaryPriceRow}>
              {typeof claim.before_price === "number" && (
                <Text style={styles.summaryPriceBefore}>{formatMoney(claim.before_price)}</Text>
              )}
              {typeof claim.after_price === "number" && (
                <Text style={styles.summaryPriceAfter}>{formatMoney(claim.after_price)}</Text>
              )}
              {typeof claim.discount_pct === "number" && (
                <View style={styles.summaryDiscount}>
                  <Text style={styles.summaryDiscountText}>{Math.round(claim.discount_pct)}% OFF</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {isActive && (
          <TouchableOpacity
            testID="cancel-claim-btn"
            style={styles.cancelBtn}
            onPress={cancel}
            disabled={cancelling}
            activeOpacity={0.85}
          >
            {cancelling ? (
              <ActivityIndicator color={colors.error} />
            ) : (
              <>
                <Ionicons name="trash" size={16} color={colors.error} />
                <Text style={styles.cancelText}>Cancel claim</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  topRow: { flexDirection: "row", justifyContent: "flex-end" },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  successHero: { alignItems: "center", marginTop: spacing.md },
  successCheck: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.cardStrong,
  },
  successTitle: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  deadline: { fontSize: 13, color: colors.brand, fontWeight: "700", marginTop: 4 },

  qrCard: {
    padding: spacing.xl,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  qrCodeLabel: {
    marginTop: spacing.lg,
    fontSize: 11, color: colors.muted, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase",
  },
  qrCode: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.brand,
    letterSpacing: 4,
  },
  qrCodeCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    marginTop: 4,
  },
  copyIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  qrHint: {
    marginTop: spacing.md, fontSize: 12, color: colors.muted,
    textAlign: "center", lineHeight: 18, maxWidth: 260,
  },

  summaryCard: {
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    flexDirection: "row", gap: spacing.md,
    alignItems: "center",
    ...shadow.card,
  },
  summaryImg: { width: 70, height: 70, borderRadius: 12 },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  summaryMerchant: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },
  summaryPriceRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center", gap: 6, flexWrap: "wrap",
  },
  summaryPriceBefore: {
    fontSize: 12, color: colors.muted, textDecorationLine: "line-through", fontWeight: "500",
  },
  summaryPriceAfter: {
    fontSize: 16, fontWeight: "800", color: colors.onSurface,
  },
  summaryDiscount: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  summaryDiscountText: {
    color: colors.brand, fontSize: 10, fontWeight: "800",
  },

  cancelBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 48,
    borderRadius: radius.pill,
    backgroundColor: "#FFE4E4",
  },
  cancelText: { color: colors.error, fontSize: 14, fontWeight: "800" },
});
