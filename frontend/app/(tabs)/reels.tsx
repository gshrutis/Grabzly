import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Deal = {
  id: string;
  title: string;
  merchant_name?: string;
  merchant_id?: string;
  discount_pct?: number;
  after_price?: number;
  before_price?: number;
  video_url?: string;
  image_url?: string;
  description?: string;
};

function ReelItem({ deal, active, tabBarHeight }: { deal: Deal; active: boolean; tabBarHeight: number }) {
  const router = useRouter();
  const player = useVideoPlayer(deal.video_url ?? null, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
    return () => { try { player.pause(); } catch {} };
  }, [active, player]);

  const toggleMute = () => {
    const next = !muted;
    player.muted = next;
    setMuted(next);
  };

  const cardHeight = SCREEN_H - tabBarHeight;

  return (
    <View style={[styles.reel, { height: cardHeight }]} testID={`reel-${deal.id}`}>
      {deal.video_url ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surfaceInverse }]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.reelSideActions}>
        <TouchableOpacity onPress={toggleMute} style={styles.actionBtn} testID={`mute-${deal.id}`}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color={colors.white} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => deal.merchant_id && router.push(`/store/${deal.merchant_id}`)}
          style={styles.actionBtn}
          testID={`store-${deal.id}`}
        >
          <Ionicons name="storefront" size={22} color={colors.white} />
          <Text style={styles.actionText}>Store</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.reelInfo}>
        {typeof deal.discount_pct === "number" && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{Math.round(deal.discount_pct)}% OFF</Text>
          </View>
        )}
        <Text style={styles.reelTitle} numberOfLines={2}>{deal.title}</Text>
        <Text style={styles.reelMerchant}>{deal.merchant_name}</Text>
        {deal.description && (
          <Text style={styles.reelDesc} numberOfLines={2}>{deal.description}</Text>
        )}
        <TouchableOpacity
          testID={`view-deal-${deal.id}`}
          style={styles.claimBtn}
          onPress={() => router.push(`/deal/${deal.id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.claimBtnText}>View deal</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.onBrandPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ReelsView() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + insets.bottom;
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.reels();
        setDeals(d);
      } catch (e) { console.warn(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (deals.length === 0) {
    return (
      <View style={[styles.loading, { padding: spacing.xl }]}>
        <Ionicons name="videocam-off" size={40} color={colors.muted} />
        <Text style={styles.emptyText}>No video reels available right now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={deals}
        keyExtractor={(d) => d.id}
        renderItem={({ item, index }) => (
          <ReelItem deal={item} active={index === activeIndex} tabBarHeight={tabBarHeight} />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        snapToInterval={SCREEN_H - tabBarHeight}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / (SCREEN_H - tabBarHeight));
          setActiveIndex(idx);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  loading: {
    flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: spacing.md,
  },
  emptyText: { color: colors.muted, fontSize: 14, fontWeight: "600", textAlign: "center" },
  reel: { width: SCREEN_W, backgroundColor: "#000", position: "relative" },
  reelSideActions: {
    position: "absolute",
    right: spacing.md,
    bottom: 200,
    gap: spacing.lg,
    alignItems: "center",
  },
  actionBtn: {
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  reelInfo: {
    position: "absolute",
    left: spacing.lg,
    right: 70,
    bottom: 32,
  },
  discountBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: 10,
  },
  discountText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  reelTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  reelMerchant: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600",
  },
  reelDesc: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  claimBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
  },
  claimBtnText: {
    color: colors.onBrandPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
});
