import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import PosStatusBar from "../components/PosStatusBar";
import { notifyHidScan } from "../services/hidScannerService";
import { useCartStore, type CartItem as StoreCartItem } from "../stores/cartStore";
import { resolveScan, setProductPrice, type ScanProduct } from "../services/api/scanApi";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { formatMoney } from "../utils/money";
import { ApiError } from "../services/api/apiClient";
import { clearDeviceSession } from "../services/deviceSession";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme } from "../theme";

/* ---------------- NAV TYPES ---------------- */

type RootStackParamList = {
  SellScan: undefined;
  CollectPayment: undefined;
  Payment: undefined;
  EnrollDevice: undefined;
  DeviceBlocked: undefined;
};

type NavProp = NativeStackNavigationProp<RootStackParamList, "SellScan">;

/* ---------------- TYPES ---------------- */

type PosMode = "SELL" | "DIGITISE";

/* ---------------- SCREEN ---------------- */

export default function SellScanScreen() {
  const navigation = useNavigation<NavProp>();
  const scanInputRef = useRef<TextInput>(null);
  const lastScanRef = useRef<{ code: string; mode: PosMode; ts: number } | null>(null);

  /* ---------- STATE ---------- */
  const [mode, setMode] = useState<PosMode>("SELL");
  const [scanInput, setScanInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [priceModal, setPriceModal] = useState<{ product: ScanProduct } | null>(
    null
  );
  const [priceInput, setPriceInput] = useState("");
  const [priceSubmitting, setPriceSubmitting] = useState(false);
  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [deviceActive, setDeviceActive] = useState<boolean | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [discountInput, setDiscountInput] = useState("");
  const [discountEditing, setDiscountEditing] = useState(false);

  const {
    items,
    total,
    discountAmount,
    addItem,
    applyDiscount,
    removeDiscount,
    clearCart: clearCartStore
  } = useCartStore();

  /* ---------- DERIVED ---------- */
  const currency = items[0]?.currency ?? "INR";
  const totalLabel = formatMoney(total, currency);
  const collectDisabled = storeActive === false;
  const payDisabled = items.length === 0 || storeActive === false;

  /* ---------- ACTIONS ---------- */

  const addProductToCart = (product: ScanProduct, priceMinorOverride?: number) => {
    const priceMinor = priceMinorOverride ?? product.priceMinor;
    if (priceMinor === null || priceMinor === undefined) {
      return;
    }

    addItem({
      id: product.id,
      name: product.name,
      priceMinor,
      currency: product.currency,
      barcode: product.barcode,
    });
  };

  const applyDiscountInput = () => {
    const parsed = Number(discountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      removeDiscount();
      return;
    }

    const minor = Math.round(parsed * 100);
    applyDiscount({ type: "fixed", value: minor });
  };

  const handleCollectPayment = () => {
    if (storeActive === false) {
      Alert.alert("POS Inactive", POS_MESSAGES.storeInactive);
      return;
    }
    navigation.navigate("CollectPayment");
  };

  const handleDeviceAuthError = async (error: ApiError): Promise<boolean> => {
    if (error.message === "device_inactive") {
      navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
      return true;
    }
    if (error.message === "device_unauthorized") {
      await clearDeviceSession();
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    if (error.message === "device_not_enrolled") {
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    return false;
  };

  const handleScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || isResolving || priceModal) return;

    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.code === trimmed && last.mode === mode && now - last.ts < 500) {
      return;
    }
    lastScanRef.current = { code: trimmed, mode, ts: now };

    if (storeActive === false) {
      Alert.alert("POS Inactive", POS_MESSAGES.storeInactive);
      return;
    }

    notifyHidScan();
    setIsResolving(true);

    try {
      const result = await resolveScan({
        scanValue: trimmed,
        mode
      });

      if (result.action === "IGNORED") {
        return;
      }

      if (mode === "DIGITISE") {
        if (result.action === "ALREADY_DIGITISED") {
          Alert.alert("Already saved", "Already digitised / known.");
          return;
        }
        Alert.alert("Saved", POS_MESSAGES.digitiseSaved);
        return;
      }

      if (result.action === "ADD_TO_CART" && result.product.priceMinor !== null) {
        addProductToCart(result.product);
        return;
      }

      if (result.action === "PROMPT_PRICE") {
        setPriceInput("");
        setPriceModal({ product: result.product });
        return;
      }

      Alert.alert("Scan Result", "Unable to add item from scan.");
    } catch (error) {
      if (error instanceof ApiError) {
        if (await handleDeviceAuthError(error)) {
          return;
        }
        if (error.message === "store_inactive") {
          setStoreActive(false);
          Alert.alert("POS Inactive", POS_MESSAGES.storeInactive);
          return;
        }
        if (error.message === "store not found") {
          Alert.alert("Store Missing", "Store not found. Check Superadmin setup.");
          return;
        }
      }
      Alert.alert("Scan Failed", "Could not resolve scan. Check connection.");
    } finally {
      setIsResolving(false);
      setScanInput("");
    }
  };

  const handlePriceSubmit = async () => {
    if (!priceModal || priceSubmitting) return;

    const parsed = Number(priceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert("Invalid Price", "Enter a valid selling price.");
      return;
    }

    const priceMinor = Math.round(parsed * 100);
    setPriceSubmitting(true);

    try {
      const updated = await setProductPrice({
        productId: priceModal.product.id,
        priceMinor
      });
      addProductToCart(updated, priceMinor);
      setPriceModal(null);
      setPriceInput("");
    } catch (error) {
      if (error instanceof ApiError) {
        if (await handleDeviceAuthError(error)) {
          return;
        }
        if (error.message === "store_inactive") {
          setStoreActive(false);
          Alert.alert("POS Inactive", POS_MESSAGES.storeInactive);
          return;
        }
        if (error.message === "product not found") {
          Alert.alert("Product Missing", "Product not found. Re-scan the item.");
          return;
        }
      }
      Alert.alert("Price Save Failed", "Could not save price. Try again.");
    } finally {
      setPriceSubmitting(false);
    }
  };

  const handlePriceCancel = () => {
    setPriceModal(null);
    setPriceInput("");
  };

  const handleClearCart = () => {
    if (items.length === 0) return;

    Alert.alert("Clear Cart", "Cancel current sale?", [
      { text: "No" },
      {
        text: "Yes",
        style: "destructive",
        onPress: () => clearCartStore(),
      },
    ]);
  };

  /* ---------- EFFECTS ---------- */

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const status = await fetchUiStatus();
        if (cancelled) return;
        setStoreActive(Boolean(status.storeActive));
        setDeviceActive(Boolean(status.deviceActive));
        setPendingOutboxCount(status.pendingOutboxCount ?? 0);
        if (status.deviceActive === false) {
          navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError) {
          const handled = await handleDeviceAuthError(error);
          if (handled) return;
          if (error.message === "store_inactive") {
            setStoreActive(false);
            return;
          }
          if (error.message === "store not found") {
            setStoreActive(false);
            return;
          }
        }
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (discountEditing) return;
    if (discountAmount > 0) {
      setDiscountInput((discountAmount / 100).toFixed(2));
    } else {
      setDiscountInput("0.00");
    }
  }, [discountAmount, discountEditing]);

  useEffect(() => {
    if (items.length === 0) {
      removeDiscount();
      setDiscountInput("0.00");
    }
  }, [items.length, removeDiscount]);

  useEffect(() => {
    if (!priceModal && !isResolving) {
      scanInputRef.current?.focus();
    }
  }, [priceModal, isResolving, mode]);

  /* ---------- UI ---------- */

  return (
    <View style={styles.container}>
      {/* REAL STATUS BAR (DEVICE STATE) */}
      <PosStatusBar
        storeActive={storeActive}
        deviceActive={deviceActive}
        pendingOutboxCount={pendingOutboxCount}
        mode={mode}
      />

      {/* MODE SELECTOR */}
      <View style={styles.modeRow}>
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, mode === "SELL" && styles.segmentActive]}
            onPress={() => setMode("SELL")}
          >
            <Text style={[styles.segmentText, mode === "SELL" && styles.segmentTextActive]}>
              SELL
            </Text>
          </Pressable>

          <Pressable
            style={[styles.segment, mode === "DIGITISE" && styles.segmentActive]}
            onPress={() => setMode("DIGITISE")}
          >
            <Text style={[styles.segmentText, mode === "DIGITISE" && styles.segmentTextActive]}>
              DIGITISE
            </Text>
          </Pressable>
        </View>
      </View>

      {/* SCAN INPUT (UNIFIED ENTRY POINT) */}
      <View style={styles.scanCard}>
        <Text style={styles.scanLabel}>Scan barcode or type and press Enter</Text>
        <TextInput
          style={styles.scanInput}
          placeholder="Scan barcode"
          placeholderTextColor={theme.colors.textTertiary}
          value={scanInput}
          autoFocus
          onChangeText={setScanInput}
          onSubmitEditing={() => handleScan(scanInput)}
          blurOnSubmit={false}
          editable={!priceModal && !isResolving}
          ref={scanInputRef}
        />
      </View>

      {/* CART (SELL ONLY) */}
      {mode === "SELL" && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={styles.cart}
          contentContainerStyle={items.length === 0 ? styles.cartEmpty : undefined}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No items yet. Scan a product to start a bill.</Text>
          }
          renderItem={({ item }: { item: StoreCartItem }) => (
            <View style={styles.cartRow}>
              <Text style={styles.itemName}>
                {item.name} × {item.quantity}
              </Text>
              <Text style={styles.itemPrice}>
                {formatMoney(item.priceMinor * item.quantity, item.currency ?? "INR")}
              </Text>
            </View>
          )}
        />
      )}

      {mode === "SELL" && (
        <View style={styles.discountRow}>
          <Text style={styles.discountLabel}>Discount</Text>
          <TextInput
            style={styles.discountInput}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={discountInput}
            onFocus={() => setDiscountEditing(true)}
            onBlur={() => {
              setDiscountEditing(false);
              applyDiscountInput();
            }}
            onChangeText={setDiscountInput}
          />
        </View>
      )}

      {/* FOOTER */}
      <View style={styles.footer}>
        {mode === "SELL" && (
          <Pressable onPress={handleClearCart} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear Cart</Text>
          </Pressable>
        )}

        <View style={styles.ctaRow}>
          <Pressable
            style={[
              styles.collectBtn,
              collectDisabled && styles.ctaDisabled
            ]}
            onPress={handleCollectPayment}
            disabled={collectDisabled}
          >
            <Text style={styles.collectText}>COLLECT PAYMENT</Text>
          </Pressable>

          {mode === "SELL" && (
            <Pressable
              style={[
                styles.payBtn,
                payDisabled && styles.ctaDisabled
              ]}
              disabled={payDisabled}
              onPress={() => navigation.navigate("Payment")}
            >
              <Text style={styles.payText}>PAY {totalLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Modal
        visible={priceModal !== null}
        transparent
        animationType="fade"
        onRequestClose={handlePriceCancel}
      >
        <KeyboardAvoidingView
          style={styles.priceOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.priceCard}>
            <Text style={styles.priceTitle}>Enter selling price</Text>
            <Text style={styles.priceSubtitle}>
              {priceModal?.product.name ?? "Scanned item"}
            </Text>
            <Text style={styles.priceHint}>{POS_MESSAGES.pricePrompt}</Text>

            <TextInput
              style={styles.priceInput}
              value={priceInput}
              onChangeText={setPriceInput}
              placeholder="Price"
              keyboardType="decimal-pad"
              autoFocus
            />

            <View style={styles.priceActions}>
              <Pressable
                style={styles.priceCancel}
                onPress={handlePriceCancel}
                disabled={priceSubmitting}
              >
                <Text style={styles.priceCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.priceSave}
                onPress={handlePriceSubmit}
                disabled={priceSubmitting}
              >
                <Text style={styles.priceSaveText}>
                  {priceSubmitting ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 12,
  },

  modeRow: {
    marginBottom: 12,
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 0,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: theme.colors.textInverse,
  },

  scanCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  scanLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  scanInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.textPrimary,
  },

  cart: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 8,
    overflow: "hidden",
  },
  cartEmpty: {
    flexGrow: 1,
    paddingVertical: 24,
  },
  emptyText: {
    textAlign: "center",
    color: theme.colors.textTertiary,
  },

  cartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.primaryDark,
  },
  discountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    marginTop: 10,
  },
  discountLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  discountInput: {
    minWidth: 110,
    textAlign: "right",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceAlt,
  },

  footer: {
    paddingTop: 12,
  },
  clearBtn: {
    alignItems: "center",
    marginBottom: 10,
  },
  clearText: {
    color: theme.colors.textTertiary,
    fontWeight: "600",
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
  },
  collectBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
  },
  collectText: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.primary,
  },
  payBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  payText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: "800",
  },

  priceOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlayLight,
    justifyContent: "center",
    padding: 20,
  },
  priceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  priceTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
    color: theme.colors.textPrimary,
  },
  priceSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  priceHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  priceInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.textPrimary,
  },
  priceActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  priceCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  priceCancelText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  priceSave: {
    backgroundColor: theme.colors.primaryDark,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  priceSaveText: {
    color: theme.colors.textInverse,
    fontWeight: "800",
  },
});
