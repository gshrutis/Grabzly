import React from "react";
import { Tabs } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

export default function MerchantTabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
          ...Platform.select({ ios: {}, android: { elevation: 8 } }),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarButtonTestID: "mtab-dashboard",
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: "Deals",
          tabBarIcon: ({ color, size }) => <Ionicons name="pricetags" size={size} color={color} />,
          tabBarButtonTestID: "mtab-deals",
        }}
      />
      <Tabs.Screen
        name="redeem"
        options={{
          title: "Redeem",
          tabBarIcon: ({ color, size }) => <Ionicons name="qr-code" size={size} color={color} />,
          tabBarButtonTestID: "mtab-redeem",
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
          tabBarButtonTestID: "mtab-analytics",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Store",
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} />,
          tabBarButtonTestID: "mtab-settings",
        }}
      />
    </Tabs>
  );
}
