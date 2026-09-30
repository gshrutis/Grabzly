/** Generic admin list screen factory — DRY for Merchants/Deals/Customers. */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { Toolbar, SearchInput, Chip, StatusBadge, Pager, EmptyState, LoadingRow } from "@/src/components/AdminUI";
import FilterPanel, { type FilterField } from "@/src/components/FilterPanel";
import { colors, shadow } from "@/src/theme";

export type Column<T> = { header: string; render: (row: T) => React.ReactNode; width?: number | string };

export function AdminList<T extends { id: string }>(props: {
  title: string;
  endpoint: string;              // e.g. /api/admin/merchants
  statuses: { key: string; label: string }[];
  columns: Column<T>[];
  detailRoute: (id: string) => string;
  searchPlaceholder?: string;
  filterFields?: FilterField[];
  loadDynamicFilterOptions?: boolean;
}) {
  const { request } = useAdmin();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v && v.length > 0).length,
    [filters],
  );

  const fetchNow = useCallback(() => {
    setLoading(true);
    const query: Record<string, any> = {
      q: q || undefined,
      status: status === "all" ? undefined : status,
      skip, limit,
    };
    for (const [k, v] of Object.entries(filters)) {
      if (v && v.length > 0) query[k] = v;
    }
    request(props.endpoint, { query })
      .then(setData).finally(() => setLoading(false));
  }, [q, status, skip, limit, filters, props.endpoint, request]);

  useEffect(() => { const id = setTimeout(fetchNow, 250); return () => clearTimeout(id); }, [fetchNow]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>{props.title}</Text>
      <Toolbar>
        <SearchInput value={q} onChangeText={(v) => { setQ(v); setSkip(0); }} placeholder={props.searchPlaceholder} />
        <Chip label="All" active={status === "all"} onPress={() => { setStatus("all"); setSkip(0); }} testID="chip-all" />
        {props.statuses.map((s) => (
          <Chip key={s.key} label={s.label} active={status === s.key} onPress={() => { setStatus(s.key); setSkip(0); }} testID={`chip-${s.key}`} />
        ))}
        {props.filterFields && props.filterFields.length > 0 && (
          <FilterPanel
            fields={props.filterFields}
            value={filters}
            activeCount={activeFilterCount}
            loadDynamicOptions={props.loadDynamicFilterOptions}
            onApply={(next) => { setFilters(next); setSkip(0); }}
            onReset={() => { setFilters({}); setSkip(0); }}
          />
        )}
      </Toolbar>

      <View style={styles.tableCard}>
        {/* header */}
        <View style={[styles.row, styles.headerRow]}>
          {props.columns.map((c, i) => (
            <Text key={i} style={[styles.cell, { flex: c.width ? undefined : 1, width: typeof c.width === "number" ? c.width : c.width as any }, styles.headerCell]}>{c.header}</Text>
          ))}
          <Text style={[styles.cell, { width: 40 }, styles.headerCell]}> </Text>
        </View>

        {loading ? <LoadingRow /> : data.items.length === 0 ? <EmptyState label="No results" /> :
          data.items.map((row: T) => (
            <Pressable key={row.id} testID={`row-${row.id}`}
              onPress={() => router.push(props.detailRoute(row.id) as any)}
              style={({ hovered }: any) => [styles.row, hovered && styles.rowHover]}>
              {props.columns.map((c, i) => (
                <View key={i} style={[styles.cell, { flex: c.width ? undefined : 1, width: typeof c.width === "number" ? c.width : c.width as any }]}>
                  {c.render(row)}
                </View>
              ))}
              <View style={[styles.cell, { width: 40, alignItems: "center" }]}>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </View>
            </Pressable>
          ))
        }
      </View>
      <Pager skip={skip} limit={limit} total={data.total} onPage={setSkip} />
    </ScrollView>
  );
}

// Utility renderers
export function Cell({ children, secondary }: { children: React.ReactNode; secondary?: boolean }) {
  return <Text numberOfLines={1} style={[styles.cellText, secondary && { color: colors.muted, fontWeight: "600" }]}>{children}</Text>;
}
export { StatusBadge };

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  tableCard: { backgroundColor: colors.surface, borderRadius: 12, ...shadow.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider, gap: 8 },
  rowHover: { backgroundColor: colors.surfaceSecondary },
  headerRow: { backgroundColor: colors.surfaceSecondary, borderTopWidth: 0 },
  headerCell: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  cell: { paddingRight: 8 },
  cellText: { fontSize: 13, color: colors.onSurface, fontWeight: "700" },
});
