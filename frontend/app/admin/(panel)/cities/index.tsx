/**
 * Cities admin — geo-anchored regions with a radius.
 * Customer feed/map auto-filter by the selected city.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { EmptyState, LoadingRow, StatusBadge } from "@/src/components/AdminUI";
import { colors, shadow } from "@/src/theme";

type City = {
  id: string; slug: string; name: string;
  country?: string; state?: string;
  lat: number; lng: number; radius_km: number;
  is_active: boolean; order?: number;
  merchant_count?: number; active_deal_count?: number;
};

export default function CitiesPage() {
  const { request } = useAdmin();
  const [items, setItems] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<City | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    request("/api/admin/cities")
      .then((d: any) => setItems(d.items || []))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [request]);
  useEffect(load, [load]);

  const onDelete = async (c: City) => {
    if (!(await confirmAsync(`Delete "${c.name}"?`, "Customer app users who had this city selected will fall back to their GPS location."))) return;
    try {
      await request(`/api/admin/cities/${c.id}`, { method: "DELETE" });
      load();
    } catch (e: any) { showAlert("Cannot delete", e.message); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>Cities</Text>
          <Text style={styles.hint}>Each city has a center (lat/lng) + radius. Customer feed/map filters by the selected city.</Text>
        </View>
        <Pressable testID="city-new" style={styles.primaryBtn} onPress={() => setCreating(true)}>
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.primaryBtnText}>New city</Text>
        </Pressable>
      </View>

      {loading ? <LoadingRow />
        : error ? <EmptyState label={error} />
        : items.length === 0 ? <EmptyState label="No cities yet — add your first one." />
        : (
          <View style={styles.card}>
            <View style={[styles.row, styles.headerRowT]}>
              <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>City</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 130 }]}>Country / State</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 140 }]}>Center</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 80 }]}>Radius</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 140 }]}>Stats</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 100 }]}>Status</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 130 }]}> </Text>
            </View>
            {items.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={[styles.cell, { flex: 2 }]}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.sub}>{c.slug}</Text>
                </View>
                <Text style={[styles.cell, styles.cellText, { width: 130 }]}>
                  {[c.country, c.state].filter(Boolean).join(", ") || "—"}
                </Text>
                <Text style={[styles.cell, styles.cellText, { width: 140 }]}>{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</Text>
                <Text style={[styles.cell, styles.cellText, { width: 80 }]}>{c.radius_km} km</Text>
                <View style={[styles.cell, { width: 140 }]}>
                  <Text style={styles.stat}>{c.merchant_count ?? 0} merchants</Text>
                  <Text style={styles.stat}>{c.active_deal_count ?? 0} active deals</Text>
                </View>
                <View style={[styles.cell, { width: 100 }]}>
                  <StatusBadge status={c.is_active ? "active" : "inactive"} />
                </View>
                <View style={[styles.cell, { width: 130, flexDirection: "row", gap: 6 }]}>
                  <Pressable style={styles.iconBtn} onPress={() => setEditing(c)} testID={`city-edit-${c.slug}`}>
                    <Ionicons name="create-outline" size={16} color={colors.onSurface} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => onDelete(c)} testID={`city-del-${c.slug}`}>
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

      {(creating || editing) && (
        <CityModal
          initial={editing || {}}
          isEdit={!!editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={async (payload) => {
            if (editing) {
              await request(`/api/admin/cities/${editing.id}`, {
                method: "PATCH", body: JSON.stringify(payload),
              });
            } else {
              await request("/api/admin/cities", {
                method: "POST", body: JSON.stringify(payload),
              });
            }
            setCreating(false); setEditing(null); load();
          }}
        />
      )}
    </ScrollView>
  );
}

function CityModal({ initial, isEdit, onSave, onClose }: {
  initial: Partial<City>; isEdit: boolean;
  onSave: (payload: any) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(initial.name || "");
  const [slug, setSlug] = useState(initial.slug || "");
  const [country, setCountry] = useState(initial.country || "");
  const [state, setState] = useState(initial.state || "");
  const [lat, setLat] = useState(initial.lat !== undefined ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial.lng !== undefined ? String(initial.lng) : "");
  const [radius, setRadius] = useState(String(initial.radius_km ?? 25));
  const [order, setOrder] = useState(String(initial.order ?? 0));
  const [isActive, setIsActive] = useState<boolean>(initial.is_active !== false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const geocode = async () => {
    if (!name.trim()) { setErr("Enter a city name first"); return; }
    setGeocoding(true); setErr(null);
    try {
      const q = encodeURIComponent([name, state, country].filter(Boolean).join(", "));
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
      const arr = await res.json();
      if (arr?.[0]) {
        setLat(String(parseFloat(arr[0].lat).toFixed(6)));
        setLng(String(parseFloat(arr[0].lon).toFixed(6)));
      } else { setErr("City not found in geocoder"); }
    } catch (e: any) { setErr(e.message); }
    finally { setGeocoding(false); }
  };

  const submit = async () => {
    setErr(null);
    if (!name.trim()) return setErr("Name is required");
    const la = parseFloat(lat), lo = parseFloat(lng), r = parseFloat(radius);
    if (!isFinite(la) || la < -90 || la > 90) return setErr("Invalid latitude");
    if (!isFinite(lo) || lo < -180 || lo > 180) return setErr("Invalid longitude");
    if (!isFinite(r) || r <= 0 || r > 500) return setErr("Radius must be 0–500 km");
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim() || undefined,
        country: country.trim() || undefined,
        state: state.trim() || undefined,
        lat: la, lng: lo, radius_km: r,
        order: parseInt(order || "0", 10) || 0,
        is_active: isActive,
      });
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{isEdit ? "Edit city" : "New city"}</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={20} color={colors.muted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 2 }}>
                <Label>Name</Label>
                <TextInput testID="city-input-name" style={styles.input} value={name} onChangeText={setName}
                  placeholder="San Francisco" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Slug (optional)</Label>
                <TextInput testID="city-input-slug" style={styles.input} value={slug} onChangeText={setSlug}
                  placeholder="san-francisco" placeholderTextColor={colors.muted} autoCapitalize="none" />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Label>Country</Label>
                <TextInput style={styles.input} value={country} onChangeText={setCountry}
                  placeholder="USA" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>State / Region</Label>
                <TextInput style={styles.input} value={state} onChangeText={setState}
                  placeholder="CA" placeholderTextColor={colors.muted} />
              </View>
            </View>

            <View style={styles.geoBar}>
              <Text style={styles.geoHint}>Set center coordinates:</Text>
              <Pressable style={styles.geoBtn} onPress={geocode} disabled={geocoding} testID="city-geocode">
                {geocoding ? <ActivityIndicator size="small" color={colors.brand} /> :
                  <><Ionicons name="search" size={14} color={colors.brand} /><Text style={styles.geoBtnText}>Auto-locate</Text></>}
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Label>Latitude</Label>
                <TextInput testID="city-input-lat" style={styles.input} value={lat} onChangeText={setLat}
                  keyboardType="numbers-and-punctuation" placeholder="37.7749" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>Longitude</Label>
                <TextInput testID="city-input-lng" style={styles.input} value={lng} onChangeText={setLng}
                  keyboardType="numbers-and-punctuation" placeholder="-122.4194" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ width: 100 }}>
                <Label>Radius (km)</Label>
                <TextInput testID="city-input-radius" style={styles.input} value={radius} onChangeText={setRadius}
                  keyboardType="number-pad" placeholder="25" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ width: 80 }}>
                <Label>Order</Label>
                <TextInput style={styles.input} value={order} onChangeText={setOrder}
                  keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} />
              </View>
            </View>
            <Pressable style={styles.toggle} onPress={() => setIsActive((x) => !x)} testID="city-toggle-active">
              <Ionicons name={isActive ? "checkbox" : "square-outline"} size={18} color={isActive ? colors.brand : colors.muted} />
              <Text style={styles.toggleText}>Active (visible in customer city picker)</Text>
            </Pressable>
            {err ? <Text style={styles.err}>{err}</Text> : null}
          </ScrollView>
          <View style={styles.modalFoot}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={submit} disabled={saving} testID="city-save">
              {saving ? <ActivityIndicator size="small" color={colors.white} /> :
                <Text style={styles.primaryBtnText}>{isEdit ? "Save" : "Create"}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function confirmAsync(title: string, msg?: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${msg || ""}`));
  return new Promise((res) => {
    Alert.alert(title, msg, [
      { text: "Cancel", style: "cancel", onPress: () => res(false) },
      { text: "OK", style: "destructive", onPress: () => res(true) },
    ]);
  });
}
function showAlert(title: string, msg?: string) {
  if (Platform.OS === "web") { window.alert(`${title}\n\n${msg || ""}`); return; }
  Alert.alert(title, msg);
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  h1: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4, maxWidth: 560 },
  card: { backgroundColor: colors.surface, borderRadius: 12, ...shadow.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider, gap: 8 },
  headerRowT: { backgroundColor: colors.surfaceSecondary, borderTopWidth: 0 },
  cell: { paddingRight: 8 },
  headerCell: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  cellText: { fontSize: 13, color: colors.onSurface, fontWeight: "700" },
  name: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: "600" },
  stat: { fontSize: 12, color: colors.onSurface, fontWeight: "700" },
  iconBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },

  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 8, backgroundColor: colors.brand, justifyContent: "center" },
  primaryBtnText: { color: colors.white, fontWeight: "800", fontSize: 13 },
  secondaryBtn: { paddingHorizontal: 14, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  secondaryBtnText: { color: colors.onSurface, fontWeight: "800", fontSize: 13 },

  modalScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 720, backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden", maxHeight: "90%" },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  modalFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary },
  label: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  input: { height: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 14, color: colors.onSurface, backgroundColor: colors.surface },
  geoBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  geoHint: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  geoBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  geoBtnText: { fontSize: 12, fontWeight: "800", color: colors.brand },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleText: { fontSize: 13, color: colors.onSurface, fontWeight: "700" },
  err: { color: colors.error, fontSize: 13, fontWeight: "700" },
});
