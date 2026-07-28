import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { useLocation } from "@/src/context/location";
import DealCard from "@/src/components/DealCard";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function StoreProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, refresh } = useAuth();
  const { loc } = useLocation();
  const [merchant, setMerchant] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.getMerchant(id, { lat: loc.lat, lng: loc.lng });
        setMerchant(m);
      } catch (e) { console.warn(e); }
      setLoading(false);
    })();
  }, [id, loc.lat, loc.lng]);

  useEffect(() => {
    setFollowing((user?.favorited_merchants || []).includes(id));
  }, [user, id]);

  const toggleFollow = async () => {
    if (!token) {
      router.push("/sign-in");
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    try {
      const res = await api.toggleFollow(id);
      setFollowing(res.following);
      await refresh();
    } catch {}
  };

  const openDirections = () => {
    if (!merchant) return;
    const { lat, lng, name } = merchant;
    const label = encodeURIComponent(name);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      default: `https://maps.google.com/?q=${lat},${lng}`,
    })!;
    Linking.openURL(url).catch(() => {});
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }
  if (!merchant) {
    return (
      <View style={styles.loading}>
        <Text>Merchant not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={styles.cover}>
        <Image source={{ uri: merchant.cover_image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <LinearGradient
          colors={["rgba(45,36,34,0.5)", "transparent", "rgba(45,36,34,0.85)"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.coverTop, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            testID="store-back-btn"
            style={styles.iconCircle}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            testID="follow-btn"
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={toggleFollow}
            activeOpacity={0.85}
          >
            <Ionicons
              name={following ? "heart" : "heart-outline"}
              size={16}
              color={following ? colors.white : colors.brand}
            />
            <Text style={[styles.followText, following && { color: colors.white }]}>
              {following ? "Following" : "Follow"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.headerBody}>
        <Image source={{ uri: merchant.logo }} style={styles.logo} contentFit="cover" />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{merchant.name}</Text>
          {merchant.verified && (
            <Ionicons name="checkmark-circle" size={18} color={colors.info} />
          )}
        </View>
        <Text style={styles.category}>{String(merchant.category).toUpperCase()}</Text>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.statText}>{merchant.rating} ({merchant.review_count})</Text>
          </View>
          {typeof merchant.distance_km === "number" && (
            <View style={styles.stat}>
              <Ionicons name="location" size={14} color={colors.brand} />
              <Text style={styles.statText}>{merchant.distance_km.toFixed(1)} km</Text>
            </View>
          )}
          <View style={styles.stat}>
            <Ionicons name="time" size={14} color={colors.muted} />
            <Text style={styles.statText}>{merchant.hours}</Text>
          </View>
        </View>

        <Text style={styles.description}>{merchant.description}</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            testID="store-directions-btn"
            style={styles.actionBtn}
            onPress={openDirections}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={18} color={colors.brand} />
            <Text style={styles.actionBtnText}>Directions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="store-call-btn"
            style={styles.actionBtn}
            onPress={() => merchant.phone && Linking.openURL(`tel:${merchant.phone}`).catch(() => {})}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={18} color={colors.brand} />
            <Text style={styles.actionBtnText}>Call</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.dealsSection}>
        <Text style={styles.sectionTitle}>Active deals</Text>
        {(merchant.deals || []).filter((d: any) => !d.expired).length === 0 ? (
          <Text style={styles.emptyText}>No active deals right now — follow to get notified.</Text>
        ) : (
          (merchant.deals || [])
            .filter((d: any) => !d.expired)
            .map((d: any) => <DealCard key={d.id} deal={{ ...d, merchant_name: merchant.name, verified: merchant.verified }} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  cover: { height: 220, position: "relative" },
  coverTop: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, gap: 8,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  followBtnActive: {
    backgroundColor: colors.brand,
  },
  followText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  headerBody: {
    marginTop: -30,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  logo: { width: 56, height: 56, borderRadius: 14, marginBottom: spacing.sm },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  category: { fontSize: 11, color: colors.muted, fontWeight: "800", letterSpacing: 0.8, marginTop: 4 },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: spacing.md },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  description: { marginTop: spacing.md, fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: spacing.lg },
  actionBtn: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  actionBtnText: { color: colors.brand, fontWeight: "800", fontSize: 13 },

  dealsSection: { padding: spacing.lg },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: "center", padding: spacing.xl },
});
