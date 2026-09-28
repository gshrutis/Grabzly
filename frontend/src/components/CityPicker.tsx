/**
 * CityPicker — a compact pill button that opens a modal with the admin-managed
 * cities. Selecting a city filters the feed/map by its geo-radius.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocation, type City } from "@/src/context/location";
import { colors, radius, spacing, shadow } from "@/src/theme";

export default function CityPicker({ compact }: { compact?: boolean }) {
  const { cities, selectedCity, setSelectedCity } = useLocation();
  const [open, setOpen] = useState(false);

  const label = selectedCity ? selectedCity.name : "Near me";

  return (
    <>
      <TouchableOpacity
        testID="city-picker-btn"
        style={[styles.pill, compact && styles.pillCompact]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name={selectedCity ? "location" : "navigate"} size={14} color={colors.brand} />
        <Text style={[styles.pillText, compact && { fontSize: 12 }]} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-down" size={12} color={colors.muted} />
      </TouchableOpacity>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Choose city</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="city-option-nearme"
              style={[styles.option, !selectedCity && styles.optionActive]}
              onPress={async () => { await setSelectedCity(null); setOpen(false); }}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="navigate" size={16} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Near me</Text>
                <Text style={styles.optionSub}>Use your device location</Text>
              </View>
              {!selectedCity ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
            </TouchableOpacity>

            {cities.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No cities configured yet. Ask your admin to add cities in the Admin Panel.</Text>
              </View>
            ) : (
              <FlatList
                data={cities}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = selectedCity?.id === item.id;
                  return (
                    <TouchableOpacity
                      testID={`city-option-${item.slug}`}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={async () => { await setSelectedCity(item); setOpen(false); }}
                    >
                      <View style={[styles.optionIcon, { backgroundColor: colors.surfaceSecondary }]}>
                        <Ionicons name="location" size={16} color={colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle}>{item.name}</Text>
                        <Text style={styles.optionSub} numberOfLines={1}>
                          {[item.state, item.country].filter(Boolean).join(", ") || `${item.radius_km} km radius`}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 360 }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, height: 34, borderRadius: 17,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    maxWidth: 200,
  },
  pillCompact: { height: 30, paddingHorizontal: 10, gap: 4 },
  pillText: { fontSize: 13, fontWeight: "800", color: colors.onSurface, maxWidth: 130 },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end", ...(Platform.OS === "web" ? { alignItems: "center", justifyContent: "center" } : null) },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 24,
    ...(Platform.OS === "web" ? { width: 420, borderRadius: 20 } : {}),
    ...shadow.cardStrong,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  optionActive: { backgroundColor: colors.brandTertiary },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  optionSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },
  empty: { padding: 24, alignItems: "center" },
  emptyText: { fontSize: 13, color: colors.muted, fontWeight: "600", textAlign: "center" },
});
