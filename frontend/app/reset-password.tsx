import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function ResetPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ merchant?: string }>();
  const isMerchant = params.merchant === "1";
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email || !newPassword) return setError("Email and new password are required.");
    if (newPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (newPassword !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await api.resetPassword(email.trim(), newPassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Reset failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          testID="reset-close"
          style={styles.closeBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.brandBadge}>
            <Ionicons name="lock-closed" size={26} color={colors.white} />
          </View>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>Enter your email and choose a new password.</Text>
        </View>

        {success ? (
          <View style={styles.successBox}>
            <View style={styles.successCheck}>
              <Ionicons name="checkmark" size={32} color={colors.white} />
            </View>
            <Text style={styles.successTitle}>Password updated</Text>
            <Text style={styles.successSub}>You can now sign in with your new password.</Text>
            <TouchableOpacity
              testID="reset-back-to-signin"
              style={styles.primaryBtn}
              onPress={() => router.replace(isMerchant ? "/merchant/sign-in" : "/sign-in")}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="reset-email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>New password</Text>
              <TextInput
                testID="reset-password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Confirm new password</Text>
              <TextInput
                testID="reset-confirm"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Re-enter password"
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
              testID="reset-submit"
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={submit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnText}>Reset password</Text>}
            </TouchableOpacity>

            <Text style={styles.demoNote}>
              Demo mode: password is reset immediately without an email link. Production would send a secure reset token.
            </Text>
          </View>
        )}
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
  header: { alignItems: "flex-start", marginTop: spacing.xl, marginBottom: spacing.xl },
  brandBadge: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.cardStrong,
  },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing.sm, lineHeight: 20 },
  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  input: {
    height: 52, paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: 15, color: colors.onSurface,
  },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10, backgroundColor: "#FFE4E4", borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700" },
  primaryBtn: {
    marginTop: spacing.md,
    height: 56, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
    ...shadow.cardStrong,
  },
  primaryBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  demoNote: {
    fontSize: 11, color: colors.muted, fontStyle: "italic", textAlign: "center", marginTop: spacing.sm,
  },
  successBox: {
    alignItems: "center", padding: spacing.xl, gap: spacing.md,
  },
  successCheck: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center",
    ...shadow.cardStrong,
  },
  successTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  successSub: { fontSize: 14, color: colors.muted, textAlign: "center" },
});
