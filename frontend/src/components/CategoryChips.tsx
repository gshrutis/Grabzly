import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, CATEGORY_META } from "@/src/theme";

type Category = { id: string; name: string };

type Props = {
  categories: Category[];
  selected: string | null;
  onChange: (id: string | null) => void;
  showAll?: boolean;
};

export default function CategoryChips({ categories, selected, onChange, showAll = true }: Props) {
  const handlePress = (id: string | null) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(id);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {showAll && (
          <TouchableOpacity
            testID="chip-all"
            style={[styles.chip, selected === null && styles.chipActive]}
            onPress={() => handlePress(null)}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={16} color={selected === null ? colors.onBrandPrimary : colors.onSurface} />
            <Text style={[styles.label, selected === null && styles.labelActive]}>All</Text>
          </TouchableOpacity>
        )}
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat.id] || { icon: "pricetag", color: colors.brand, label: cat.name };
          const active = selected === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              testID={`chip-${cat.id}`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => handlePress(cat.id)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={meta.icon as any}
                size={16}
                color={active ? colors.onBrandPrimary : meta.color}
              />
              <Text style={[styles.label, active && styles.labelActive]}>{cat.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 56,
    backgroundColor: colors.surface,
  },
  row: {
    paddingHorizontal: spacing.lg,
    gap: 8,
    alignItems: "center",
    height: 56,
  },
  chip: {
    flexShrink: 0,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurface,
  },
  labelActive: {
    color: colors.onBrandPrimary,
  },
});
