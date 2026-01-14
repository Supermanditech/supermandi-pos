import React from "react";
import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { theme } from "../theme";
import { isQaMenuEnabled } from "./UiShowcaseScreen";
import { useSettingsStore } from "../stores/settingsStore";
import { LANGUAGE_NAMES, type SupportedLanguage } from "../i18n";
import { BUILD_INFO, API_BASE_URL } from "../config/api";

type RootStackParamList = {
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

  const toggleLanguage = () => {
    const nextLang: SupportedLanguage = language === 'en' ? 'hi' : 'en';
    setLanguage(nextLang);
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

      <Pressable style={styles.menuItem} onPress={goToBills}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"receipt-text" as any} size={20} color={theme.colors.primary} />
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
        <View style={styles.buildInfo}>
          <Text style={styles.buildInfoLabel}>Build Info (DEV)</Text>
          <Text style={styles.buildInfoText}>SHA: {BUILD_INFO.gitSha}</Text>
          <Text style={styles.buildInfoText}>Built: {BUILD_INFO.buildTime}</Text>
          <Text style={styles.buildInfoText}>API: {API_BASE_URL}</Text>
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
  buildInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  buildInfoText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: theme.colors.textSecondary,
    marginTop: 2
  }
});
