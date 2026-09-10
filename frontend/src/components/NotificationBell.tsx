import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth";
import { colors } from "@/src/theme";

type Props = {
  color?: string;
  size?: number;
  testID?: string;
};

/**
 * Small bell icon that fetches the current user's unread notification count
 * and renders a badge when > 0. Tapping navigates to `/notifications`.
 * Rendered as a normal touchable button (44x44 min tap area).
 * Silent no-op for guest users (still visible, but no badge; taps route to sign-in via the notif screen).
 */
export default function NotificationBell({ color, size = 20, testID = "notif-bell" }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }
    try {
      const res = await api.notificationsUnreadCount();
      setCount(res.count || 0);
    } catch {}
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Light polling every 30s to catch new incoming notifications
  useEffect(() => {
    if (!user) return;
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh, user]);

  return (
    <TouchableOpacity
      testID={testID}
      style={styles.btn}
      onPress={() => router.push("/notifications")}
      activeOpacity={0.7}
    >
      <Ionicons name="notifications-outline" size={size} color={color || colors.onSurface} />
      {count > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  badge: {
    position: "absolute",
    top: 2, right: 2,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.error,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.surface,
  },
  badgeText: {
    color: colors.white, fontSize: 9, fontWeight: "800",
  },
});
