import React from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

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
import KhataScreenV3 from "./KhataScreenV3";
import SalesHistoryScreenV3 from "./SalesHistoryScreenV3";
import FinanceScreenV3 from "./FinanceScreenV3";
import ReportsScreenV3 from "./ReportsScreenV3";
import CustomersScreenV3 from "./CustomersScreenV3";
import SettingsScreenV3 from "./SettingsScreenV3";

type Nav = NativeStackNavigationProp<any>;

// V3-FIX-157: Reactive scan result store for intent-specific routing
import { useScanResultStore } from "../../stores/scanResultStore";

// V3-FIX-071: Payment chooser navigates to child screens
export function V3PaymentWrapper() {
  const nav = useNavigation<Nav>();
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
  const context = route?.params?.defaultContext ?? route?.params?.context ?? "sell";
  return <ScanScreenV3
    visible={true}
    defaultContext={context}
    onClose={() => nav.goBack()}
    onProductFound={(barcode, scanContext) => {
      // V3-FIX-157: Intent-specific routing via reactive store
      if (scanContext === "procurement" || scanContext === "counter_purchase") {
        useScanResultStore.getState().setScanResult(barcode, scanContext);
      }
      nav.goBack();
    }}
    onNewProduct={(barcode) => nav.navigate("V3NewProduct", { barcode })}
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
  return <CompareScreenV3 visible={true} productName={params.productName ?? "Product"} packSize={params.packSize ?? ""} mrpMinor={params.mrpMinor ?? 1000} currentStock={params.currentStock ?? 0} sellPriceMinor={params.sellPriceMinor ?? 1000} weeklyNeed={params.weeklyNeed ?? 50} onClose={() => nav.goBack()} onOrder={() => nav.goBack()} />;
}

export function V3CounterPurchaseWrapper() {
  const nav = useNavigation<Nav>();
  return <CounterPurchaseScreenV3 onClose={() => nav.goBack()} />;
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

export function V3SettingsWrapper() {
  const nav = useNavigation<Nav>();
  return <SettingsScreenV3 onClose={() => nav.goBack()} onSwitchStaff={() => nav.reset({ index: 0, routes: [{ name: "V3StaffLogin" }] })} onLogout={() => nav.reset({ index: 0, routes: [{ name: "Splash" }] })} />;
}
