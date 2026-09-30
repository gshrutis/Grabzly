/**
 * FilterPanel — collapsible advanced filter drawer for admin list screens.
 * All state is controlled by the parent (AdminList); this component only
 * renders inputs and calls back on Apply/Reset.
 */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, shadow } from "@/src/theme";
import { useAdmin } from "@/src/context/admin-auth";

export type FilterFieldSelect = {
  key: string; label: string; type: "select";
  options: Array<{ value: string; label: string }>;
};
export type FilterFieldText = { key: string; label: string; type: "text"; placeholder?: string };
export type FilterFieldDate = { key: string; label: string; type: "date" };
export type FilterField = FilterFieldSelect | FilterFieldText | FilterFieldDate;

type Props = {
  fields: FilterField[];
  value: Record<string, string>;
  onApply: (next: Record<string, string>) => void;
  onReset: () => void;
  activeCount: number;
  // If any field of key "category" or "city" is a select, we can auto-populate
  // its options from admin endpoints.
  loadDynamicOptions?: boolean;
};

export default function FilterPanel({ fields, value, onApply, onReset, activeCount, loadDynamicOptions }: Props) {
  const { request } = useAdmin();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(value);
  const [dynamic, setDynamic] = useState<Record<string, Array<{ value: string; label: string }>>>({});

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (!loadDynamicOptions) return;
    (async () => {
      const out: Record<string, Array<{ value: string; label: string }>> = {};
      try {
        const cats = await request<any>("/api/admin/categories");
        const list = (cats?.items || []).filter((c: any) => c.is_active !== false);
        out.category = list.map((c: any) => ({ value: c.slug, label: c.name }));
      } catch {}
      try {
        const cities = await request<any>("/api/admin/cities");
        out.city = (cities?.items || [])
          .filter((c: any) => c.is_active !== false)
          .map((c: any) => ({ value: c.name, label: c.name }));
      } catch {}
      setDynamic(out);
    })();
  }, [loadDynamicOptions, request]);

  const patch = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <View>
      <Pressable testID="filters-toggle" onPress={() => setOpen((o) => !o)}
        style={({ hovered }: any) => [styles.toggleBtn, hovered && styles.toggleHover, open && styles.toggleOpen]}>
        <Ionicons name="options-outline" size={14} color={open ? colors.brand : colors.onSurface} />
        <Text style={[styles.toggleText, open && { color: colors.brand }]}>Filters</Text>
        {activeCount > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{activeCount}</Text></View>
        )}
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={styles.panel}>
          <View style={styles.grid}>
            {fields.map((f) => {
              const opts = f.type === "select"
                ? (dynamic[f.key] && dynamic[f.key].length > 0 ? dynamic[f.key] : f.options)
                : [];
              return (
                <View key={f.key} style={styles.fieldWrap}>
                  <Text style={styles.label}>{f.label}</Text>
                  {f.type === "text" && (
                    <TextInput
                      testID={`filter-${f.key}`}
                      style={styles.input}
                      value={draft[f.key] || ""}
                      onChangeText={(v) => patch(f.key, v)}
                      placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
                      placeholderTextColor={colors.muted}
                    />
                  )}
                  {f.type === "date" && (
                    <TextInput
                      testID={`filter-${f.key}`}
                      style={styles.input}
                      value={draft[f.key] || ""}
                      onChangeText={(v) => patch(f.key, v)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                    />
                  )}
                  {f.type === "select" && (
                    <View style={styles.chipRow}>
                      <Pressable onPress={() => patch(f.key, "")}
                        style={[styles.chip, !draft[f.key] && styles.chipActive]}>
                        <Text style={[styles.chipText, !draft[f.key] && { color: colors.white }]}>All</Text>
                      </Pressable>
                      {opts.map((o) => (
                        <Pressable key={o.value}
                          testID={`filter-${f.key}-${o.value}`}
                          onPress={() => patch(f.key, o.value)}
                          style={[styles.chip, draft[f.key] === o.value && styles.chipActive]}>
                          <Text style={[styles.chipText, draft[f.key] === o.value && { color: colors.white }]}>{o.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.footer}>
            <Pressable testID="filter-reset" style={styles.resetBtn}
              onPress={() => { setDraft({}); onReset(); setOpen(false); }}>
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable testID="filter-apply" style={styles.applyBtn}
              onPress={() => { onApply(draft); setOpen(false); }}>
              <Ionicons name="checkmark" size={14} color={colors.white} />
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, height: 38,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleHover: { backgroundColor: colors.surfaceSecondary },
  toggleOpen: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  toggleText: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "800" },

  panel: {
    marginTop: 8, padding: 14, borderRadius: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    ...shadow.card, gap: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fieldWrap: { flexBasis: 240, flexGrow: 1, minWidth: 200 },
  label: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  input: { height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 13, color: colors.onSurface, backgroundColor: colors.surface, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },

  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 },
  resetBtn: { paddingHorizontal: 14, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  resetText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  applyBtn: { paddingHorizontal: 14, height: 36, borderRadius: 8, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", gap: 6 },
  applyText: { color: colors.white, fontSize: 12, fontWeight: "800" },
});
