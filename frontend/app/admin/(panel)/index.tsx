import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useAdmin } from "@/src/context/admin-auth";
import { KpiCard, Toolbar, Chip, LoadingRow, EmptyState } from "@/src/components/AdminUI";
import { colors, shadow } from "@/src/theme";

const RANGES: [string, string][] = [["today", "Today"], ["7d", "Last 7d"], ["30d", "Last 30d"], ["90d", "Last 90d"], ["all", "All time"]];

export default function AdminDashboard() {
  const { request } = useAdmin();
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    request("/api/admin/dashboard", { query: { range } })
      .then(setData).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, [range, request]);

  const k = data?.kpis;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Dashboard</Text>
      <Toolbar>
        {RANGES.map(([v, l]) => <Chip key={v} label={l} active={range === v} onPress={() => setRange(v)} testID={`range-${v}`} />)}
      </Toolbar>
      {loading ? <LoadingRow /> : error ? <EmptyState label={error} /> : !k ? <EmptyState label="No data" /> : (
        <>
          <View style={styles.kpiRow}>
            <KpiCard label="Total customers" value={k.total_customers} hint={`+${k.today.new_customers} today`} color="#2BB8D6" />
            <KpiCard label="Active customers" value={k.active_customers} color="#0A7F3F" />
            <KpiCard label="New customers" value={k.new_customers} hint={`in selected range`} color="#8B4FEF" />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard label="Total merchants" value={k.total_merchants} hint={`+${k.today.new_merchants} today`} color="#FF5A36" />
            <KpiCard label="Active merchants" value={k.active_merchants} color="#0A7F3F" />
            <KpiCard label="Pending merchants" value={k.pending_merchants} color="#8A6A00" />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard label="Total deals" value={k.total_deals} hint={`+${k.today.new_deals} today`} color="#FF8A00" />
            <KpiCard label="Active deals" value={k.active_deals} color="#0A7F3F" />
            <KpiCard label="Pending" value={k.pending_deals} color="#8A6A00" />
            <KpiCard label="Expired" value={k.expired_deals} color="#606770" />
          </View>

          <View style={styles.grid}>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Deals by category</Text>
              {data.charts.deals_by_category.length === 0 ? <EmptyState label="No deals in range" /> :
                data.charts.deals_by_category.map((r: any) => (
                  <BarRow key={r.category} label={r.category || "(uncategorized)"} value={r.count}
                    max={Math.max(...data.charts.deals_by_category.map((x: any) => x.count))} />
                ))}
            </View>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Top cities by merchants</Text>
              {data.charts.merchants_by_city.length === 0 ? <EmptyState label="No merchants" /> :
                data.charts.merchants_by_city.map((r: any) => (
                  <BarRow key={r.city} label={r.city} value={r.count} color="#8B4FEF"
                    max={Math.max(...data.charts.merchants_by_city.map((x: any) => x.count))} />
                ))}
            </View>
          </View>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Signups over time</Text>
            {data.charts.growth.length === 0 ? <EmptyState label="No signups in range" /> : (
              <View style={styles.growth}>
                {data.charts.growth.map((d: any) => (
                  <View key={d.date} style={styles.growthCol}>
                    <View style={[styles.growthBar, { height: Math.max(4, d.customers * 4), backgroundColor: "#2BB8D6" }]} />
                    <View style={[styles.growthBar, { height: Math.max(2, d.merchants * 4), backgroundColor: "#FF5A36" }]} />
                    <Text style={styles.growthLabel}>{d.date.slice(5)}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.legend}>
              <LegendDot c="#2BB8D6" l="Customers" /><LegendDot c="#FF5A36" l="Merchants" />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function BarRow({ label, value, max, color = colors.brand }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View style={styles.bar}>
      <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
      <Text style={styles.barVal}>{value}</Text>
    </View>
  );
}
function LegendDot({ c, l }: { c: string; l: string }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} /><Text style={{ fontSize: 11, color: colors.muted, fontWeight: "700" }}>{l}</Text></View>;
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  kpiRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  grid: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  panel: { flex: 1, minWidth: 300, backgroundColor: colors.surface, borderRadius: 12, padding: 16, ...shadow.card },
  panelTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  barLabel: { width: 100, fontSize: 12, color: colors.onSurface, fontWeight: "700" },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  barVal: { width: 30, textAlign: "right", fontSize: 12, fontWeight: "800", color: colors.onSurface },
  growth: { flexDirection: "row", alignItems: "flex-end", gap: 4, minHeight: 120 },
  growthCol: { alignItems: "center", gap: 2 },
  growthBar: { width: 10, borderRadius: 2 },
  growthLabel: { fontSize: 9, color: colors.muted, marginTop: 2 },
  legend: { flexDirection: "row", gap: 12, marginTop: 8 },
});
