import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";

export type Country = {
  code: string;      // ISO-2, used as list key
  dial: string;      // e.g. "+91"
  name: string;
  flag: string;      // emoji
  minDigits: number; // subscriber number only (excludes dial code)
  maxDigits: number;
};

/**
 * Curated top-10 countries. Digit limits are the *subscriber* number
 * (i.e. everything after the country dial code). Sources: ITU E.164 +
 * national mobile numbering plans (2026).
 */
export const COUNTRIES: Country[] = [
  { code: "IN", dial: "+91",  name: "India",          flag: "🇮🇳", minDigits: 10, maxDigits: 10 },
  { code: "US", dial: "+1",   name: "United States",  flag: "🇺🇸", minDigits: 10, maxDigits: 10 },
  { code: "GB", dial: "+44",  name: "United Kingdom", flag: "🇬🇧", minDigits: 10, maxDigits: 10 },
  { code: "AE", dial: "+971", name: "UAE",            flag: "🇦🇪", minDigits: 9,  maxDigits: 9  },
  { code: "SG", dial: "+65",  name: "Singapore",      flag: "🇸🇬", minDigits: 8,  maxDigits: 8  },
  { code: "AU", dial: "+61",  name: "Australia",      flag: "🇦🇺", minDigits: 9,  maxDigits: 9  },
  { code: "CA", dial: "+1",   name: "Canada",         flag: "🇨🇦", minDigits: 10, maxDigits: 10 },
  { code: "DE", dial: "+49",  name: "Germany",        flag: "🇩🇪", minDigits: 10, maxDigits: 11 },
  { code: "FR", dial: "+33",  name: "France",         flag: "🇫🇷", minDigits: 9,  maxDigits: 9  },
  { code: "JP", dial: "+81",  name: "Japan",          flag: "🇯🇵", minDigits: 10, maxDigits: 10 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

export function isValidNationalNumber(national: string, country: Country): boolean {
  const digits = national.replace(/\D/g, "");
  return digits.length >= country.minDigits && digits.length <= country.maxDigits;
}

type Props = {
  value: Country;
  onChange: (c: Country) => void;
  testID?: string;
};

export default function CountryPicker({ value, onChange, testID = "country-picker" }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        testID={testID}
        style={styles.trigger}
        onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(true); }}
        activeOpacity={0.85}
      >
        <Text style={styles.flag}>{value.flag}</Text>
        <Text style={styles.dial}>{value.dial}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.muted} />
      </TouchableOpacity>

      <Modal transparent animationType="slide" visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.title}>Choose country</Text>
              <TouchableOpacity testID={`${testID}-close`} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => {
                const active = item.code === value.code;
                return (
                  <TouchableOpacity
                    testID={`country-${item.code}`}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.flag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.dialSub}>{item.dial}</Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 48,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRightWidth: 0,
  },
  flag: { fontSize: 20 },
  dial: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, maxHeight: "70%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  rowActive: { backgroundColor: colors.brandTertiary },
  name: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  dialSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "700" },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg + 32 },
});
