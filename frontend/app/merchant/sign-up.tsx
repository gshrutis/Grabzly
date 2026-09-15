import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/auth";
import PhoneAuthTab from "@/src/components/PhoneAuthTab";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function MerchantSignUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, refresh } = useAuth();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name || !email || !password) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signUp(email.trim(), password, name.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/merchant/onboarding");
    } catch (e: any) {
      setError(e.message || "Sign up failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          testID="msignup-close"
          style={styles.closeBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.brandBadge}>
            <Ionicons name="storefront" size={26} color={colors.white} />
          </View>
          <View style={styles.merchantPill}>
            <Text style={styles.merchantPillText}>MERCHANT PORTAL</Text>
          </View>
          <Text style={styles.title}>Create merchant account</Text>
          <Text style={styles.subtitle}>Next: we&apos;ll walk you through business details + KYC in under 3 minutes.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.modeSwitch}>
            <TouchableOpacity
              testID="msu-mode-phone"
              style={[styles.modeBtn, mode === "phone" && styles.modeBtnActive]}
              onPress={() => setMode("phone")}
              activeOpacity={0.85}
            >
              <Ionicons name="phone-portrait" size={14} color={mode === "phone" ? colors.white : colors.onSurface} />
              <Text style={[styles.modeText, mode === "phone" && { color: colors.white }]}>Phone</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="msu-mode-email"
              style={[styles.modeBtn, mode === "email" && styles.modeBtnActive]}
              onPress={() => setMode("email")}
              activeOpacity={0.85}
            >
              <Ionicons name="mail" size={14} color={mode === "email" ? colors.white : colors.onSurface} />
              <Text style={[styles.modeText, mode === "email" && { color: colors.white }]}>Email</Text>
            </TouchableOpacity>
          </View>

          {mode === "phone" ? (
            <PhoneAuthTab role="merchant" onSuccess={async () => {
              await refresh();
              router.replace("/merchant/onboarding");
            }} />
          ) : (
          <>
          <View style={styles.field}>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              testID="msignup-name"
              value={name}
              onChangeText={setName}
              placeholder="Jane Doe"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="msignup-email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@yourstore.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="msignup-password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
            />
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            testID="msignup-submit"
            style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>Continue to KYC</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="msignup-to-signin"
            onPress={() => router.replace("/merchant/sign-in")}
            activeOpacity={0.7}
            style={{ alignItems: "center", padding: 12 }}
          >
            <Text style={styles.linkText}>
              Have an account? <Text style={{ color: colors.brand, fontWeight: "800" }}>Merchant sign in</Text>
            </Text>
          </TouchableOpacity>
          </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  closeBtn: {
    alignSelf: "flex-start",
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  header: {
    alignItems: "flex-start",
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  brandBadge: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.cardStrong,
  },
  merchantPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.info,
    marginBottom: spacing.md,
  },
  merchantPillText: { color: colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing.sm, lineHeight: 20 },
  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  input: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: 15,
    color: colors.onSurface,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    backgroundColor: "#FFE4E4",
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700" },
  primaryBtn: {
    marginTop: spacing.md,
    height: 56,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    ...shadow.cardStrong,
  },
  primaryBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  linkText: { color: colors.muted, fontSize: 14 },
  modeSwitch: {
    flexDirection: "row", padding: 4, gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    marginBottom: spacing.sm,
  },
  modeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 40, borderRadius: radius.pill,
  },
  modeBtnActive: { backgroundColor: colors.brand },
  modeText: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
});
