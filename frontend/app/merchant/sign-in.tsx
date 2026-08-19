import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/auth";
import { api } from "@/src/api/client";
import PhoneAuthTab from "@/src/components/PhoneAuthTab";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function MerchantSignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, refresh } = useAuth();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) {
      setError("Please fill in both fields.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Check if user is a merchant; otherwise route to onboarding
      try {
        await api.merchantMe();
        router.replace("/merchant/(tabs)");
      } catch {
        router.replace("/merchant/onboarding");
      }
      await refresh();
    } catch (e: any) {
      setError(e.message || "Sign in failed");
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
          testID="merchant-signin-close"
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to manage deals, scan redemptions, and view insights.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.modeSwitch}>
            <TouchableOpacity
              testID="mmode-phone"
              style={[styles.modeBtn, mode === "phone" && styles.modeBtnActive]}
              onPress={() => setMode("phone")}
              activeOpacity={0.85}
            >
              <Ionicons name="phone-portrait" size={14} color={mode === "phone" ? colors.white : colors.onSurface} />
              <Text style={[styles.modeText, mode === "phone" && { color: colors.white }]}>Phone</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="mmode-email"
              style={[styles.modeBtn, mode === "email" && styles.modeBtnActive]}
              onPress={() => setMode("email")}
              activeOpacity={0.85}
            >
              <Ionicons name="mail" size={14} color={mode === "email" ? colors.white : colors.onSurface} />
              <Text style={[styles.modeText, mode === "email" && { color: colors.white }]}>Email</Text>
            </TouchableOpacity>
          </View>

          {mode === "phone" ? (
            <PhoneAuthTab
              role="merchant"
              onSuccess={async () => {
                await refresh();
                try { await api.merchantMe(); router.replace("/merchant/(tabs)"); }
                catch { router.replace("/merchant/onboarding"); }
              }}
            />
          ) : (
          <>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="msignin-email"
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
            <View style={styles.pwWrap}>
              <TextInput
                testID="msignin-password"
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPw}
                autoComplete="password"
                style={[styles.input, { flex: 1, borderWidth: 0 }]}
              />
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={styles.pwToggle}>
                <Ionicons name={showPw ? "eye-off" : "eye"} size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            testID="msignin-submit"
            style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="log-in" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>Sign in</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="msignin-forgot"
            onPress={() => router.push({ pathname: "/reset-password", params: { merchant: "1" } })}
            activeOpacity={0.7}
            style={{ alignItems: "center", padding: 8 }}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="msignin-to-signup"
            onPress={() => router.replace("/merchant/sign-up")}
            activeOpacity={0.7}
            style={{ alignItems: "center", padding: 12 }}
          >
            <Text style={styles.linkText}>
              New to HappyHour? <Text style={{ color: colors.brand, fontWeight: "800" }}>Create merchant account</Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            testID="msignin-to-customer"
            onPress={() => router.replace("/sign-in")}
            activeOpacity={0.7}
            style={styles.customerLink}
          >
            <Ionicons name="person" size={16} color={colors.muted} />
            <Text style={styles.customerLinkText}>Customer login</Text>
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
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
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
  pwWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: colors.border,
    paddingRight: 8,
  },
  pwToggle: { padding: 8 },
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
  forgotText: { color: colors.brand, fontSize: 13, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  customerLink: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  customerLinkText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
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
