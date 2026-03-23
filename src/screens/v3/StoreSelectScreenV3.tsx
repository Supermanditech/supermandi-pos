import React, { useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Circle } from "react-native-svg";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import { apiClient } from "../../services/api/apiClient";
import { saveDeviceSession } from "../../services/deviceSession";
import { useSettingsStore } from "../../stores/settingsStore";

// V3-063: Multi-store selector — shown when user has >1 ACTIVE store

type Store = { id: string; name: string; code: string };

export default function StoreSelectScreenV3() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<any>();
  const phone = route.params?.phone ?? "";
  const stores: Store[] = route.params?.stores ?? [];
  const colors = useThemeColors();
  // GCP-STG-0413: Use safe area insets instead of hardcoded paddingTop
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);

  const handleSelect = async (store: Store) => {
    try {
      const result = await apiClient.post<{
        token: string; storeId: string; storeName: string; storeCode: string;
      }>("/api/v1/pos/auth/verify-otp", { phone, otp: route.params?.otp, storeId: store.id });

      await saveDeviceSession({
        deviceId: `pos-${phone}`,
        storeId: result.storeId,
        deviceToken: result.token,
      });

      // V3-CLIENT-003: Hydrate store metadata immediately after selection
      if (result.storeName) useSettingsStore.getState().setStoreName(result.storeName);
      if (result.storeCode) useSettingsStore.getState().setStoreCode(result.storeCode);

      showToast(`Welcome to ${result.storeName}!`);
      navigation.reset({ index: 0, routes: [{ name: "V3StaffLogin" }] });
    } catch (err: any) {
      showToast(err?.message ?? "Failed to select store");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Svg width={48} height={48} viewBox="0 0 32 32">
          <Rect x={2} y={2} width={28} height={28} rx={8} fill="#2563EB" />
          <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Circle cx={16} cy={25.3} r={2.1} fill="#fff" />
        </Svg>
        <Text style={styles.title}>Select Store</Text>
        <Text style={styles.subtitle}>You have access to {stores.length} stores</Text>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<View style={{ padding: 32, alignItems: "center" }}><Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No stores available</Text><Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Contact support to get store access</Text></View>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => handleSelect(item)}>
            <View style={styles.storeIcon}>
              <Text style={styles.storeInitial}>{item.name[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeName}>{item.name}</Text>
              <Text style={styles.storeCode}>{item.code}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function createStyles(colors: ColorPalette, safeTop: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    // GCP-STG-0413: Dynamic paddingTop from safe area insets instead of hardcoded 60
    header: { alignItems: "center", paddingTop: safeTop + 16, paddingBottom: 24 },
    title: { fontSize: 22, fontWeight: "900", color: colors.textPrimary, marginTop: 16, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: colors.textTertiary, marginTop: 4 },
    list: { padding: getScreenPadding() },
    card: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: colors.background, borderRadius: 16, borderWidth: 2, borderColor: colors.border, marginBottom: 10, gap: 12 },
    storeIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
    storeInitial: { fontSize: 20, fontWeight: "800", color: colors.primary },
    storeName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    storeCode: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
    arrow: { fontSize: 24, color: colors.textTertiary },
  });
}
