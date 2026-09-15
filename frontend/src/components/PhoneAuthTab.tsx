import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, shadow } from "@/src/theme";

type Props = {
  onSuccess: (user: any) => Promise<void> | void;
  role?: "customer" | "merchant";
};

/**
 * Reusable phone + OTP login block.
 * Uses mock OTP in demo mode — server accepts `123456` OR the code returned
 * from /api/auth/otp/request (demo_code field). We autofill for testing.
 */
export default function PhoneAuthTab({ onSuccess, role: _role = "customer" }: Props) {
  const { setSession } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setError(null);
    if (!phone || phone.replace(/\D/g, "").length < 6) {
      setError("Enter a valid phone number (with country code).");
      return;
    }
    setLoading(true);
    try {
      const res = await api.otpRequest(phone.trim());
      setDemoCode(res.demo_code || null);
      setStep("code");
      Haptics.selectionAsync().catch(() => {});
    } catch (e: any) {
      setError(e.message || "Failed to send OTP");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setError(null);
    if (code.length < 4) {
      setError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.otpVerify(phone.trim(), code.trim(), name.trim() || undefined);
      await setSession(res.access_token, res.user);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await onSuccess(res.user);
    } catch (e: any) {
      setError(e.message || "Verification failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setLoading(false);
  };

  return (
    <View style={styles.wrap}>
      {step === "phone" ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Mobile number</Text>
            <TextInput
              testID="phone-input"
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Name (optional for existing users)</Text>
            <TextInput
              testID="phone-name-input"
              value={name}
              onChangeText={setName}
              placeholder="For first-time users"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
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
            testID="send-otp-btn"
            style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={sendOtp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color={colors.white} /> : (
              <>
                <Ionicons name="send" size={16} color={colors.white} />
                <Text style={styles.primaryBtnText}>Send OTP</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.otpSentText}>
            OTP sent to <Text style={{ fontWeight: "800" }}>{phone}</Text>
          </Text>
          {demoCode && (
            <View style={styles.demoBanner}>
              <Ionicons name="information-circle" size={14} color={colors.info} />
              <Text style={styles.demoText}>Demo mode: use <Text style={{ fontWeight: "800" }}>{demoCode}</Text></Text>
            </View>
          )}
          <View style={styles.field}>
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              testID="otp-code-input"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              style={[styles.input, styles.codeInput]}
              autoFocus
            />
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            testID="verify-otp-btn"
            style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={verifyOtp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color={colors.white} /> : (
              <>
                <Ionicons name="checkmark" size={16} color={colors.white} />
                <Text style={styles.primaryBtnText}>Verify & continue</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="change-phone-btn"
            style={{ alignItems: "center", padding: 12 }}
            onPress={() => { setStep("phone"); setCode(""); setError(null); }}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>Change number</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  field: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  input: {
    height: 52, paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: 15, color: colors.onSurface,
  },
  codeInput: {
    textAlign: "center", fontSize: 26, letterSpacing: 8, fontWeight: "800",
    height: 64,
  },
  primaryBtn: {
    marginTop: spacing.sm,
    height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    ...shadow.cardStrong,
  },
  primaryBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10, backgroundColor: "#FFE4E4", borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700" },
  otpSentText: { fontSize: 13, color: colors.muted, textAlign: "center" },
  demoBanner: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#E4F1FA",
  },
  demoText: { color: colors.info, fontSize: 12, fontWeight: "700" },
  linkText: { color: colors.brand, fontSize: 13, fontWeight: "700" },
});
