import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform,
  ScrollView, RefreshControl, FlatList,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api/client";
import { colors, radius, spacing, shadow } from "@/src/theme";
import EmptyState from "@/src/components/EmptyState";

const CACHE_KEY = "hh_merchant_active_claims_cache";

type Mode = "scan" | "manual" | "log";

export default function MerchantRedeem() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("scan");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [scanning, setScanning] = useState(true);
  const cooldownRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const c = await api.merchantClaims();
      setClaims(c);
      // Cache active claims for offline validation
      const active = c.filter((x: any) => x.status === "active");
      await storage.setItem(CACHE_KEY, JSON.stringify(active));
      setOffline(false);
    } catch (e) {
      // Fall back to cached
      const cached = await storage.getItem<string>(CACHE_KEY, "");
      if (cached) {
        try {
          setClaims(JSON.parse(cached));
          setOffline(true);
        } catch {}
      }
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const validateCode = async (raw: string) => {
    setError(null);
    setValidating(true);
    setValidated(null);
    try {
      const claim = await api.merchantValidateCode(raw);
      setValidated(claim);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      // Try offline cache
      const cached = await storage.getItem<string>(CACHE_KEY, "");
      if (cached) {
        try {
          const list = JSON.parse(cached) as any[];
          const code = raw.startsWith("HH:") ? raw.split(":")[2] : raw.toUpperCase();
          const match = list.find((c) => c.redemption_code === code || c.qr_payload === raw);
          if (match) {
            setValidated({ ...match, _offline: true });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            setError("Offline mode — will sync when connection returns.");
            setValidating(false);
            return;
          }
        } catch {}
      }
      setError(e.message || "Code not found");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setValidating(false);
  };

  const confirmRedeem = async () => {
    if (!validated) return;
    setValidating(true);
    try {
      const res = await api.merchantRedeem(validated.id);
      setValidated({ ...res.claim, points_awarded: res.points_awarded });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await load();
    } catch (e: any) {
      setError(e.message || "Redemption failed");
    }
    setValidating(false);
  };

  const voidClaim = async (claim_id: string) => {
    try {
      await api.merchantVoidClaim(claim_id, "no_show");
      Haptics.selectionAsync().catch(() => {});
      await load();
    } catch (e) { console.warn(e); }
  };

  const onBarcodeScanned = (result: any) => {
    if (scanned) return;
    setScanned(true);
    setScanning(false);
    const data = result.data;
    validateCode(data);
    // reset scan lock after a few sec
    clearTimeout(cooldownRef.current);
    cooldownRef.current = setTimeout(() => {
      setScanned(false);
      setScanning(true);
    }, 3500);
  };

  useEffect(() => () => clearTimeout(cooldownRef.current), []);

  const resetFlow = () => {
    setValidated(null);
    setError(null);
    setManualCode("");
    setScanned(false);
    setScanning(true);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Redeem</Text>
        {offline && (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline" size={10} color={colors.white} />
            <Text style={styles.offlineText}>OFFLINE</Text>
          </View>
        )}
        <View style={styles.modeTabs}>
          {(["scan", "manual", "log"] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              testID={`redeem-mode-${m}`}
              style={[styles.modeTab, mode === m && styles.modeTabActive]}
              onPress={() => { setMode(m); resetFlow(); }}
              activeOpacity={0.85}
            >
              <Ionicons
                name={m === "scan" ? "scan" : m === "manual" ? "keypad" : "list"}
                size={14}
                color={mode === m ? colors.white : colors.onSurface}
              />
              <Text style={[styles.modeTabText, mode === m && { color: colors.white }]}>
                {m === "scan" ? "Scan" : m === "manual" ? "Manual" : "Log"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* CONTENT */}
      {mode === "scan" && (
        <View style={styles.scanArea}>
          {permission?.granted ? (
            <View style={styles.cameraWrap}>
              {scanning && (
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scanning ? onBarcodeScanned : undefined}
                />
              )}
              <View style={styles.scanFrame} />
              <Text style={styles.scanHint}>Point camera at customer QR code</Text>
            </View>
          ) : (
            <View style={styles.permissionBox}>
              <Ionicons name="camera" size={40} color={colors.brand} />
              <Text style={styles.permissionTitle}>
                {Platform.OS === "web" ? "Camera unavailable in web preview" : "Camera permission required"}
              </Text>
              <Text style={styles.permissionSub}>
                {Platform.OS === "web"
                  ? "Use Manual entry to test the redemption flow, or scan on a physical device via Expo Go."
                  : "Grant camera access to scan customer QR codes."}
              </Text>
              {Platform.OS !== "web" && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={async () => await requestPermission()}
                  activeOpacity={0.85}
                  testID="grant-camera-btn"
                >
                  <Text style={styles.primaryBtnText}>Grant camera</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                testID="switch-to-manual"
                style={styles.linkBtn}
                onPress={() => setMode("manual")}
              >
                <Text style={styles.linkText}>Use manual code entry →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {mode === "manual" && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Redemption code</Text>
          <TextInput
            testID="manual-code-input"
            value={manualCode}
            onChangeText={(t) => setManualCode(t.toUpperCase())}
            placeholder="ENTER 6-CHAR CODE"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            style={styles.codeInput}
            maxLength={12}
          />
          <TouchableOpacity
            testID="validate-manual-btn"
            style={[styles.primaryBtn, { marginTop: spacing.md }]}
            onPress={() => manualCode && validateCode(manualCode)}
            disabled={!manualCode || validating}
            activeOpacity={0.85}
          >
            {validating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>Validate</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.hint}>Tip: codes are printed under the QR in the customer&apos;s app.</Text>
        </ScrollView>
      )}

      {mode === "log" && (
        <FlatList
          data={claims}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logCode}>#{item.redemption_code}</Text>
                <Text style={styles.logDeal} numberOfLines={1}>{item.deal_title}</Text>
                <Text style={styles.logUser}>{item.user_name} · {new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <View style={[styles.logStatus, {
                backgroundColor:
                  item.status === "active" ? colors.brandTertiary :
                  item.status === "redeemed" ? "#D1F5E0" :
                  colors.surfaceTertiary,
              }]}>
                <Text style={[styles.logStatusText, {
                  color:
                    item.status === "active" ? colors.brand :
                    item.status === "redeemed" ? colors.success :
                    colors.muted,
                }]}>
                  {String(item.status).toUpperCase()}
                </Text>
              </View>
              {item.status === "active" && (
                <TouchableOpacity
                  testID={`void-${item.id}`}
                  style={styles.voidBtn}
                  onPress={() => voidClaim(item.id)}
                >
                  <Ionicons name="close" size={16} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          )}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.sm }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} />
          }
          ListEmptyComponent={
            <EmptyState icon="ticket-outline" title="No redemptions yet" subtitle="Claims will show up here once customers claim your deals." />
          }
        />
      )}

      {/* VALIDATION RESULT */}
      {validated && (
        <View style={styles.resultOverlay}>
          <View style={[styles.resultCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            {validated.status === "redeemed" ? (
              <>
                <View style={[styles.resultIcon, { backgroundColor: colors.success }]}>
                  <Ionicons name="checkmark" size={40} color={colors.white} />
                </View>
                <Text style={styles.resultTitle}>Redeemed!</Text>
                {validated.points_awarded && (
                  <Text style={styles.resultSub}>+{validated.points_awarded} pts awarded to {validated.user_name}</Text>
                )}
                <TouchableOpacity onPress={resetFlow} style={styles.primaryBtn} activeOpacity={0.85} testID="scan-next-btn">
                  <Text style={styles.primaryBtnText}>Scan next</Text>
                </TouchableOpacity>
              </>
            ) : validated.status === "active" ? (
              <>
                <View style={[styles.resultIcon, { backgroundColor: colors.brand }]}>
                  <Ionicons name="ticket" size={40} color={colors.white} />
                </View>
                <Text style={styles.resultTitle}>Valid claim</Text>
                <Text style={styles.resultDeal}>{validated.deal_title}</Text>
                <Text style={styles.resultSub}>Customer: {validated.user_name}</Text>
                <View style={styles.resultBtnRow}>
                  <TouchableOpacity onPress={resetFlow} style={styles.secondaryBtn} activeOpacity={0.85}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmRedeem} style={styles.primaryBtn} activeOpacity={0.85} testID="confirm-redeem-btn">
                    {validating ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color={colors.white} />
                        <Text style={styles.primaryBtnText}>Redeem</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.resultIcon, { backgroundColor: colors.error }]}>
                  <Ionicons name="close" size={40} color={colors.white} />
                </View>
                <Text style={styles.resultTitle}>Invalid</Text>
                <Text style={styles.resultSub}>This code is {validated.status}.</Text>
                <TouchableOpacity onPress={resetFlow} style={styles.primaryBtn} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>OK</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {error && !validated && (
        <View style={[styles.errorFloating, { bottom: insets.bottom + 80 }]}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  offlineBadge: {
    position: "absolute", top: 45, right: spacing.lg,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
  },
  offlineText: { color: colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  modeTabs: {
    flexDirection: "row",
    gap: 4,
    marginTop: spacing.md,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  modeTabActive: { backgroundColor: colors.brand },
  modeTabText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },

  scanArea: { flex: 1 },
  cameraWrap: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  scanFrame: {
    width: 240, height: 240,
    borderWidth: 3, borderColor: colors.brand,
    borderRadius: radius.lg,
    backgroundColor: "transparent",
  },
  scanHint: {
    position: "absolute", bottom: 40,
    color: colors.white, fontSize: 13, fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.pill,
  },
  permissionBox: {
    flex: 1,
    alignItems: "center", justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  permissionSub: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 18, maxWidth: 280 },
  linkBtn: { padding: spacing.md },
  linkText: { color: colors.brand, fontSize: 14, fontWeight: "800" },

  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  codeInput: {
    marginTop: 6,
    height: 80,
    borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    textAlign: "center",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 6,
    color: colors.onSurface,
  },
  hint: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.md },

  primaryBtn: {
    height: 52,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
    ...shadow.card,
  },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    height: 52, paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },

  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    ...shadow.card,
  },
  logCode: { fontSize: 14, fontWeight: "800", color: colors.brand, letterSpacing: 1.5 },
  logDeal: { fontSize: 13, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  logUser: { fontSize: 11, color: colors.muted, marginTop: 2 },
  logStatus: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill,
  },
  logStatusText: { fontSize: 10, fontWeight: "800" },
  voidBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#FFE4E4",
    alignItems: "center", justifyContent: "center",
  },

  resultOverlay: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  resultIcon: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  resultTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  resultDeal: { fontSize: 15, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  resultSub: { fontSize: 13, color: colors.muted, textAlign: "center" },
  resultBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignSelf: "stretch" },

  errorFloating: {
    position: "absolute", left: spacing.lg, right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#FFE4E4",
  },
  errorText: { flex: 1, color: colors.error, fontSize: 13, fontWeight: "700" },
});
