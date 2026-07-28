import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors } from "@/src/theme";

export default function MerchantRoot() {
  const router = useRouter();
  const { user, token, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    (async () => {
      if (!token) {
        router.replace("/sign-in");
        return;
      }
      if (user?.role !== "merchant") {
        router.replace("/merchant/onboarding");
        return;
      }
      try {
        await api.merchantMe();
        router.replace("/merchant/(tabs)");
      } catch {
        router.replace("/merchant/onboarding");
      }
    })();
  }, [loading, token, user, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
