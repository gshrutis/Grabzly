import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { useLocation } from "@/src/context/location";
import LocationPickerModal from "@/src/components/LocationPickerModal";
import { CATEGORY_META, colors, radius, spacing, shadow } from "@/src/theme";

type Step = 1 | 2 | 3;

export default function MerchantOnboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { loc } = useLocation();

  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Business
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [subCategory, setSubCategory] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("10:00 - 22:00");
  const [phone, setPhone] = useState("");
  const [priceRange, setPriceRange] = useState<"$" | "$$" | "$$$">("$$");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState(loc.lat);
  const [lng, setLng] = useState(loc.lng);
  const [showMap, setShowMap] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

  // KYC
  const [licenseDoc, setLicenseDoc] = useState<string | null>(null);
  const [taxDoc, setTaxDoc] = useState<string | null>(null);
  const [idDoc, setIdDoc] = useState<string | null>(null);
  const [taxIdNumber, setTaxIdNumber] = useState("");

  // Media
  const [logo, setLogo] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { router.replace("/sign-in"); return; }
    // Prefill from existing merchant profile if the user has one.
    (async () => {
      try {
        const m = await api.merchantMe();
        if (m) {
          setIsEdit(true);
          setName(m.name || "");
          setCategory(m.category || "food");
          setSubCategory(m.sub_category || "");
          setAddress(m.address || "");
          setHours(m.hours || "10:00 - 22:00");
          setPhone(m.phone || "");
          setPriceRange((m.price_range as any) || "$$");
          setDescription(m.description || "");
          setLogo(m.logo || null);
          setCover(m.cover_image || null);
          setLicenseDoc(m.business_license_doc || null);
          setTaxDoc(m.tax_id_doc || null);
          setIdDoc(m.owner_id_doc || null);
          setTaxIdNumber(m.tax_id_number || "");
          if (typeof m.lat === "number" && typeof m.lng === "number") {
            setLat(m.lat); setLng(m.lng);
          }
        }
      } catch {}
    })();
  }, [user, router]);

  const pickImage = async (setter: (uri: string) => void, aspect?: [number, number]) => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("Please allow photo library access to upload images.");
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: !!aspect,
      aspect,
      quality: 0.7,
      base64: true,
    });
    if (!res.canceled && res.assets?.[0]?.base64) {
      const mime = res.assets[0].mimeType || "image/jpeg";
      setter(`data:${mime};base64,${res.assets[0].base64}`);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const finish = async () => {
    setError(null);
    if (!name || !address) {
      setError("Business name and address are required.");
      return;
    }
    setSaving(true);
    try {
      await api.merchantOnboard({
        name, category, sub_category: subCategory, description,
        address, lat, lng, hours, phone, price_range: priceRange,
        logo, cover_image: cover,
        business_license_doc: licenseDoc, tax_id_doc: taxDoc, owner_id_doc: idDoc,
        tax_id_number: taxIdNumber,
      });
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/merchant/(tabs)");
    } catch (e: any) {
      setError(e.message || "Onboarding failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          testID="merchant-onboarding-back"
          style={styles.backBtn}
          onPress={() => step === 1 ? router.back() : setStep((step - 1) as Step)}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a merchant</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressWrap}>
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            style={[styles.progressBar, s <= step && styles.progressBarActive]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.stepTitle}>Business info</Text>
            <Text style={styles.stepHint}>Basics we&apos;ll show on your store page.</Text>

            <Field label="Business name" testID="mo-name">
              <TextInput
                value={name} onChangeText={setName}
                placeholder="Bella Napoli Pizza" placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </Field>

            <Field label="Category">
              <View style={styles.chipRow}>
                {["food", "grocery", "clothing", "kitchenware", "cafe", "bakery"].map((id) => {
                  const meta = CATEGORY_META[id];
                  const active = category === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      testID={`mo-cat-${id}`}
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
            </Field>

            <Field label="Sub-category (optional)">
              <TextInput
                value={subCategory} onChangeText={setSubCategory}
                placeholder="e.g. Neapolitan Pizza" placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </Field>

            <Field label="Address" testID="mo-address">
              <TextInput
                value={address} onChangeText={setAddress}
                placeholder="Street, City" placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <View style={styles.pinRow}>
                <Text style={styles.locPin}>Pin: {lat.toFixed(4)}, {lng.toFixed(4)}</Text>
                <TouchableOpacity
                  testID="mo-pick-map"
                  style={styles.pickMapBtn}
                  onPress={() => setShowMap(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="map" size={14} color={colors.brand} />
                  <Text style={styles.pickMapBtnText}>Pick on map</Text>
                </TouchableOpacity>
              </View>
            </Field>

            <Field label="Business hours">
              <TextInput
                value={hours} onChangeText={setHours}
                placeholder="10:00 - 22:00" placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </Field>

            <Field label="Phone (optional)">
              <TextInput
                value={phone} onChangeText={setPhone}
                placeholder="+1 555 010 1010" placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                style={styles.input}
              />
            </Field>

            <Field label="Price range">
              <View style={styles.chipRow}>
                {(["$", "$$", "$$$"] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, priceRange === p && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                    onPress={() => setPriceRange(p)}
                  >
                    <Text style={[styles.chipText, priceRange === p && { color: colors.white }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Description">
              <TextInput
                value={description} onChangeText={setDescription}
                placeholder="Tell customers what makes you special."
                placeholderTextColor={colors.muted}
                multiline
                style={[styles.input, { height: 90, textAlignVertical: "top", paddingTop: spacing.md }]}
              />
            </Field>
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.stepTitle}>KYC & verification</Text>
            <Text style={styles.stepHint}>Upload documents to get the verified badge. Auto-approved instantly for this demo.</Text>

            <DocPicker
              label="Business license/registration"
              value={licenseDoc}
              onPick={() => pickImage(setLicenseDoc)}
              icon="document-text"
              testID="mo-license"
            />
            <DocPicker
              label="Tax ID document"
              value={taxDoc}
              onPick={() => pickImage(setTaxDoc)}
              icon="receipt"
              testID="mo-tax"
            />
            <DocPicker
              label="Owner ID proof"
              value={idDoc}
              onPick={() => pickImage(setIdDoc)}
              icon="card"
              testID="mo-id"
            />

            <Field label="Tax ID number (optional)">
              <TextInput
                value={taxIdNumber} onChangeText={setTaxIdNumber}
                placeholder="e.g. EIN 12-3456789" placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </Field>
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.stepTitle}>Store branding</Text>
            <Text style={styles.stepHint}>Logo + cover photo — makes your store look professional.</Text>

            <Field label="Store logo">
              <TouchableOpacity
                testID="mo-logo-pick"
                style={styles.logoPick}
                onPress={() => pickImage(setLogo)}
                activeOpacity={0.85}
              >
                {logo ? (
                  <Image source={{ uri: logo }} style={styles.logoPreview} contentFit="cover" />
                ) : (
                  <>
                    <Ionicons name="image" size={32} color={colors.muted} />
                    <Text style={styles.pickHint}>Tap to upload logo</Text>
                  </>
                )}
              </TouchableOpacity>
            </Field>

            <Field label="Cover photo">
              <TouchableOpacity
                testID="mo-cover-pick"
                style={styles.coverPick}
                onPress={() => pickImage(setCover)}
                activeOpacity={0.85}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : (
                  <>
                    <Ionicons name="images" size={32} color={colors.muted} />
                    <Text style={styles.pickHint}>Tap to upload cover</Text>
                  </>
                )}
              </TouchableOpacity>
            </Field>
          </View>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          testID="mo-next-btn"
          style={styles.primaryBtn}
          onPress={() => {
            if (step < 3) setStep((step + 1) as Step);
            else finish();
          }}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>{step < 3 ? "Continue" : (isEdit ? "Save changes" : "Submit & go live")}</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Map picker modal */}
      <LocationPickerModal
        visible={showMap}
        onClose={() => setShowMap(false)}
        onConfirm={(picked) => {
          setLat(picked.lat);
          setLng(picked.lng);
          if (picked.label && (!address || address.length < 5)) {
            setAddress(picked.label);
          }
          setShowMap(false);
        }}
        initialLat={lat}
        initialLng={lng}
        initialLabel={address}
        title="Set your store location"
      />
    </View>
  );
}

function Field({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function DocPicker({
  label, value, onPick, icon, testID,
}: { label: string; value: string | null; onPick: () => void; icon: string; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={styles.docPicker} onPress={onPick} activeOpacity={0.85}>
      <View style={styles.docIcon}>
        <Ionicons name={icon as any} size={22} color={value ? colors.success : colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.docTitle}>{label}</Text>
        <Text style={[styles.docSub, value && { color: colors.success }]}>
          {value ? "Uploaded ✓" : "Tap to upload"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: colors.onSurface },
  progressWrap: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  progressBar: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.divider,
  },
  progressBarActive: { backgroundColor: colors.brand },
  scroll: { padding: spacing.lg, gap: spacing.md },
  stepTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  stepHint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: 15, color: colors.onSurface,
  },
  locPin: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  pinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  pickMapBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  pickMapBtnText: { color: colors.brand, fontSize: 12, fontWeight: "800" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },

  docPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: colors.border,
  },
  docIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  docTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  docSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },

  logoPick: {
    width: 120, height: 120, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2, borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  logoPreview: { width: "100%", height: "100%" },
  coverPick: {
    height: 160, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2, borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
    gap: 6,
  },
  pickHint: { fontSize: 12, color: colors.muted, fontWeight: "700" },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10,
    backgroundColor: "#FFE4E4",
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700" },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    height: 56,
    flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    ...shadow.cardStrong,
  },
  primaryBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
});
