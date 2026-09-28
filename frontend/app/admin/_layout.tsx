import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { Stack, useRouter, usePathname } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { AdminAuthProvider, useAdmin } from "@/src/context/admin-auth";
import { colors, radius, spacing } from "@/src/theme";

/** Root layout for /admin routes: wraps everything in AdminAuthProvider,
 *  renders a persistent sidebar+topbar on wide screens, and hides them on the
 *  sign-in page.
 */
export default function AdminLayout() {
  return (
    <AdminAuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(panel)" />
      </Stack>
    </AdminAuthProvider>
  );
}
