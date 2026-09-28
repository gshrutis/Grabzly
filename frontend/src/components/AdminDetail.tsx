/** Generic detail screen shared by merchants/deals/customers. */
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { StatusBadge } from "@/src/components/AdminUI";
import { colors, radius, shadow } from "@/src/theme";

export function DetailScreen(props: {
  entityKind: "merchant" | "deal" | "customer";
  fetchEndpoint: (id: string) => string;
  statusEndpoint: (id: string) => string;
  actions: { key: string; label: string; color?: string; requireReason?: boolean }[];
  render: (data: any) => React.ReactNode;
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request } = useAdmin();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    request(props.fetchEndpoint(String(id))).then(setData).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [id]);

  const doAction = async (a: { key: string; label: string; requireReason?: boolean }) => {
    if (a.requireReason && !reason.trim() && Platform.OS !== "web") {
      Alert.alert("Reason required", `Please enter a reason to ${a.label}`);
      return;
    }
    if (a.requireReason && Platform.OS === "web" && !reason.trim()) {
      const r = (globalThis as any).prompt?.(`Reason to ${a.label}?`) || "";
      if (!r) return;
      setReason(r);
    }
    setBusy(a.key); setError(null);
    try {
      await request(props.statusEndpoint(String(id)), {
        method: "PATCH", body: JSON.stringify({ status: a.key, reason: reason || undefined }),
      });
      setReason(""); load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.brand} /></View>;
  if (!data) return <View style={s.center}><Text>Not found</Text></View>;

  return (
    <ScrollView contentContainerStyle={s.container}>
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
        <Ionicons name="chevron-back" size={16} color={colors.onSurface} />
        <Text style={s.backText}>Back</Text>
      </TouchableOpacity>

      {props.render(data)}

      <View style={s.actionsCard} testID="admin-actions-card">
        <Text style={s.h3}>Admin actions</Text>
        <View style={s.actions}>
          {props.actions.map(a => (
            <TouchableOpacity key={a.key} testID={`action-${a.key}`} onPress={() => doAction(a)} disabled={busy !== null}
              style={[s.actionBtn, { backgroundColor: a.color || colors.brand }, busy && { opacity: 0.6 }]}>
              {busy === a.key ? <ActivityIndicator color={colors.white} /> : <Text style={s.actionText}>{a.label}</Text>}
            </TouchableOpacity>
          ))}
        </View>
        <TextInput testID="reason-input" value={reason} onChangeText={setReason} placeholder="Reason (optional, required for reject/suspend)"
          placeholderTextColor={colors.muted} style={s.reasonInput} />
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

export function KV({ k, v }: { k: string; v: any }) {
  return (
    <View style={s.kv}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v == null || v === "" ? "—" : String(v)}</Text>
    </View>
  );
}
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={s.section}><Text style={s.h2}>{title}</Text>{children}</View>;
}
export { StatusBadge };

const s = StyleSheet.create({
  container: { padding: 24, gap: 14, maxWidth: 1100, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surface, ...shadow.card },
  backText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  section: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 10, ...shadow.card },
  h2: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  h3: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  kv: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 12 },
  k: { width: 160, fontSize: 12, color: colors.muted, fontWeight: "700" },
  v: { flex: 1, fontSize: 13, color: colors.onSurface, fontWeight: "700" },
  actionsCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 10, ...shadow.card },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { paddingHorizontal: 14, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  actionText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  reasonInput: { height: 40, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginTop: 6 },
  error: { color: colors.error, fontSize: 12, fontWeight: "700" },
});
