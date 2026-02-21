// T-108: Brand identity header with shortmark icon
import React, { useCallback, useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, Pressable, View, Alert, RefreshControl } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { theme } from "../theme";
import { isQaMenuEnabled } from "./UiShowcaseScreen";
import { useSettingsStore } from "../stores/settingsStore";
import { useStaffSessionStore } from "../stores/staffSessionStore";
import { useCartStore } from "../stores/cartStore";
import { usePurchaseDraftStore } from "../stores/purchaseDraftStore";
import { useProductsStore } from "../stores/productsStore";
import { LANGUAGE_NAMES, type SupportedLanguage } from "../i18n";
import { BUILD_INFO, API_BASE_URL } from "../config/api";
import { getDeviceToken, clearDeviceSession } from "../services/deviceSession";
import { fetchUiStatus, type UiStatusResponse } from "../services/api/uiStatusApi";
import { getDailySummary, type DailySummary } from "../services/api/dailySummaryApi";
import { logPosEvent } from "../services/cloudEventLogger";
import { pendingOutboxCount } from "../services/offline/outbox";
import { syncOutbox } from "../services/offline/sync";
import { subscribeNetworkStatus } from "../services/networkStatus";
import { formatMoney } from "../utils/money";
import { printerService, type PrinterStatus } from "../services/printerService";
import { asError } from "../utils/errorUtils";
import BrandShortmark from "../components/BrandShortmark";

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
  Buy: undefined; // AUD-POS-NAV-002: Wire BuyScreen to navigation
  BnplDues: undefined; // SM-020: BNPL Dues screen
  Khata: undefined; // T-154: Khata (Credit Book) screen
  CustomerList: undefined; // T-155: Customer Profiles screen
  DailyClosing: undefined; // T-191: Daily Closing / Z-Report screen
  Shift: undefined; // T-192: Shift Management screen
  OverdueDues: undefined; // T-193: Overdue DUE payments dunning
  Return: undefined; // T-194: Return/Refund processing
  CustomerManagement: undefined; // T-196: Customer management
  OpeningStock: undefined; // T-198: Opening stock ledger
  DailyReport: undefined; // T-199: Daily closing report
  PrinterSettings: undefined; // T-195: Thermal printer configuration
  ChatList: undefined; // T-294: Chat list screen
  AIInsights: undefined; // T-307: AI Insights screen
  BulkPurchaseCredit: undefined; // T-288: Bulk purchase credit screen
  Help: undefined; // HELP-001: Help & Support screen
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

  // TICKET-002 + GL-RJ-009: Daily Summary state with enhanced error handling
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // GO-LIVE-250: Yesterday's summary for trend comparison
  const [yesterdaySummary, setYesterdaySummary] = useState<DailySummary | null>(null);

  // GO-LIVE-236: Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

  // GO-LIVE-244: Network status indicator
  const [isOnline, setIsOnline] = useState(true);

  // GO-LIVE-237: Sync state
  const [syncing, setSyncing] = useState(false);

  // POS-PRINT-002: Printer connectivity status
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>({ connected: false, paperAvailable: true });

  const loadDailySummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      // GO-LIVE-250: Fetch both today and yesterday for trend comparison
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const [summary, yesterdayData] = await Promise.all([
        getDailySummary(),
        getDailySummary(yesterdayStr).catch(() => null), // Don't fail if yesterday fails
      ]);
      setDailySummary(summary);
      setYesterdaySummary(yesterdayData);
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[MenuScreen] dailySummary fetch failed:", e);
      setSummaryError(e.message || "Failed to load summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  // GO-LIVE-244: Subscribe to network status
  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((online) => {
      setIsOnline(online);
    });
    return () => unsubscribe();
  }, []);

  // GO-LIVE-236: Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadDailySummary(),
        (async () => {
          const token = await getDeviceToken();
          const tokenSuffix = token ? token.slice(-6) : "none";
          const uiStatus = await fetchUiStatus();
          setOpStatus({
            tokenSuffix,
            storeId: uiStatus.storeId ?? null,
            storeName: uiStatus.storeName ?? null,
            storeCode: uiStatus.storeCode ?? null,
            storeActive: uiStatus.storeActive ?? null,
            deviceActive: uiStatus.deviceActive ?? null,
            pendingOutboxCount: uiStatus.pendingOutboxCount ?? 0,
            deviceLabel: uiStatus.deviceId ?? null,
          });
        })(),
      ]);
    } catch (e) {
      console.error("[MenuScreen] refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // GO-LIVE-237: Manual sync trigger
  const handleSync = useCallback(async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      await syncOutbox();
      const count = await pendingOutboxCount();
      setOpStatus((prev) => ({ ...prev, pendingOutboxCount: count }));
      if (count === 0) {
        Alert.alert(t('menu.syncComplete', { defaultValue: "Sync Complete" }), t('menu.allDataSynced', { defaultValue: "All data has been synced." }));
      }
    } catch (_e: unknown) {
    const e = asError(_e);
      console.error("[MenuScreen] sync failed:", e);
      Alert.alert(t('menu.syncFailed', { defaultValue: "Sync Failed" }), e.message || "Please try again.");
    } finally {
      setSyncing(false);
    }
  }, [syncing, isOnline, t]);

  useEffect(() => {
    void loadDailySummary();
    // POS-PRINT-002: Check printer connectivity on menu mount
    printerService.checkConnectivity().then(setPrinterStatus);
  }, []);

  // POS-PRINT-002: Test printer handler
  const handleTestPrint = useCallback(async () => {
    try {
      await printerService.testPrint();
      setPrinterStatus(printerService.getStatus());
      Alert.alert(t('menu.printerOk', 'Printer OK'), t('menu.testPrintSuccess', 'Test page sent successfully.'));
    } catch {
      setPrinterStatus(printerService.getStatus());
      Alert.alert(t('menu.printerError', 'Printer Error'), t('menu.testPrintFailed', 'Could not print test page.'));
    }
  }, [t]);

  // GO-LIVE-250: Calculate trend percentage and direction
  const getTrend = (today: number, yesterday: number | undefined): { percent: number; isUp: boolean } | null => {
    if (yesterday === undefined || yesterday === 0) return null;
    const percent = ((today - yesterday) / yesterday) * 100;
    return { percent: Math.abs(percent), isUp: percent >= 0 };
  };

  const renderTrend = (today: number, yesterday: number | undefined) => {
    const trend = getTrend(today, yesterday);
    if (!trend) return null;
    return (
      <View style={[styles.trendBadge, trend.isUp ? styles.trendBadgeUp : styles.trendBadgeDown]}>
        <MaterialCommunityIcons
          name={trend.isUp ? "trending-up" : "trending-down"}
          size={10}
          color={trend.isUp ? theme.colors.success : theme.colors.error}
        />
        <Text style={[styles.trendText, trend.isUp ? styles.trendTextUp : styles.trendTextDown]}>
          {trend.percent.toFixed(0)}%
        </Text>
      </View>
    );
  };

  // Alias for devInfo used in switch store handler
  const devInfo = opStatus;

  // SA-P1-001: Staff session for Switch Staff
  const staffSession = useStaffSessionStore((s) => s.session);
  const clearStaffSession = useStaffSessionStore((s) => s.clearSession);

  const handleSwitchStaff = () => {
    Alert.alert(
      "Switch Staff",
      `Logged in as ${staffSession?.name ?? "Unknown"} (${staffSession?.role ?? ""}). Switch to a different staff member?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          style: "destructive",
          onPress: () => clearStaffSession(),
        },
      ]
    );
  };

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
  const goToBnplDues = () => navigation.navigate("BnplDues"); // SM-020
  const goToKhata = () => navigation.navigate("Khata"); // T-154
  const goToCustomerList = () => navigation.navigate("CustomerList"); // T-155
  const goToDailyClosing = () => navigation.navigate("DailyClosing"); // T-191
  const goToShift = () => navigation.navigate("Shift"); // T-192
  const goToOverdueDues = () => navigation.navigate("OverdueDues"); // T-193
  const goToReturn = () => navigation.navigate("Return"); // T-194
  const goToCustomerManagement = () => navigation.navigate("CustomerManagement"); // T-196
  const goToOpeningStock = () => navigation.navigate("OpeningStock"); // T-198
  const goToDailyReport = () => navigation.navigate("DailyReport"); // T-199
  const goToPrinterSettings = () => navigation.navigate("PrinterSettings"); // T-195
  const goToChat = () => navigation.navigate("ChatList"); // T-294
  const goToAIInsights = () => navigation.navigate("AIInsights"); // T-307
  const goToBulkPurchaseCredit = () => navigation.navigate("BulkPurchaseCredit"); // T-288
  const goToHelp = () => navigation.navigate("Help"); // HELP-001

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        // GO-LIVE-236: Pull-to-refresh for daily summary
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* T-108: Brand identity header with shortmark icon */}
      <View style={styles.header}>
        <View style={styles.brandHeader}>
          <BrandShortmark
            size={24}
            backgroundColor={theme.colors.primary}
            lineColor={theme.colors.textInverse}
            dotColor={theme.colors.textInverse}
          />
          <Text style={styles.brandPillText}>SuperMandi</Text>
          <Text style={styles.menuLabel}>{t('menu.title')}</Text>
        </View>
        {/* GO-LIVE-244: Offline indicator */}
        {!isOnline && (
          <View style={styles.offlineIndicator}>
            <MaterialCommunityIcons name="wifi-off" size={14} color={theme.colors.error} />
            <Text style={styles.offlineText}>{t('menu.offline', { defaultValue: "Offline" })}</Text>
          </View>
        )}
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
          <View style={styles.syncRow}>
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
            {/* GO-LIVE-237: Manual sync button */}
            {opStatus.pendingOutboxCount > 0 && isOnline && (
              <Pressable
                onPress={handleSync}
                style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                disabled={syncing}
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name={syncing ? "loading" : "sync"}
                  size={16}
                  color={syncing ? theme.colors.textTertiary : theme.colors.primary}
                />
                <Text style={[styles.syncButtonText, syncing && styles.syncButtonTextDisabled]}>
                  {syncing ? t('menu.syncing', { defaultValue: "Syncing..." }) : t('menu.syncNow', { defaultValue: "Sync Now" })}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* POS-002 + GL-RJ-009: Daily Summary Card - Enhanced with error handling and refresh */}
      <Pressable style={styles.summaryCard} onPress={goToSalesStatement}>
        <View style={styles.statusHeader}>
          <MaterialCommunityIcons name="chart-bar" size={16} color={theme.colors.primary} />
          <Text style={styles.statusHeaderText}>{t('menu.todaysSales', { defaultValue: "Today's Sales" })}</Text>
          {/* GL-RJ-009: Refresh button */}
          <Pressable
            onPress={(e) => { e.stopPropagation(); void loadDailySummary(); }}
            style={styles.summaryRefresh}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={summaryLoading ? "loading" : "refresh"}
              size={16}
              color={theme.colors.textTertiary}
            />
          </Pressable>
          <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textTertiary} />
        </View>
        {summaryLoading ? (
          <Text style={styles.summaryLoading}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
        ) : summaryError ? (
          /* GL-RJ-009: Error state with retry */
          <View style={styles.summaryErrorContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color={theme.colors.error} />
            <Text style={styles.summaryErrorText}>{summaryError}</Text>
            <Pressable style={styles.summaryRetryButton} onPress={loadDailySummary}>
              <Text style={styles.summaryRetryText}>{t('common.retry', { defaultValue: 'Retry' })}</Text>
            </Pressable>
          </View>
        ) : dailySummary ? (
          <View style={styles.summaryGrid}>
            {/* GO-LIVE-250: Added trend indicators */}
            <View style={styles.summaryItem}>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{formatMoney(dailySummary.totalSales)}</Text>
                {renderTrend(dailySummary.totalSales, yesterdaySummary?.totalSales)}
              </View>
              <Text style={styles.summaryLabel}>{t('menu.totalSales', { defaultValue: 'Total Sales' })}</Text>
            </View>
            <View style={styles.summaryItem}>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{dailySummary.totalBills}</Text>
                {renderTrend(dailySummary.totalBills, yesterdaySummary?.totalBills)}
              </View>
              <Text style={styles.summaryLabel}>{t('menu.bills', { defaultValue: 'Bills' })}</Text>
            </View>
            <View style={styles.summaryItem}>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{formatMoney(dailySummary.averageBillValue)}</Text>
                {renderTrend(dailySummary.averageBillValue, yesterdaySummary?.averageBillValue)}
              </View>
              <Text style={styles.summaryLabel}>{t('menu.avgBill', { defaultValue: 'Avg Bill' })}</Text>
            </View>
            <View style={styles.summaryItem}>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{dailySummary.itemsSold}</Text>
                {renderTrend(dailySummary.itemsSold, yesterdaySummary?.itemsSold)}
              </View>
              <Text style={styles.summaryLabel}>{t('menu.itemsSold', { defaultValue: 'Items Sold' })}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.summaryLoading}>{t('menu.noSalesYet', { defaultValue: 'No sales yet today' })}</Text>
        )}
        {dailySummary && dailySummary.totalSales > 0 && (
          <View style={styles.paymentBreakdown}>
            <Text style={styles.breakdownTitle}>{t('menu.paymentModes', { defaultValue: 'Payment Modes' })}</Text>
            <View style={styles.breakdownRow}>
              {dailySummary.paymentBreakdown.cash > 0 && (
                <Text style={styles.breakdownItem}>Cash: {formatMoney(dailySummary.paymentBreakdown.cash)}</Text>
              )}
              {dailySummary.paymentBreakdown.upi > 0 && (
                <Text style={styles.breakdownItem}>UPI: {formatMoney(dailySummary.paymentBreakdown.upi)}</Text>
              )}
              {dailySummary.paymentBreakdown.card > 0 && (
                <Text style={styles.breakdownItem}>Card: {formatMoney(dailySummary.paymentBreakdown.card)}</Text>
              )}
            </View>
          </View>
        )}
      </Pressable>

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

      {/* T-194: Return/Refund Processing */}
      <Pressable style={styles.menuItem} onPress={goToReturn}>
        <View style={[styles.menuIcon, styles.menuIconDanger]}>
          <MaterialCommunityIcons name={"rotate-left" as any} size={20} color={theme.colors.error} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Return / Refund</Text>
          <Text style={styles.menuSubtitle}>Process returns and issue refunds</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* POS-PRINT-002: Printer status indicator */}
      <Pressable style={styles.printerStatusRow} onPress={handleTestPrint}>
        <MaterialCommunityIcons
          name={printerStatus.connected ? "printer-check" : "printer-alert"}
          size={16}
          color={printerStatus.connected ? theme.colors.success : theme.colors.error}
        />
        <Text style={[styles.printerStatusText, { color: printerStatus.connected ? theme.colors.success : theme.colors.error }]}>
          {printerStatus.connected ? t('menu.printerReady', 'Printer Ready') : t('menu.printerUnavailable', 'Printer Unavailable')}
        </Text>
        <Text style={styles.printerTestLink}>{t('menu.testPrint', 'Test')}</Text>
      </Pressable>

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
            <>
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

              {/* AUD-POS-NAV-002: Wire BuyScreen to navigation */}
              <Pressable style={styles.menuItem} onPress={() => navigation.navigate("Buy")}>
                <View style={styles.menuIcon}>
                  <MaterialCommunityIcons name={"storefront-outline" as any} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.menuText}>
                  <Text style={styles.menuTitle}>{t('menu.productCatalog', { defaultValue: 'Product Catalog' })}</Text>
                  <Text style={styles.menuSubtitle}>{t('menu.productCatalogSubtitle', { defaultValue: 'Browse and add products to purchase' })}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
              </Pressable>

              {/* SM-020: BNPL Dues Screen */}
              <Pressable style={styles.menuItem} onPress={goToBnplDues}>
                <View style={[styles.menuIcon, styles.menuIconBnpl]}>
                  <MaterialCommunityIcons name={"clock-outline" as any} size={20} color={theme.colors.accent} />
                </View>
                <View style={styles.menuText}>
                  <Text style={styles.menuTitle}>{t('menu.bnplDues', { defaultValue: 'BNPL Dues' })}</Text>
                  <Text style={styles.menuSubtitle}>{t('menu.bnplDuesSubtitle', { defaultValue: 'View and pay pending BNPL dues' })}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
              </Pressable>
            </>
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

      {/* T-198: Opening Stock Ledger */}
      <Pressable style={styles.menuItem} onPress={goToOpeningStock}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"package-variant-plus" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Opening Stock</Text>
          <Text style={styles.menuSubtitle}>Initialize stock for new products</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-154 / T-155: Customers & Credit Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Customers & Credit</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToKhata}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"book-open-variant" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Khata (Credit Book)</Text>
          <Text style={styles.menuSubtitle}>Track credit and payments</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <Pressable style={styles.menuItem} onPress={goToCustomerList}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"account-group-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Customers</Text>
          <Text style={styles.menuSubtitle}>Customer profiles and purchase history</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-196: Customer Management */}
      <Pressable style={styles.menuItem} onPress={goToCustomerManagement}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"account-details-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Customer Management</Text>
          <Text style={styles.menuSubtitle}>Add, edit, and manage customer profiles</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-193: Overdue Dues Collection */}
      <Pressable style={styles.menuItem} onPress={goToOverdueDues}>
        <View style={[styles.menuIcon, styles.menuIconDanger]}>
          <MaterialCommunityIcons name={"alert-circle-outline" as any} size={20} color={theme.colors.error} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Overdue Dues</Text>
          <Text style={styles.menuSubtitle}>Collect overdue DUE payments and send reminders</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-307: AI & Intelligence Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>AI & Intelligence</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToAIInsights}>
        <View style={[styles.menuIcon, styles.menuIconAi]}>
          <MaterialCommunityIcons name={"brain" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>AI Insights</Text>
          <Text style={styles.menuSubtitle}>Alerts, forecasts, slow movers, expiry tracking</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-288: Bulk Purchase Credit */}
      <Pressable style={styles.menuItem} onPress={goToBulkPurchaseCredit}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"cash-multiple" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Bulk Purchase Credit</Text>
          <Text style={styles.menuSubtitle}>Browse and apply for credit offers</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-294: Chat / Messaging Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Messages</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToChat}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"chat-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Chat</Text>
          <Text style={styles.menuSubtitle}>Message suppliers and support</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <Pressable
        style={styles.menuItem}
        onPress={() => {
          const supportPhone = process.env.EXPO_PUBLIC_SUPPORT_PHONE;
          if (!supportPhone) {
            Alert.alert("Support Unavailable", "Support phone not configured. Please contact support via email.");
            return;
          }
          const message = encodeURIComponent(
            `Hi SuperMandi Support,\n\nStore: ${opStatus.storeName || "N/A"}\nDevice: ${opStatus.deviceLabel || "N/A"}\n\nI need help with: `
          );
          // wa.me universal link works on both Android and iOS
          const url = `https://wa.me/${supportPhone}?text=${message}`;
          Linking.openURL(url).catch(() => {
            Alert.alert("WhatsApp Not Found", "Please install WhatsApp to use this feature.");
          });
        }}
      >
        <View style={[styles.menuIcon, styles.menuIconWhatsapp]}>
          <MaterialCommunityIcons name={"whatsapp" as any} size={20} color="#25D366" />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>WhatsApp Support</Text>
          <Text style={styles.menuSubtitle}>Chat with SuperMandi support team</Text>
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

      {/* T-199: Daily Report */}
      <Pressable style={styles.menuItem} onPress={goToDailyReport}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"file-chart-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Daily Report</Text>
          <Text style={styles.menuSubtitle}>View, print, and share daily sales report</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-191 / T-192: Operations Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Operations</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToDailyClosing}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"clipboard-check-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Daily Closing</Text>
          <Text style={styles.menuSubtitle}>Z-Report and cash reconciliation</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <Pressable style={styles.menuItem} onPress={goToShift}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"clock-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Shift Management</Text>
          <Text style={styles.menuSubtitle}>Start, end, and view shift history</Text>
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

      {/* SA-P1-001: Switch Staff */}
      <Pressable style={styles.menuItem} onPress={handleSwitchStaff}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"account-switch" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Switch Staff</Text>
          <Text style={styles.menuSubtitle}>
            {staffSession ? `${staffSession.name} (${staffSession.role})` : "Not logged in"}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* T-195: Printer Settings */}
      <Pressable style={styles.menuItem} onPress={goToPrinterSettings}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"printer-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Printer Settings</Text>
          <Text style={styles.menuSubtitle}>Paper width, auto-print, copies</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* HELP-001: Help & Support */}
      <Pressable style={styles.menuItem} onPress={goToHelp}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"help-circle-outline" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Help &amp; Support</Text>
          <Text style={styles.menuSubtitle}>Contact us, quick links</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
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
            <Text style={styles.buildInfoText}>StoreCode: {devInfo.storeCode ?? "null"}</Text>
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
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  // T-108: Brand identity header styles
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandPillText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textInverse,
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    lineHeight: 18,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  // GO-LIVE-244: Offline indicator styles
  offlineIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.errorSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.error,
  },
  // GO-LIVE-237: Sync button styles
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.primarySoft,
  },
  syncButtonDisabled: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  syncButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  syncButtonTextDisabled: {
    color: theme.colors.textTertiary,
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
  // POS-PRINT-002: Printer status row styles
  printerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  printerStatusText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  printerTestLink: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
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
  // SM-020: BNPL menu icon style
  menuIconBnpl: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent + "15"
  },
  menuIconAi: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "15"
  },
  menuIconWhatsapp: {
    borderColor: "#25D366",
    backgroundColor: "#25D366" + "15",
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
  },
  // TICKET-002: Daily Summary Card styles
  summaryCard: {
    marginTop: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  summaryItem: {
    width: "50%",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  summaryLoading: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    paddingVertical: 16,
    textAlign: "center",
  },
  paymentBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  breakdownTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  breakdownItem: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  // GL-RJ-009: Summary refresh and error styles
  summaryRefresh: {
    marginLeft: 'auto',
    padding: 4,
  },
  summaryErrorContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  summaryErrorText: {
    fontSize: 13,
    color: theme.colors.error,
    textAlign: 'center',
  },
  summaryRetryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  summaryRetryText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  // GO-LIVE-250: Trend indicator styles
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  trendBadgeUp: {
    backgroundColor: theme.colors.successSoft,
  },
  trendBadgeDown: {
    backgroundColor: theme.colors.errorSoft,
  },
  trendText: {
    fontSize: 9,
    fontWeight: '600',
  },
  trendTextUp: {
    color: theme.colors.success,
  },
  trendTextDown: {
    color: theme.colors.error,
  },
});
