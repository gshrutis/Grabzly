import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Modal, FlatList,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { CATEGORY_META, colors, radius, spacing, shadow } from "@/src/theme";
import { formatMoney } from "@/src/utils/format";

type DealType = "flash" | "regular" | "video";

const HOURS_OPTIONS = [
  { label: "30 min", mins: 30 },
  { label: "1 hour", mins: 60 },
  { label: "2 hours", mins: 120 },
  { label: "4 hours", mins: 240 },
  { label: "1 day", mins: 60 * 24 },
];

const TAGS_BY_CATEGORY: Record<string, string[]> = {
  food: ["Vegan", "Vegetarian", "Gluten-free", "Halal", "Kosher", "Spicy", "Contains nuts", "Dairy-free"],
  grocery: ["Organic", "Farm-fresh", "Local", "Imported", "Frozen", "Ready-to-eat"],
  clothing: ["Men", "Women", "Unisex", "Kids", "New arrival", "Limited edition", "Sustainable"],
  kitchenware: ["Handmade", "Dishwasher-safe", "Non-stick", "Ceramic", "Stainless", "Cast iron", "Eco-friendly"],
  cafe: ["Signature", "Seasonal", "Caffeine-free", "Vegan", "Dairy-free", "Sugar-free"],
  bakery: ["Fresh today", "Vegan", "Gluten-free", "Sourdough", "Contains nuts", "Egg-free"],
};

export default function DealForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<null | "image" | "video">(null);

  // Deal fields
  const [dealType, setDealType] = useState<DealType>("flash");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("food");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [quantity, setQuantity] = useState("");
  const [perLimit, setPerLimit] = useState("1");
  const [durationMins, setDurationMins] = useState<number>(60);
  const [image, setImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [dietary, setDietary] = useState<Set<string>>(new Set());
  const [terms, setTerms] = useState("One per customer. Show code in-store. Not combinable with other offers.");
  const [isDraft, setIsDraft] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [sampleVideos, setSampleVideos] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [vids, m] = await Promise.all([api.sampleVideos(), api.merchantMe()]);
        setSampleVideos(vids);
        if (m?.category) {
          if (!isEdit) setCategory(m.category);
        }
      } catch {}
      if (isEdit) {
        try {
          const deals = await api.merchantDeals(true);
          const d = deals.find((x: any) => x.id === id);
          if (d) {
            setDealType(d.deal_type);
            setTitle(d.title);
            setDescription(d.description || "");
            setCategory(d.category);
            setBefore(d.before_price ? String(d.before_price) : "");
            setAfter(String(d.after_price));
            setQuantity(d.quantity != null ? String(d.quantity) : "");
            setPerLimit(String(d.per_customer_limit || 1));
            setImage(d.image_url || null);
            setVideoUrl(d.video_url || null);
            setDietary(new Set(d.dietary_tags || []));
            setTerms(d.terms || "");
            setIsDraft(!!d.is_draft);
          }
        } catch (e) { console.warn(e); }
      }
      setLoading(false);
    })();
  }, [id, isEdit]);

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploading("image");
    setError(null);
    try {
      const mime = asset.mimeType || "image/jpeg";
      const { url } = await api.uploadMedia(asset.uri, mime, asset.fileName || `image_${Date.now()}.jpg`);
      setImage(url);
    } catch (e: any) {
      setError(`Image upload failed: ${e?.message || "please try again"}`);
    } finally {
      setUploading(null);
    }
  };

  const pickVideoFromGallery = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 60,
      quality: 0.5,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploading("video");
    setError(null);
    try {
      const mime = asset.mimeType || "video/mp4";
      const { url } = await api.uploadMedia(asset.uri, mime, asset.fileName || `video_${Date.now()}.mp4`);
      setVideoUrl(url);
      setShowVideoPicker(false);
    } catch (e: any) {
      setError(`Video upload failed: ${e?.message || "please try again"}`);
    } finally {
      setUploading(null);
    }
  };

  const recordVideo = async () => {
    if (Platform.OS === "web") {
      setError("Camera recording is not available in web preview. Use gallery or a sample video.");
      return;
    }
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== "granted") return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 60,
      quality: 0.5,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploading("video");
    setError(null);
    try {
      const mime = asset.mimeType || "video/mp4";
      const { url } = await api.uploadMedia(asset.uri, mime, asset.fileName || `video_${Date.now()}.mp4`);
      setVideoUrl(url);
      setShowVideoPicker(false);
    } catch (e: any) {
      setError(`Video upload failed: ${e?.message || "please try again"}`);
    } finally {
      setUploading(null);
    }
  };

  const toggleTag = (tag: string) => {
    Haptics.selectionAsync().catch(() => {});
    const next = new Set(dietary);
    next.has(tag) ? next.delete(tag) : next.add(tag);
    setDietary(next);
  };

  const submit = async (draft = false) => {
    setError(null);
    if (!title || !after) {
      setError("Title and price are required.");
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      const expires = new Date(now.getTime() + durationMins * 60000);

      const beforeNum = before ? Number(before) : undefined;
      const afterNum = Number(after);
      const discountPct = beforeNum && afterNum ? Math.round(((beforeNum - afterNum) / beforeNum) * 100) : undefined;

      const body: any = {
        title, description, category, deal_type: dealType,
        before_price: beforeNum, after_price: afterNum, discount_pct: discountPct,
        quantity: quantity ? Number(quantity) : undefined,
        per_customer_limit: Number(perLimit) || 1,
        expires_at: dealType === "regular" ? undefined : expires.toISOString(),
        image_url: image ?? undefined,
        video_url: dealType === "video" ? (videoUrl ?? undefined) : undefined,
        dietary_tags: Array.from(dietary),
        terms,
        is_draft: draft,
      };

      if (isEdit) {
        await api.merchantPatchDeal(id!, body);
      } else {
        await api.merchantCreateDeal(body);
      }
      
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
if (router.canGoBack()) {
  router.back();
} else {
  router.replace("/merchant");
}
      router.back();
    } catch (e: any) {
      setError(e.message || "Save failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setSaving(false);
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  const discountPreview = before && after ? Math.round(((Number(before) - Number(after)) / Number(before)) * 100) : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          testID="df-close"
          style={styles.iconBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? "Edit deal" : "New deal"}</Text>
        <TouchableOpacity
          testID="df-preview"
          style={styles.iconBtn}
          onPress={() => setShowPreview(true)}
        >
          <Ionicons name="eye" size={20} color={colors.brand} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 140 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Deal type */}
        <Text style={styles.label}>Deal type</Text>
        <View style={styles.typeRow}>
          {(["flash", "regular", "video"] as DealType[]).map((t) => (
            <TouchableOpacity
              key={t}
              testID={`df-type-${t}`}
              style={[styles.typeCard, dealType === t && styles.typeCardActive]}
              onPress={() => setDealType(t)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={t === "flash" ? "flash" : t === "video" ? "videocam" : "pricetag"}
                size={22}
                color={dealType === t ? colors.white : colors.brand}
              />
              <Text style={[styles.typeLabel, dealType === t && { color: colors.white }]}>
                {t === "flash" ? "Flash" : t === "video" ? "Video" : "Regular"}
              </Text>
              <Text style={[styles.typeSub, dealType === t && { color: "rgba(255,255,255,0.85)" }]}>
                {t === "flash" ? "Time-boxed, limited qty" : t === "video" ? "Promo w/ video" : "Standing catalog"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Image */}
        <Text style={styles.label}>Deal image</Text>
        <TouchableOpacity testID="df-image-pick" style={styles.imagePick} onPress={pickImage} activeOpacity={0.85} disabled={uploading === "image"}>
          {uploading === "image" ? (
            <View style={{ alignItems: "center", gap: 6 }}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.pickHint}>Uploading…</Text>
            </View>
          ) : image ? (
            <>
              <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" blurRadius={18} />
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
              <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="contain" />
            </>
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="camera" size={26} color={colors.muted} />
              <Text style={styles.pickHint}>Tap to upload photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Video attach */}
        {dealType === "video" && (
          <>
            <Text style={styles.label}>Promo video</Text>
            <TouchableOpacity
              testID="df-video-pick"
              style={styles.imagePick}
              onPress={() => setShowVideoPicker(true)}
              activeOpacity={0.85}
              disabled={uploading === "video"}
            >
              {uploading === "video" ? (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <ActivityIndicator size="small" color={colors.brand} />
                  <Text style={styles.pickHint}>Uploading video…</Text>
                </View>
              ) : videoUrl ? (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Ionicons name="videocam" size={26} color={colors.success} />
                  <Text style={styles.pickHint} numberOfLines={1}>
                    Video attached ✓ (tap to change)
                  </Text>
                </View>
              ) : (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Ionicons name="videocam-outline" size={26} color={colors.muted} />
                  <Text style={styles.pickHint}>Tap to attach a promo video</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {Object.entries(CATEGORY_META).map(([id, meta]) => {
            const active = category === id;
            return (
              <TouchableOpacity
                key={id}
                testID={`df-cat-${id}`}
                style={[styles.chip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
                onPress={() => setCategory(id)}
                activeOpacity={0.85}
              >
                <Ionicons name={meta.icon as any} size={14} color={active ? colors.white : meta.color} />
                <Text style={[styles.chipText, active && { color: colors.white }]}>{meta.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Title & description */}
        <Text style={styles.label}>Title</Text>
        <TextInput
          testID="df-title" value={title} onChangeText={setTitle}
          placeholder="e.g. Neapolitan Margherita — 40% Off"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          testID="df-desc" value={description} onChangeText={setDescription}
          placeholder="Details customers will see"
          placeholderTextColor={colors.muted}
          multiline
          style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: spacing.md }]}
        />

        {/* Prices */}
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Original price</Text>
            <TextInput
              testID="df-before" value={before} onChangeText={setBefore}
              placeholder="20.00" placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Deal price</Text>
            <TextInput
              testID="df-after" value={after} onChangeText={setAfter}
              placeholder="12.00" placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
        </View>
        {discountPreview !== null && discountPreview > 0 && (
          <View style={styles.discountBanner}>
            <Ionicons name="pricetag" size={12} color={colors.brand} />
            <Text style={styles.discountBannerText}>Customers will see {discountPreview}% OFF</Text>
          </View>
        )}

        {/* Qty + per-customer limit */}
        {dealType !== "regular" && (
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Quantity available</Text>
              <TextInput
                testID="df-qty" value={quantity} onChangeText={setQuantity}
                placeholder="e.g. 20" placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Per-customer limit</Text>
              <TextInput
                testID="df-limit" value={perLimit} onChangeText={setPerLimit}
                placeholder="1" placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          </View>
        )}

        {/* Duration */}
        {dealType !== "regular" && (
          <>
            <Text style={styles.label}>Duration</Text>
            <View style={styles.chipRow}>
              {HOURS_OPTIONS.map((h) => (
                <TouchableOpacity
                  key={h.mins}
                  testID={`df-dur-${h.mins}`}
                  style={[styles.chip, durationMins === h.mins && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                  onPress={() => setDurationMins(h.mins)}
                >
                  <Text style={[styles.chipText, durationMins === h.mins && { color: colors.white }]}>{h.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Tags — per category */}
        {(TAGS_BY_CATEGORY[category]?.length ?? 0) > 0 && (
          <>
            <Text style={styles.label}>Tags (optional)</Text>
            <View style={styles.chipRow}>
              {TAGS_BY_CATEGORY[category].map((tag) => {
                const active = dietary.has(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    testID={`df-tag-${tag}`}
                    style={[styles.chip, active && { backgroundColor: colors.info, borderColor: colors.info }]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[styles.chipText, active && { color: colors.white }]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Terms */}
        <Text style={styles.label}>Terms & conditions</Text>
        <TextInput
          testID="df-terms" value={terms} onChangeText={setTerms}
          multiline
          placeholderTextColor={colors.muted}
          style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: spacing.md }]}
        />

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          testID="df-save-draft"
          style={styles.draftBtn}
          onPress={() => submit(true)}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.draftBtnText}>Save draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="df-publish"
          style={styles.publishBtn}
          onPress={() => submit(false)}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="rocket" size={18} color={colors.white} />
              <Text style={styles.publishBtnText}>{isEdit ? "Save" : "Publish"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Video picker modal */}
      <Modal transparent animationType="slide" visible={showVideoPicker} onRequestClose={() => setShowVideoPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Text style={styles.modalTitle}>Attach a promo video</Text>
            <TouchableOpacity style={styles.videoOptRow} onPress={pickVideoFromGallery}>
              <Ionicons name="images" size={22} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoOptTitle}>From gallery</Text>
                <Text style={styles.videoOptSub}>Pick a video you already recorded.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.videoOptRow} onPress={recordVideo}>
              <Ionicons name="videocam" size={22} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoOptTitle}>Record new video</Text>
                <Text style={styles.videoOptSub}>Up to 60 seconds. Camera access required.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <Text style={styles.sampleTitle}>Or start from a template</Text>
            <FlatList
              horizontal
              data={sampleVideos}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.sampleCard, videoUrl === item.url && { borderColor: colors.brand, borderWidth: 2 }]}
                  onPress={() => { setVideoUrl(item.url); setShowVideoPicker(false); }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play-circle" size={30} color={colors.brand} />
                  <Text style={styles.sampleLabel} numberOfLines={2}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setShowVideoPicker(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Preview modal */}
      <Modal transparent animationType="fade" visible={showPreview} onRequestClose={() => setShowPreview(false)}>
        <View style={styles.previewOverlay}>
          <View style={[styles.previewSheet, { paddingTop: insets.top + spacing.md }]}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewHeaderText}>Customer preview</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)}>
                <Ionicons name="close" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.previewCard}>
              {image && <Image source={{ uri: image }} style={styles.previewImg} contentFit="cover" />}
              {discountPreview !== null && discountPreview > 0 && (
                <View style={styles.previewDisc}>
                  <Text style={styles.previewDiscText}>{discountPreview}% OFF</Text>
                </View>
              )}
              <View style={{ padding: spacing.md }}>
                <Text style={styles.previewTitle}>{title || "Deal title"}</Text>
                <Text style={styles.previewDesc}>{description || "Description will appear here."}</Text>
                <View style={styles.previewPriceRow}>
                  {before && <Text style={styles.previewBefore}>{formatMoney(Number(before))}</Text>}
                  <Text style={styles.previewAfter}>{formatMoney(Number(after) || 0)}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  body: { padding: spacing.lg, gap: spacing.md },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  typeRow: { flexDirection: "row", gap: 8 },
  typeCard: {
    flex: 1, padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "flex-start", gap: 4,
    minHeight: 90,
  },
  typeCardActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  typeLabel: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  typeSub: { fontSize: 10, color: colors.muted, fontWeight: "600" },
  imagePick: {
    height: 160, borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2, borderColor: colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    padding: spacing.md,
  },
  pickHint: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: 15, color: colors.onSurface,
  },
  discountBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
  },
  discountBannerText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10,
    backgroundColor: "#FFE4E4",
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700" },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  draftBtn: {
    height: 52, paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  draftBtnText: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  publishBtn: {
    flex: 1, height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    ...shadow.cardStrong,
  },
  publishBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  videoOptRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  videoOptTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  videoOptSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  sampleTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  sampleCard: {
    width: 130, height: 90,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    alignItems: "center", justifyContent: "center",
    gap: 4,
  },
  sampleLabel: { fontSize: 10, color: colors.muted, fontWeight: "700", textAlign: "center" },
  modalClose: { alignItems: "center", padding: spacing.md },
  modalCloseText: { color: colors.muted, fontSize: 14, fontWeight: "700" },

  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)" },
  previewSheet: { flex: 1, padding: spacing.lg },
  previewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  previewHeaderText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  previewCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden" },
  previewImg: { width: "100%", height: 200 },
  previewDisc: {
    position: "absolute", top: 12, left: 12,
    backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill,
  },
  previewDiscText: { color: colors.white, fontWeight: "800", fontSize: 11 },
  previewTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  previewDesc: { fontSize: 13, color: colors.muted, marginTop: 4 },
  previewPriceRow: { flexDirection: "row", gap: 8, alignItems: "baseline", marginTop: spacing.sm },
  previewBefore: { fontSize: 13, color: colors.muted, textDecorationLine: "line-through" },
  previewAfter: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
});
