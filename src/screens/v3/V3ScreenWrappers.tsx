import React from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

// V3-001: Wrapper components for React Navigation stack registration
// Each wrapper passes navigation.goBack() as onClose and navigation params as props

import PaymentScreenV3 from "./PaymentScreenV3";
import SuccessScreenV3 from "./SuccessScreenV3";
import ScanScreenV3 from "./ScanScreenV3";
import NewProductScreenV3 from "./NewProductScreenV3";
import CompareScreenV3 from "./CompareScreenV3";
import CounterPurchaseScreenV3 from "./CounterPurchaseScreenV3";
import GRNScreenV3 from "./GRNScreenV3";
import ReorderScreenV3 from "./ReorderScreenV3";
import StockScreenV3 from "./StockScreenV3";
import KhataScreenV3 from "./KhataScreenV3";
import FinanceScreenV3 from "./FinanceScreenV3";
import ReportsScreenV3 from "./ReportsScreenV3";
import CustomersScreenV3 from "./CustomersScreenV3";
import SettingsScreenV3 from "./SettingsScreenV3";

type Nav = NativeStackNavigationProp<any>;

export function V3PaymentWrapper() {
  const nav = useNavigation<Nav>();
  return <PaymentScreenV3 onBack={() => nav.goBack()} onComplete={(method) => nav.navigate("V3Success", { method })} />;
}

export function V3SuccessWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  const method = route?.params?.method ?? "CASH";
  return <SuccessScreenV3 paymentMethod={method} totalMinor={0} itemCount={0} onNewSale={() => nav.navigate("SellScan")} />;
}

export function V3ScanWrapper() {
  const nav = useNavigation<Nav>();
  return <ScanScreenV3 visible={true} onClose={() => nav.goBack()} onProductFound={() => nav.goBack()} onNewProduct={(barcode) => nav.navigate("V3NewProduct", { barcode })} />;
}

export function V3NewProductWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  const barcode = route?.params?.barcode ?? "0000000000000";
  return <NewProductScreenV3 barcode={barcode} onClose={() => nav.goBack()} onProductAdded={() => nav.goBack()} />;
}

export function V3CompareWrapper({ route }: any) {
  const nav = useNavigation<Nav>();
  return <CompareScreenV3 visible={true} productName={route?.params?.productName ?? "Product"} packSize="" mrpMinor={1000} currentStock={0} sellPriceMinor={1000} weeklyNeed={50} onClose={() => nav.goBack()} onOrder={() => nav.goBack()} />;
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
  return <StockScreenV3 onClose={() => nav.goBack()} />;
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

export function V3SettingsWrapper() {
  const nav = useNavigation<Nav>();
  return <SettingsScreenV3 onClose={() => nav.goBack()} />;
}
