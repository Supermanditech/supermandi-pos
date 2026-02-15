/**
 * T-059: VariantPickerModal
 *
 * Shows retail selling variants for LOOSE_BULK products.
 * When a loose product (e.g., Flour 50kg) is scanned, this modal
 * displays the available retail variants (1kg, 5kg, 500gm, etc.)
 * so the POS operator can pick the correct selling unit.
 *
 * If no variants exist, falls through to direct cart add with parent price.
 */

import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
} from "react-native";
import {
  fetchRetailVariants,
  type RetailVariant,
  type StoreLookupProduct,
} from "../../services/api/productsApi";

export type VariantPickerRequest = {
  barcode: string;
  format?: string;
  product: StoreLookupProduct;
};

type VariantPickerModalProps = {
  visible: boolean;
  request: VariantPickerRequest | null;
  onClose: () => void;
  onSelect: (variant: RetailVariant, parentProduct: StoreLookupProduct) => void;
  onFallback: (parentProduct: StoreLookupProduct, barcode: string) => void;
};

export function VariantPickerModal({
  visible,
  request,
  onClose,
  onSelect,
  onFallback,
}: VariantPickerModalProps) {
  const [variants, setVariants] = useState<RetailVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && request?.product.store_product_id) {
      loadVariants(request.product.store_product_id);
    }
  }, [visible, request?.product.store_product_id]);

  async function loadVariants(storeProductId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchRetailVariants(storeProductId);
      setVariants(result);
      // If no variants, fall back to parent product direct add
      if (result.length === 0 && request) {
        onFallback(request.product, request.barcode);
        onClose();
      }
    } catch {
      setError("Failed to load variants");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelect(variant: RetailVariant) {
    if (request) {
      onSelect(variant, request.product);
      onClose();
    }
  }

  function handleSellAsParent() {
    if (request) {
      onFallback(request.product, request.barcode);
      onClose();
    }
  }

  function formatPrice(paise: number): string {
    const rupees = paise / 100;
    return `\u20B9${rupees.toFixed(rupees % 1 === 0 ? 0 : 2)}`;
  }

  const renderVariant = ({ item }: { item: RetailVariant }) => (
    <Pressable
      style={styles.variantCard}
      onPress={() => handleSelect(item)}
    >
      <View style={styles.variantInfo}>
        <Text style={styles.variantLabel}>{item.variantLabel}</Text>
        <Text style={styles.variantDetail}>
          {item.variantQty} {item.baseUnit}
        </Text>
      </View>
      <View style={styles.variantPrice}>
        <Text style={styles.priceText}>{formatPrice(item.sellPriceMinor)}</Text>
      </View>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Select Variant</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {request?.product.store_display_name || request?.product.global_name || ""}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>&times;</Text>
            </Pressable>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>Loading variants...</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => request?.product.store_product_id && loadVariants(request.product.store_product_id)}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={variants}
              renderItem={renderVariant}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}

          {/* Footer: Sell as parent (no variant) */}
          {!isLoading && !error && variants.length > 0 && (
            <Pressable
              style={styles.parentBtn}
              onPress={handleSellAsParent}
            >
              <Text style={styles.parentBtnText}>
                Sell as bulk ({formatPrice(request?.product.sell_price ?? 0)}/{request?.product.unit || "unit"})
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    fontSize: 24,
    color: "#6b7280",
  },
  centered: {
    padding: 40,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 14,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "#2563eb",
    borderRadius: 6,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  list: {
    padding: 16,
  },
  variantCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  variantInfo: {
    flex: 1,
  },
  variantLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  variantDetail: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  variantPrice: {
    paddingLeft: 12,
  },
  priceText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#059669",
  },
  parentBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  parentBtnText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "500",
  },
});
