/** Shared admin table primitives — used by Merchants/Deals/Customers pages. */
import React from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing, shadow } from "@/src/theme";

export function KpiCard({ label, value, hint, color }: { label: string; value: string | number; hint?: string; color?: string }) {
  return (
    <View style={[k.card, color ? { borderLeftWidth: 4, borderLeftColor: color } : null]}>
      <Text style={k.label}>{label}</Text>
      <Text style={k.value}>{value}</Text>
      {hint ? <Text style={k.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <View style={t.bar}>{children}</View>;
}

export function SearchInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  return (
    <View style={t.searchWrap}>
      <Ionicons name="search" size={14} color={colors.muted} />
      <TextInput testID="admin-search" value={value} onChangeText={onChangeText}
        placeholder={placeholder || "Search…"} placeholderTextColor={colors.muted} style={t.searchInput} />
    </View>
  );
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[t.chip, active && t.chipActive]}>
      <Text style={[t.chipText, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const s = (status || "").toLowerCase();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active:    { bg: "#DFF6E7", fg: "#0A7F3F", label: "Active" },
    approved:  { bg: "#DFF6E7", fg: "#0A7F3F", label: "Approved" },
    pending:   { bg: "#FFF2CC", fg: "#8A6A00", label: "Pending" },
    rejected:  { bg: "#FFE1E1", fg: "#B00020", label: "Rejected" },
    suspended: { bg: "#FFE1E1", fg: "#B00020", label: "Suspended" },
    inactive:  { bg: "#EFF1F5", fg: "#606770", label: "Inactive" },
    paused:    { bg: "#FFE9D6", fg: "#B25200", label: "Paused" },
    archived:  { bg: "#EFF1F5", fg: "#606770", label: "Archived" },
    blocked:   { bg: "#FFE1E1", fg: "#B00020", label: "Blocked" },
    expired:   { bg: "#FFE9D6", fg: "#B25200", label: "Expired" },
  };
  const m = map[s] || { bg: "#EFF1F5", fg: "#606770", label: status || "—" };
  return <View style={[t.badge, { backgroundColor: m.bg }]}><Text style={[t.badgeText, { color: m.fg }]}>{m.label}</Text></View>;
}

export function Pager({ skip, limit, total, onPage }: { skip: number; limit: number; total: number; onPage: (skip: number) => void }) {
  const page = Math.floor(skip / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <View style={t.pager}>
      <Text style={t.pagerInfo}>{total} results · Page {page} / {pages}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Pressable style={t.pagerBtn} disabled={skip <= 0} onPress={() => onPage(Math.max(0, skip - limit))}>
          <Ionicons name="chevron-back" size={14} color={colors.onSurface} />
        </Pressable>
        <Pressable style={t.pagerBtn} disabled={skip + limit >= total} onPress={() => onPage(skip + limit)}>
          <Ionicons name="chevron-forward" size={14} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <View style={t.empty}><Text style={t.emptyText}>{label}</Text></View>;
}

export function LoadingRow() {
  return <View style={t.loading}><ActivityIndicator size="small" color={colors.brand} /></View>;
}

const k = StyleSheet.create({
  card: { flex: 1, minWidth: 180, backgroundColor: colors.surface, borderRadius: 12, padding: 16, ...shadow.card },
  label: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  value: { fontSize: 26, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: "600" },
});

const t = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 38, minWidth: 220, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 13 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "800" },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  pagerInfo: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  pagerBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 13, color: colors.muted, fontWeight: "700" },
  loading: { padding: 24, alignItems: "center" },
});
