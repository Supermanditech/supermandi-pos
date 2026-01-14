// SEARCH-SELL-UX-001: SKU Picker Modal for 2-step SELL add
// First tap shows this picker, second tap adds selected SKU

import React, { useCallback } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import type { StoreSearchGroup, StoreSkuMatch } from "../../services/api/sellSearchApi";
import { getLocalizedGroupName, getLocalizedBrand } from "../../services/api/sellSearchApi";

// =============================================================================
// TYPES
// =============================================================================

export interface SkuPickerModalProps {
  visible: boolean;
  group: StoreSearchGroup | null;
  currency?: string;
  onSelectSku: (sku: StoreSkuMatch) => void;
  onClose: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SkuPickerModal({
  visible,
  group,
  currency = "INR",
  onSelectSku,
  onClose,
}: SkuPickerModalProps) {
  const handleSelectSku = useCallback(
    (sku: StoreSkuMatch) => {
      onSelectSku(sku);
      onClose();
    },
    [onSelectSku, onClose]
  );

  const renderSkuRow = useCallback(
    ({ item }: { item: StoreSkuMatch }) => {
      const price = item.sellPrice ? formatMoney(item.sellPrice, currency) : "--";
      const stockLabel =
        item.currentStock > 0
          ? `${item.currentStock} in stock`
          : "Out of stock";
      const stockColor =
        item.currentStock > 10
          ? theme.colors.success
          : item.currentStock > 0
            ? theme.colors.warning
            : theme.colors.error;

      return (
        <Pressable
          style={styles.skuRow}
          onPress={() => handleSelectSku(item)}
          android_ripple={{ color: theme.colors.border }}
        >
          <View style={styles.skuRowLeft}>
            {item.barcode && (
              <View style={styles.barcodeRow}>
                <MaterialCommunityIcons
                  name="barcode"
                  size={14}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.barcodeText}>{item.barcode}</Text>
              </View>
            )}
            {item.displayName && (
              <Text style={styles.displayName} numberOfLines={1}>
                {item.displayName}
              </Text>
            )}
            <View style={styles.stockRow}>
              <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
              <Text style={[styles.stockText, { color: stockColor }]}>
                {stockLabel}
              </Text>
            </View>
          </View>
          <View style={styles.skuRowRight}>
            <Text style={styles.priceText}>{price}</Text>
            <MaterialCommunityIcons
              name="plus-circle"
              size={24}
              color={theme.colors.primary}
            />
          </View>
        </Pressable>
      );
    },
    [currency, handleSelectSku]
  );

  if (!group) return null;

  // TR-PEND-006: Use localized display names for Hindi UX parity
  const localizedName = getLocalizedGroupName(group);
  const localizedBrand = getLocalizedBrand(group);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {localizedName}
              </Text>
              {localizedBrand && (
                <Text style={styles.headerBrand}>{localizedBrand}</Text>
              )}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          </View>

          {/* Instruction */}
          <Text style={styles.instruction}>
            Select a variant to add to cart:
          </Text>

          {/* SKU List */}
          <FlatList
            data={group.matches}
            keyExtractor={(item) => item.storeProductId}
            renderItem={renderSkuRow}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  headerBrand: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  instruction: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  skuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  skuRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  skuRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  barcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  barcodeText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: "monospace",
  },
  displayName: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockText: {
    fontSize: 12,
  },
  priceText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
});

export default SkuPickerModal;
