import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function AdminSignIn() {
  const router = useRouter();
  const { login, admin } = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { if (admin) router.replace("/admin/(panel)"); }, [admin, router]);

  const submit = async () => {
    setError(null); setBusy(true);
    try { await login(email, password); router.replace("/admin/(panel)"); }
    catch (e: any) { setError(e?.message || "Login failed"); }
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}><Ionicons name="shield-checkmark" size={32} color={colors.brand} /></View>
        <Text style={styles.title}>Admin sign-in</Text>
        <Text style={styles.sub}>Restricted area · authorized administrators only</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput testID="admin-email" value={email} onChangeText={setEmail}
            placeholder="admin@happyhour.local" placeholderTextColor={colors.muted}
            autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput testID="admin-password" value={password} onChangeText={setPassword}
            placeholder="••••••••" placeholderTextColor={colors.muted}
            secureTextEntry style={styles.input} />
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity testID="admin-signin-btn" onPress={submit} disabled={busy || !email || !password}
          style={[styles.primary, (busy || !email || !password) && { opacity: 0.55 }]} activeOpacity={0.85}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#F5F6FA", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: 16, padding: 28, gap: 14, ...shadow.card },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  sub: { fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 8 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  input: { height: 46, paddingHorizontal: 14, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, color: colors.onSurface },
  primary: { marginTop: 8, height: 48, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: "#FFE4E4", borderRadius: 8 },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700" },
});
