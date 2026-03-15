// T-108: Brand identity header with shortmark icon
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TextInput, Pressable, View, Alert, RefreshControl } from "react-native";
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../theme";
import { isQaMenuEnabled } from "./UiShowcaseScreen";
import { useSettingsStore } from "../stores/settingsStore";
import { useStaffSessionStore } from "../stores/staffSessionStore";
import { useCartStore } from "../stores/cartStore";
import { usePurchaseCartStore } from "../stores/purchaseCartStore";
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
  SalesHistory: { action?: 'reprint' | 'download' | 'share' } | undefined; // STG-181: Optional action param
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

// STG-147: Title case helper for store name display
const toTitleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export default function MenuScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const showQaMenu = isQaMenuEnabled();
  // LIVE.POS.THEME.TOKENS_BRAND_PARITY.001: Dynamic theme colors
  const tc = useThemeColors();
  // STG-285: Dynamic styles for dark mode support
  const styles = useMemo(() => createStyles(tc), [tc]);
  // STG-179: Show user-friendly version (e.g. "v1.2.3") instead of raw SHA
  const buildVersionLabel = (BUILD_INFO as any).version
    ? `v${String((BUILD_INFO as any).version)}`
    : (BUILD_INFO as any).gitSha
      ? `v${String((BUILD_INFO as any).gitSha).slice(0, 7)}`
      : "unknown";
  const buildShaLabel = buildVersionLabel;
  const buildTimeLabel = String((BUILD_INFO as any).buildTime || (BUILD_INFO as any).buildDate || "unknown");

  // GO-LIVE-002: Feature flags for section visibility
  const buyEnabled = useSettingsStore((state) => state.buyEnabled);
  const reorderEnabled = useSettingsStore((state) => state.reorderEnabled);
  const showPurchasingSection = buyEnabled || reorderEnabled;

  // I18N-002: Language preference
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  // LIVE.POS.THEME.RUNTIME_TOGGLE_PARITY.001: Theme toggle
  const themeMode = useSettingsStore((state) => state.themeMode);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);

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
          pendingOutboxCount: await pendingOutboxCount(),
          deviceLabel: uiStatus.deviceId ?? null,
        });
      } catch (e) {
        if (__DEV__) console.error("[MenuScreen] opStatus fetch failed:", e);
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

  // STG-148/STG-256: Collapsible status panel state
  const [statusCollapsed, setStatusCollapsed] = useState(false);

  // STG-169: Search bar state
  const [searchQuery, setSearchQuery] = useState('');

  // STG-159: Collapsible sections state (keyed by section name)
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});

  // STG-161/STG-252: Unread chat count badge (default 0, will be fetched from API later)
  const [unreadChatCount] = useState(0);

  // STG-251: Daily closing pending badge (default false, TODO: integrate with API)
  const [dailyClosingDone] = useState(false);

  const loadDailySummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      // GO-LIVE-250: Fetch both today and yesterday for trend comparison
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

      const [summary, yesterdayData] = await Promise.all([
        getDailySummary(),
        getDailySummary(yesterdayStr).catch(() => null), // Don't fail if yesterday fails
      ]);
      setDailySummary(summary);
      setYesterdaySummary(yesterdayData);
    } catch (_e: unknown) {
    const e = asError(_e);
      if (__DEV__) console.error("[MenuScreen] dailySummary fetch failed:", e);
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

  // STG-182: Haptic feedback wrapper for menu item presses
  const hapticPress = useCallback((fn: () => void) => () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
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
            pendingOutboxCount: await pendingOutboxCount(),
            deviceLabel: uiStatus.deviceId ?? null,
          });
        })(),
      ]);
    } catch (e) {
      if (__DEV__) console.error("[MenuScreen] refresh failed:", e);
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
        Alert.alert(t('menu.syncComplete'), t('menu.allDataSynced'));
      }
    } catch (_e: unknown) {
    const e = asError(_e);
      if (__DEV__) console.error("[MenuScreen] sync failed:", e);
      Alert.alert(t('menu.syncFailed'), e.message || t('menu.syncFailedRetry'));
    } finally {
      setSyncing(false);
    }
  }, [syncing, isOnline, t]);

  useEffect(() => {
    void loadDailySummary();
    // POS-PRINT-002: Check printer connectivity on menu mount
    printerService.checkConnectivity().then(setPrinterStatus).catch(() => {});
  }, []);

  // POS-PRINT-002: Test printer handler
  const handleTestPrint = useCallback(async () => {
    try {
      await printerService.testPrint();
      setPrinterStatus(printerService.getStatus());
      Alert.alert(t('menu.printerOk'), t('menu.testPrintSuccess'));
    } catch {
      setPrinterStatus(printerService.getStatus());
      Alert.alert(t('menu.printerError'), t('menu.testPrintFailed'));
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
      <View style={styles.trendContainer}>
        <View style={[styles.trendBadge, trend.isUp ? styles.trendBadgeUp : styles.trendBadgeDown]}>
          <MaterialCommunityIcons
            name={trend.isUp ? "trending-up" : "trending-down"}
            size={10}
            color={trend.isUp ? tc.success : tc.error}
          />
          {/* STG-187: Cap trend display at 999%+ */}
          <Text style={[styles.trendText, trend.isUp ? styles.trendTextUp : styles.trendTextDown]}>
            {trend.percent > 999 ? '999%+' : trend.percent.toFixed(0) + '%'}
          </Text>
        </View>
        {/* STG-149: Comparison period label */}
        <Text style={styles.trendPeriodLabel}>{t('menu.vsYesterday')}</Text>
      </View>
    );
  };

  // STG-159: Toggle section collapse
  const toggleSection = useCallback((section: string) => {
    setSectionCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // STG-169: Search filter helper — checks if a text matches the search query
  const matchesSearch = useCallback((text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  }, [searchQuery]);

  // STG-159: Collapsible section header renderer
  const renderSectionHeader = useCallback((sectionKey: string, title: string) => {
    const isCollapsed = sectionCollapsed[sectionKey] ?? false;
    return (
      <Pressable
        style={styles.collapsibleSectionHeader}
        onPress={() => toggleSection(sectionKey)}
        accessibilityRole="button"
        accessibilityLabel={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <MaterialCommunityIcons
          name={isCollapsed ? "chevron-right" : "chevron-down"}
          size={16}
          color={tc.textSecondary}
        />
      </Pressable>
    );
  }, [sectionCollapsed, toggleSection, styles, tc]);

  // STG-159: Check if a section is collapsed
  const isSectionCollapsed = useCallback((sectionKey: string) => {
    return sectionCollapsed[sectionKey] ?? false;
  }, [sectionCollapsed]);

  // Alias for devInfo used in switch store handler
  const devInfo = opStatus;

  // SA-P1-001: Staff session for Switch Staff
  const staffSession = useStaffSessionStore((s) => s.session);
  const clearStaffSession = useStaffSessionStore((s) => s.clearSession);

  const handleSwitchStaff = () => {
    Alert.alert(
      t('menu.switchStaffTitle'),
      t('menu.switchStaffMessage', { name: staffSession?.name ?? "Unknown", role: staffSession?.role ?? "" }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('menu.switchButton'),
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
      usePurchaseCartStore.getState().resetForStore(); // ISSUE-125
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
      if (__DEV__) console.error('[MenuScreen] Switch store failed:', error);
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
      style={[styles.container, { backgroundColor: tc.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
      scrollIndicatorInsets={{ right: 1 }}
      refreshControl={
        // GO-LIVE-236: Pull-to-refresh for daily summary
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[tc.primary]}
          tintColor={tc.primary}
        />
      }
    >
      {/* T-108: Brand identity header with shortmark icon */}
      <View style={styles.header}>
        <View style={styles.brandHeader}>
          <BrandShortmark
            size={24}
            backgroundColor={tc.primary}
            lineColor={tc.textInverse}
            dotColor={tc.textInverse}
          />
          {/* STG-162: Removed redundant "Menu" title label — keep only brand pill */}
          <Text style={styles.brandPillText}>SuperMandi</Text>
        </View>
        {/* GO-LIVE-244: Offline indicator */}
        {!isOnline && (
          <View style={styles.offlineIndicator}>
            <MaterialCommunityIcons name="wifi-off" size={14} color={tc.error} />
            <Text style={styles.offlineText}>{t('menu.offline')}</Text>
          </View>
        )}
      </View>

      {/* STG-169: Search bar for filtering menu items */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={18} color={tc.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('menu.searchPlaceholder')}
          placeholderTextColor={tc.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search menu items"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <MaterialCommunityIcons name="close-circle" size={16} color={tc.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* DEV-057: Operational Status Panel — STG-148/STG-256: Collapsible with tap toggle */}
      <View style={styles.statusPanel}>
        <Pressable
          style={styles.statusHeader}
          onPress={() => setStatusCollapsed((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={statusCollapsed ? "Expand operational status" : "Collapse operational status"}
        >
          <MaterialCommunityIcons name="chart-donut" size={16} color={tc.primary} />
          <Text style={styles.statusHeaderText}>{t('menu.operationalStatus')}</Text>
          <View style={styles.statusCollapseToggle}>
            <MaterialCommunityIcons
              name={statusCollapsed ? "chevron-right" : "chevron-down"}
              size={16}
              color={tc.textSecondary}
            />
          </View>
        </Pressable>
        {!statusCollapsed && (
          <>
            <View style={styles.statusRow}>
              {/* STG-147: Apply toTitleCase to store name */}
              <Text style={styles.statusLabel}>
                {opStatus.storeName ? toTitleCase(opStatus.storeName) : t('menu.statusLoading')}
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
            {/* STG-146: Show friendly device label (last 6 chars) instead of raw UUID */}
            {opStatus.deviceLabel && (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>
                  {t('menu.deviceLabel')}: Device-{opStatus.deviceLabel.slice(-6).toUpperCase()}
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
              <Text style={styles.statusLabel}>{t('menu.syncLabel')}</Text>
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
                    accessibilityLabel={syncing ? "Syncing data" : "Sync pending changes now"}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons
                      name={syncing ? "loading" : "sync"}
                      size={16}
                      color={syncing ? tc.textTertiary : tc.primary}
                    />
                    <Text style={[styles.syncButtonText, syncing && styles.syncButtonTextDisabled]}>
                      {syncing ? t('menu.syncing') : t('menu.syncNow')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </>
        )}
      </View>

      {/* POS-002 + GL-RJ-009: Daily Summary Card - Enhanced with error handling and refresh */}
      <View style={styles.summaryCard}>
        <View style={styles.statusHeader}>
          <MaterialCommunityIcons name="chart-bar" size={16} color={tc.primary} />
          <Text style={styles.statusHeaderText}>{t('menu.todaysSales')}</Text>
          <Pressable
            onPress={() => { void loadDailySummary(); }}
            style={styles.summaryRefresh}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh daily summary"
          >
            <MaterialCommunityIcons
              name={summaryLoading ? "loading" : "refresh"}
              size={16}
              color={tc.textTertiary}
            />
          </Pressable>
          <Pressable onPress={goToSalesStatement} hitSlop={8} accessibilityRole="button" accessibilityLabel="View today's sales details">
            <MaterialCommunityIcons name="chevron-right" size={16} color={tc.textTertiary} />
          </Pressable>
        </View>
        {summaryLoading ? (
          /* STG-190: Skeleton placeholder boxes instead of "Loading..." text */
          <View style={styles.skeletonContainer}>
            <View style={styles.skeletonBox} />
            <View style={styles.skeletonBox} />
            <View style={styles.skeletonBox} />
            <View style={styles.skeletonBox} />
          </View>
        ) : summaryError ? (
          /* GL-RJ-009: Error state with retry */
          <View style={styles.summaryErrorContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color={tc.error} />
            <Text style={styles.summaryErrorText}>{summaryError}</Text>
            <Pressable style={styles.summaryRetryButton} onPress={loadDailySummary} accessibilityRole="button" accessibilityLabel="Retry loading daily summary">
              <Text style={styles.summaryRetryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : dailySummary ? (
          <>
          {/* STG-151: Labels above metric values; STG-171: Hero metric (totalSales) bigger */}
          <View style={styles.summaryGrid}>
            {/* GO-LIVE-250: Added trend indicators */}
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{t('menu.totalSales')}</Text>
              <View style={styles.summaryValueRow}>
                <Text style={styles.heroValue}>{formatMoney(dailySummary.totalSales)}</Text>
                {renderTrend(dailySummary.totalSales, yesterdaySummary?.totalSales)}
              </View>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{t('menu.bills')}</Text>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{dailySummary.totalBills}</Text>
                {renderTrend(dailySummary.totalBills, yesterdaySummary?.totalBills)}
              </View>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{t('menu.avgBill')}</Text>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{formatMoney(dailySummary.averageBillValue)}</Text>
                {renderTrend(dailySummary.averageBillValue, yesterdaySummary?.averageBillValue)}
              </View>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{t('menu.itemsSold')}</Text>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{dailySummary.itemsSold}</Text>
                {renderTrend(dailySummary.itemsSold, yesterdaySummary?.itemsSold)}
              </View>
            </View>
          </View>
          </>
        ) : (
          <Text style={styles.summaryLoading}>{t('menu.noSalesYet')}</Text>
        )}
        {/* STG-150: Show "No payments today" when all breakdown values are 0 */}
        {dailySummary && dailySummary.totalSales > 0 && (
          <View style={styles.paymentBreakdown}>
            <Text style={styles.breakdownTitle}>{t('menu.paymentModes')}</Text>
            {(dailySummary.paymentBreakdown.cash > 0 || dailySummary.paymentBreakdown.upi > 0 || dailySummary.paymentBreakdown.card > 0) ? (
              <View style={styles.breakdownRow}>
                {dailySummary.paymentBreakdown.cash > 0 && (
                  <Text style={styles.breakdownItem}>{t('menu.cashLabel')} {formatMoney(dailySummary.paymentBreakdown.cash)}</Text>
                )}
                {dailySummary.paymentBreakdown.upi > 0 && (
                  <Text style={styles.breakdownItem}>{t('menu.upiLabel')} {formatMoney(dailySummary.paymentBreakdown.upi)}</Text>
                )}
                {dailySummary.paymentBreakdown.card > 0 && (
                  <Text style={styles.breakdownItem}>{t('menu.cardLabel')} {formatMoney(dailySummary.paymentBreakdown.card)}</Text>
                )}
              </View>
            ) : (
              <Text style={styles.breakdownItem}>{t('menu.noPaymentsToday')}</Text>
            )}
          </View>
        )}
        <Pressable onPress={goToSalesStatement} style={styles.summaryTapArea} accessibilityRole="button" accessibilityLabel="View sales details">
          <Text style={styles.summaryTapText}>{t('menu.viewDetails')}</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={tc.primary} />
        </Pressable>
      </View>

      {/* STG-159: Sales section — collapsible, search-filtered, usage-ordered first */}
      {(matchesSearch('sales history reprint download share return refund barcode')) && (
        <>
          {renderSectionHeader('sales', t('menu.salesSection'))}
          {!isSectionCollapsed('sales') && (
            <>
              {matchesSearch('sales history') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToBills)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Sales History">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name="receipt" size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.salesHistory')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.salesHistorySubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* STG-181: Bill actions pass action param to SalesHistory */}
              {matchesSearch('reprint download share bill') && (
                <View style={styles.billActions}>
                  <Pressable style={styles.billAction} onPress={hapticPress(() => navigation.navigate("SalesHistory", { action: 'reprint' }))} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Reprint bill">
                    <MaterialCommunityIcons name="printer-outline" size={18} color={tc.primary} />
                    <Text style={styles.billActionText}>{t('menu.reprint')}</Text>
                    <Text style={styles.billActionSubtitle}>{t('menu.reprintSubtitle')}</Text>
                  </Pressable>
                  <Pressable style={styles.billAction} onPress={hapticPress(() => navigation.navigate("SalesHistory", { action: 'download' }))} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Download bill">
                    <MaterialCommunityIcons name="download" size={18} color={tc.primary} />
                    <Text style={styles.billActionText}>{t('menu.download')}</Text>
                    <Text style={styles.billActionSubtitle}>{t('menu.downloadSubtitle')}</Text>
                  </Pressable>
                  <Pressable style={styles.billAction} onPress={hapticPress(() => navigation.navigate("SalesHistory", { action: 'share' }))} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Share bill">
                    <MaterialCommunityIcons name="share-variant" size={18} color={tc.primary} />
                    <Text style={styles.billActionText}>{t('menu.share')}</Text>
                    <Text style={styles.billActionSubtitle}>{t('menu.shareSubtitle')}</Text>
                  </Pressable>
                </View>
              )}

              {/* T-194: Return/Refund Processing */}
              {matchesSearch('return refund') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToReturn)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Return and Refund">
                  <View style={[styles.menuIcon, styles.menuIconDanger]}>
                    <MaterialCommunityIcons name={"rotate-left" as any} size={20} color={tc.error} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.returnRefund')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.returnRefundSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* POS-PRINT-002: Printer status indicator — STG-249: Wrapped in card */}
              {matchesSearch('printer') && (
                <Pressable style={[styles.printerStatusRow]} onPress={hapticPress(handleTestPrint)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Test printer connection">
                  <MaterialCommunityIcons
                    name={printerStatus.connected ? "printer-check" : "printer-alert"}
                    size={16}
                    color={printerStatus.connected ? tc.success : tc.error}
                  />
                  <Text style={[styles.printerStatusText, { color: printerStatus.connected ? tc.success : tc.error }]}>
                    {printerStatus.connected ? t('menu.printerReady') : t('menu.printerUnavailable')}
                  </Text>
                  <Text style={styles.printerTestLink}>{t('menu.testPrint')}</Text>
                </Pressable>
              )}

              {matchesSearch('barcode sheets') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(() => navigation.navigate("BarcodeSheet"))} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Barcode Sheets">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"barcode" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.barcodeSheets')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.barcodeSheetsSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* STG-159: Stock Management — collapsible, search-filtered, usage-ordered 2nd */}
      {matchesSearch('stock inward opening') && (
        <>
          {renderSectionHeader('stock', t('menu.stockManagement'))}
          {!isSectionCollapsed('stock') && (
            <>
              {matchesSearch('stock inward') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToInward)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Stock Inward">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"package-down" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.stockInward')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.stockInwardSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* T-198: Opening Stock Ledger */}
              {matchesSearch('opening stock') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToOpeningStock)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Opening Stock">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"package-variant-plus" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.openingStock')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.openingStockSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* STG-159: Customers & Credit — collapsible, search-filtered, usage-ordered 3rd */}
      {/* STG-247: Only Khata + Customers (max 2 items) */}
      {matchesSearch('khata credit customers') && (
        <>
          {renderSectionHeader('customers', t('menu.customersCredit'))}
          {!isSectionCollapsed('customers') && (
            <>
              {matchesSearch('khata credit book') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToKhata)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Khata Credit Book">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"book-open-variant" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.khata')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.khataSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* STG-157: Merged "Customer Management" into "Customers" */}
              {/* STG-247: Removed "Overdue Dues" (accessible from Khata) */}
              {matchesSearch('customers') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToCustomerList)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Customers">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"account-group-outline" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.customers')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.customersSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* STG-159: Purchasing — collapsible, search-filtered, usage-ordered 4th */}
      {/* GO-LIVE-002: Conditionally show based on feature flags */}
      {showPurchasingSection && matchesSearch('purchase orders catalog bnpl reorder') && (
        <>
          {renderSectionHeader('purchasing', t('menu.purchasing'))}
          {!isSectionCollapsed('purchasing') && (
            <>
              {buyEnabled && (
                <>
                  {matchesSearch('purchase orders') && (
                    <Pressable style={styles.menuItem} onPress={hapticPress(goToOrders)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Purchase Orders">
                      <View style={styles.menuIcon}>
                        <MaterialCommunityIcons name={"clipboard-list" as any} size={20} color={tc.primary} />
                      </View>
                      <View style={styles.menuText}>
                        <Text style={styles.menuTitle}>{t('menu.purchaseOrders')}</Text>
                        <Text style={styles.menuSubtitle}>{t('menu.purchaseOrdersSubtitle')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                    </Pressable>
                  )}

                  {/* AUD-POS-NAV-002: Wire BuyScreen to navigation */}
                  {matchesSearch('product catalog') && (
                    <Pressable style={styles.menuItem} onPress={hapticPress(() => navigation.navigate("Buy"))} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Product Catalog">
                      <View style={styles.menuIcon}>
                        <MaterialCommunityIcons name={"storefront-outline" as any} size={20} color={tc.primary} />
                      </View>
                      <View style={styles.menuText}>
                        <Text style={styles.menuTitle}>{t('menu.productCatalog')}</Text>
                        <Text style={styles.menuSubtitle}>{t('menu.productCatalogSubtitle')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                    </Pressable>
                  )}

                  {/* SM-020: BNPL Dues Screen */}
                  {matchesSearch('bnpl dues') && (
                    <Pressable style={styles.menuItem} onPress={hapticPress(goToBnplDues)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="BNPL Dues">
                      <View style={[styles.menuIcon, styles.menuIconBnpl]}>
                        <MaterialCommunityIcons name={"clock-outline" as any} size={20} color={tc.accent} />
                      </View>
                      <View style={styles.menuText}>
                        <Text style={styles.menuTitle}>{t('menu.bnplDues')}</Text>
                        <Text style={styles.menuSubtitle}>{t('menu.bnplDuesSubtitle')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                    </Pressable>
                  )}
                </>
              )}

              {reorderEnabled && (
                <>
                  {matchesSearch('reorder settings') && (
                    <Pressable style={styles.menuItem} onPress={hapticPress(goToReorderSettings)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Reorder Settings">
                      <View style={styles.menuIcon}>
                        <MaterialCommunityIcons name={"cog" as any} size={20} color={tc.primary} />
                      </View>
                      <View style={styles.menuText}>
                        <Text style={styles.menuTitle}>{t('menu.reorderSettings')}</Text>
                        <Text style={styles.menuSubtitle}>{t('menu.reorderSettingsSubtitle')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                    </Pressable>
                  )}

                  {matchesSearch('reorder policies') && (
                    <Pressable style={styles.menuItem} onPress={hapticPress(goToReorderPolicies)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Reorder Policies">
                      <View style={styles.menuIcon}>
                        <MaterialCommunityIcons name={"format-list-checks" as any} size={20} color={tc.primary} />
                      </View>
                      <View style={styles.menuText}>
                        <Text style={styles.menuTitle}>{t('menu.reorderPolicies')}</Text>
                        <Text style={styles.menuSubtitle}>{t('menu.reorderPoliciesSubtitle')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* STG-159: Reports — collapsible, search-filtered, usage-ordered 5th */}
      {matchesSearch('purchase history sales statement stock statement daily report') && (
        <>
          {renderSectionHeader('reports', t('menu.reports'))}
          {!isSectionCollapsed('reports') && (
            <>
              {matchesSearch('purchase history') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToPurchaseHistory)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Purchase History">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"history" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.purchaseHistory')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.purchaseHistorySubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {matchesSearch('sales statement') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToSalesStatement)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Sales Statement">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"chart-line" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.salesStatement')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.salesStatementSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {matchesSearch('stock statement') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToStockStatement)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Stock Statement">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"package-variant" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.stockStatement')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.stockStatementSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* T-199: Daily Report */}
              {matchesSearch('daily report') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToDailyReport)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Daily Report">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"file-chart-outline" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.dailyReport')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.dailyReportSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* STG-159: Operations — collapsible, search-filtered */}
      {matchesSearch('daily closing shift management') && (
        <>
          {renderSectionHeader('operations', t('menu.operations'))}
          {!isSectionCollapsed('operations') && (
            <>
              {matchesSearch('daily closing') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToDailyClosing)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Daily Closing">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"clipboard-check-outline" as any} size={20} color={tc.primary} />
                    {/* STG-251: Pending badge when daily closing not done */}
                    {!dailyClosingDone && (
                      <View style={styles.pendingDot} />
                    )}
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.dailyClosing')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.dailyClosingSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {matchesSearch('shift management') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToShift)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Shift Management">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"clock-outline" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.shiftManagement')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.shiftManagementSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* T-307: AI & Intelligence Section — collapsible, search-filtered */}
      {matchesSearch('ai insights bulk purchase credit') && (
        <>
          {renderSectionHeader('ai', t('menu.aiSection'))}
          {!isSectionCollapsed('ai') && (
            <>
              {matchesSearch('ai insights') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToAIInsights)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="AI Insights">
                  <View style={[styles.menuIcon, styles.menuIconAi]}>
                    <MaterialCommunityIcons name={"brain" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.aiInsights')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.aiInsightsSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* T-288: Bulk Purchase Credit */}
              {matchesSearch('bulk purchase credit') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToBulkPurchaseCredit)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Bulk Purchase Credit">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"cash-multiple" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.bulkPurchaseCredit')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.bulkPurchaseCreditSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* T-294: Chat / Messaging Section — collapsible, search-filtered */}
      {matchesSearch('chat whatsapp support messages') && (
        <>
          {renderSectionHeader('messages', t('menu.messages'))}
          {!isSectionCollapsed('messages') && (
            <>
              {matchesSearch('chat') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToChat)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Chat">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"chat-outline" as any} size={20} color={tc.primary} />
                    {/* STG-161/STG-252: Unread chat count badge */}
                    {unreadChatCount > 0 && (
                      <View style={styles.notificationBadge}>
                        <Text style={styles.notificationBadgeText}>{unreadChatCount > 99 ? '99+' : unreadChatCount}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.chat')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.chatSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {matchesSearch('whatsapp support') && (
                <Pressable
                  style={styles.menuItem}
                  android_ripple={{ color: tc.primary + '20', borderless: false }}
                  accessibilityRole="button"
                  accessibilityLabel="WhatsApp Support"
                  onPress={hapticPress(() => {
                    let supportPhone = process.env.EXPO_PUBLIC_SUPPORT_PHONE;
                    if (!supportPhone) {
                      Alert.alert(t('menu.supportUnavailableTitle'), t('menu.supportUnavailableMessage'));
                      return;
                    }
                    supportPhone = supportPhone.replace(/\D/g, "");
                    if (supportPhone.length === 10) supportPhone = `91${supportPhone}`;
                    const message = encodeURIComponent(
                      t('menu.whatsappSupportMessage', { storeName: opStatus.storeName || "N/A", deviceLabel: opStatus.deviceLabel || "N/A" })
                    );
                    const url = `https://wa.me/${supportPhone}?text=${message}`;
                    Linking.openURL(url).catch(() => {
                      Alert.alert(t('menu.whatsappNotFoundTitle'), t('menu.whatsappNotFoundMessage'));
                    });
                  })}
                >
                  <View style={[styles.menuIcon, styles.menuIconWhatsapp]}>
                    <MaterialCommunityIcons name={"whatsapp" as any} size={20} color={tc.whatsapp} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.whatsappSupport')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.whatsappSupportSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* STG-159: Settings — collapsible, search-filtered, usage-ordered 6th */}
      {matchesSearch('language theme switch staff printer settings help support') && (
        <>
          {renderSectionHeader('settings', t('menu.settings'))}
          {!isSectionCollapsed('settings') && (
            <>
              {matchesSearch('language') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(toggleLanguage)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Toggle language">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"translate" as any} size={20} color={tc.primary} />
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
                    ]}>हिंदी</Text>
                  </View>
                </Pressable>
              )}

              {/* LIVE.POS.THEME.RUNTIME_TOGGLE_PARITY.001: Theme toggle */}
              {matchesSearch('theme dark light') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(toggleTheme)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Toggle theme">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons
                      name={themeMode === 'dark' ? "weather-night" as any : "white-balance-sunny" as any}
                      size={20}
                      color={tc.primary}
                    />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.theme')}</Text>
                    <Text style={styles.menuSubtitle}>
                      {themeMode === 'dark' ? t('menu.darkMode') : t('menu.lightMode')}
                    </Text>
                  </View>
                  <View style={styles.languageToggle}>
                    <Text style={[
                      styles.langOption,
                      themeMode === 'light' && styles.langOptionActive
                    ]}>☀</Text>
                    <Text style={styles.langDivider}>|</Text>
                    <Text style={[
                      styles.langOption,
                      themeMode === 'dark' && styles.langOptionActive
                    ]}>🌙</Text>
                  </View>
                </Pressable>
              )}

              {/* SA-P1-001: Switch Staff — STG-164: shows display_name via staffSession.name */}
              {matchesSearch('switch staff') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(handleSwitchStaff)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Switch Staff">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"account-switch" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.switchStaff')}</Text>
                    <Text style={styles.menuSubtitle}>
                      {staffSession ? t('menu.switchStaffSubtitle', { name: staffSession.name, role: staffSession.role }) : t('menu.switchStaffNotLoggedIn')}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* T-195: Printer Settings */}
              {matchesSearch('printer settings') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToPrinterSettings)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Printer Settings">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"printer-outline" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.printerSettings')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.printerSettingsSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* HELP-001: Help & Support */}
              {matchesSearch('help support') && (
                <Pressable style={styles.menuItem} onPress={hapticPress(goToHelp)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Help and Support">
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"help-circle-outline" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.helpSupport')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.helpSupportSubtitle')}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}

              {/* STG-167: About section */}
              {matchesSearch('about version terms privacy') && (
                <Pressable
                  style={styles.menuItem}
                  android_ripple={{ color: tc.primary + '20', borderless: false }}
                  accessibilityRole="button"
                  accessibilityLabel="About"
                  onPress={hapticPress(() => {
                    Alert.alert(
                      t('menu.about'),
                      `${t('menu.aboutVersion', { version: buildVersionLabel })}\n\n${t('common.termsOfService')}: https://supermandi.com/terms\n${t('common.privacyPolicy')}: https://supermandi.com/privacy`
                    );
                  })}
                >
                  <View style={styles.menuIcon}>
                    <MaterialCommunityIcons name={"information-outline" as any} size={20} color={tc.primary} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuTitle}>{t('menu.about')}</Text>
                    <Text style={styles.menuSubtitle}>{t('menu.aboutSubtitle', { version: buildVersionLabel })}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      {/* STG-250: Danger Zone section — Switch Store moved here with error-colored header */}
      {matchesSearch('switch store danger') && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, styles.dangerSectionTitle]}>{t('menu.dangerZone')}</Text>
          </View>

          <Pressable style={styles.menuItem} onPress={hapticPress(handleSwitchStore)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="Switch Store">
            <View style={[styles.menuIcon, styles.menuIconDanger]}>
              <MaterialCommunityIcons name={"swap-horizontal" as any} size={20} color={tc.error} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{t('menu.switchStore')}</Text>
              <Text style={styles.menuSubtitle}>{t('menu.switchStoreSubtitle')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
          </Pressable>

          {/* STG-168: Logout / End Session */}
          <Pressable
            style={styles.menuItem}
            android_ripple={{ color: tc.primary + '20', borderless: false }}
            accessibilityRole="button"
            accessibilityLabel="Logout"
            onPress={hapticPress(() => {
              Alert.alert(
                t('menu.logoutConfirmTitle'),
                t('menu.logoutConfirmMessage'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('menu.logoutButton'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        // Clear staff session
                        clearStaffSession();
                        // Clear all local state
                        useCartStore.getState().resetForStore();
                        usePurchaseCartStore.getState().resetForStore();
                        usePurchaseDraftStore.getState().resetForStore();
                        useProductsStore.getState().resetForStore();
                        // Clear device session
                        await clearDeviceSession();
                        // Navigate to EnrollDevice
                        navigation.dispatch(
                          CommonActions.reset({
                            index: 0,
                            routes: [{ name: 'EnrollDevice' }],
                          })
                        );
                      } catch (error) {
                        if (__DEV__) console.error('[MenuScreen] Logout failed:', error);
                        Alert.alert(t('common.error'), t('errors.unknownError'));
                      }
                    },
                  },
                ]
              );
            })}
          >
            <View style={[styles.menuIcon, styles.menuIconDanger]}>
              <MaterialCommunityIcons name={"logout" as any} size={20} color={tc.error} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{t('menu.logout')}</Text>
              <Text style={styles.menuSubtitle}>{t('menu.logoutSubtitle')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
          </Pressable>
        </>
      )}

      {/* Developer/QA Section — STG-144: __DEV__ gate prevents exposure in release builds */}
      {__DEV__ && showQaMenu && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('menu.developerQa')}</Text>
          </View>

          <Pressable style={styles.menuItem} onPress={hapticPress(goToUiShowcase)} android_ripple={{ color: tc.primary + '20', borderless: false }} accessibilityRole="button" accessibilityLabel="UI Showcase">
            <View style={[styles.menuIcon, styles.menuIconQa]}>
              <MaterialCommunityIcons name={"layers-outline" as any} size={20} color={tc.warning} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{t('menu.uiShowcase')}</Text>
              <Text style={styles.menuSubtitle}>{t('menu.uiShowcaseSubtitle')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={tc.textSecondary} />
          </Pressable>
        </>
      )}

      {/* LIVE.POS.BUILDSTAMP.RUNTIME_GCP_PARITY.001: Build Info - DEV only, theme-aware */}
      {__DEV__ && (
        <View style={[styles.buildInfo, { backgroundColor: tc.surfaceAlt, borderColor: tc.border }, BUILD_INFO.isDirty && styles.buildInfoDirty]}>
          <Text style={[styles.buildInfoLabel, { color: tc.warning }]}>
            Build Info {BUILD_INFO.isDirty ? "(DIRTY)" : "(CLEAN)"}
          </Text>
          <Text style={[styles.buildInfoText, styles.buildInfoFingerprint, { color: tc.textPrimary }]}>
            {BUILD_INFO.fingerprint}
          </Text>
          <Text style={[styles.buildInfoText, { color: tc.textSecondary }]}>
            Branch: {BUILD_INFO.branch} | SHA: {BUILD_INFO.gitSha}
          </Text>
          {BUILD_INFO.isDirty && (
            <Text style={[styles.buildInfoDirtyText, { color: tc.warning }]}>
              {BUILD_INFO.modifiedCount} modified, {BUILD_INFO.untrackedCount} untracked
            </Text>
          )}
          <Text style={[styles.buildInfoText, { color: tc.textSecondary }]}>Built: {BUILD_INFO.buildTime}</Text>
          <Text style={[styles.buildInfoText, { color: tc.textSecondary }]}>API: {API_BASE_URL?.replace(/https?:\/\//, '').replace(/:\d+$/, '') ?? "—"}</Text>
          {/* STG-145: Mask sensitive data — no token, no UUID, no API URL in any build */}
          <View style={[styles.devInfoSection, { borderTopColor: tc.border }]}>
            <Text style={[styles.devInfoLabel, { color: tc.primary }]}>Device Info</Text>
            <Text style={[styles.buildInfoText, { color: tc.textSecondary }]}>
              Auth: {devInfo.tokenSuffix !== "none" && devInfo.tokenSuffix !== "..." ? "Authenticated \u2713" : "Not authenticated"}
            </Text>
            <Text style={[styles.buildInfoText, { color: tc.textSecondary }]}>Store: {devInfo.storeName ?? "—"}</Text>
            <Text style={[styles.buildInfoText, { color: tc.textSecondary }]}>StoreCode: {devInfo.storeCode ?? "—"}</Text>
          </View>
        </View>
      )}

      {/* STG-144: Release build stamp hidden in production — no SHA/deploy info to end users */}
      {__DEV__ && (
        <View style={styles.releaseBuildInfo}>
          <Text style={[styles.releaseBuildInfoText, { color: tc.textTertiary }]}>
            Build: {buildShaLabel} · Deployed: {buildTimeLabel}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// STG-285: Dynamic styles for dark mode support
function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingVertical: 14,
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
    color: colors.textInverse,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    lineHeight: 18,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  // GO-LIVE-244: Offline indicator styles
  offlineIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.errorSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.error,
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
    backgroundColor: colors.primarySoft,
  },
  syncButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  syncButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },
  syncButtonTextDisabled: {
    color: colors.textTertiary,
  },
  statusPanel: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.primary,
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
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadgeActive: {
    backgroundColor: colors.successSoft,
  },
  statusBadgeInactive: {
    backgroundColor: colors.errorSoft,
  },
  statusBadgeWarning: {
    backgroundColor: colors.warningSoft,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  statusBadgeTextActive: {
    color: colors.success,
  },
  statusBadgeTextInactive: {
    color: colors.error,
  },
  statusBadgeTextWarning: {
    color: colors.warning,
  },
  menuItem: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center"
  },
  menuText: {
    flex: 1
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary
  },
  menuSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary
  },
  billActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  billAction: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: "center",
    gap: 6
  },
  billActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary
  },
  // POS-PRINT-002: Printer status row styles
  printerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 10,
  },
  printerStatusText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  printerTestLink: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 4,
    paddingHorizontal: 4
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  menuIconQa: {
    borderColor: colors.warning,
    backgroundColor: colors.warning + "15"
  },
  menuIconDanger: {
    borderColor: colors.error,
    backgroundColor: colors.error + "15"
  },
  // SM-020: BNPL menu icon style
  menuIconBnpl: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + "15"
  },
  menuIconAi: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "15"
  },
  menuIconWhatsapp: {
    borderColor: colors.whatsapp,
    backgroundColor: colors.whatsapp + "15",
  },
  languageToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4
  },
  langOption: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    paddingHorizontal: 4
  },
  langOptionActive: {
    color: colors.primary
  },
  langDivider: {
    color: colors.border,
    fontSize: 14
  },
  buildInfo: {
    marginTop: 32,
    padding: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed"
  },
  buildInfoDirty: {
    borderColor: colors.warning,
    backgroundColor: colors.warning + "10"
  },
  buildInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.warning,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  buildInfoFingerprint: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4
  },
  buildInfoText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.textSecondary,
    marginTop: 2
  },
  buildInfoDirtyText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.warning,
    marginTop: 2
  },
  devInfoSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  releaseBuildInfo: {
    marginTop: 24,
    marginBottom: 4,
    alignItems: "center",
  },
  releaseBuildInfoText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.textTertiary,
  },
  devInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  // TICKET-002: Daily Summary Card styles
  summaryCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
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
    // STG-051: Larger, more prominent values for quick glance
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  // STG-151: Label above value — marginBottom instead of marginTop
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  summaryLoading: {
    fontSize: 13,
    color: colors.textTertiary,
    paddingVertical: 16,
    textAlign: "center",
  },
  paymentBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  breakdownTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  breakdownItem: {
    fontSize: 12,
    color: colors.textSecondary,
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
    color: colors.error,
    textAlign: 'center',
  },
  summaryRetryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  summaryRetryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textInverse,
  },
  summaryTapArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryTapText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
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
    backgroundColor: colors.successSoft,
  },
  trendBadgeDown: {
    backgroundColor: colors.errorSoft,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  trendTextUp: {
    color: colors.success,
  },
  trendTextDown: {
    color: colors.error,
  },
  // STG-149: Trend container wraps badge + period label
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendPeriodLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  // STG-148/STG-256: Status panel collapse toggle
  statusCollapseToggle: {
    marginLeft: 'auto',
  },
  // STG-169: Search bar styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 4,
  },
  // STG-159: Collapsible section header styles
  collapsibleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  // STG-171: Hero metric value (totalSales) — larger than regular summaryValue
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  // STG-250: Danger Zone section header in error color
  dangerSectionTitle: {
    color: colors.error,
  },
  // STG-190: Skeleton shimmer placeholder styles
  skeletonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 8,
  },
  skeletonBox: {
    width: '48%' as any,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  // STG-153: Bill action subtitle styles
  billActionSubtitle: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  // STG-161/STG-252: Notification badge styles
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textInverse, // STG-053: use theme token instead of hardcoded #FFFFFF
  },
  // STG-251: Pending dot indicator for daily closing
  pendingDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
}); }
