import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import PosStatusBar from "../components/PosStatusBar";
import { cacheDeviceInfo, fetchDeviceInfo, getCachedDeviceInfo } from "../services/deviceInfo";
import { notifyHidScan, wasHidScannerActive } from "../services/hidScannerService";
import { useCartStore, type CartItem as StoreCartItem } from "../stores/cartStore";
import { handleScan as handleGlobalScan, setScanRuntime, type ScanNotice } from "../services/scan/handleScan";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { formatMoney } from "../utils/money";
import { ApiError } from "../services/api/apiClient";
import { clearDeviceSession } from "../services/deviceSession";
import { POS_MESSAGES } from "../utils/uiStatus";
import { offlineDb } from "../services/offline/localDb";
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

type AddOverlayItem = {
  barcode: string;
  name: string;
  currency: string;
  priceMinor: number | null;
};

/* ---------------- SCREEN ---------------- */

export default function SellScanScreen() {
  const navigation = useNavigation<NavProp>();
  const hidInputRef = useRef<TextInput>(null);
  const hidBufferRef = useRef("");

  /* ---------- STATE ---------- */
  const [mode, setMode] = useState<PosMode>("SELL");
  const [hidInput, setHidInput] = useState("");
  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [deviceActive, setDeviceActive] = useState<boolean | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [deviceStoreId, setDeviceStoreId] = useState<string | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [discountInput, setDiscountInput] = useState("");
  const [discountEditing, setDiscountEditing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraScanned, setCameraScanned] = useState(false);
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  const [barcodePreview, setBarcodePreview] = useState<{ name: string; barcode: string } | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [lastAddMessage, setLastAddMessage] = useState<string | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [addOverlayOpen, setAddOverlayOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<AddOverlayItem[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [selectedAddItems, setSelectedAddItems] = useState<Record<string, AddOverlayItem>>({});
  const addMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    items,
    total,
    discountAmount,
    mutationHistory,
    applyDiscount,
    removeDiscount,
    clearCart: clearCartStore,
    undoLastAction,
    lockCart,
    locked
  } = useCartStore();

  /* ---------- DERIVED ---------- */
  const currency = items[0]?.currency ?? "INR";
  const totalLabel = formatMoney(total, currency);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const hasItems = items.length > 0;
  const collectDisabled = storeActive === false;
  const payDisabled = !hasItems || storeActive === false || locked;
  const cameraDisabled = storeActive === false;
  const scanDisabled = cameraDisabled || scannerOpen;
  const cartHint = locked
    ? "Cart locked"
    : discountAmount > 0
      ? "Discount applied"
      : itemCount === 0
        ? "Scan or add items"
        : itemCount <= 2
          ? "Add more items"
          : "Review bill";
  const selectedAddCount = Object.keys(selectedAddItems).length;

  /* ---------- ACTIONS ---------- */

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

  const handleDeviceAuthError = useCallback(async (error: ApiError): Promise<boolean> => {
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
  }, [navigation]);

  const handleStoreInactive = useCallback(() => {
    setStoreActive(false);
  }, []);

  useEffect(() => {
    setScanRuntime({
      intent: "SELL",
      mode,
      storeActive,
      onNotice: setScanNotice,
      onDeviceAuthError: handleDeviceAuthError,
      onStoreInactive: handleStoreInactive
    });
  }, [handleDeviceAuthError, handleStoreInactive, mode, storeActive]);

  const commitHidScan = (raw: string) => {
    const value = raw.trim();
    hidBufferRef.current = "";
    setHidInput("");
    if (value) {
      notifyHidScan(true);
      void handleGlobalScan(value);
    }
  };

  const handleHidChange = (text: string) => {
    if (scanDisabled) return;
    hidBufferRef.current = text;
    setHidInput(text);
  };

  const handleHidSubmit = () => {
    if (scanDisabled) return;
    commitHidScan(hidBufferRef.current);
  };

  const handleHidKeyPress = (event: { nativeEvent: { key: string } }) => {
    if (scanDisabled) return;
    if (event.nativeEvent.key === "Enter") {
      commitHidScan(hidBufferRef.current);
    }
  };

  const handleOpenCamera = async () => {
    if (cameraDisabled) return;
    if (wasHidScannerActive()) {
      setScanNotice({ tone: "info", message: "HID scanner detected. Use the scanner to scan." });
      return;
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setScanNotice({
          tone: "warning",
          message: "Camera permission is required to scan barcodes."
        });
        return;
      }
    }
    setCameraScanned(false);
    setScannerOpen(true);
  };

  const handleCameraScan = (value: string) => {
    if (!value) return;
    setCameraScanned(true);
    setScannerOpen(false);
    void handleGlobalScan(value);
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

  const addItemFromOverlay = (item: AddOverlayItem) => {
    useCartStore.getState().addItem({
      id: item.barcode,
      name: item.name,
      priceMinor: item.priceMinor ?? 0,
      currency: item.currency,
      barcode: item.barcode
    });

    if (item.priceMinor === null) {
      setScanNotice({ tone: "warning", message: POS_MESSAGES.newItemWarning });
    }
  };

  const toggleSelectedItem = (item: AddOverlayItem) => {
    setSelectedAddItems((prev) => {
      if (prev[item.barcode]) {
        const next = { ...prev };
        delete next[item.barcode];
        return next;
      }
      return { ...prev, [item.barcode]: item };
    });
  };

  const handleAddSelected = () => {
    const entries = Object.values(selectedAddItems);
    if (entries.length === 0) return;
    entries.forEach(addItemFromOverlay);
    setSelectedAddItems({});
  };

  const handleAddOverlaySubmit = () => {
    const value = addQuery.trim();
    if (!value) return;
    void handleGlobalScan(value);
    setAddQuery("");
  };

  const closeAddOverlay = () => {
    setAddOverlayOpen(false);
    setAddQuery("");
    setAddResults([]);
    setSelectedAddItems({});
  };

  const clearAddTimers = () => {
    if (addMessageTimerRef.current) {
      clearTimeout(addMessageTimerRef.current);
      addMessageTimerRef.current = null;
    }
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const handleUndo = () => {
    clearAddTimers();
    setLastAddMessage(null);
    setUndoVisible(false);
    undoLastAction();
  };

  /* ---------- EFFECTS ---------- */

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const status = await fetchUiStatus();
        if (cancelled) return;
        setStoreActive(status.storeActive ?? null);
        setDeviceActive(status.deviceActive ?? null);
        setDeviceStoreId(status.storeId ?? null);
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
  }, [handleDeviceAuthError, navigation]);

  useEffect(() => {
    let cancelled = false;

    const applyInfo = (info: { storeId: string | null; storeName: string | null }) => {
      if (cancelled) return;
      setDeviceStoreId(info.storeId ?? null);
      setStoreName(info.storeName ?? null);
    };

    const loadCached = async () => {
      const cached = await getCachedDeviceInfo();
      if (cached) {
        applyInfo(cached);
      }
    };

    const refresh = async () => {
      try {
        const info = await fetchDeviceInfo();
        applyInfo(info);
        await cacheDeviceInfo(info);
      } catch (error) {
        if (error instanceof ApiError) {
          await handleDeviceAuthError(error);
        }
      }
    };

    loadCached();
    void refresh();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });

    const interval = setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(interval);
    };
  }, [handleDeviceAuthError]);

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
    if (scannerOpen) return;
    if (scanDisabled) return;
    requestAnimationFrame(() => {
      hidInputRef.current?.focus();
    });
  }, [scannerOpen, scanDisabled]);

  useEffect(() => {
    const lastMutation = mutationHistory[mutationHistory.length - 1];
    if (!lastMutation || lastMutation.type !== "UPSERT_ITEM") return;

    const currentItem = items.find(item => item.id === lastMutation.itemId);
    if (!currentItem) return;

    const previousQty = lastMutation.previousItem?.quantity ?? 0;
    if (currentItem.quantity <= previousQty) return;

    const variantLabel =
      (currentItem.metadata?.variantName as string | undefined)
      ?? (currentItem.metadata?.variant as string | undefined)
      ?? currentItem.sku
      ?? "";
    const variantSuffix = variantLabel ? ` ${variantLabel}` : "";

    clearAddTimers();
    setLastAddMessage(`✔ ${currentItem.name}${variantSuffix} added`);
    setUndoVisible(true);

    addMessageTimerRef.current = setTimeout(() => {
      setLastAddMessage(null);
    }, 2000);

    undoTimerRef.current = setTimeout(() => {
      setUndoVisible(false);
    }, 3000);
  }, [items, mutationHistory]);

  useEffect(() => {
    return () => {
      clearAddTimers();
    };
  }, []);

  useEffect(() => {
    if (mode !== "SELL" && addOverlayOpen) {
      closeAddOverlay();
    }
  }, [addOverlayOpen, mode]);

  useEffect(() => {
    if (!addOverlayOpen) {
      if (addSearchTimerRef.current) {
        clearTimeout(addSearchTimerRef.current);
        addSearchTimerRef.current = null;
      }
      return;
    }

    if (addSearchTimerRef.current) {
      clearTimeout(addSearchTimerRef.current);
    }

    const query = addQuery.trim().toLowerCase();
    setAddLoading(true);
    let cancelled = false;

    addSearchTimerRef.current = setTimeout(async () => {
      try {
        const baseSelect = `
          SELECT p.barcode as barcode,
                 p.name as name,
                 p.currency as currency,
                 pr.price_minor as priceMinor
          FROM offline_products p
          LEFT JOIN offline_prices pr ON pr.barcode = p.barcode
        `;
        const params: Array<string | number | null> = [];
        let sql = baseSelect;

        if (query.length > 0) {
          const like = `%${query}%`;
          sql += " WHERE lower(p.name) LIKE ? OR lower(p.barcode) LIKE ?";
          params.push(like, like);
        }

        sql += " ORDER BY p.updated_at DESC LIMIT 50";
        const rows = await offlineDb.all<AddOverlayItem>(sql, params);
        if (!cancelled) {
          setAddResults(rows);
        }
      } finally {
        if (!cancelled) {
          setAddLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      if (addSearchTimerRef.current) {
        clearTimeout(addSearchTimerRef.current);
        addSearchTimerRef.current = null;
      }
    };
  }, [addOverlayOpen, addQuery]);

  /* ---------- UI ---------- */

  return (
    <View style={styles.container}>
      {/* REAL STATUS BAR (DEVICE STATE) */}
      <PosStatusBar
        storeActive={storeActive}
        deviceActive={deviceActive}
        pendingOutboxCount={pendingOutboxCount}
        mode={mode}
        storeName={storeName}
        storeId={deviceStoreId}
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

      <Pressable
        style={[styles.scanCard, scanDisabled && styles.ctaDisabled]}
        onPress={handleOpenCamera}
        disabled={scanDisabled}
      >
        <View style={styles.scanCardRow}>
          <View style={styles.scanCardIcon}>
            <MaterialCommunityIcons name="camera" size={22} color={theme.colors.primary} />
          </View>
          <View style={styles.scanCardText}>
            <Text style={styles.scanCardTitle}>Scan Product to Digitise</Text>
            <Text style={styles.scanCardSubtitle}>Store/Sale Billing</Text>
          </View>
          <View style={styles.scanCardQr}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color={theme.colors.primary} />
          </View>
        </View>
      </Pressable>

      {mode === "SELL" && (
        <Pressable
          style={[styles.addItemsButton, storeActive === false && styles.ctaDisabled]}
          onPress={() => setAddOverlayOpen(true)}
          disabled={storeActive === false}
        >
          <MaterialCommunityIcons name="plus-circle" size={18} color={theme.colors.primary} />
          <Text style={styles.addItemsText}>+ ADD ITEMS</Text>
        </Pressable>
      )}

      {scanNotice && (
        <View
          style={[
            styles.scanNotice,
            scanNotice.tone === "warning" && styles.scanNoticeWarning,
            scanNotice.tone === "error" && styles.scanNoticeError,
            scanNotice.tone === "info" && styles.scanNoticeInfo
          ]}
        >
          <Text style={styles.scanNoticeText}>{scanNotice.message}</Text>
        </View>
      )}

      <Modal
        visible={addOverlayOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAddOverlay}
      >
        <View style={styles.addOverlay}>
          <View style={styles.addCard}>
            <View style={styles.addHeader}>
              <Text style={styles.addTitle}>Add items</Text>
              <Pressable onPress={closeAddOverlay}>
                <Text style={styles.addClose}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.addSearchInput}
              value={addQuery}
              onChangeText={setAddQuery}
              placeholder="Search by name or barcode"
              returnKeyType="search"
              onSubmitEditing={handleAddOverlaySubmit}
            />

            {addLoading ? (
              <Text style={styles.addEmptyText}>Searching...</Text>
            ) : addResults.length === 0 ? (
              <Text style={styles.addEmptyText}>No products found.</Text>
            ) : (
              <FlatList
                data={addResults}
                keyExtractor={(item) => item.barcode}
                style={styles.addResults}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = Boolean(selectedAddItems[item.barcode]);
                  const priceLabel =
                    item.priceMinor === null
                      ? "Price pending"
                      : formatMoney(item.priceMinor, item.currency ?? "INR");

                  return (
                    <Pressable
                      style={[styles.addRow, selected && styles.addRowSelected]}
                      onPress={() => addItemFromOverlay(item)}
                    >
                      <View style={styles.addRowInfo}>
                        <Text style={styles.addRowName}>{item.name}</Text>
                        <Text style={styles.addRowMeta}>
                          {item.barcode} • {priceLabel}
                        </Text>
                      </View>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          toggleSelectedItem(item);
                        }}
                        hitSlop={8}
                      >
                        <MaterialCommunityIcons
                          name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                          size={20}
                          color={selected ? theme.colors.primary : theme.colors.textSecondary}
                        />
                      </Pressable>
                    </Pressable>
                  );
                }}
              />
            )}

            <View style={styles.addFooter}>
              <Text style={styles.addFooterText}>
                {selectedAddCount} selected
              </Text>
              <Pressable
                style={[
                  styles.addFooterButton,
                  selectedAddCount === 0 && styles.ctaDisabled
                ]}
                onPress={handleAddSelected}
                disabled={selectedAddCount === 0}
              >
                <Text style={styles.addFooterButtonText}>
                  Add to Bill ({selectedAddCount})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* CART (SELL ONLY) */}
      {mode === "SELL" && hasItems && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={styles.cart}
          renderItem={({ item }: { item: StoreCartItem }) => (
            <View style={styles.cartRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>
                  {item.name} x {item.quantity}
                </Text>
                {item.barcode ? (
                  <Pressable
                    onPress={() => setBarcodePreview({ name: item.name, barcode: item.barcode ?? "" })}
                    style={styles.barcodeButton}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="barcode" size={16} color={theme.colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.itemPrice}>
                {formatMoney(item.priceMinor * item.quantity, item.currency ?? "INR")}
              </Text>
            </View>
          )}
        />
      )}

      {mode === "SELL" && hasItems && (
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
      {mode === "SELL" && hasItems && (
        <View style={styles.footer}>
          <Pressable onPress={handleClearCart} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear Cart</Text>
          </Pressable>

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

            <Pressable
              style={[
                styles.payBtn,
                payDisabled && styles.ctaDisabled
              ]}
              disabled={payDisabled}
              onPress={() => {
                lockCart();
                navigation.navigate("Payment");
              }}
            >
              <Text style={styles.payText}>TOTAL BILL {totalLabel}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Modal
        visible={scannerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraCard}>
            {cameraPermission?.granted ? (
              <CameraView
                style={styles.cameraView}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "qr",
                    "ean13",
                    "ean8",
                    "code128",
                    "code39",
                    "code93",
                    "upc_a",
                    "upc_e",
                    "itf14"
                  ],
                }}
                onBarcodeScanned={cameraScanned ? undefined : (event) => handleCameraScan(event.data)}
              />
            ) : (
              <View style={styles.cameraPermission}>
                <Text style={styles.cameraPermissionText}>
                  Camera permission is required to scan barcodes.
                </Text>
                <Pressable style={styles.cameraPermissionButton} onPress={() => requestCameraPermission()}>
                  <Text style={styles.cameraPermissionButtonText}>Allow Camera</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.cameraActions}>
              <Text style={styles.cameraHint}>Align the barcode/QR inside the frame.</Text>
              <Pressable onPress={() => setScannerOpen(false)}>
                <Text style={styles.cameraClose}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(barcodePreview)}
        transparent
        animationType="fade"
        onRequestClose={() => setBarcodePreview(null)}
      >
        <View style={styles.barcodeOverlay}>
          <View style={styles.barcodeCard}>
            <Text style={styles.barcodeTitle}>{barcodePreview?.name ?? "Barcode"}</Text>
            {barcodePreview?.barcode ? (
              <QRCode value={barcodePreview.barcode} size={180} />
            ) : (
              <Text style={styles.barcodeMissing}>Barcode unavailable.</Text>
            )}
            {barcodePreview?.barcode ? (
              <Text style={styles.barcodeValue}>{barcodePreview.barcode}</Text>
            ) : null}
            <Pressable style={styles.barcodeClose} onPress={() => setBarcodePreview(null)}>
              <Text style={styles.barcodeCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <TextInput
        ref={hidInputRef}
        value={hidInput}
        onChangeText={handleHidChange}
        onSubmitEditing={handleHidSubmit}
        onKeyPress={handleHidKeyPress}
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        caretHidden
        contextMenuHidden
        editable={!scanDisabled}
        inputMode="none"
        showSoftInputOnFocus={false}
        style={styles.hidInput}
      />

      <View style={styles.cartBar}>
        <View style={styles.cartBarTop}>
          <Text style={styles.cartBarCount}>
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </Text>
          <View style={styles.cartBarTopRight}>
            {locked && (
              <View style={styles.cartBarLocked}>
                <Text style={styles.cartBarLockedText}>Cart locked</Text>
              </View>
            )}
            <Text style={styles.cartBarTotal}>{totalLabel}</Text>
          </View>
        </View>
        <View style={styles.cartBarBottom}>
          <Text style={styles.cartBarHint}>{lastAddMessage ?? cartHint}</Text>
          {undoVisible && !locked && (
            <Pressable onPress={handleUndo} hitSlop={8}>
              <Text style={styles.cartBarUndo}>Undo</Text>
            </Pressable>
          )}
        </View>
      </View>

    </View>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 12,
    paddingBottom: 120,
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
  scanCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  scanCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  scanCardText: {
    flex: 1,
  },
  scanCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  scanCardSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  addItemsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  addItemsText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.primary,
  },
  scanCardQr: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  scanNotice: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  scanNoticeWarning: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
  },
  scanNoticeError: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.errorSoft,
  },
  scanNoticeInfo: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.accentSoft,
  },
  scanNoticeText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  addOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlayLight,
    justifyContent: "center",
    padding: 16,
  },
  addCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    maxHeight: "80%",
  },
  addHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  addClose: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  addSearchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceAlt,
    marginBottom: 12,
  },
  addResults: {
    marginBottom: 12,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 12,
  },
  addRowSelected: {
    backgroundColor: theme.colors.accentSoft,
  },
  addRowInfo: {
    flex: 1,
  },
  addRowName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  addRowMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  addEmptyText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  addFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  addFooterText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  addFooterButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  addFooterButtonText: {
    color: theme.colors.textInverse,
    fontWeight: "800",
    fontSize: 12,
  },
  hidInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  cartBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    ...theme.shadows.sm,
  },
  cartBarTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartBarTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartBarLocked: {
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cartBarLockedText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning,
  },
  cartBarBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cartBarCount: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartBarTotal: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  cartBarHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  cartBarUndo: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
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

  cartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  barcodeButton: {
    padding: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
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

  cameraOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlayLight,
    justifyContent: "center",
    padding: 16,
  },
  cameraCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  cameraView: {
    height: 280,
    width: "100%",
  },
  cameraActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cameraHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  cameraClose: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  cameraPermission: {
    padding: 16,
    alignItems: "center",
    gap: 12,
  },
  cameraPermissionText: {
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  cameraPermissionButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cameraPermissionButtonText: {
    color: theme.colors.primary,
    fontWeight: "700",
  },

  barcodeOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlayLight,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  barcodeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    alignItems: "center",
    minWidth: 240,
  },
  barcodeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  barcodeValue: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  barcodeMissing: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginVertical: 12,
  },
  barcodeClose: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  barcodeCloseText: {
    color: theme.colors.primary,
    fontWeight: "700",
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


