import React, { useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

// GCP-STG-0506: Scan context guard — disable scanning during payment flow
import { setScanEnabled } from "../../services/scan/handleScan";

// V3-001: Wrapper components for React Navigation stack registration
// Each wrapper passes navigation.goBack() as onClose and navigation params as props

import PaymentScreenV3 from "./PaymentScreenV3";
import CashScreenV3 from "./CashScreenV3";
import UpiScreenV3 from "./UpiScreenV3";
import UdharScreenV3 from "./UdharScreenV3";
import SuccessScreenV3 from "./SuccessScreenV3";
import ScanScreenV3 from "./ScanScreenV3";
import NewProductScreenV3 from "./NewProductScreenV3";
import CompareScreenV3 from "./CompareScreenV3";
import CounterPurchaseScreenV3 from "./CounterPurchaseScreenV3";
import GRNScreenV3 from "./GRNScreenV3";
import ReorderScreenV3 from "./ReorderScreenV3";
import StockScreenV3 from "./StockScreenV3";
import BarcodeSheetScreenV3 from "./BarcodeSheetScreenV3"; // GCP-STG-0062
import KhataScreenV3 from "./KhataScreenV3";
import SalesHistoryScreenV3 from "./SalesHistoryScreenV3";
import FinanceScreenV3 from "./FinanceScreenV3";
import ReportsScreenV3 from "./ReportsScreenV3";
import CustomersScreenV3 from "./CustomersScreenV3";
import SettingsScreenV3 from "./SettingsScreenV3";
import OrderTrackingScreenV3 from "./OrderTrackingScreenV3";
import NotificationsScreenV3 from "./NotificationsScreenV3"; // GCP-STG-0749

type Nav = NativeStackNavigationProp<any>;

// V3-FIX-157: Reactive scan result store for intent-specific routing
import { useScanResultStore } from "../../stores/scanResultStore";
// GCP-STG-0316: Search trigger store for scan-not-found → search-by-name handoff
import { useSearchTriggerStore } from "../../stores/searchTriggerStore";

// V3-FIX-071: Payment chooser navigates to child screens
export function V3PaymentWrapper() {
  const nav = useNavigation<Nav>();
  // GCP-STG-0506: Disable scanning while payment screen is active
  useEffect(() => {
    setScanEnabled(false);
    return () => { setScanEnabled(true); };
  }, []);
  const toSuccess = (method: string, saleId?: string, totalMinor?: number, itemCount?: number) =>
    nav.navigate("V3Success", { method, saleId, totalMinor, itemCount });
  return (
    <PaymentScreenV3
      onBack={() => nav.goBack()}
      onCash={() => nav.navigate("V3Cash" as any)}
      onUpi={() => nav.navigate("V3Upi" as any)}
      onUdhar={() => nav.navigate("V3Udhar" as any)}
      onComplete={toSuccess}
    />
  );
}

// V3-FIX-072: Dedicated cash payment screen
export function V3CashWrapper() {
  const nav = useNavigation<Nav>();
  return <CashScreenV3 onBack={() => nav.goBack()} onComplete={(method, saleId, totalMinor, itemCount) => nav.navigate("V3Success", { method, saleId, totalMinor, itemCount })} />;
}

// V3-FIX-073: Dedicated UPI payment screen
export function V3UpiWrapper() {
  const nav = useNavigation<Nav>();
  return <UpiScreenV3 onBack={() => nav.goBack()} onComplete={(method, saleId, totalMinor, itemCount) => nav.navigate("V3Success", { method, saleId, totalMinor, itemCount })} />;
}

// V3-FIX-074: Dedicated Udhar payment screen
export function V3UdharWrapper() {
  const nav = useNavigation<Nav>();
  // V3-HARDEN-103: Pass customerPhone to success for server-backed WhatsApp
  return <UdharScreenV3 onBack={() => nav.goBack()} onComplete={(method, saleId, totalMinor, itemCount, customerPhone) => nav.navigate("V3Success", { method, saleId, totalMinor, itemCount, customerPhone })} />;
}

export function V3SuccessWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  const method = route?.params?.method ?? "CASH";
  const saleId = route?.params?.saleId;
  // RI-019: Use params passed from PaymentScreenV3 to avoid cart-cleared race
  const total = route?.params?.totalMinor ?? 0;
  const count = route?.params?.itemCount ?? 0;
  const cartStore = require("../../stores/cartStore").useCartStore;
  // V3-HARDEN-103: Pass customerPhone for server-backed WhatsApp send
  const customerPhone = route?.params?.customerPhone;
  return <SuccessScreenV3 paymentMethod={method} totalMinor={total} itemCount={count} saleId={saleId} customerPhone={customerPhone} onNewSale={() => { cartStore.getState()?.clearCart?.(true); nav.navigate("SellScan"); }} />;
}

export function V3ScanWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  // V3-FIX-157: Read both "context" and "defaultContext" params for scan intent routing
  // V3-FIX-157: Canonical intent names — map legacy short names to canonical
  const rawContext = route?.params?.defaultContext ?? route?.params?.context ?? "sell_scan";
  const context = rawContext === "sell" ? "sell_scan"
    : rawContext === "procurement" ? "supplier_catalog_procurement_scan"
    : rawContext === "counter_purchase" ? "counter_purchase_scan"
    : rawContext;
  return <ScanScreenV3
    visible={true}
    defaultContext={context}
    onClose={() => nav.goBack()}
    onProductFound={(barcode, scanContext) => {
      // V3-FIX-157: Intent-specific routing via reactive store — canonical names
      if (scanContext === "supplier_catalog_procurement_scan" || scanContext === "counter_purchase_scan") {
        useScanResultStore.getState().setScanResult(barcode, scanContext);
      }
      nav.goBack();
    }}
    onNewProduct={(barcode) => nav.navigate("V3NewProduct", { barcode })}
    // GCP-STG-0316: Search by Name fallback — write to trigger store, parent screen reacts
    onSearchByName={(barcode) => {
      useSearchTriggerStore.getState().triggerSearch(barcode);
      nav.goBack();
    }}
  />;
}

export function V3NewProductWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  const barcode = route?.params?.barcode ?? "0000000000000";
  return <NewProductScreenV3 barcode={barcode} onClose={() => nav.goBack()} onProductAdded={() => nav.goBack()} />;
}

export function V3CompareWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  const params = route?.params ?? {};
  // V3-FIX-173: Pass canonical productId for supplier-offer identity lookup
  return <CompareScreenV3 visible={true} productName={params.productName ?? "Product"} productId={params.productId} packSize={params.packSize ?? ""} mrpMinor={params.mrpMinor ?? 1000} currentStock={params.currentStock ?? 0} sellPriceMinor={params.sellPriceMinor ?? 1000} weeklyNeed={params.weeklyNeed ?? 50} onClose={() => nav.goBack()} onOrder={() => nav.goBack()} />;
}

export function V3CounterPurchaseWrapper() {
  const nav = useNavigation<Nav>();
  // GCP-STG-0055: Wire camera scan to navigate to V3Scan with counter_purchase context
  return <CounterPurchaseScreenV3 onClose={() => nav.goBack()} onCameraScan={() => nav.navigate("V3Scan", { context: "counter_purchase_scan" })} />;
}

export function V3GRNWrapper() {
  const nav = useNavigation<Nav>();
  return <GRNScreenV3 onClose={() => nav.goBack()} />;
}

export function V3ReorderWrapper() {
  const nav = useNavigation<Nav>();
  return <ReorderScreenV3 onClose={() => nav.goBack()} />;
}

export function V3StockWrapper() {
  const nav = useNavigation<Nav>();
  // V3-FIX-080: Opening Stock navigates to scan in stock_in context
  return <StockScreenV3 onClose={() => nav.goBack()} onOpeningStock={() => { nav.goBack(); nav.navigate("V3Scan" as any, { context: "stock_in" }); }} />;
}

// GCP-STG-0062: Barcode sheet screen wrapper
export function V3BarcodeSheetWrapper() {
  const nav = useNavigation<Nav>();
  return <BarcodeSheetScreenV3 onClose={() => nav.goBack()} />;
}

export function V3KhataWrapper() {
  const nav = useNavigation<Nav>();
  return <KhataScreenV3 onClose={() => nav.goBack()} />;
}

export function V3FinanceWrapper() {
  const nav = useNavigation<Nav>();
  return <FinanceScreenV3 onClose={() => nav.goBack()} />;
}

export function V3ReportsWrapper() {
  const nav = useNavigation<Nav>();
  return <ReportsScreenV3 onClose={() => nav.goBack()} />;
}

export function V3CustomersWrapper() {
  const nav = useNavigation<Nav>();
  return <CustomersScreenV3 onClose={() => nav.goBack()} />;
}

// V3-FIX-093: Sales History screen
export function V3SalesHistoryWrapper() {
  const nav = useNavigation<Nav>();
  return <SalesHistoryScreenV3 onClose={() => nav.goBack()} />;
}

// GCP-STG-0748: Order tracking screen wrapper
export function V3OrderTrackingWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  const orderId = route?.params?.orderId ?? "";
  return <OrderTrackingScreenV3 orderId={orderId} onClose={() => nav.goBack()} />;
}

// GCP-STG-0749: Notifications screen wrapper
export function V3NotificationsWrapper() {
  const nav = useNavigation<Nav>();
  return <NotificationsScreenV3 onClose={() => nav.goBack()} />;
}

export function V3SettingsWrapper() {
  const nav = useNavigation<Nav>();
  return <SettingsScreenV3 onClose={() => nav.goBack()} onSwitchStaff={() => nav.reset({ index: 0, routes: [{ name: "V3StaffLogin" }] })} onLogout={() => nav.reset({ index: 0, routes: [{ name: "Splash" }] })} />;
}
