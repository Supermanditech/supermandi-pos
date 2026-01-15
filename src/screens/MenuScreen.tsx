import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, Pressable, View, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { theme } from "../theme";
import { isQaMenuEnabled } from "./UiShowcaseScreen";
import { useSettingsStore } from "../stores/settingsStore";
import { useCartStore } from "../stores/cartStore";
import { usePurchaseDraftStore } from "../stores/purchaseDraftStore";
import { useProductsStore } from "../stores/productsStore";
import { LANGUAGE_NAMES, type SupportedLanguage } from "../i18n";
import { BUILD_INFO, API_BASE_URL } from "../config/api";
import { getDeviceToken, clearDeviceSession } from "../services/deviceSession";
import { fetchUiStatus, type UiStatusResponse } from "../services/api/uiStatusApi";
import { logPosEvent } from "../services/cloudEventLogger";
import { pendingOutboxCount } from "../services/offline/outbox";

type RootStackParamList = {
  EnrollDevice: undefined;
  SalesHistory: undefined;
  BarcodeSheet: undefined;
  OrderHistory: undefined;
  ReorderSettings: undefined;
  ReorderPolicies: undefined;
  Inward: undefined;
  PurchaseHistory: undefined;
  SalesStatement: undefined;
  StockStatement: undefined;
  UiShowcase: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MenuScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const showQaMenu = isQaMenuEnabled();

  // GO-LIVE-002: Feature flags for section visibility
  const buyEnabled = useSettingsStore((state) => state.buyEnabled);
  const reorderEnabled = useSettingsStore((state) => state.reorderEnabled);
  const showPurchasingSection = buyEnabled || reorderEnabled;

  // I18N-002: Language preference
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  // DEV-057: Operational status for status panel
  // STORECODE-003: Added storeCode for display
  const [opStatus, setOpStatus] = useState<{
    tokenSuffix: string;
    storeId: string | null;
    storeName: string | null;
    storeCode: string | null;
    storeActive: boolean | null;
    deviceActive: boolean | null;
    pendingOutboxCount: number;
    deviceLabel: string | null;
  }>({
    tokenSuffix: "...",
    storeId: null,
    storeName: null,
    storeCode: null,
    storeActive: null,
    deviceActive: null,
    pendingOutboxCount: 0,
    deviceLabel: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const token = await getDeviceToken();
        const tokenSuffix = token ? token.slice(-6) : "none";
        const uiStatus = await fetchUiStatus();
        setOpStatus({
          tokenSuffix,
          storeId: uiStatus.storeId ?? null,
          storeName: uiStatus.storeName ?? null,
          storeCode: uiStatus.storeCode ?? null, // STORECODE-003
          storeActive: uiStatus.storeActive ?? null,
          deviceActive: uiStatus.deviceActive ?? null,
          pendingOutboxCount: uiStatus.pendingOutboxCount ?? 0,
          deviceLabel: uiStatus.deviceId ?? null,
        });
      } catch (e) {
        console.error("[MenuScreen] opStatus fetch failed:", e);
      }
    })();
  }, []);

  // Alias for devInfo used in switch store handler
  const devInfo = opStatus;

  const toggleLanguage = () => {
    const nextLang: SupportedLanguage = language === 'en' ? 'hi' : 'en';
    setLanguage(nextLang);
  };

  const handleSwitchStore = async () => {
    // Check for pending offline data before allowing switch
    const pendingCount = await pendingOutboxCount();

    if (pendingCount > 0) {
      Alert.alert(
        t('menu.unsyncedData'),
        t('menu.unsyncedDataWarning', { count: pendingCount }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('menu.switchAnyway'),
            style: 'destructive',
            onPress: () => proceedWithSwitchStore()
          }
        ]
      );
    } else {
      Alert.alert(
        t('menu.switchStoreConfirm'),
        t('menu.switchStoreWarning'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('menu.switchStoreButton'),
            style: 'destructive',
            onPress: () => proceedWithSwitchStore()
          }
        ]
      );
    }
  };

  const proceedWithSwitchStore = async () => {
    try {
      // Log the switch event before clearing
      void logPosEvent("STORE_SWITCH", {
        previousStoreId: devInfo.storeId,
        nextStoreId: null,
        reason: "manual_switch"
      });

      // Clear all local state
      useCartStore.getState().resetForStore();
      usePurchaseDraftStore.getState().resetForStore();
      useProductsStore.getState().resetForStore();

      // Clear device session
      await clearDeviceSession();

      // Navigate to EnrollDevice and reset navigation stack
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'EnrollDevice' }],
        })
      );
    } catch (error) {
      console.error('[MenuScreen] Switch store failed:', error);
      Alert.alert(t('common.error'), t('errors.unknownError'));
    }
  };

  const goToBills = () => navigation.navigate("SalesHistory");
  const goToOrders = () => navigation.navigate("OrderHistory");
  const goToReorderSettings = () => navigation.navigate("ReorderSettings");
  const goToReorderPolicies = () => navigation.navigate("ReorderPolicies");
  const goToInward = () => navigation.navigate("Inward");
  const goToPurchaseHistory = () => navigation.navigate("PurchaseHistory");
  const goToSalesStatement = () => navigation.navigate("SalesStatement");
  const goToStockStatement = () => navigation.navigate("StockStatement");
  const goToUiShowcase = () => navigation.navigate("UiShowcase");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('menu.title')}</Text>
      </View>

      {/* DEV-057: Operational Status Panel */}
      <View style={styles.statusPanel}>
        <View style={styles.statusHeader}>
          <MaterialCommunityIcons name="chart-donut" size={16} color={theme.colors.primary} />
          <Text style={styles.statusHeaderText}>{t('menu.operationalStatus')}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>
            {opStatus.storeName || t('menu.statusLoading')}
            {opStatus.storeCode ? ` (${opStatus.storeCode})` : ''}
          </Text>
          <View style={[
            styles.statusBadge,
            opStatus.storeActive === true && styles.statusBadgeActive,
            opStatus.storeActive === false && styles.statusBadgeInactive
          ]}>
            <Text style={[
              styles.statusBadgeText,
              opStatus.storeActive === true && styles.statusBadgeTextActive,
              opStatus.storeActive === false && styles.statusBadgeTextInactive
            ]}>
              {opStatus.storeActive === null
                ? t('menu.statusLoading')
                : opStatus.storeActive
                  ? t('menu.statusActive')
                  : t('menu.statusInactive')}
            </Text>
          </View>
        </View>
        {opStatus.deviceLabel && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>
              {t('menu.deviceLabel')}: {opStatus.deviceLabel}
            </Text>
            <View style={[
              styles.statusBadge,
              opStatus.deviceActive === true && styles.statusBadgeActive,
              opStatus.deviceActive === false && styles.statusBadgeInactive
            ]}>
              <Text style={[
                styles.statusBadgeText,
                opStatus.deviceActive === true && styles.statusBadgeTextActive,
                opStatus.deviceActive === false && styles.statusBadgeTextInactive
              ]}>
                {opStatus.deviceActive === null
                  ? t('menu.statusLoading')
                  : opStatus.deviceActive
                    ? t('menu.statusActive')
                    : t('menu.statusBlocked')}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Sync</Text>
          <View style={[
            styles.statusBadge,
            opStatus.pendingOutboxCount === 0 && styles.statusBadgeActive,
            opStatus.pendingOutboxCount > 0 && styles.statusBadgeWarning
          ]}>
            <Text style={[
              styles.statusBadgeText,
              opStatus.pendingOutboxCount === 0 && styles.statusBadgeTextActive,
              opStatus.pendingOutboxCount > 0 && styles.statusBadgeTextWarning
            ]}>
              {opStatus.pendingOutboxCount > 0
                ? t('menu.syncPending', { count: opStatus.pendingOutboxCount })
                : t('menu.syncOk')}
            </Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.menuItem} onPress={goToBills}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name="receipt" size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.salesHistory')}</Text>
          <Text style={styles.menuSubtitle}>{t('menu.salesHistorySubtitle')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <View style={styles.billActions}>
        <Pressable style={styles.billAction} onPress={goToBills}>
          <MaterialCommunityIcons name="printer-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.billActionText}>{t('menu.reprint')}</Text>
        </Pressable>
        <Pressable style={styles.billAction} onPress={goToBills}>
          <MaterialCommunityIcons name="download" size={18} color={theme.colors.primary} />
          <Text style={styles.billActionText}>{t('menu.download')}</Text>
        </Pressable>
        <Pressable style={styles.billAction} onPress={goToBills}>
          <MaterialCommunityIcons name="share-variant" size={18} color={theme.colors.primary} />
          <Text style={styles.billActionText}>{t('menu.share')}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.menuItem} onPress={() => navigation.navigate("BarcodeSheet")}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"barcode" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.barcodeSheets')}</Text>
          <Text style={styles.menuSubtitle}>{t('menu.barcodeSheetsSubtitle')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* V3.0.9 Menu Items - GO-LIVE-002: Conditionally show based on feature flags */}
      {showPurchasingSection && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('menu.purchasing')}</Text>
          </View>

          {buyEnabled && (
            <Pressable style={styles.menuItem} onPress={goToOrders}>
              <View style={styles.menuIcon}>
                <MaterialCommunityIcons name={"clipboard-list" as any} size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>{t('menu.purchaseOrders')}</Text>
                <Text style={styles.menuSubtitle}>{t('menu.purchaseOrdersSubtitle')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
            </Pressable>
          )}

          {reorderEnabled && (
            <>
              <Pressable style={styles.menuItem} onPress={goToReorderSettings}>
                <View style={styles.menuIcon}>
                  <MaterialCommunityIcons name={"cog" as any} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.menuText}>
                  <Text style={styles.menuTitle}>{t('menu.reorderSettings')}</Text>
                  <Text style={styles.menuSubtitle}>{t('menu.reorderSettingsSubtitle')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
              </Pressable>

              <Pressable style={styles.menuItem} onPress={goToReorderPolicies}>
                <View style={styles.menuIcon}>
                  <MaterialCommunityIcons name={"format-list-checks" as any} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.menuText}>
                  <Text style={styles.menuTitle}>{t('menu.reorderPolicies')}</Text>
                  <Text style={styles.menuSubtitle}>{t('menu.reorderPoliciesSubtitle')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
              </Pressable>
            </>
          )}

        </>
      )}

      {/* Stock Inward - ALWAYS visible (essential operation) */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('menu.stockManagement')}</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToInward}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"package-down" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.stockInward')}</Text>
          <Text style={styles.menuSubtitle}>{t('menu.stockInwardSubtitle')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* Reports Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('menu.reports')}</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToPurchaseHistory}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"history" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.purchaseHistory')}</Text>
          <Text style={styles.menuSubtitle}>{t('menu.purchaseHistorySubtitle')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <Pressable style={styles.menuItem} onPress={goToSalesStatement}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"chart-line" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.salesStatement')}</Text>
          <Text style={styles.menuSubtitle}>{t('menu.salesStatementSubtitle')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <Pressable style={styles.menuItem} onPress={goToStockStatement}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"package-variant" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.stockStatement')}</Text>
          <Text style={styles.menuSubtitle}>{t('menu.stockStatementSubtitle')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* Settings Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('menu.settings')}</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={toggleLanguage}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"translate" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.language')} / भाषा</Text>
          <Text style={styles.menuSubtitle}>
            {LANGUAGE_NAMES[language]}
          </Text>
        </View>
        <View style={styles.languageToggle}>
          <Text style={[
            styles.langOption,
            language === 'en' && styles.langOptionActive
          ]}>EN</Text>
          <Text style={styles.langDivider}>|</Text>
          <Text style={[
            styles.langOption,
            language === 'hi' && styles.langOptionActive
          ]}>हि</Text>
        </View>
      </Pressable>

      <Pressable style={styles.menuItem} onPress={handleSwitchStore}>
        <View style={[styles.menuIcon, styles.menuIconDanger]}>
          <MaterialCommunityIcons name={"swap-horizontal" as any} size={20} color={theme.colors.error} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>{t('menu.switchStore')}</Text>
          <Text style={styles.menuSubtitle}>{t('menu.switchStoreSubtitle')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* Developer/QA Section - Only visible in dev or with QA flag */}
      {showQaMenu && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('menu.developerQa')}</Text>
          </View>

          <Pressable style={styles.menuItem} onPress={goToUiShowcase}>
            <View style={[styles.menuIcon, styles.menuIconQa]}>
              <MaterialCommunityIcons name={"layers-outline" as any} size={20} color={theme.colors.warning} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{t('menu.uiShowcase')}</Text>
              <Text style={styles.menuSubtitle}>{t('menu.uiShowcaseSubtitle')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </>
      )}

      {/* Build Info - DEV only */}
      {__DEV__ && (
        <View style={[styles.buildInfo, BUILD_INFO.isDirty && styles.buildInfoDirty]}>
          <Text style={styles.buildInfoLabel}>
            Build Info {BUILD_INFO.isDirty ? "(DIRTY)" : "(CLEAN)"}
          </Text>
          <Text style={[styles.buildInfoText, styles.buildInfoFingerprint]}>
            {BUILD_INFO.fingerprint}
          </Text>
          <Text style={styles.buildInfoText}>
            Branch: {BUILD_INFO.branch} | SHA: {BUILD_INFO.gitSha}
          </Text>
          {BUILD_INFO.isDirty && (
            <Text style={styles.buildInfoDirtyText}>
              {BUILD_INFO.modifiedCount} modified, {BUILD_INFO.untrackedCount} untracked
            </Text>
          )}
          <Text style={styles.buildInfoText}>Built: {BUILD_INFO.buildTime}</Text>
          <Text style={styles.buildInfoText}>API: {API_BASE_URL}</Text>
          <View style={styles.devInfoSection}>
            <Text style={styles.devInfoLabel}>Device Info</Text>
            <Text style={styles.buildInfoText}>Token: ...{devInfo.tokenSuffix}</Text>
            <Text style={styles.buildInfoText}>Store: {devInfo.storeName ?? "null"}</Text>
            <Text style={styles.buildInfoText}>StoreId: {devInfo.storeId ?? "null"}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    paddingVertical: 8,
    alignItems: "center"
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  statusPanel: {
    marginTop: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  statusHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceAlt,
  },
  statusBadgeActive: {
    backgroundColor: theme.colors.successSoft,
  },
  statusBadgeInactive: {
    backgroundColor: theme.colors.errorSoft,
  },
  statusBadgeWarning: {
    backgroundColor: theme.colors.warningSoft,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  statusBadgeTextActive: {
    color: theme.colors.success,
  },
  statusBadgeTextInactive: {
    color: theme.colors.error,
  },
  statusBadgeTextWarning: {
    color: theme.colors.warning,
  },
  menuItem: {
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center"
  },
  menuText: {
    flex: 1
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  menuSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textSecondary
  },
  billActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  billAction: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    alignItems: "center",
    gap: 6
  },
  billActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 4,
    paddingHorizontal: 4
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  menuIconQa: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warning + "15"
  },
  menuIconDanger: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.error + "15"
  },
  languageToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4
  },
  langOption: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    paddingHorizontal: 4
  },
  langOptionActive: {
    color: theme.colors.primary
  },
  langDivider: {
    color: theme.colors.border,
    fontSize: 14
  },
  buildInfo: {
    marginTop: 32,
    padding: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: "dashed"
  },
  buildInfoDirty: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warning + "10"
  },
  buildInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  buildInfoFingerprint: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 4
  },
  buildInfoText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: theme.colors.textSecondary,
    marginTop: 2
  },
  buildInfoDirtyText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: theme.colors.warning,
    marginTop: 2
  },
  devInfoSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  devInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
    marginBottom: 4,
    textTransform: "uppercase"
  }
});
