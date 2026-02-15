// T-193: Collection/Dunning for Overdue DUE Payments
// Screen listing overdue DUE payments with color coding, WhatsApp reminder, and payment link

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDate } from "../i18n/formatters";
import { apiClient } from "../services/api/apiClient";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";

// =============================================================================
// TYPES
// =============================================================================

interface OverdueDue {
  id: string;
  saleId: string;
  billRef: string;
  customerName: string;
  customerPhone: string;
  amountMinor: number;
  dueDate: string; // ISO date
  daysOverdue: number;
  reminderSentAt: string | null;
}

interface OverdueDuesResponse {
  dues: OverdueDue[];
}

// =============================================================================
// HELPERS
// =============================================================================

/** Get severity color based on days overdue */
function getSeverityColor(daysOverdue: number): string {
  if (daysOverdue > 30) return theme.colors.error;
  if (daysOverdue > 7) return "#F97316"; // orange
  return "#EAB308"; // yellow
}

/** Get severity label */
function getSeverityLabel(daysOverdue: number): string {
  if (daysOverdue > 30) return "Critical";
  if (daysOverdue > 7) return "Overdue";
  return "Due Soon";
}

/** Format DD/MM/YYYY for Indian locale */
function formatIndianDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// =============================================================================
// API
// =============================================================================

async function fetchOverdueDues(): Promise<OverdueDue[]> {
  const response = await apiClient.get<OverdueDuesResponse>(
    "/api/v1/pos/payments/overdue"
  );
  return response.dues;
}

// =============================================================================
// COMPONENT
// =============================================================================

interface OverdueDuesScreenProps {
  onBack?: () => void;
  onNavigateToPayment?: (saleId: string) => void;
}

export default function OverdueDuesScreen({
  onBack,
  onNavigateToPayment,
}: OverdueDuesScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dues, setDues] = useState<OverdueDue[]>([]);
  const [error, setError] = useState<string | null>(null);
  // T-193: Track reminder timestamps in local state
  const [reminderSentMap, setReminderSentMap] = useState<
    Record<string, string>
  >({});

  const loadDues = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchOverdueDues();
      // Sort by days overdue descending (oldest first)
      const sorted = [...data].sort((a, b) => b.daysOverdue - a.daysOverdue);
      setDues(sorted);
    } catch (e: any) {
      console.error("[OverdueDuesScreen] Failed to load overdue dues:", e);
      setError(e?.message || "Failed to load overdue dues");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDues();
  }, [loadDues]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDues();
  }, [loadDues]);

  // T-193: Generate and share WhatsApp reminder message
  const handleSendReminder = useCallback(
    async (due: OverdueDue) => {
      const storeName = "SuperMandi"; // fallback store name
      const amountStr = formatMoney(due.amountMinor);
      const dateStr = formatIndianDate(due.dueDate);
      const message = `Dear ${due.customerName}, you have an outstanding payment of ${amountStr} from ${dateStr}. Please pay at your earliest. - ${storeName}`;

      // Try WhatsApp first, fallback to Share
      const phoneNumber = due.customerPhone.startsWith("+91")
        ? due.customerPhone
        : `+91${due.customerPhone.replace(/^0+/, "")}`;
      const whatsappUrl = `whatsapp://send?phone=${encodeURIComponent(
        phoneNumber
      )}&text=${encodeURIComponent(message)}`;

      try {
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          // Fallback to native share
          await Share.share({ message });
        }

        // Track reminder sent at
        setReminderSentMap((prev) => ({
          ...prev,
          [due.id]: new Date().toISOString(),
        }));
      } catch (e) {
        console.error("[OverdueDuesScreen] Share failed:", e);
        // Fallback to share API
        try {
          await Share.share({ message });
          setReminderSentMap((prev) => ({
            ...prev,
            [due.id]: new Date().toISOString(),
          }));
        } catch {
          Alert.alert("Error", "Could not send reminder");
        }
      }
    },
    []
  );

  const handleRecordPayment = useCallback(
    (due: OverdueDue) => {
      if (onNavigateToPayment) {
        onNavigateToPayment(due.saleId);
      } else {
        Alert.alert("Record Payment", "Navigate to payment screen to record payment for this due.");
      }
    },
    [onNavigateToPayment]
  );

  const totalOverdue = dues.reduce((sum, d) => sum + d.amountMinor, 0);

  const renderDueItem = useCallback(
    ({ item }: { item: OverdueDue }) => {
      const severityColor = getSeverityColor(item.daysOverdue);
      const severityLabel = getSeverityLabel(item.daysOverdue);
      const reminderSent =
        reminderSentMap[item.id] || item.reminderSentAt;

      return (
        <View style={styles.card}>
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <MaterialCommunityIcons
                name="account-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customerName}
              </Text>
            </View>
            <View
              style={[
                styles.severityBadge,
                { backgroundColor: severityColor + "20" },
              ]}
            >
              <Text style={[styles.severityText, { color: severityColor }]}>
                {severityLabel}
              </Text>
            </View>
          </View>

          {/* Details */}
          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailValue}>+91 {item.customerPhone}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bill #</Text>
              <Text style={styles.detailValue}>{item.billRef}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount</Text>
              <Text style={[styles.detailValueBold, { color: severityColor }]}>
                {formatMoney(item.amountMinor)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Due Date</Text>
              <Text style={styles.detailValue}>
                {formatIndianDate(item.dueDate)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Days Overdue</Text>
              <Text style={[styles.detailValueBold, { color: severityColor }]}>
                {item.daysOverdue} days
              </Text>
            </View>
          </View>

          {/* Reminder status */}
          {reminderSent && (
            <View style={styles.reminderSent}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={14}
                color={theme.colors.success}
              />
              <Text style={styles.reminderSentText}>
                Reminder sent {formatDate(reminderSent, "short")}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.cardActions}>
            <Pressable
              style={styles.reminderButton}
              onPress={() => handleSendReminder(item)}
            >
              <MaterialCommunityIcons
                name="whatsapp"
                size={16}
                color={theme.colors.success}
              />
              <Text style={styles.reminderButtonText}>Send Reminder</Text>
            </Pressable>
            <Pressable
              style={styles.paymentButton}
              onPress={() => handleRecordPayment(item)}
            >
              <MaterialCommunityIcons
                name="cash-register"
                size={16}
                color={theme.colors.textInverse}
              />
              <Text style={styles.paymentButtonText}>Record Payment</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [handleSendReminder, handleRecordPayment, reminderSentMap]
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <BackHeader title="Overdue Dues" onBack={onBack} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading overdue dues...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <BackHeader title="Overdue Dues" onBack={onBack} />
        <View style={styles.centerContent}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => { setLoading(true); void loadDues(); }}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title="Overdue Dues" onBack={onBack} />

      {/* Summary bar */}
      {dues.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Overdue</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalOverdue)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Customers</Text>
            <Text style={styles.summaryValue}>{dues.length}</Text>
          </View>
        </View>
      )}

      {/* Content */}
      {dues.length === 0 ? (
        <EmptyState
          icon="check-circle-outline"
          title="No overdue dues"
          description="All customer payments are up to date. Great job!"
        />
      ) : (
        <FlatList
          data={dues}
          keyExtractor={(item) => item.id}
          renderItem={renderDueItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </View>
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
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.error,
    textAlign: "center",
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.error,
  },
  listContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: theme.spacing.xs,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardDetails: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  detailValueBold: {
    fontSize: 15,
    fontWeight: "700",
  },
  reminderSent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: theme.colors.successSoft,
    borderRadius: theme.borderRadius.sm,
  },
  reminderSentText: {
    fontSize: 11,
    color: theme.colors.success,
    fontWeight: "500",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  reminderButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.successSoft,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.success + "30",
  },
  reminderButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.success,
  },
  paymentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  paymentButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});
