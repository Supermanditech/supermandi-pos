import React, { useMemo, useState, useCallback } from "react";
import { View, FlatList, TextInput, Pressable, StyleSheet, Text, ScrollView, ActivityIndicator, Modal, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";

import PurchaseItemCardV3, { type PurchaseItemData } from "../../components/v3/PurchaseItemCardV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import { useProductsStore } from "../../stores/productsStore";
import { recordManualInward } from "../../services/api/inventoryApi";
import { getPurchaseHistory } from "../../services/api/inventoryApi";
import { isOnline } from "../../services/networkStatus";
import { getSuppliers } from "../../services/api/suppliersApi";

// V3-041: Counter Purchase screen — wire real barcode lookup + createPurchase API

type CounterPurchaseScreenV3Props = {
  onClose: () => void;
};

export default function CounterPurchaseScreenV3({ onClose }: CounterPurchaseScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<PurchaseItemData[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [supplierPickerVisible, setSupplierPickerVisible] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<Array<{ id: string; name: string }>>([]);
  const getProductByBarcode = useProductsStore((s) => s.getProductByBarcode);

  const handleQtyChange = useCallback((idx: number, qty: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, qtyCases: qty } : it));
  }, []);

  const handlePriceChange = useCallback((idx: number, price: string) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, purchasePrice: price } : it));
  }, []);

  const handleSameAsLast = useCallback((idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx && it.lastPurchasePrice ? { ...it, purchasePrice: String(it.lastPurchasePrice), qtyCases: it.lastPurchaseQty ?? it.qtyCases } : it));
    showToast("Same as last order applied");
  }, []);

  const handleFieldChange = useCallback((idx: number, field: string, value: string) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      if (field === "caseSize") return { ...it, caseSize: parseInt(value, 10) || 1 };
      return { ...it, [field]: value };
    }));
  }, []);

  // V3-041: Real barcode lookup — checks productsStore first, then marks as new
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;
    try {
    // Prevent duplicate scan
    if (items.some((it) => it.barcode === barcode.trim())) {
      showToast("Already scanned");
      setBarcodeInput("");
      return;
    }
    const product = getProductByBarcode(barcode.trim());
    if (product) {
      // V3-FIX-078: Known product — carry real productId for authoritative inward record
      const newItem: PurchaseItemData = {
        barcode: product.barcode ?? barcode.trim(),
        name: product.name,
        brand: product.category ?? undefined,
        state: "existing" as const,
        qtyCases: 1,
        purchasePrice: product.priceMinor ? String(product.priceMinor / 100) : "",
        sellPrice: product.priceMinor ? String(product.priceMinor / 100) : "",
        caseSize: 1,
        productId: (product as any).id ?? (product as any).storeProductId,
        gstPct: (product as any).gstPct ?? (product as any).gstRate,
      } as PurchaseItemData & { productId?: string; gstPct?: number };
      setItems((prev) => [newItem, ...prev]);
      showToast(`Added: ${product.name}`);
    } else {
      // Unknown barcode — new product
      const newItem: PurchaseItemData = {
        barcode: barcode.trim(),
        state: "new" as const,
        qtyCases: 1,
        purchasePrice: "",
        sellPrice: "",
        caseSize: 1,
      };
      setItems((prev) => [newItem, ...prev]);
      showToast("New product — fill details below");
    }
    setBarcodeInput("");
    } catch (err) {
      showToast("Scan failed — try again");
    }
  }, [items, getProductByBarcode]);

  // PD-013: Confirm purchase with offline guard
  const handleConfirm = useCallback(async () => {
    if (items.length === 0) { showToast("No items to save"); return; }
    if (invoiceNo && !/^[A-Za-z0-9\-\/]{2,30}$/.test(invoiceNo.trim())) { showToast("Invoice # must be 2-30 alphanumeric characters"); return; }
    const incomplete = items.find((it) => !it.purchasePrice || parseFloat(it.purchasePrice) <= 0);
    if (incomplete) { showToast("Enter purchase price for all items"); return; }
    const online = await isOnline();
    if (!online) { showToast("Offline — purchase will be queued and synced when online"); }
    setSaving(true);
    try {
      // V3-FIX-078: Explicit product identity semantics
      //   - Known products (state==="existing"): use real productId — required, not barcode fallback
      //   - New/manual products (state==="new"): use barcode as provisional identity with explicit flag
      const txnItems = items.map((it) => ({
        productId: it.state === "existing" && (it as any).productId
          ? (it as any).productId
          : it.barcode, // New products: barcode is the provisional identity until master-cataloged
        quantity: it.qtyCases * (it.caseSize ?? 1),
        unitCost: Math.round(parseFloat(it.purchasePrice) * 100),
        isNewProduct: it.state === "new",
      }));
      // V3-FIX-078: Supplier linkage — two distinct paths:
      //   - Known supplier (picked from list): carry id + name (authoritative)
      //   - Ad-hoc supplier (free-text only): carry name only (manual entry)
      const pickedSupplier = supplierOptions.find((s) => s.name === supplierName);
      const supplierPayload = supplierName
        ? pickedSupplier
          ? { id: pickedSupplier.id, name: pickedSupplier.name } // Authoritative
          : { name: supplierName } // Ad-hoc free-text
        : null;
      await recordManualInward(
        txnItems,
        invoiceNo ? `Invoice: ${invoiceNo}` : undefined,
        supplierPayload,
      );
      showToast("Purchase confirmed! Stock updated.");
      setTimeout(onClose, 1200);
    } catch (err) {
      showToast("Failed to save purchase — check connection");
    } finally {
      setSaving(false);
    }
  }, [items, invoiceNo, supplierName, onClose]);

  // V3-FIX-078: Real per-item totals and GST from product metadata
  const totalAmount = items.reduce((s, it) => {
    const price = parseFloat(it.purchasePrice) || 0;
    return s + it.qtyCases * (it.caseSize ?? 1) * price;
  }, 0);
  const gstAmount = items.reduce((s, it) => {
    const price = parseFloat(it.purchasePrice) || 0;
    const lineTotal = it.qtyCases * (it.caseSize ?? 1) * price;
    const gstPct = (it as any).gstPct ?? 0; // 0 if unknown — no fabricated 18%
    return s + Math.round(lineTotal * gstPct / 100 * 100) / 100;
  }, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose} accessibilityLabel="Back"><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.headerTitle}>Counter Purchase</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Scan zone */}
      <View style={styles.scanZone}>
        <View style={styles.scanBtns}>
          <Pressable style={styles.cameraScanBtn} accessibilityLabel="Camera scan">
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M7 7h.01M7 12h10M7 17h.01" /></Svg>
            <Text style={styles.scanBtnText}>Camera Scan</Text>
          </Pressable>
          <Pressable style={styles.hidScanBtn} accessibilityLabel="HID scanner">
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2}><Rect x={2} y={4} width={20} height={16} rx={2} /><Path d="M6 8h.01M6 12h12M6 16h.01" /></Svg>
            <Text style={styles.hidBtnText}>HID Scanner</Text>
          </Pressable>
        </View>
        <View style={styles.scanInputRow}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2}><Rect x={3} y={3} width={18} height={18} rx={2} /></Svg>
          <TextInput style={styles.scanInput} value={barcodeInput} onChangeText={setBarcodeInput} placeholder="Scan barcode or type product name..." placeholderTextColor={colors.textTertiary} autoFocus />
          <View style={styles.readyDot} />
          <Text style={styles.readyText}>READY</Text>
          <Pressable style={styles.scanSubmit} onPress={() => handleBarcodeScan(barcodeInput)}><Text style={styles.scanSubmitText}>↵</Text></Pressable>
        </View>
        <Text style={styles.scanHint}>Scan continuously — each barcode auto-adds below</Text>
      </View>

      {/* Supplier selector */}
      <View style={styles.supplierRow}>
        <Text style={styles.supplierLabel}>SUPPLIER:</Text>
        <TextInput style={[styles.supplierSelect, { fontSize: 12, fontWeight: "600", color: colors.textPrimary }]} value={supplierName} onChangeText={setSupplierName} placeholder="Enter supplier name..." placeholderTextColor={colors.textTertiary} />
        <Pressable style={styles.supplierAdd} onPress={async () => {
          const online = await isOnline();
          if (!online) { showToast("Supplier list requires connection"); return; }
          try {
            const suppliers = await getSuppliers();
            setSupplierOptions(suppliers.map((s) => ({ id: s.id, name: s.businessName ?? s.tradeName ?? "Supplier" })));
            setSupplierPickerVisible(true);
          } catch { showToast("Could not load suppliers"); }
        }}><Text style={styles.supplierAddText}>+</Text></Pressable>
      </View>
      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceLabel}>Invoice #:</Text>
        <TextInput style={styles.invoiceInput} placeholder="Enter invoice no." value={invoiceNo} onChangeText={setInvoiceNo} placeholderTextColor={colors.textTertiary} />
        <Text style={styles.invoiceDate}>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text>
      </View>

      {/* Items list */}
      <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
        <View style={styles.itemsHeader}>
          <Text style={styles.itemsTitle}>SCANNED ITEMS ({items.length})</Text>
          <Pressable onPress={() => {
            const barcode = `MANUAL-${Date.now()}`;
            setItems((prev) => [{ barcode, state: "new" as const, qtyCases: 1, purchasePrice: "", sellPrice: "", caseSize: 1 }, ...prev]);
            showToast("Manual entry added — fill product details");
          }}><Text style={styles.addManual}>+ Add Manually</Text></Pressable>
        </View>

        {items.length === 0 && (
          <View style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textSecondary }}>No items scanned yet</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: "center" }}>Scan a barcode or type product name above to start adding items</Text>
          </View>
        )}
        {items.map((item, idx) => (
          <PurchaseItemCardV3
            key={item.barcode}
            item={item}
            onQtyChange={(qty) => handleQtyChange(idx, qty)}
            onPriceChange={(price) => handlePriceChange(idx, price)}
            onSameAsLast={() => handleSameAsLast(idx)}
            onFieldChange={(field, value) => handleFieldChange(idx, String(field), value)}
          />
        ))}

        {/* Why add details */}
        <View style={styles.whyCard}>
          <Text style={styles.whyTitle}>Why add full product details?</Text>
          {["Stock sync — auto inventory update", "GST compliance — HSN in invoices", "Margin tracking — real-time profit", "Expiry alerts — FEFO warnings", "Supplier ledger — payment tracking", "Reorder intelligence — smart suggestions"].map((t) => (
            <Text key={t} style={styles.whyItem}>✓ {t}</Text>
          ))}
        </View>
      </ScrollView>

      {/* Footer summary */}
      <View style={styles.footer}>
        <View style={styles.footerTop}>
          <Text style={styles.footerMeta}>{items.length} items{supplierName ? ` · ${supplierName}` : ""}{invoiceNo ? ` · ${invoiceNo}` : ""}</Text>
          <Text style={styles.footerCount}>{items.filter(i => i.state === "repeat").length} repeat · {items.filter(i => i.state === "new").length} new</Text>
        </View>
        <View style={styles.footerRow}><Text style={styles.footerLabel}>Subtotal</Text><Text style={styles.footerValue}>₹{Math.round(totalAmount).toLocaleString("en-IN")}</Text></View>
        <View style={styles.footerRow}><Text style={styles.footerLabel}>GST (mixed rates)</Text><Text style={styles.footerValue}>₹{Math.round(gstAmount).toLocaleString("en-IN")}</Text></View>
        <View style={[styles.footerRow, styles.footerTotal]}><Text style={styles.totalLabel}>Grand Total</Text><Text style={styles.totalValue}>₹{Math.round(totalAmount + gstAmount).toLocaleString("en-IN")}</Text></View>
        <View style={styles.footerActions}>
          <Pressable style={styles.draftBtn} onPress={async () => {
            if (items.length === 0) { showToast("No items to save"); return; }
            const draft = { items, supplierName, invoiceNo, savedAt: Date.now() };
            await AsyncStorage.setItem("supermandi.purchase.draft", JSON.stringify(draft));
            showToast("Draft saved — restore on next visit");
          }}><Text style={styles.draftText}>Save Draft</Text></Pressable>
          <Pressable style={styles.waBtn} onPress={() => {
            if (items.length === 0) { showToast("No items to send"); return; }
            const itemList = items.map((it) => `• ${it.name ?? it.barcode} ×${it.qtyCases} @ ₹${it.purchasePrice}`).join("\n");
            const msg = encodeURIComponent(`*Purchase Order*${supplierName ? `\nSupplier: ${supplierName}` : ""}${invoiceNo ? `\nInvoice: ${invoiceNo}` : ""}\n\n${itemList}\n\n*Total: ₹${Math.round(totalAmount + gstAmount).toLocaleString("en-IN")}*`);
            Linking.openURL(`whatsapp://send?text=${msg}`).catch(() => showToast("WhatsApp not installed"));
          }}>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="#fff"><Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><Path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.72-1.391A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" /></Svg>
            <Text style={styles.waBtnText}>Send</Text>
          </Pressable>
          <Pressable style={[styles.confirmBtn, saving && { opacity: 0.6 }]} onPress={handleConfirm} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmText}>Confirm</Text>}
          </Pressable>
        </View>
      </View>

      {/* DA-018: Supplier picker modal */}
      <Modal visible={supplierPickerVisible} transparent animationType="slide" onRequestClose={() => setSupplierPickerVisible(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "60%" }}>
            <Text style={{ fontSize: 16, fontWeight: "800", marginBottom: 12 }}>Select Supplier</Text>
            <ScrollView>
              {supplierOptions.map((s) => (
                <Pressable key={s.id} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => { setSupplierName(s.name); setSupplierPickerVisible(false); }}>
                  <Text style={{ fontSize: 14, fontWeight: "600" }}>{s.name}</Text>
                </Pressable>
              ))}
              {supplierOptions.length === 0 && <Text style={{ padding: 20, textAlign: "center", color: colors.textTertiary }}>No suppliers found</Text>}
            </ScrollView>
            <Pressable onPress={() => setSupplierPickerVisible(false)} style={{ padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: "center", marginTop: 8 }}>
              <Text style={{ fontWeight: "700", color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    // Scan
    scanZone: { padding: 12, backgroundColor: colors.primaryLight },
    scanBtns: { flexDirection: "row", gap: 8, marginBottom: 8 },
    cameraScanBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, backgroundColor: colors.primary, borderRadius: 14 },
    scanBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
    hidScanBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 2, borderColor: colors.primary },
    hidBtnText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
    scanInputRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 2, borderColor: colors.primary },
    scanInput: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textPrimary },
    readyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
    readyText: { fontSize: 9, color: colors.success, fontWeight: "700" },
    scanSubmit: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    scanSubmitText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    scanHint: { fontSize: 9, color: colors.textTertiary, textAlign: "center", marginTop: 4 },
    // Supplier
    supplierRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 6, backgroundColor: colors.surface },
    supplierLabel: { fontSize: 10, fontWeight: "700", color: colors.textTertiary },
    supplierSelect: { flex: 1, padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
    supplierText: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
    supplierAdd: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    supplierAddText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    invoiceRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingBottom: 6, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    invoiceLabel: { fontSize: 9, color: colors.textTertiary },
    invoiceInput: { fontSize: 9, fontWeight: "600", borderBottomWidth: 1, borderBottomColor: colors.border, width: 100 },
    invoiceDate: { fontSize: 9, color: colors.textTertiary, marginLeft: "auto" },
    // Items
    itemsList: { flex: 1, padding: 14 },
    itemsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    itemsTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8 },
    addManual: { fontSize: 10, fontWeight: "700", color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    // Why card
    whyCard: { padding: 12, backgroundColor: colors.primaryLight, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, marginTop: 4 },
    whyTitle: { fontSize: 11, fontWeight: "700", color: colors.primary, marginBottom: 4 },
    whyItem: { fontSize: 10, color: colors.textSecondary, paddingVertical: 2 },
    // Footer
    footer: { padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    footerTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    footerMeta: { fontSize: 11, color: colors.textTertiary },
    footerCount: { fontSize: 11, color: colors.success, fontWeight: "700" },
    footerRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    footerLabel: { fontSize: 12, color: colors.textTertiary },
    footerValue: { fontSize: 12, fontWeight: "700" },
    footerTotal: { borderTopWidth: 2, borderTopColor: colors.textPrimary, paddingTop: 6, marginTop: 4 },
    totalLabel: { fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
    totalValue: { fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
    footerActions: { flexDirection: "row", gap: 8, marginTop: 10 },
    draftBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    draftText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    waBtn: { width: 48, paddingVertical: 12, borderRadius: 12, backgroundColor: "#25D366", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
    waBtnText: { fontSize: 10, fontWeight: "700", color: "#fff" },
    confirmBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" },
    confirmText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  });
}
