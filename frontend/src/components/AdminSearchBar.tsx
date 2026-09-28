/**
 * AdminSearchBar — global search in the admin top bar.
 * Debounced query; dropdown shows top merchants/deals/customers with deep links.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { colors, shadow } from "@/src/theme";

type Result = {
  q: string;
  merchants: any[];
  deals: any[];
  customers: any[];
  total: number;
};

export default function AdminSearchBar() {
  const { request } = useAdmin();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debouncer = useRef<any>(null);

  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    if (debouncer.current) clearTimeout(debouncer.current);
    debouncer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await request<Result>("/api/admin/search", { query: { q: q.trim(), limit: 5 } });
        setRes(r);
      } catch { setRes(null); }
      finally { setLoading(false); }
    }, 250);
    return () => { if (debouncer.current) clearTimeout(debouncer.current); };
  }, [q, request]);

  const go = useCallback((path: string) => {
    setOpen(false); setQ("");
    router.push(path as any);
  }, [router]);

  const showDropdown = open && (loading || (res && res.total > 0) || (q.trim().length > 0 && res && res.total === 0));

  return (
    <View style={styles.wrap}>
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={14} color={colors.muted} />
        <TextInput
          testID="admin-global-search"
          value={q}
          onChangeText={setQ}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search merchants, deals, customers…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
        />
        {q.length > 0 && (
          <Pressable onPress={() => { setQ(""); setRes(null); }} hitSlop={8}>
            <Ionicons name="close-circle" size={14} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.emptyRow}><ActivityIndicator size="small" color={colors.brand} /></View>
          ) : res && res.total === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No results for “{q}”</Text>
            </View>
          ) : res ? (
            <>
              {res.merchants.length > 0 && (
                <Section title="Merchants">
                  {res.merchants.map((m) => (
                    <ResultRow
                      key={m.id} testID={`search-merchant-${m.id}`}
                      icon="storefront" color={colors.brand}
                      title={m.name}
                      subtitle={`${m.category || "—"}${m.city ? " · " + m.city : ""}${m.phone ? " · " + m.phone : ""}`}
                      onPress={() => go(`/admin/(panel)/merchants/${m.id}`)}
                    />
                  ))}
                </Section>
              )}
              {res.deals.length > 0 && (
                <Section title="Deals">
                  {res.deals.map((d) => (
                    <ResultRow
                      key={d.id} testID={`search-deal-${d.id}`}
                      icon="pricetag" color="#8B4FEF"
                      title={d.title}
                      subtitle={`${d.merchant_name || "—"}${d.category ? " · " + d.category : ""}${d.status ? " · " + d.status : ""}`}
                      onPress={() => go(`/admin/(panel)/deals/${d.id}`)}
                    />
                  ))}
                </Section>
              )}
              {res.customers.length > 0 && (
                <Section title="Customers">
                  {res.customers.map((c) => (
                    <ResultRow
                      key={c.id} testID={`search-customer-${c.id}`}
                      icon="person" color="#2BB8D6"
                      title={c.name || c.email || c.phone || "—"}
                      subtitle={`${c.email || c.phone || ""}${typeof c.points === "number" ? " · " + c.points + " pts" : ""}`}
                      onPress={() => go(`/admin/(panel)/customers/${c.id}`)}
                    />
                  ))}
                </Section>
              )}
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ResultRow({ icon, color, title, subtitle, onPress, testID }: {
  icon: any; color: string; title: string; subtitle?: string; onPress: () => void; testID?: string;
}) {
  return (
    <Pressable testID={testID} onPress={onPress}
      style={({ hovered }: any) => [styles.resultRow, hovered && styles.resultHover]}>
      <View style={[styles.resultIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.resultTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.resultSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", flex: 1, maxWidth: 480 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 6,
    height: 36, paddingHorizontal: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 13, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  dropdown: {
    position: "absolute", top: 42, left: 0, right: 0,
    backgroundColor: colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.cardStrong,
    zIndex: 100, maxHeight: 460, overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 10, fontWeight: "800", color: colors.muted,
    textTransform: "uppercase", letterSpacing: 0.6,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    backgroundColor: colors.surfaceSecondary,
  },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  resultHover: { backgroundColor: colors.surfaceSecondary },
  resultIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  resultTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  resultSub: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: "600" },
  emptyRow: { padding: 20, alignItems: "center" },
  emptyText: { fontSize: 13, color: colors.muted, fontWeight: "700" },
});
