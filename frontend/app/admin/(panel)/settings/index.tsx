/**
 * System Settings — single-doc admin form.
 * Values here are live: they flow through /api/settings to the customer/merchant
 * app, and through admin_panel.get_setting() to the redemption/loyalty logic.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator, Switch, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { EmptyState, LoadingRow } from "@/src/components/AdminUI";
import { colors, shadow } from "@/src/theme";

type Settings = {
  brand_name: string;
  brand_logo_url: string | null;
  support_email: string;
  default_deal_radius_km: number;
  loyalty_points_per_redemption: number;
  referral_referrer_reward: number;
  referral_referee_reward: number;
  guest_browsing_enabled: boolean;
  reels_tab_enabled: boolean;
};

export default function SettingsPage() {
  const { request } = useAdmin();
  const [initial, setInitial] = useState<Settings | null>(null);
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    request<Settings>("/api/admin/settings")
      .then((d) => {
        setInitial(d);
        setForm({
          ...d,
          default_deal_radius_km: String(d.default_deal_radius_km),
          loyalty_points_per_redemption: String(d.loyalty_points_per_redemption),
          referral_referrer_reward: String(d.referral_referrer_reward),
          referral_referee_reward: String(d.referral_referee_reward),
        });
      })
      .catch((e: any) => setBanner({ type: "err", msg: e.message }))
      .finally(() => setLoading(false));
  }, [request]);
  useEffect(load, [load]);

  const patch = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const validate = () => {
    const r = parseFloat(form.default_deal_radius_km);
    const p = parseInt(form.loyalty_points_per_redemption, 10);
    const rr = parseInt(form.referral_referrer_reward, 10);
    const re = parseInt(form.referral_referee_reward, 10);
    if (!form.brand_name?.trim()) return "Brand name is required";
    if (!isFinite(r) || r <= 0 || r > 500) return "Deal radius must be 0–500 km";
    if (!Number.isFinite(p) || p < 0 || p > 100000) return "Points per redemption must be 0–100000";
    if (!Number.isFinite(rr) || rr < 0) return "Referrer reward must be ≥ 0";
    if (!Number.isFinite(re) || re < 0) return "Referee reward must be ≥ 0";
    if (form.support_email && !/^\S+@\S+\.\S+$/.test(form.support_email)) return "Invalid support email";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { setBanner({ type: "err", msg: err }); return; }
    setSaving(true); setBanner(null);
    try {
      const payload = {
        brand_name: form.brand_name.trim(),
        brand_logo_url: form.brand_logo_url?.trim() || null,
        support_email: form.support_email?.trim() || null,
        default_deal_radius_km: parseFloat(form.default_deal_radius_km),
        loyalty_points_per_redemption: parseInt(form.loyalty_points_per_redemption, 10),
        referral_referrer_reward: parseInt(form.referral_referrer_reward, 10),
        referral_referee_reward: parseInt(form.referral_referee_reward, 10),
        guest_browsing_enabled: !!form.guest_browsing_enabled,
        reels_tab_enabled: !!form.reels_tab_enabled,
      };
      const updated = await request<Settings>("/api/admin/settings", {
        method: "PATCH", body: JSON.stringify(payload),
      });
      setInitial(updated);
      setBanner({ type: "ok", msg: "Settings saved — changes are live." });
    } catch (e: any) {
      setBanner({ type: "err", msg: e.message });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!initial) return;
    setForm({
      ...initial,
      default_deal_radius_km: String(initial.default_deal_radius_km),
      loyalty_points_per_redemption: String(initial.loyalty_points_per_redemption),
      referral_referrer_reward: String(initial.referral_referrer_reward),
      referral_referee_reward: String(initial.referral_referee_reward),
    });
    setBanner(null);
  };

  if (loading) return <View style={styles.container}><LoadingRow /></View>;
  if (!form) return <View style={styles.container}><EmptyState label="Failed to load settings" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>Settings</Text>
          <Text style={styles.hint}>System-wide defaults, branding & feature flags. Changes propagate immediately.</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.secondaryBtn} onPress={reset}><Text style={styles.secondaryBtnText}>Reset</Text></Pressable>
          <Pressable style={[styles.primaryBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving} testID="settings-save">
            {saving ? <ActivityIndicator size="small" color={colors.white} /> :
              <><Ionicons name="checkmark" size={16} color={colors.white} /><Text style={styles.primaryBtnText}>Save changes</Text></>}
          </Pressable>
        </View>
      </View>

      {banner && (
        <View style={[styles.banner, banner.type === "ok" ? styles.bannerOk : styles.bannerErr]}>
          <Ionicons name={banner.type === "ok" ? "checkmark-circle" : "alert-circle"} size={16}
            color={banner.type === "ok" ? "#0A7F3F" : colors.error} />
          <Text style={[styles.bannerText, { color: banner.type === "ok" ? "#0A7F3F" : colors.error }]}>{banner.msg}</Text>
        </View>
      )}

      <Section title="Branding" subtitle="Shown in the customer & merchant apps and system emails.">
        <Row>
          <Field label="Brand name" flex={2}>
            <TextInput testID="s-brand-name" style={styles.input} value={form.brand_name}
              onChangeText={(v) => patch("brand_name", v)} placeholder="Happy Hour" placeholderTextColor={colors.muted} />
          </Field>
          <Field label="Support email" flex={2}>
            <TextInput testID="s-support-email" style={styles.input} value={form.support_email || ""}
              onChangeText={(v) => patch("support_email", v)} placeholder="support@happyhour.io"
              placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" />
          </Field>
        </Row>
        <Row>
          <Field label="Brand logo URL (optional)" flex={1}>
            <TextInput testID="s-brand-logo" style={styles.input} value={form.brand_logo_url || ""}
              onChangeText={(v) => patch("brand_logo_url", v)} placeholder="https://…" placeholderTextColor={colors.muted}
              autoCapitalize="none" />
          </Field>
        </Row>
      </Section>

      <Section title="Defaults" subtitle="Baseline values used across the app when the user has no override.">
        <Row>
          <Field label="Default deal search radius (km)">
            <TextInput testID="s-radius" style={styles.input} value={form.default_deal_radius_km}
              onChangeText={(v) => patch("default_deal_radius_km", v)} keyboardType="numbers-and-punctuation"
              placeholder="5" placeholderTextColor={colors.muted} />
          </Field>
          <Field label="Loyalty points per redemption">
            <TextInput testID="s-points" style={styles.input} value={form.loyalty_points_per_redemption}
              onChangeText={(v) => patch("loyalty_points_per_redemption", v)} keyboardType="number-pad"
              placeholder="25" placeholderTextColor={colors.muted} />
          </Field>
        </Row>
        <Row>
          <Field label="Referrer bonus (points to the inviter)">
            <TextInput testID="s-ref-referrer" style={styles.input} value={form.referral_referrer_reward}
              onChangeText={(v) => patch("referral_referrer_reward", v)} keyboardType="number-pad"
              placeholder="200" placeholderTextColor={colors.muted} />
          </Field>
          <Field label="Referee bonus (points to the new user)">
            <TextInput testID="s-ref-referee" style={styles.input} value={form.referral_referee_reward}
              onChangeText={(v) => patch("referral_referee_reward", v)} keyboardType="number-pad"
              placeholder="100" placeholderTextColor={colors.muted} />
          </Field>
        </Row>
      </Section>

      <Section title="Feature flags" subtitle="Toggle major app surfaces without a deploy.">
        <ToggleRow
          label="Guest browsing"
          hint="Let visitors browse the feed/map without signing in."
          value={form.guest_browsing_enabled}
          onChange={(v) => patch("guest_browsing_enabled", v)}
          testID="s-toggle-guest"
        />
        <ToggleRow
          label="Reels tab"
          hint="Show the short-video reels tab in the customer app."
          value={form.reels_tab_enabled}
          onChange={(v) => patch("reels_tab_enabled", v)}
          testID="s-toggle-reels"
        />
      </Section>
    </ScrollView>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
      <View style={{ padding: 16, gap: 12 }}>{children}</View>
    </View>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}
function Field({ label, flex, children }: { label: string; flex?: number; children: React.ReactNode }) {
  return (
    <View style={{ flex: flex ?? 1, minWidth: 200 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
function ToggleRow({ label, hint, value, onChange, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch testID={testID} value={!!value} onValueChange={onChange}
        trackColor={{ true: colors.brand, false: "#DADEE6" }} thumbColor={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14, ...(Platform.OS === "web" ? ({ maxWidth: 1100 } as any) : null) },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4, maxWidth: 560 },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 8, backgroundColor: colors.brand, justifyContent: "center" },
  primaryBtnText: { color: colors.white, fontWeight: "800", fontSize: 13 },
  secondaryBtn: { paddingHorizontal: 14, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  secondaryBtnText: { color: colors.onSurface, fontWeight: "800", fontSize: 13 },

  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 8 },
  bannerOk: { backgroundColor: "#DFF6E7" },
  bannerErr: { backgroundColor: "#FFE1E1" },
  bannerText: { fontSize: 13, fontWeight: "700", flex: 1 },

  card: { backgroundColor: colors.surface, borderRadius: 12, ...shadow.card, overflow: "hidden" },
  sectionHead: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surfaceSecondary },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  sectionSub: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  label: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  input: { height: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 14, color: colors.onSurface, backgroundColor: colors.surface },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  toggleLabel: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  toggleHint: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },
});
