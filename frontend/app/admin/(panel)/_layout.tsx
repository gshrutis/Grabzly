import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Stack, useRouter, usePathname } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { colors, spacing } from "@/src/theme";
import AdminSearchBar from "@/src/components/AdminSearchBar";

const NAV = [
  { key: "dashboard",  label: "Dashboard",  icon: "grid-outline",       path: "/admin/(panel)" },
  { key: "merchants",  label: "Merchants",  icon: "storefront-outline", path: "/admin/(panel)/merchants" },
  { key: "deals",      label: "Deals",      icon: "pricetag-outline",   path: "/admin/(panel)/deals" },
  { key: "customers",  label: "Customers",  icon: "people-outline",     path: "/admin/(panel)/customers" },
  { key: "categories", label: "Categories", icon: "layers-outline",     path: "/admin/(panel)/categories" },
  { key: "cities",     label: "Cities",     icon: "location-outline",   path: "/admin/(panel)/cities" },
  { key: "settings",   label: "Settings",   icon: "settings-outline",   path: "/admin/(panel)/settings" },
];

export default function PanelLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, loading, logout } = useAdmin();
  const { width } = useWindowDimensions();
  const sidebarWide = width >= 900;

  useEffect(() => {
    if (!loading && !admin) router.replace("/admin/sign-in");
  }, [admin, loading, router]);

  if (loading || !admin) return <View style={{ flex: 1, backgroundColor: "#F5F6FA" }} />;

  return (
    <View style={styles.shell}>
      {/* Sidebar */}
      <View style={[styles.sidebar, !sidebarWide && styles.sidebarNarrow]}>
        <View style={styles.brand}>
          <Ionicons name="flash" size={20} color={colors.brand} />
          {sidebarWide && <Text style={styles.brandText}>Happy Hour Admin</Text>}
        </View>
        {NAV.map((n) => {
          const active = pathname === n.path || (n.path !== "/admin/(panel)" && pathname.startsWith(n.path));
          return (
            <Pressable key={n.key} testID={`nav-${n.key}`}
              onPress={() => router.push(n.path as any)}
              style={({ hovered }: any) => [styles.navItem, active && styles.navActive, hovered && styles.navHover]}>
              <Ionicons name={n.icon as any} size={18} color={active ? colors.brand : colors.onSurface} />
              {sidebarWide && <Text style={[styles.navLabel, active && { color: colors.brand }]}>{n.label}</Text>}
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        <Pressable testID="admin-logout" onPress={async () => { await logout(); router.replace("/admin/sign-in"); }}
          style={({ hovered }: any) => [styles.navItem, hovered && styles.navHover]}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          {sidebarWide && <Text style={[styles.navLabel, { color: colors.error }]}>Sign out</Text>}
        </Pressable>
      </View>

      {/* Main */}
      <View style={{ flex: 1 }}>
        <View style={styles.topbar}>
          <Text style={styles.topbarTitle}>Admin panel</Text>
          <AdminSearchBar />
          <View style={styles.topbarRight}>
            <Ionicons name="notifications-outline" size={18} color={colors.muted} />
            <View style={styles.avatar}><Text style={{ color: colors.white, fontWeight: "800" }}>{(admin.email || "?")[0].toUpperCase()}</Text></View>
            <Text style={{ fontWeight: "700", color: colors.onSurface }}>{admin.email}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: "#F5F6FA" },
  sidebar: { width: 220, backgroundColor: colors.surface, paddingVertical: 20, paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: colors.divider, gap: 4 },
  sidebarNarrow: { width: 62, paddingHorizontal: 6 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingBottom: 16 },
  brandText: { fontWeight: "800", color: colors.onSurface, fontSize: 15 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  navHover: { backgroundColor: colors.surfaceSecondary },
  navActive: { backgroundColor: colors.brandTertiary },
  navLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  topbar: { height: 56, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, zIndex: 10 },
  topbarTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  topbarRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
