// UiShowcaseScreen - QA/Developer Tool
// Lists all screens, tabs, and modals for testing
// Only visible when __DEV__ or EXPO_PUBLIC_ENABLE_QA_MENU=true

import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";

import { theme } from "../theme";
import { showToast } from "../utils/showToast";
import { ProductDetailModal } from "../components/buy/ProductDetailModal";
import { PurchaseCartModal } from "../components/buy/PurchaseCartModal";
import type { CatalogProduct } from "../services/api/catalogApi";
import { seedDemoStore } from "../services/api/demoApi";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { asError } from "../utils/errorUtils";

// =============================================================================
// QA GATE CHECK
// =============================================================================

export function isQaMenuEnabled(): boolean {
  if (__DEV__) return true;
  const extra = Constants.expoConfig?.extra ?? {};
  return extra.EXPO_PUBLIC_ENABLE_QA_MENU === "true" || extra.EXPO_PUBLIC_ENABLE_QA_MENU === true;
}

// =============================================================================
// TYPES
// =============================================================================

interface UiShowcaseScreenProps {
  onNavigateTo: (screen: string, params?: Record<string, unknown>) => void;
  onBack: () => void;
}

interface UiItem {
  id: string;
  name: string;
  type: "stack" | "tab" | "modal" | "inline";
  description: string;
  trigger?: string;
  screen?: string;
  params?: Record<string, unknown>;
  action?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function UiShowcaseScreen({ onNavigateTo, onBack }: UiShowcaseScreenProps) {
  // Modal states
  const [productDetailVisible, setProductDetailVisible] = useState(false);
  const [purchaseCartVisible, setPurchaseCartVisible] = useState(false);

  // Mock product for ProductDetailModal
  const mockProduct: CatalogProduct = {
    id: "mock-product-001",
    name: "Test Product - Amul Butter 500g",
    brand: "Amul",
    description: "Premium quality butter for testing purposes",
    category: "Dairy",
    primaryBarcode: "8901234567890",
    unit: "500g",
    bestPrice: 280,
    minMoq: 1,
    supplierCount: 2,
    stockStatus: "in_stock",
    isActive: true,
    suppliers: [
      {
        supplierId: "sup-001",
        supplierProductId: "sp-001",
        supplierName: "Metro Cash & Carry",
        purchasePrice: 280,
        mrp: 295,
        moq: 5,
        stockQuantity: 100,
        stockStatus: "in_stock",
        isPreferred: true,
      },
      {
        supplierId: "sup-002",
        supplierProductId: "sp-002",
        supplierName: "Best Wholesale",
        purchasePrice: 285,
        mrp: 295,
        moq: 3,
        stockQuantity: 50,
        stockStatus: "in_stock",
        isPreferred: false,
      },
    ],
  };

  // Stack screens
  const stackScreens: UiItem[] = [
    { id: "splash", name: "SplashScreen", type: "stack", description: "App loading screen", screen: "Splash" },
    { id: "enroll", name: "EnrollDeviceScreen", type: "stack", description: "Device enrollment", screen: "EnrollDevice" },
    { id: "blocked", name: "DeviceBlockedScreen", type: "stack", description: "Device blocked message", screen: "DeviceBlocked" },
    { id: "sellscan", name: "PosRootLayout (Main)", type: "stack", description: "Main POS with tabs", screen: "SellScan" },
    { id: "payment", name: "PaymentScreen", type: "stack", description: "Payment collection", screen: "Payment" },
    { id: "success", name: "SuccessPrintScreen", type: "stack", description: "Sale success + print", screen: "SuccessPrint" },
    { id: "saleshistory", name: "SalesHistoryScreen", type: "stack", description: "Bills history list", screen: "SalesHistory" },
    { id: "billdetail", name: "BillDetailScreen", type: "stack", description: "Single bill detail", screen: "BillDetail", params: { saleId: "test-sale" } },
    { id: "barcode", name: "BarcodeSheetScreen", type: "stack", description: "Barcode PDF generator", screen: "BarcodeSheet" },
    { id: "orderhistory", name: "OrderHistoryScreen", type: "stack", description: "Purchase orders list", screen: "OrderHistory" },
    { id: "orderdetail", name: "OrderDetailScreen", type: "stack", description: "Single PO detail", screen: "OrderDetail", params: { orderId: "test-order" } },
    { id: "reordersettings", name: "ReorderSettingsScreen", type: "stack", description: "Auto-reorder config", screen: "ReorderSettings" },
    { id: "reorderpolicies", name: "ReorderPoliciesScreen", type: "stack", description: "Product reorder policies", screen: "ReorderPolicies" },
    { id: "grn", name: "GRNScreen", type: "stack", description: "Goods receipt note", screen: "GRN", params: { orderId: "test-order" } },
    { id: "inward", name: "InwardScreen", type: "stack", description: "Stock inward / purchase entry", screen: "Inward" },
  ];

  // Tab screens (inside PosRootLayout)
  const tabScreens: UiItem[] = [
    { id: "tab-menu", name: "MenuScreen", type: "tab", description: "App menu", trigger: "Tap MENU tab" },
    { id: "tab-sell", name: "SellScanScreen", type: "tab", description: "Scan & sell products", trigger: "Tap SELL tab" },
    { id: "tab-buy", name: "BuyScreen", type: "tab", description: "Browse & order from suppliers", trigger: "Tap BUY tab (if enabled)" },
    { id: "tab-reorder", name: "ReorderScreen", type: "tab", description: "Review pending reorders", trigger: "Tap REORDER tab" },
  ];

  // Modal components
  const modalScreens: UiItem[] = [
    {
      id: "modal-productdetail",
      name: "ProductDetailModal",
      type: "modal",
      description: "Product details with supplier list",
      trigger: "Tap product card in BUY tab",
      action: () => setProductDetailVisible(true),
    },
    {
      id: "modal-purchasecart",
      name: "PurchaseCartModal",
      type: "modal",
      description: "Purchase cart grouped by supplier",
      trigger: "Tap cart icon in BUY tab",
      action: () => setPurchaseCartVisible(true),
    },
    {
      id: "modal-editpolicy",
      name: "EditPolicyModal",
      type: "modal",
      description: "Edit reorder policy for product",
      trigger: "Tap policy row in ReorderPolicies",
    },
    {
      id: "modal-editreorder",
      name: "EditReorderModal",
      type: "modal",
      description: "Edit pending reorder quantity",
      trigger: "Tap reorder item in REORDER tab",
    },
    {
      id: "modal-dismiss",
      name: "DismissReasonModal",
      type: "modal",
      description: "Select reason for dismissing reorder",
      trigger: "Tap dismiss on reorder item",
    },
    {
      id: "modal-camera",
      name: "Camera Scanner Modal",
      type: "inline",
      description: "Camera barcode scanner",
      trigger: "Tap camera button in SELL/BUY",
    },
    {
      id: "modal-cart",
      name: "Cart Sheet (Sell)",
      type: "inline",
      description: "Sales cart bottom sheet",
      trigger: "Tap cart icon in SELL tab",
    },
    {
      id: "modal-editor",
      name: "Item Editor Modal (Inward)",
      type: "inline",
      description: "Edit purchase item prices",
      trigger: "Tap item row in Inward screen",
    },
  ];

  const [seeding, setSeeding] = useState(false);

  const handleSeedDemoData = async () => {
    try {
      // Get current store ID from AsyncStorage
      const storeId = await AsyncStorage.getItem("supermandi.store_id");
      if (!storeId) {
        Alert.alert("Error", "No store ID found. Please enroll device first.");
        return;
      }

      setSeeding(true);
      showToast("Seeding demo data...");

      const result = await seedDemoStore(storeId);

      if (result.success) {
        const { seeded } = result;
        Alert.alert(
          "Demo Data Seeded",
          `Store: ${result.storeName} (${result.storeCode})\n\n` +
          `Products: ${seeded.products}\n` +
          `Store Products: ${seeded.store_products}\n` +
          `Barcodes: ${seeded.barcodes}\n` +
          `Suppliers: ${seeded.suppliers}\n` +
          `Purchase Orders: ${seeded.purchase_orders}\n` +
          `Bills: ${seeded.bills}\n` +
          `Reorder Policies: ${seeded.reorder_policies}`
        );
      }
    } catch (_error: unknown) {
    const error = asError(_error);
      const message = error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Seed Failed", message);
    } finally {
      setSeeding(false);
    }
  };

  const renderItem = (item: UiItem) => {
    const canNavigate = item.screen && item.type === "stack";
    const canOpen = item.action && item.type === "modal";

    return (
      <Pressable
        key={item.id}
        style={styles.item}
        onPress={() => {
          if (canNavigate && item.screen) {
            onNavigateTo(item.screen, item.params);
          } else if (canOpen && item.action) {
            item.action();
          } else if (item.trigger) {
            showToast(`Trigger: ${item.trigger}`);
          }
        }}
      >
        <View style={styles.itemIcon}>
          <MaterialCommunityIcons
            name={
              item.type === "stack"
                ? "layers"
                : item.type === "tab"
                  ? "tab"
                  : item.type === "modal"
                    ? "card-outline"
                    : "code-braces"
            }
            size={18}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.itemContent}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemDesc}>{item.description}</Text>
          {item.trigger && (
            <Text style={styles.itemTrigger}>Trigger: {item.trigger}</Text>
          )}
        </View>
        {(canNavigate || canOpen) && (
          <MaterialCommunityIcons
            name={canNavigate ? "chevron-right" : "open-in-new"}
            size={20}
            color={theme.colors.textSecondary}
          />
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>UI Showcase (QA)</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* QA Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QA Actions</Text>
          <Pressable
            style={[styles.actionButton, seeding && styles.actionButtonDisabled]}
            onPress={handleSeedDemoData}
            disabled={seeding}
          >
            <MaterialCommunityIcons
              name={seeding ? "loading" : "database-import"}
              size={18}
              color={theme.colors.textInverse}
            />
            <Text style={styles.actionButtonText}>
              {seeding ? "Seeding..." : "Seed Demo Data"}
            </Text>
          </Pressable>
          <Text style={styles.actionHint}>
            Creates products, suppliers, orders, bills, and reorder policies for testing all screens.
            Only works for demo stores (DM*, QA*, TS*, ST* codes).
          </Text>
        </View>

        {/* Stack Screens */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stack Screens ({stackScreens.length})</Text>
          <Text style={styles.sectionSubtitle}>Full-page screens in navigation stack</Text>
          {stackScreens.map(renderItem)}
        </View>

        {/* Tab Screens */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tab Screens ({tabScreens.length})</Text>
          <Text style={styles.sectionSubtitle}>Screens inside PosRootLayout tabs</Text>
          {tabScreens.map(renderItem)}
        </View>

        {/* Modal Components */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modal Components ({modalScreens.length})</Text>
          <Text style={styles.sectionSubtitle}>Popup/overlay components</Text>
          {modalScreens.map(renderItem)}
        </View>
      </ScrollView>

      {/* ProductDetailModal for testing */}
      <ProductDetailModal
        visible={productDetailVisible}
        product={mockProduct}
        onClose={() => setProductDetailVisible(false)}
        onViewCart={() => {
          setProductDetailVisible(false);
          setPurchaseCartVisible(true);
        }}
      />

      {/* PurchaseCartModal for testing */}
      <PurchaseCartModal
        visible={purchaseCartVisible}
        onClose={() => setPurchaseCartVisible(false)}
        onOrderPlaced={() => showToast("Order placed for supplier")}
        onAllOrdersPlaced={() => {
          showToast("All orders placed");
          setPurchaseCartVisible(false);
        }}
      />
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  headerRight: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  itemDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  itemTrigger: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 4,
    fontStyle: "italic",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionHint: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 8,
    textAlign: "center",
  },
});
