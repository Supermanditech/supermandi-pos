import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { submitPurchaseDraft } from "../services/purchaseDraft";
import { usePurchaseDraftStore, type PurchaseDraftItem } from "../stores/purchaseDraftStore";
import { formatMoney } from "../utils/money";
import { theme } from "../theme";

type PurchaseScreenProps = {
  storeActive: boolean | null;
  scanDisabled: boolean;
  onOpenScanner: () => void;
};

type PurchaseItemUpdates = {
  quantity?: number;
  purchasePriceMinor?: number | null;
  sellingPriceMinor?: number | null;
};

type PurchaseItemRowProps = {
  item: PurchaseDraftItem;
  onUpdate: (barcode: string, updates: PurchaseItemUpdates) => void;
  onRemove: (barcode: string) => void;
};

const parsePriceInput = (text: string): number | null => {
  const normalized = text.replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

const parseQuantityInput = (text: string): number => {
  const value = Math.round(Number(text));
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
};

const formatPriceInput = (minor: number | null): string => {
  if (!minor || minor <= 0) return "";
  return (minor / 100).toFixed(2);
};

function PurchaseItemRow({ item, onUpdate, onRemove }: PurchaseItemRowProps) {
  const [qty, setQty] = useState(String(item.quantity));
  const [purchasePrice, setPurchasePrice] = useState(formatPriceInput(item.purchasePriceMinor));
  const [sellingPrice, setSellingPrice] = useState(formatPriceInput(item.sellingPriceMinor));

  useEffect(() => {
    setQty(String(item.quantity));
  }, [item.quantity]);

  useEffect(() => {
    setPurchasePrice(formatPriceInput(item.purchasePriceMinor));
  }, [item.purchasePriceMinor]);

  useEffect(() => {
    setSellingPrice(formatPriceInput(item.sellingPriceMinor));
  }, [item.sellingPriceMinor]);

  const statusComplete = item.status === "COMPLETE";

  return (
    <View style={styles.sheetRow}>
      <View style={[styles.sheetCell, styles.sheetCellItem]}>
        <Text style={styles.sheetItemName} numberOfLines={1}>
          {item.name || item.barcode}
        </Text>
        <Text style={styles.sheetItemBarcode} numberOfLines={1}>
          {item.barcode}
        </Text>
      </View>
      <View style={[styles.sheetCell, styles.sheetCellQty]}>
        <TextInput
          style={[styles.sheetInput, styles.sheetInputCenter]}
          value={qty}
          onChangeText={setQty}
          onEndEditing={() => onUpdate(item.barcode, { quantity: parseQuantityInput(qty) })}
          keyboardType="numeric"
        />
      </View>
      <View style={[styles.sheetCell, styles.sheetCellPrice]}>
        <TextInput
          style={[styles.sheetInput, styles.sheetInputRight]}
          value={purchasePrice}
          onChangeText={setPurchasePrice}
          onEndEditing={() => onUpdate(item.barcode, { purchasePriceMinor: parsePriceInput(purchasePrice) })}
          keyboardType="numeric"
        />
      </View>
      <View style={[styles.sheetCell, styles.sheetCellPrice]}>
        <TextInput
          style={[styles.sheetInput, styles.sheetInputRight]}
          value={sellingPrice}
          onChangeText={setSellingPrice}
          onEndEditing={() => onUpdate(item.barcode, { sellingPriceMinor: parsePriceInput(sellingPrice) })}
          keyboardType="numeric"
        />
      </View>
      <View style={[styles.sheetCell, styles.sheetCellStatus]}>
        <View
          style={[
            styles.sheetStatusDot,
            statusComplete ? styles.sheetStatusDotComplete : styles.sheetStatusDotIncomplete
          ]}
        />
        <Text
          style={[
            styles.sheetStatusText,
            statusComplete ? styles.sheetStatusTextComplete : styles.sheetStatusTextIncomplete
          ]}
          numberOfLines={1}
        >
          {statusComplete ? "Complete" : "Incomplete"}
        </Text>
      </View>
      <Pressable
        style={[styles.sheetCell, styles.sheetCellRemove, styles.sheetCellLast]}
        onPress={() => onRemove(item.barcode)}
        accessibilityLabel={`Remove ${item.name || item.barcode}`}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

export default function PurchaseScreen({ storeActive, scanDisabled, onOpenScanner }: PurchaseScreenProps) {
  const { items, updateItem, remove, hasIncomplete } = usePurchaseDraftStore();
  const hasOpenItems = hasIncomplete();

  const totalMinor = useMemo(() => {
    return items.reduce((sum, item) => {
      const price = item.purchasePriceMinor ?? 0;
      return sum + price * item.quantity;
    }, 0);
  }, [items]);

  const currency = items[0]?.currency ?? "INR";
  const totalLabel = formatMoney(totalMinor, currency);

  const submitDisabled = items.length === 0 || hasOpenItems || storeActive === false;

  const handleSubmit = async () => {
    try {
      const result = await submitPurchaseDraft();
      Alert.alert("Purchase submitted", `Purchase ID ${result.purchaseId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "purchase_failed";
      if (message === "purchase_incomplete") {
        Alert.alert("Complete required fields", "Fill quantity, purchase, and selling price for all items.");
        return;
      }
      if (message === "purchase_empty") {
        Alert.alert("No items", "Scan items before submitting a purchase.");
        return;
      }
      Alert.alert("Purchase failed", "Unable to submit purchase. Try again.");
    }
  };

  const header = (
    <View>
      <Pressable
        style={[styles.scanPad, scanDisabled && styles.ctaDisabled]}
        onPress={onOpenScanner}
        disabled={scanDisabled}
      >
        <View style={styles.scanLeft}>
          <MaterialCommunityIcons name="barcode-scan" size={24} color={theme.colors.primary} />
        </View>
        <View style={styles.scanCenter}>
          <Text style={styles.scanTitle}>Scan here</Text>
        </View>
        <View style={styles.scanRight}>
          <MaterialCommunityIcons name="qrcode-scan" size={22} color={theme.colors.primary} />
        </View>
      </Pressable>

      <View style={styles.draftHeader}>
        <Text style={styles.draftTitle}>Invoice Data Sheet</Text>
        <View style={styles.draftMeta}>
          <Text style={styles.draftMetaText}>{items.length} items</Text>
          <Text style={styles.draftTotal}>{totalLabel}</Text>
        </View>
      </View>

      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellItem, styles.sheetHeaderCellLeft]}>
          Item
        </Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellQty]}>Qty</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellPrice]}>Purchase</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellPrice]}>Selling</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellStatus]}>Status</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellRemove, styles.sheetCellLast]}> </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.barcode}
        renderItem={({ item }) => (
          <PurchaseItemRow
            item={item}
            onUpdate={updateItem}
            onRemove={remove}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No drafts yet.</Text>
            <Text style={styles.emptySubtext}>Scan items to start a purchase draft.</Text>
          </View>
        }
        contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.listContent}
      />
      <View style={styles.actionBar}>
        {storeActive === false ? (
          <Text style={styles.actionHint}>Store is inactive. Purchase is disabled.</Text>
        ) : hasOpenItems ? (
          <Text style={styles.actionHint}>Complete all item fields to submit.</Text>
        ) : null}
        <Pressable
          style={[styles.invoiceButton, scanDisabled && styles.ctaDisabled]}
          onPress={onOpenScanner}
          disabled={scanDisabled}
        >
          <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.invoiceText}>Scan Supplier Invoice</Text>
        </Pressable>
        <Pressable
          style={[styles.submitButton, submitDisabled && styles.ctaDisabled]}
          onPress={handleSubmit}
          disabled={submitDisabled}
        >
          <Text style={styles.submitText}>Submit Purchase</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: 12,
    paddingBottom: 170,
  },
  emptyContent: {
    padding: 12,
    paddingBottom: 170,
  },
  scanPad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  scanLeft: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  scanCenter: {
    flex: 1,
    alignItems: "flex-start",
    paddingHorizontal: 12,
    gap: 2,
  },
  scanTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  scanSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  scanRight: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  draftHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  draftMeta: {
    alignItems: "flex-end",
  },
  draftMetaText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  draftTotal: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  sheetHeader: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  sheetHeaderCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    textAlign: "center",
  },
  sheetHeaderCellLeft: {
    textAlign: "left",
  },
  sheetRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  sheetCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
  },
  sheetCellItem: {
    flex: 1.8,
    minWidth: 140,
    alignItems: "flex-start",
  },
  sheetCellQty: {
    flex: 0.6,
    minWidth: 60,
  },
  sheetCellPrice: {
    flex: 0.9,
    minWidth: 86,
  },
  sheetCellStatus: {
    flex: 0.9,
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sheetCellRemove: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCellLast: {
    borderRightWidth: 0,
  },
  sheetItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  sheetItemBarcode: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  sheetInputCenter: {
    textAlign: "center",
  },
  sheetInputRight: {
    textAlign: "right",
  },
  sheetStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  sheetStatusDotComplete: {
    backgroundColor: theme.colors.success,
  },
  sheetStatusDotIncomplete: {
    backgroundColor: theme.colors.warning,
  },
  sheetStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  sheetStatusTextComplete: {
    color: theme.colors.success,
  },
  sheetStatusTextIncomplete: {
    color: theme.colors.warning,
  },
  empty: {
    alignItems: "center",
    marginTop: 24,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  actionBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    ...theme.shadows.sm,
  },
  actionHint: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.warning,
  },
  invoiceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
  },
  invoiceText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  submitText: {
    color: theme.colors.textInverse,
    fontWeight: "800",
    fontSize: 14,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
});
