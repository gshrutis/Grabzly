/**
 * Categories admin — hierarchical tree with inline create/edit/delete.
 * Uses `/api/admin/categories` (returns both `items` and `tree`).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAdmin } from "@/src/context/admin-auth";
import { EmptyState, LoadingRow } from "@/src/components/AdminUI";
import { colors, shadow, radius } from "@/src/theme";

type Cat = {
  id: string; slug: string; name: string;
  icon?: string; color?: string;
  parent_id?: string | null;
  order?: number;
  applies_to?: "merchants" | "deals" | "both";
  is_active?: boolean;
  merchant_count?: number;
  deal_count?: number;
  children?: Cat[];
};

const APPLIES: Array<Cat["applies_to"]> = ["both", "merchants", "deals"];

export default function CategoriesPage() {
  const { request } = useAdmin();
  const [tree, setTree] = useState<Cat[]>([]);
  const [flat, setFlat] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [creating, setCreating] = useState<{ parent_id: string | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    request("/api/admin/categories")
      .then((d: any) => { setTree(d.tree || []); setFlat(d.items || []); })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(load, [load]);

  const onDelete = async (c: Cat) => {
    if (!(await confirmAsync(`Delete "${c.name}"?`, "This cannot be undone."))) return;
    try {
      await request(`/api/admin/categories/${c.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      showAlert("Cannot delete", e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>Categories</Text>
          <Text style={styles.hint}>Hierarchical tags for merchants & deals. Slug is the stable identifier used by the app.</Text>
        </View>
        <Pressable testID="cat-new" style={styles.primaryBtn}
          onPress={() => setCreating({ parent_id: null })}>
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.primaryBtnText}>New category</Text>
        </Pressable>
      </View>

      {loading ? <LoadingRow />
        : error ? <EmptyState label={error} />
        : tree.length === 0 ? <EmptyState label="No categories yet — create your first one." />
        : (
          <View style={styles.card}>
            {tree.map((n) => (
              <Node key={n.id} node={n} depth={0}
                onEdit={setEditing}
                onAddChild={(p) => setCreating({ parent_id: p.id })}
                onDelete={onDelete} />
            ))}
          </View>
        )}

      {creating && (
        <EditModal
          initial={{ parent_id: creating.parent_id }}
          parents={flat}
          onClose={() => setCreating(null)}
          onSave={async (payload) => {
            await request("/api/admin/categories", {
              method: "POST", body: JSON.stringify(payload),
            });
            setCreating(null); load();
          }}
        />
      )}
      {editing && (
        <EditModal
          initial={editing}
          parents={flat.filter((p) => p.id !== editing.id)}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await request(`/api/admin/categories/${editing.id}`, {
              method: "PATCH", body: JSON.stringify(payload),
            });
            setEditing(null); load();
          }}
        />
      )}
    </ScrollView>
  );
}

function Node({ node, depth, onEdit, onAddChild, onDelete }: {
  node: Cat; depth: number;
  onEdit: (c: Cat) => void; onAddChild: (c: Cat) => void; onDelete: (c: Cat) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasKids = (node.children?.length || 0) > 0;
  return (
    <>
      <View style={[styles.row, depth > 0 && { paddingLeft: 16 + depth * 20 }]}>
        <Pressable onPress={() => hasKids && setOpen((x) => !x)}
          style={styles.chevBtn} testID={`cat-toggle-${node.slug}`}>
          {hasKids ? <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={colors.muted} />
            : <View style={{ width: 14 }} />}
        </Pressable>
        <View style={[styles.dot, { backgroundColor: node.color || colors.brand }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{node.name}</Text>
          <Text style={styles.sub}>
            <Text style={styles.slug}>{node.slug}</Text>
            {" · "}{node.applies_to || "both"}
            {typeof node.merchant_count === "number"
              ? ` · ${node.merchant_count} merchants, ${node.deal_count} deals` : ""}
            {node.is_active === false ? " · Inactive" : ""}
          </Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => onAddChild(node)} testID={`cat-add-child-${node.slug}`}>
          <Ionicons name="add" size={16} color={colors.brand} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => onEdit(node)} testID={`cat-edit-${node.slug}`}>
          <Ionicons name="create-outline" size={16} color={colors.onSurface} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => onDelete(node)} testID={`cat-del-${node.slug}`}>
          <Ionicons name="trash-outline" size={16} color={colors.error} />
        </Pressable>
      </View>
      {open && node.children?.map((c) => (
        <Node key={c.id} node={c} depth={depth + 1}
          onEdit={onEdit} onAddChild={onAddChild} onDelete={onDelete} />
      ))}
    </>
  );
}

function EditModal({ initial, parents, onSave, onClose }: {
  initial: Partial<Cat>; parents: Cat[];
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name || "");
  const [slug, setSlug] = useState(initial.slug || "");
  const [icon, setIcon] = useState(initial.icon || "");
  const [color, setColor] = useState(initial.color || "#FF5A36");
  const [order, setOrder] = useState(String(initial.order ?? 0));
  const [parentId, setParentId] = useState<string | null>(initial.parent_id ?? null);
  const [appliesTo, setAppliesTo] = useState<Cat["applies_to"]>(initial.applies_to || "both");
  const [isActive, setIsActive] = useState<boolean>(initial.is_active !== false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial.id;

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim() || undefined,
        icon: icon.trim() || undefined,
        color: color.trim() || undefined,
        order: parseInt(order || "0", 10) || 0,
        parent_id: parentId === null ? "" : parentId,
        applies_to: appliesTo,
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
            <Text style={styles.modalTitle}>{isEdit ? "Edit category" : "New category"}</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={20} color={colors.muted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Field label="Name">
              <TextInput testID="cat-input-name" style={styles.input} value={name} onChangeText={setName}
                placeholder="e.g. Italian Restaurants" placeholderTextColor={colors.muted} />
            </Field>
            <Field label="Slug (optional — auto from name)">
              <TextInput testID="cat-input-slug" style={styles.input} value={slug} onChangeText={setSlug}
                placeholder="italian-restaurants" placeholderTextColor={colors.muted} autoCapitalize="none" />
            </Field>
            <Field label="Parent">
              <View style={styles.selectRow}>
                <Chip label="— No parent —" active={parentId === null} onPress={() => setParentId(null)} />
                {parents.map((p) => (
                  <Chip key={p.id} label={p.name} active={parentId === p.id} onPress={() => setParentId(p.id)} />
                ))}
              </View>
            </Field>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Icon (Font Awesome key)">
                  <TextInput style={styles.input} value={icon} onChangeText={setIcon}
                    placeholder="utensils" placeholderTextColor={colors.muted} autoCapitalize="none" />
                </Field>
              </View>
              <View style={{ width: 120 }}>
                <Field label="Color">
                  <View style={styles.colorRow}>
                    <View style={[styles.colorSwatch, { backgroundColor: color }]} />
                    <TextInput style={[styles.input, { flex: 1 }]} value={color} onChangeText={setColor}
                      placeholder="#FF5A36" placeholderTextColor={colors.muted} autoCapitalize="none" />
                  </View>
                </Field>
              </View>
              <View style={{ width: 80 }}>
                <Field label="Order">
                  <TextInput style={styles.input} value={order} onChangeText={setOrder}
                    keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} />
                </Field>
              </View>
            </View>
            <Field label="Applies to">
              <View style={styles.selectRow}>
                {APPLIES.map((a) => (
                  <Chip key={a} label={a!} active={appliesTo === a} onPress={() => setAppliesTo(a)} />
                ))}
              </View>
            </Field>
            <Pressable style={styles.toggle} onPress={() => setIsActive((x) => !x)} testID="cat-toggle-active">
              <Ionicons name={isActive ? "checkbox" : "square-outline"} size={18} color={isActive ? colors.brand : colors.muted} />
              <Text style={styles.toggleText}>Active (visible in customer app)</Text>
            </Pressable>
            {err ? <Text style={styles.err}>{err}</Text> : null}
          </ScrollView>
          <View style={styles.modalFoot}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={submit} disabled={saving} testID="cat-save">
              {saving ? <ActivityIndicator color={colors.white} size="small" /> :
                <Text style={styles.primaryBtnText}>{isEdit ? "Save" : "Create"}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View><Text style={styles.label}>{label}</Text>{children}</View>;
}
function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

// Cross-platform confirm/alert helpers.
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
  hint: { fontSize: 12, color: colors.muted, marginTop: 4, maxWidth: 520 },
  card: { backgroundColor: colors.surface, borderRadius: 12, ...shadow.card, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  chevBtn: { width: 20, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: "600" },
  slug: { fontFamily: Platform.OS === "web" ? ("monospace" as any) : undefined, color: colors.muted },
  iconBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },

  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 8, backgroundColor: colors.brand },
  primaryBtnText: { color: colors.white, fontWeight: "800", fontSize: 13 },
  secondaryBtn: { paddingHorizontal: 14, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  secondaryBtnText: { color: colors.onSurface, fontWeight: "800", fontSize: 13 },

  modalScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 600, backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden", maxHeight: "90%" },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  modalFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary },

  label: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  input: { height: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 14, color: colors.onSurface, backgroundColor: colors.surface },
  selectRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  colorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  colorSwatch: { width: 42, height: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleText: { fontSize: 13, color: colors.onSurface, fontWeight: "700" },
  err: { color: colors.error, fontSize: 13, fontWeight: "700" },
});
