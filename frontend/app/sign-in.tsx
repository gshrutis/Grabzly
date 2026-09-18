import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/context/auth";
import PhoneAuthTab from "@/src/components/PhoneAuthTab";
import { colors, radius, spacing, shadow } from "@/src/theme";

/**
 * Sign-in = Sign-up (unified). Phone + OTP only. First-time users are
 * auto-created server-side on verify; existing users log in.
 */
export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ returnTo?: string }>();

  const handleSuccess = async () => {
    await refresh();
    if (params.returnTo) {
      router.replace(params.returnTo as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          testID="signin-back-btn"
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="flash" size={28} color={colors.brand} />
          </View>
          <Text style={styles.title}>Welcome to Happy Hour</Text>
          <Text style={styles.subtitle}>Sign in with your mobile number — we&apos;ll create your account if you&apos;re new.</Text>
        </View>

        <View style={styles.card}>
          <PhoneAuthTab onSuccess={handleSuccess} />
        </View>

        <View style={styles.footerRow}>
          <TouchableOpacity
            testID="merchant-signin-link"
            onPress={() => router.push("/merchant/sign-in")}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>Existing merchant? Sign in here</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  header: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
  logo: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 18 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  footerRow: { alignItems: "center", paddingTop: spacing.md },
  linkText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
});
