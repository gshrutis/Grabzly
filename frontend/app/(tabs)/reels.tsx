import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity, ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image } from "expo-image";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";
import { useLocation } from "@/src/context/location";

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

function WebReelVideo({ url, muted }: { url: string; muted: boolean }) {
  const hostRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const host = hostRef.current as HTMLElement | null;
    if (!host || typeof host.appendChild !== "function") return;
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = true;
    video.controls = false;
    video.removeAttribute("controls");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    video.style.position = "absolute";
    video.style.left = "0";
    video.style.top = "0";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.display = "block";
    video.style.backgroundColor = "#000";
    video.style.pointerEvents = "none";
    const start = () => {
      video.play().catch(() => {});
    };
    video.addEventListener("canplay", start);
    host.appendChild(video);
    videoRef.current = video;
    start();
    return () => {
      video.removeEventListener("canplay", start);
      video.pause();
      video.remove();
      videoRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  return <View ref={hostRef} style={styles.videoHost} />;
}

function NativeReelVideo({
  url, muted, width, height,
}: { url: string; muted: boolean; width: number; height: number }) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    const start = () => {
      try { player.play(); } catch {}
    };
    const subscription = player.addListener("statusChange", (event) => {
      if (event.status === "readyToPlay") start();
    });
    return () => {
      subscription.remove();
      try { player.pause(); } catch {}
    };
  }, [player]);

  return (
    <View
      style={{ position: "absolute", top: 0, left: 0, width, height }}
      collapsable={false}
      onLayout={() => { try { player.play(); } catch {} }}
    >
      <VideoView
        player={player}
        style={{ width, height }}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
      />
    </View>
  );
}

function ActiveReelVideo(props: { url: string; muted: boolean; width: number; height: number }) {
  if (Platform.OS === "web") return <WebReelVideo url={props.url} muted={props.muted} />;
  return <NativeReelVideo {...props} />;
}

function ReelItem({ deal, active, height }: { deal: Deal; active: boolean; height: number }) {
  const router = useRouter();
  const [muted, setMuted] = useState(true);

  const toggleMute = () => {
    setMuted((current) => !current);
  };

  return (
    <View style={[styles.reel, { height }]} testID={`reel-${deal.id}`}>
      {deal.image_url && !(Platform.OS === "web" && active && deal.video_url) ? (
        <Image
          source={{ uri: deal.image_url }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      ) : null}
      {!deal.image_url && !(active && deal.video_url) ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surfaceInverse }]} />
      ) : null}
      {active && deal.video_url ? (
        <ActiveReelVideo
          key={deal.video_url}
          url={deal.video_url}
          muted={muted}
          width={SCREEN_W}
          height={height}
        />
      ) : null}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.88)"]}
        style={styles.reelShade}
        pointerEvents="none"
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
  const { loc, selectedCity } = useLocation();

  const tabBarHeight = 60 + insets.bottom;
  const [pageHeight, setPageHeight] = useState(SCREEN_H - tabBarHeight);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.reels({
  lat: selectedCity?.lat ?? loc.lat,
  lng: selectedCity?.lng ?? loc.lng,
  city: selectedCity?.name,
});
        setDeals(d);
      } catch (e) { console.warn(e); }
      setLoading(false);
    })();
  }, [loc, selectedCity]);

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
    <View
      style={styles.container}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.height);
        if (next > 0 && next !== pageHeight) setPageHeight(next);
      }}
    >
      <FlatList
        ref={listRef}
        data={deals}
        keyExtractor={(d) => d.id}
        renderItem={({ item, index }) => (
          <ReelItem deal={item} active={index === activeIndex} height={pageHeight} />
        )}
        pagingEnabled
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        snapToInterval={pageHeight}
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        scrollEventThrottle={32}
        onScroll={(e) => {
          if (!pageHeight) return;
          const index = Math.round(e.nativeEvent.contentOffset.y / pageHeight);
          if (index >= 0 && index !== activeIndex) setActiveIndex(index);
        }}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.y / pageHeight);
          if (index !== activeIndex) setActiveIndex(index);
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
  video: { position: "absolute", top: 0, left: 0 },
  videoHost: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    backgroundColor: "#000",
  },
  reelShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 230,
    ...Platform.select({ web: { zIndex: 2 }, default: {} }),
  },
  reelSideActions: {
    position: "absolute",
    right: spacing.md,
    bottom: 200,
    gap: spacing.lg,
    alignItems: "center",
    ...Platform.select({ web: { zIndex: 2 }, default: {} }),
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
    ...Platform.select({ web: { zIndex: 2 }, default: {} }),
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
