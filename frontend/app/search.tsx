import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api/client";
import { useLocation } from "@/src/context/location";
import DealCard from "@/src/components/DealCard";
import EmptyState from "@/src/components/EmptyState";
import { colors, radius, spacing } from "@/src/theme";

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loc } = useLocation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const d = await api.listDeals({ q: query.trim(), lat: loc.lat, lng: loc.lng });
      setResults(d);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, [loc.lat, loc.lng]);

  useEffect(() => {
    setTouched(true);
    const id = setTimeout(() => search(q), 350);
    return () => clearTimeout(id);
  }, [q, search]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          testID="search-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Search deals, stores, categories"
            placeholderTextColor={colors.muted}
            autoFocus
            style={styles.input}
            returnKeyType="search"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ("")} testID="clear-search">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <DealCard deal={item} />}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            touched && q.trim() ? (
              <EmptyState
                icon="search"
                title="No results"
                subtitle="Try a different search term or broaden your filters."
              />
            ) : (
              <EmptyState
                icon="search"
                title="What are you craving?"
                subtitle="Type a keyword like &quot;pizza&quot;, &quot;coffee&quot;, or a store name."
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
    paddingVertical: 0,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
