// PurchaseCartModal - V3.0.9 compliant
// Full cart modal with items grouped by supplier

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { SupplierCartSection } from "./SupplierCartSection";
import { PaymentOptionsSheet, type PaymentMode } from "./PaymentOptionsSheet";
import { usePurchaseCartStore, type SupplierGroup } from "../../stores/purchaseCartStore";
import { useSettingsStore } from "../../stores/settingsStore";
import * as orderApi from "../../services/api/orderApi";
import * as bnplApi from "../../services/api/bnplApi";
import * as creditApi from "../../services/api/creditApi";
import { getDeviceStoreId } from "../../services/deviceSession";
// T-127: Modal back handler for Android hardware back button
import { useModalBackHandler } from "../../hooks/useModalBackHandler";
import { asError } from "../../utils/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

export interface PurchaseCartModalProps {
  visible: boolean;
  onClose: () => void;
  onOrderPlaced?: (supplierId: string) => void;
  onAllOrdersPlaced?: () => void;
}

// Min order values now come from SupplierGroup (populated from cart items)

// =============================================================================
// COMPONENT
// =============================================================================

export function PurchaseCartModal({
  visible,
  onClose,
  onOrderPlaced,
  onAllOrdersPlaced,
}: PurchaseCartModalProps) {
  // T-127: Close modal on Android hardware back button
  useModalBackHandler(visible, onClose);

  const insets = useSafeAreaInsets();

  // Cart store
  const items = usePurchaseCartStore((state) => state.items);
  const getItemsBySupplier = usePurchaseCartStore((state) => state.getItemsBySupplier);
  const getTotals = usePurchaseCartStore((state) => state.getTotals);
  const updateQuantity = usePurchaseCartStore((state) => state.updateQuantity);
  const removeItem = usePurchaseCartStore((state) => state.removeItem);
  const removeSupplierItems = usePurchaseCartStore((state) => state.removeSupplierItems);
  const clear = usePurchaseCartStore((state) => state.clear);

  // State
  const [placingOrderFor, setPlacingOrderFor] = useState<string | null>(null);
  const [placingAllOrders, setPlacingAllOrders] = useState(false);

  // SM-020: BNPL state
  const [bnplToggleState, setBnplToggleState] = useState<Record<string, boolean>>({});
  const [bnplSummary, setBnplSummary] = useState<{
    bnplEnabled: boolean;
    availableCredit: number;
    maxDays: number;
  } | null>(null);

  // SM-025: Payment options sheet state
  const [paymentSheet, setPaymentSheet] = useState<{
    visible: boolean;
    group: SupplierGroup | null;
  }>({ visible: false, group: null });

  // POS-BUY-009: Track pending UPI orders for timeout cleanup
  const pendingUpiOrders = useRef<Map<string, { orderId: string; supplierId: string; createdAt: number }>>(new Map());

  // SM-025: Credit summary state
  const [creditSummary, setCreditSummary] = useState<{
    creditEnabled: boolean;
    availableCredit: number;
  } | null>(null);

  // Settings store for BNPL and Credit updates
  const setBnplEnabled = useSettingsStore((state) => state.setBnplEnabled);
  const setBnplAvailableCredit = useSettingsStore((state) => state.setBnplAvailableCredit);
  const creditEnabled = useSettingsStore((state) => state.creditEnabled);

  // SM-020/SM-025: Fetch BNPL and Credit summary when modal opens
  useEffect(() => {
    if (visible && items.length > 0) {
      // Fetch BNPL summary
      void (async () => {
        try {
          const summary = await bnplApi.getBnplSummary();
          setBnplSummary({
            bnplEnabled: summary.bnplEnabled,
            availableCredit: summary.availableCredit,
            maxDays: 7, // Default max days
          });
          // Update settings store
          setBnplEnabled(summary.bnplEnabled);
          setBnplAvailableCredit(summary.availableCredit);
        } catch (error) {
          console.log("[PurchaseCartModal] BNPL summary fetch failed:", error);
          setBnplSummary({ bnplEnabled: false, availableCredit: 0, maxDays: 7 });
        }
      })();

      // SM-025: Fetch Credit summary if enabled
      if (creditEnabled) {
        void (async () => {
          try {
            const offers = await creditApi.getCreditOffers();
            setCreditSummary({
              creditEnabled: true,
              availableCredit: offers.eligibleAmount,
            });
          } catch (error) {
            console.log("[PurchaseCartModal] Credit summary fetch failed:", error);
            setCreditSummary({ creditEnabled: false, availableCredit: 0 });
          }
        })();
      }
    }
  }, [visible, items.length, setBnplEnabled, setBnplAvailableCredit, creditEnabled]);

  // Get grouped items
  const supplierGroups = useMemo(() => getItemsBySupplier(), [items, getItemsBySupplier]);
  const totals = useMemo(() => getTotals(), [items, getTotals]);

  // Check if all orders are valid
  const allOrdersValid = useMemo(() => {
    return supplierGroups.every((group) => {
      const hasInvalidMoq = group.items.some((item) => item.quantity < item.moq);
      const isBelowMinOrder = group.minOrderValue > 0 && group.totalAmount < group.minOrderValue;
      return !hasInvalidMoq && !isBelowMinOrder;
    });
  }, [supplierGroups]);

  // SM-020: Check BNPL eligibility for a supplier group
  const isBnplEligible = useCallback(
    (groupTotalMinor: number): boolean => {
      if (!bnplSummary?.bnplEnabled) return false;
      // Total in minor units (paise) - group.totalAmount is in rupees
      return bnplSummary.availableCredit >= groupTotalMinor * 100;
    },
    [bnplSummary]
  );

  // SM-020: Handle BNPL toggle for a supplier
  const handleBnplToggle = useCallback(
    (supplierId: string, enabled: boolean) => {
      setBnplToggleState((prev) => ({
        ...prev,
        [supplierId]: enabled,
      }));
    },
    []
  );

  // Handle update quantity
  const handleUpdateQuantity = useCallback(
    (supplierProductId: string, quantity: number) => {
      updateQuantity(supplierProductId, quantity);
    },
    [updateQuantity]
  );

  // Handle remove item
  const handleRemoveItem = useCallback(
    (supplierProductId: string) => {
      Alert.alert(
        "Remove Item",
        "Are you sure you want to remove this item from the cart?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => removeItem(supplierProductId),
          },
        ]
      );
    },
    [removeItem]
  );

  // SM-025: Show payment options sheet for supplier
  const handleShowPaymentOptions = useCallback(
    (supplierId: string) => {
      const group = supplierGroups.find((g) => g.supplierId === supplierId);
      if (group) {
        setPaymentSheet({ visible: true, group });
      }
    },
    [supplierGroups]
  );

  // SM-025: Close payment options sheet
  const handleClosePaymentSheet = useCallback(() => {
    setPaymentSheet({ visible: false, group: null });
  }, []);

  // SM-025: Handle payment selection from sheet
  // GL-RJ-003: Fixed checkout flow - only remove items AFTER payment confirmation
  const handleSelectPayment = useCallback(
    async (mode: PaymentMode): Promise<{ success: boolean; upiDeepLink?: string; error?: string; orderId?: string }> => {
      const group = paymentSheet.group;
      if (!group) {
        return { success: false, error: "No supplier selected" };
      }

      try {
        const storeId = await getDeviceStoreId();
        if (!storeId) {
          throw new Error("Store not found");
        }

        // Determine payment notes based on mode
        let storeNotes: string | undefined;
        switch (mode) {
          case "BNPL":
            storeNotes = "BNPL_REQUESTED";
            break;
          case "CREDIT":
            storeNotes = "CREDIT_PAYMENT";
            break;
          case "UPI":
            storeNotes = "UPI_PAYMENT";
            break;
          case "COD":
            storeNotes = "CASH_ON_DELIVERY";
            break;
          // T-157: Bank transfer (NEFT/RTGS/IMPS) for supplier purchases
          case "BANK_TRANSFER":
            storeNotes = "BANK_TRANSFER_PENDING";
            break;
        }

        // Create the order via API
        // T-140: Include expected delivery date
        const orderResult = await orderApi.createOrder(storeId, {
          supplierId: group.supplierId,
          orderType: "manual",
          items: group.items.map((item) => ({
            supplierProductId: item.supplierProductId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          storeNotes,
          expectedDeliveryDate: expectedDeliveryDate.toISOString(),
        });

        // For UPI, DON'T remove items yet - wait for payment confirmation
        // GL-RJ-003: Items should only be removed after UPI payment is verified
        if (mode === "UPI") {
          // Return deep link and order ID for verification
          // Cart items remain intact until payment is confirmed
          const upiDeepLink = `upi://pay?pa=supplier@upi&pn=${encodeURIComponent(group.supplierName)}&am=${group.totalAmount}&cu=INR`;
          const orderId = orderResult?.id || group.supplierId;

          // POS-BUY-009: Track for timeout cleanup
          pendingUpiOrders.current.set(orderId, {
            orderId,
            supplierId: group.supplierId,
            createdAt: Date.now(),
          });

          return {
            success: true,
            upiDeepLink,
            orderId,
          };
        }

        // GL-WF-004: For CREDIT mode, must call confirmPayment to actually process the credit deduction
        // Without this, credit is NOT deducted and the payment is not recorded
        if (mode === "CREDIT") {
          try {
            const paymentResult = await orderApi.confirmPayment(storeId, orderResult.id, "CREDIT");
            if (!paymentResult.success) {
              // Credit payment failed - keep items in cart
              console.error("[PurchaseCartModal] Credit payment failed:", paymentResult.error);
              return {
                success: false,
                error: paymentResult.error || "Credit payment failed. Please check your credit limit.",
              };
            }
            console.log("[PurchaseCartModal] Credit payment confirmed:", paymentResult.paymentId);
          } catch (paymentError: any) {
            // Credit payment failed - keep items in cart
            console.error("[PurchaseCartModal] Credit payment error:", paymentError);
            return {
              success: false,
              error: paymentError.message || "Failed to process credit payment. Please try another payment method.",
            };
          }
        }

        // For non-UPI modes (BNPL, CREDIT, COD), payment is confirmed
        // So we can safely remove items from cart
        removeSupplierItems(group.supplierId);

        // Clear BNPL toggle for this supplier
        setBnplToggleState((prev) => {
          const updated = { ...prev };
          delete updated[group.supplierId];
          return updated;
        });

        // Notify parent
        onOrderPlaced?.(group.supplierId);

        // Show success message for non-UPI modes
        let successMessage = "Your purchase order has been created.";
        if (mode === "BNPL") {
          successMessage += " BNPL payment will be set up when the order is confirmed.";
        } else if (mode === "CREDIT") {
          successMessage += " Payment has been charged to your credit line.";
        } else if (mode === "COD") {
          successMessage += " Pay when goods are delivered.";
        }

        Alert.alert("Order Placed", successMessage, [{ text: "OK" }]);

        return { success: true };
      } catch (_error: unknown) {
    const error = asError(_error);
        console.error("[PurchaseCartModal] Failed to place order:", error);
        // GL-RJ-003: On failure, cart items remain intact - no removal happened
        return { success: false, error: error.message || "Failed to place order" };
      }
    },
    [paymentSheet.group, removeSupplierItems, onOrderPlaced]
  );

  // GL-RJ-003: Handle UPI payment confirmation - call this after UPI payment is verified
  const handleUpiPaymentConfirmed = useCallback(
    (supplierId: string) => {
      // POS-BUY-009: Clear from pending tracking
      for (const [key, val] of pendingUpiOrders.current.entries()) {
        if (val.supplierId === supplierId) pendingUpiOrders.current.delete(key);
      }
      // Now safe to remove items from cart
      removeSupplierItems(supplierId);

      // Clear BNPL toggle for this supplier
      setBnplToggleState((prev) => {
        const updated = { ...prev };
        delete updated[supplierId];
        return updated;
      });

      // Notify parent
      onOrderPlaced?.(supplierId);

      Alert.alert("Order Placed", "Your purchase order has been created and payment confirmed.", [
        { text: "OK" },
      ]);
    },
    [removeSupplierItems, onOrderPlaced]
  );

  // GL-RJ-003: Handle UPI payment failure - items remain in cart
  const handleUpiPaymentFailed = useCallback(
    (supplierId: string, orderId: string) => {
      // POS-BUY-009: Clear from pending tracking
      pendingUpiOrders.current.delete(orderId);
      // Cancel the order since payment failed
      // Items remain in cart so user can retry
      Alert.alert(
        "Payment Failed",
        "UPI payment was not completed. Your cart items are intact. You can try again.",
        [{ text: "OK" }]
      );
      console.log("[PurchaseCartModal] UPI payment failed for order:", orderId, "supplier:", supplierId);
    },
    []
  );

  // POS-BUY-009: Check for expired UPI orders every 60 seconds
  const UPI_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      for (const [orderId, entry] of pendingUpiOrders.current.entries()) {
        if (now - entry.createdAt >= UPI_TIMEOUT_MS) {
          pendingUpiOrders.current.delete(orderId);
          // Remove orphaned cart items for this supplier
          removeSupplierItems(entry.supplierId);
          // Attempt to cancel the order
          try {
            const storeId = await getDeviceStoreId();
            if (storeId) {
              await orderApi.cancelOrder(storeId, orderId, "UPI payment timeout (15 min)");
            }
          } catch {
            // Best-effort cancel — backend also enforces timeout
          }
          console.log(`[PurchaseCartModal] POS-BUY-009: UPI timeout cleanup for order ${orderId}`);
        }
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [removeSupplierItems]);

  // Handle place order for supplier (legacy - now shows payment sheet)
  const handlePlaceOrder = useCallback(
    async (supplierId: string, useBnpl?: boolean) => {
      // SM-025: If BNPL is toggled, skip payment sheet and use BNPL directly
      if (useBnpl) {
        setPlacingOrderFor(supplierId);

        try {
          const storeId = await getDeviceStoreId();
          if (!storeId) {
            throw new Error("Store not found");
          }

          const supplierGroup = supplierGroups.find((g) => g.supplierId === supplierId);
          if (!supplierGroup || supplierGroup.items.length === 0) {
            throw new Error("No items found for supplier");
          }

          // T-140: Include expected delivery date
          await orderApi.createOrder(storeId, {
            supplierId,
            orderType: "manual",
            items: supplierGroup.items.map((item) => ({
              supplierProductId: item.supplierProductId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
            storeNotes: "BNPL_REQUESTED",
            expectedDeliveryDate: expectedDeliveryDate.toISOString(),
          });

          removeSupplierItems(supplierId);
          setBnplToggleState((prev) => {
            const updated = { ...prev };
            delete updated[supplierId];
            return updated;
          });
          onOrderPlaced?.(supplierId);

          Alert.alert(
            "Order Placed",
            "Your purchase order has been created. BNPL payment will be set up when the order is confirmed.",
            [{ text: "OK" }]
          );
        } catch (error) {
          console.error("[PurchaseCartModal] Failed to place order:", error);
          Alert.alert("Order Failed", "Failed to place order. Please try again.", [{ text: "OK" }]);
        } finally {
          setPlacingOrderFor(null);
        }
        return;
      }

      // Show payment options sheet for non-BNPL orders
      handleShowPaymentOptions(supplierId);
    },
    [supplierGroups, removeSupplierItems, onOrderPlaced, handleShowPaymentOptions]
  );

  // Handle place all orders
  const handlePlaceAllOrders = useCallback(async () => {
    if (!allOrdersValid) return;

    Alert.alert(
      "Place All Orders",
      `Place orders with ${supplierGroups.length} suppliers for a total of ${formatMoney(totals.grandTotal * 100)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Place Orders",
          onPress: async () => {
            setPlacingAllOrders(true);

            try {
              const storeId = await getDeviceStoreId();
              if (!storeId) {
                throw new Error("Store not found");
              }

              // Place orders sequentially
              // T-140: Include expected delivery date in all orders
              for (const group of supplierGroups) {
                await orderApi.createOrder(storeId, {
                  supplierId: group.supplierId,
                  orderType: "manual",
                  items: group.items.map((item) => ({
                    supplierProductId: item.supplierProductId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                  })),
                  expectedDeliveryDate: expectedDeliveryDate.toISOString(),
                });
              }

              // Clear all items
              clear();

              // Notify parent
              onAllOrdersPlaced?.();

              // Show success
              Alert.alert(
                "All Orders Placed",
                `Successfully created ${supplierGroups.length} draft purchase orders. Go to Orders to review and submit.`,
                [{ text: "OK", onPress: onClose }]
              );
            } catch (error) {
              console.error("[PurchaseCartModal] Failed to place all orders:", error);
              Alert.alert(
                "Some Orders Failed",
                "Some orders could not be placed. Please check and try again.",
                [{ text: "OK" }]
              );
            } finally {
              setPlacingAllOrders(false);
            }
          },
        },
      ]
    );
  }, [allOrdersValid, supplierGroups, totals, clear, onAllOrdersPlaced, onClose]);

  // T-140: Delivery date picker state
  const getDefaultDeliveryDate = (): Date => {
    const date = new Date();
    let daysAdded = 0;
    while (daysAdded < 3) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (day !== 0 && day !== 6) {
        daysAdded++;
      }
    }
    return date;
  };
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<Date>(getDefaultDeliveryDate);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatDeliveryDate = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // T-140: Generate next 7 business days for date picker options
  const deliveryDateOptions = useMemo(() => {
    const options: Date[] = [];
    const cursor = new Date();
    while (options.length < 7) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        options.push(new Date(cursor));
      }
    }
    return options;
  }, []);

  // T-140: Short weekday names for date picker
  const shortDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // POS-BUY-004: Save all orders as drafts
  const [savingDraft, setSavingDraft] = useState(false);
  const handleSaveDraft = useCallback(async () => {
    if (supplierGroups.length === 0) return;

    setSavingDraft(true);
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) {
        throw new Error("Store not found");
      }

      // T-140: Include expected delivery date in drafts
      for (const group of supplierGroups) {
        await orderApi.createOrder(storeId, {
          supplierId: group.supplierId,
          orderType: "manual",
          status: "draft",
          items: group.items.map((item) => ({
            supplierProductId: item.supplierProductId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          expectedDeliveryDate: expectedDeliveryDate.toISOString(),
        });
      }

      clear();
      Alert.alert(
        "Draft Saved",
        `${supplierGroups.length} draft order(s) saved. You can edit and submit them from Order History.`,
        [{ text: "OK", onPress: onClose }]
      );
    } catch (error) {
      console.error("[PurchaseCartModal] Failed to save draft:", error);
      Alert.alert("Save Failed", "Could not save draft. Please try again.", [{ text: "OK" }]);
    } finally {
      setSavingDraft(false);
    }
  }, [supplierGroups, clear, onClose]);

  // Handle clear cart
  const handleClearCart = useCallback(() => {
    Alert.alert(
      "Clear Cart",
      "Are you sure you want to remove all items from the cart?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => clear(),
        },
      ]
    );
  }, [clear]);

  // Empty state
  const isEmpty = items.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons
              name="close"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Purchase Cart</Text>
          <View style={styles.headerRight}>
            {!isEmpty && (
              <Pressable style={styles.clearButton} onPress={handleClearCart}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>

        {isEmpty ? (
          /* Empty State */
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="cart-outline"
              size={64}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyText}>
              Add products from the catalog to create purchase orders
            </Text>
            <Pressable style={styles.browseButton} onPress={onClose}>
              <Text style={styles.browseButtonText}>Browse Catalog</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Cart Summary */}
            <View style={styles.summaryBar}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Suppliers</Text>
                <Text style={styles.summaryValue}>{totals.supplierCount}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Items</Text>
                <Text style={styles.summaryValue}>{totals.itemCount}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Qty</Text>
                <Text style={styles.summaryValue}>{totals.totalQuantity}</Text>
              </View>
            </View>

            {/* Supplier Sections */}
            <ScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 100 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {supplierGroups.map((group) => (
                <SupplierCartSection
                  key={group.supplierId}
                  group={group}
                  minOrderValue={group.minOrderValue}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemoveItem={handleRemoveItem}
                  onPlaceOrder={handlePlaceOrder}
                  placingOrder={placingOrderFor === group.supplierId}
                  // SM-020: BNPL props
                  bnplEligible={isBnplEligible(group.totalAmount)}
                  bnplEnabled={bnplToggleState[group.supplierId] ?? false}
                  onBnplToggle={handleBnplToggle}
                  bnplMaxDays={bnplSummary?.maxDays ?? 7}
                />
              ))}
            </ScrollView>

            {/* T-140: Delivery Date Picker */}
            <View style={styles.deliveryDateSection}>
              <Pressable
                style={styles.deliveryDateHeader}
                onPress={() => setShowDatePicker((prev) => !prev)}
              >
                <View style={styles.deliveryDateLeft}>
                  <MaterialCommunityIcons
                    name="truck-delivery-outline"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <View>
                    <Text style={styles.deliveryDateLabel}>Expected Delivery</Text>
                    <Text style={styles.deliveryDateValue}>
                      {shortDayNames[expectedDeliveryDate.getDay()]},{" "}
                      {expectedDeliveryDate.getDate()}{" "}
                      {shortMonthNames[expectedDeliveryDate.getMonth()]}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name={showDatePicker ? "chevron-up" : "chevron-down"}
                  size={22}
                  color={theme.colors.textTertiary}
                />
              </Pressable>

              {showDatePicker && (
                <View style={styles.deliveryDateGrid}>
                  {deliveryDateOptions.map((option, idx) => {
                    const isSelected =
                      option.toDateString() === expectedDeliveryDate.toDateString();
                    return (
                      <Pressable
                        key={idx}
                        style={[
                          styles.deliveryDateOption,
                          isSelected && styles.deliveryDateOptionSelected,
                        ]}
                        onPress={() => {
                          setExpectedDeliveryDate(option);
                          setShowDatePicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.deliveryDateOptionDay,
                            isSelected && styles.deliveryDateOptionTextSelected,
                          ]}
                        >
                          {shortDayNames[option.getDay()]}
                        </Text>
                        <Text
                          style={[
                            styles.deliveryDateOptionDate,
                            isSelected && styles.deliveryDateOptionTextSelected,
                          ]}
                        >
                          {option.getDate()}
                        </Text>
                        <Text
                          style={[
                            styles.deliveryDateOptionMonth,
                            isSelected && styles.deliveryDateOptionTextSelected,
                          ]}
                        >
                          {shortMonthNames[option.getMonth()]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Footer with grand total and place all */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
              <View style={styles.grandTotalSection}>
                <Text style={styles.grandTotalLabel}>Grand Total</Text>
                <Text style={styles.grandTotalValue}>
                  {formatMoney(totals.grandTotal * 100)}
                </Text>
              </View>

              <View style={styles.footerButtons}>
                {/* POS-BUY-004: Save Draft button */}
                <Pressable
                  style={[styles.saveDraftButton, savingDraft && styles.placeAllButtonDisabled]}
                  onPress={handleSaveDraft}
                  disabled={supplierGroups.length === 0 || savingDraft}
                >
                  {savingDraft ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="content-save-outline"
                        size={18}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.saveDraftText}>Save Draft</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.placeAllButton,
                    (!allOrdersValid || placingAllOrders) && styles.placeAllButtonDisabled,
                  ]}
                  onPress={handlePlaceAllOrders}
                  disabled={!allOrdersValid || placingAllOrders}
                >
                  {placingAllOrders ? (
                    <ActivityIndicator size="small" color={theme.colors.textInverse} />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="send-check"
                        size={20}
                        color={theme.colors.textInverse}
                      />
                      <Text style={styles.placeAllText}>
                        Place All ({totals.supplierCount})
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>

      {/* SM-025: Payment Options Sheet */}
      {/* GL-RJ-003: Added UPI confirmation callbacks */}
      {paymentSheet.group && (
        <PaymentOptionsSheet
          visible={paymentSheet.visible}
          onClose={handleClosePaymentSheet}
          supplierName={paymentSheet.group.supplierName}
          supplierId={paymentSheet.group.supplierId}
          amount={paymentSheet.group.totalAmount}
          bnplEligible={isBnplEligible(paymentSheet.group.totalAmount)}
          bnplMaxDays={bnplSummary?.maxDays ?? 7}
          creditEligible={creditSummary?.creditEnabled ?? false}
          availableCredit={creditSummary?.availableCredit ?? 0}
          onSelectPayment={handleSelectPayment}
          onUpiPaymentConfirmed={handleUpiPaymentConfirmed}
          onUpiPaymentCancelled={handleUpiPaymentFailed}
        />
      )}
    </Modal>
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  headerRight: {
    width: 60,
    alignItems: "flex-end",
  },
  clearButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  clearButtonText: {
    fontSize: 14,
    color: theme.colors.error,
    fontWeight: "500",
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.border,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  browseButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  browseButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.lg,
  },
  grandTotalSection: {
    flex: 1,
  },
  grandTotalLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  placeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.success,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.sm,
  },
  placeAllButtonDisabled: {
    backgroundColor: theme.colors.textTertiary,
    opacity: 0.6,
  },
  placeAllText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  footerButtons: {
    flexDirection: "row" as const,
    gap: theme.spacing.sm,
  },
  saveDraftButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  saveDraftText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: theme.colors.primary,
  },
  // T-140: Delivery date picker styles
  deliveryDateSection: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  deliveryDateHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  deliveryDateLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing.sm,
  },
  deliveryDateLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  deliveryDateValue: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: theme.colors.textPrimary,
  },
  deliveryDateGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  deliveryDateOption: {
    alignItems: "center" as const,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    minWidth: 60,
  },
  deliveryDateOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "15",
  },
  deliveryDateOptionDay: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    fontWeight: "500" as const,
  },
  deliveryDateOptionDate: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: theme.colors.textPrimary,
    marginVertical: 2,
  },
  deliveryDateOptionMonth: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  deliveryDateOptionTextSelected: {
    color: theme.colors.primary,
  },
});

export default PurchaseCartModal;
