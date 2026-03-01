// T-199: Daily Closing Printable Report
// Today's report with summary cards, top products, payment split, print + share

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Print from "expo-print";

import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { BackHeader } from "../components/ui/BackHeader";
import { apiClient } from "../services/api/apiClient";
import { printerService } from "../services/printerService";
import { asError } from "../utils/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

interface TopProduct {
  productName: string;
  qtySold: number;
  revenueMinor: number;
}

interface DailyReportData {
  date: string; // YYYY-MM-DD
  totalSalesMinor: number;
  totalRevenueMinor: number;
  transactionCount: number;
  topProducts: TopProduct[];
  paymentSplit: {
    upiMinor: number;
    cashMinor: number;
    dueMinor: number;
    cardMinor: number;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = days[d.getDay()];
  return `${dayName}, ${dd}/${mm}/${yyyy}`;
}

function getYYYYMMDD(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Generate plain text report for thermal printer */
function generatePrintContent(report: DailyReportData): string {
  const lines: string[] = [];
  const W = 32; // 32-char width for 58mm thermal printer
  const sep = "=".repeat(W);
  const dash = "-".repeat(W);

  const pad = (left: string, right: string) => {
    const space = W - left.length - right.length;
    return left + " ".repeat(Math.max(1, space)) + right;
  };

  lines.push(sep);
  lines.push("       SUPERMANDI POS");
  lines.push("      DAILY REPORT");
  lines.push(sep);
  lines.push("");
  lines.push(`Date: ${formatDisplayDate(report.date)}`);
  lines.push("");
  lines.push(dash);
  lines.push("SUMMARY");
  lines.push(dash);
  lines.push(pad("Total Sales:", formatMoney(report.totalSalesMinor)));
  lines.push(pad("Revenue:", formatMoney(report.totalRevenueMinor)));
  lines.push(pad("Transactions:", String(report.transactionCount)));
  lines.push("");
  lines.push(dash);
  lines.push("PAYMENT SPLIT");
  lines.push(dash);
  if (report.paymentSplit.cashMinor > 0) {
    lines.push(pad("Cash:", formatMoney(report.paymentSplit.cashMinor)));
  }
  if (report.paymentSplit.upiMinor > 0) {
    lines.push(pad("UPI:", formatMoney(report.paymentSplit.upiMinor)));
  }
  if (report.paymentSplit.dueMinor > 0) {
    lines.push(pad("Due:", formatMoney(report.paymentSplit.dueMinor)));
  }
  if (report.paymentSplit.cardMinor > 0) {
    lines.push(pad("Card:", formatMoney(report.paymentSplit.cardMinor)));
  }
  lines.push("");

  if (report.topProducts.length > 0) {
    lines.push(dash);
    lines.push("TOP 5 PRODUCTS");
    lines.push(dash);
    for (const product of report.topProducts.slice(0, 5)) {
      const name =
        product.productName.length > 18
          ? product.productName.slice(0, 17) + "."
          : product.productName;
      lines.push(pad(name, `${product.qtySold} qty`));
      lines.push(pad("", formatMoney(product.revenueMinor)));
    }
  }

  lines.push("");
  lines.push(sep);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(sep);

  return lines.join("\n");
}

/** Generate HTML report for PDF share */
function generateHtmlReport(report: DailyReportData): string {
  const paymentRows = [
    { label: "Cash", amount: report.paymentSplit.cashMinor },
    { label: "UPI", amount: report.paymentSplit.upiMinor },
    { label: "Due", amount: report.paymentSplit.dueMinor },
    { label: "Card", amount: report.paymentSplit.cardMinor },
  ].filter((r) => r.amount > 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: sans-serif; padding: 20px; color: #0F172A; }
  h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 14px; color: #475569; margin-top: 4px; }
  .summary { display: flex; gap: 12px; margin: 16px 0; }
  .summary-card { flex: 1; background: #F7F9FC; border-radius: 8px; padding: 12px; text-align: center; }
  .summary-value { font-size: 20px; font-weight: 700; color: #2563EB; }
  .summary-label { font-size: 11px; color: #64748B; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { text-align: left; font-size: 12px; color: #64748B; padding: 6px 4px; border-bottom: 2px solid #E2E8F0; }
  td { padding: 6px 4px; font-size: 13px; border-bottom: 1px solid #E2E8F0; }
  td.right { text-align: right; font-weight: 600; }
  .section-title { font-size: 14px; font-weight: 700; color: #475569; margin-top: 20px; margin-bottom: 8px; }
  .footer { text-align: center; font-size: 11px; color: #94A3B8; margin-top: 24px; }
</style>
</head>
<body>
  <h1>SuperMandi POS</h1>
  <h2>Daily Report - ${formatDisplayDate(report.date)}</h2>

  <div class="summary">
    <div class="summary-card">
      <div class="summary-value">${formatMoney(report.totalSalesMinor)}</div>
      <div class="summary-label">Total Sales</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${formatMoney(report.totalRevenueMinor)}</div>
      <div class="summary-label">Revenue</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${report.transactionCount}</div>
      <div class="summary-label">Transactions</div>
    </div>
  </div>

  <div class="section-title">Payment Split</div>
  <table>
    <tr><th>Method</th><th style="text-align:right">Amount</th></tr>
    ${paymentRows
      .map(
        (r) =>
          `<tr><td>${r.label}</td><td class="right">${formatMoney(r.amount)}</td></tr>`
      )
      .join("")}
  </table>

  ${
    report.topProducts.length > 0
      ? `
  <div class="section-title">Top 5 Products</div>
  <table>
    <tr><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Revenue</th></tr>
    ${report.topProducts
      .slice(0, 5)
      .map(
        (p) =>
          `<tr><td>${p.productName}</td><td class="right">${p.qtySold}</td><td class="right">${formatMoney(p.revenueMinor)}</td></tr>`
      )
      .join("")}
  </table>`
      : ""
  }

  <div class="footer">Generated on ${new Date().toLocaleString()}</div>
</body>
</html>`;
}

// =============================================================================
// API
// =============================================================================

async function fetchDailyReport(date: string): Promise<DailyReportData> {
  const response = await apiClient.get<{ report: DailyReportData }>(
    `/api/v1/pos/reports/daily?date=${encodeURIComponent(date)}`
  );
  return response.report;
}

// =============================================================================
// COMPONENT
// =============================================================================

interface DailyReportScreenProps {
  onBack?: () => void;
}

export default function DailyReportScreen({
  onBack,
}: DailyReportScreenProps) {
  const colors = useThemeColors();

  const [selectedDate, setSelectedDate] = useState<string>(
    getYYYYMMDD(new Date())
  );
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const loadReport = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDailyReport(date);
      setReport(data);
    } catch (_e: unknown) {
    const e = asError(_e);
      // UIUX-POS-017: 404 means no data for this date — show empty state, not error
      if (e?.message?.includes("404") || e?.status === 404) {
        setReport(null);
      } else {
        if (__DEV__) console.error("[DailyReportScreen] Failed to load report:", e);
        setError(e?.message || "Failed to load daily report");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(selectedDate);
  }, [selectedDate, loadReport]);

  // Date navigation
  const handlePrevDay = useCallback(() => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setSelectedDate(getYYYYMMDD(d));
  }, [selectedDate]);

  const handleNextDay = useCallback(() => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const today = getYYYYMMDD(new Date());
    const nextDate = getYYYYMMDD(d);
    if (nextDate <= today) {
      setSelectedDate(nextDate);
    }
  }, [selectedDate]);

  const isToday = selectedDate === getYYYYMMDD(new Date());

  // Print handler
  const handlePrint = useCallback(async () => {
    if (!report) return;
    setPrinting(true);
    try {
      const content = generatePrintContent(report);
      await printerService.printReport(content);
    } catch (_e: unknown) {
    const e = asError(_e);
      if (__DEV__) console.error("[DailyReportScreen] Print failed:", e);
      Alert.alert(
        "Print Failed",
        e?.message || "Could not print the report."
      );
    } finally {
      setPrinting(false);
    }
  }, [report]);

  // Share handler (generate PDF via expo-print, then share)
  const handleShare = useCallback(async () => {
    if (!report) return;
    setSharing(true);
    try {
      const html = generateHtmlReport(report);
      const { uri } = await Print.printToFileAsync({ html });
      await Share.share({
        url: Platform.OS === "ios" ? uri : `file://${uri}`,
        title: `Daily Report - ${formatDisplayDate(report.date)}`,
        message: `SuperMandi Daily Report for ${formatDisplayDate(report.date)}`,
      });
    } catch (_e: unknown) {
    const e = asError(_e);
      // User might cancel share - not an error
      if (!e?.message?.includes("cancel")) {
        if (__DEV__) console.error("[DailyReportScreen] Share failed:", e);
        Alert.alert(
          "Share Failed",
          e?.message || "Could not share the report."
        );
      }
    } finally {
      setSharing(false);
    }
  }, [report]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: colors.textSecondary,
    },
    errorText: {
      marginTop: theme.spacing.md,
      fontSize: 14,
      color: colors.error,
      textAlign: "center",
    },
    retryButton: {
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // Date picker
    datePicker: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dateArrow: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    dateArrowDisabled: {
      opacity: 0.3,
    },
    dateCenter: {
      alignItems: "center",
    },
    dateText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    dateBadge: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.primary,
      marginTop: 2,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    // Summary
    summaryRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      alignItems: "center",
      ...theme.shadows.sm,
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.primaryDark,
      marginBottom: 4,
    },
    summaryLabel: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    // Payment split
    paymentSplitCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      ...theme.shadows.sm,
    },
    paymentRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    paymentLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    paymentLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    paymentAmount: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    // Top products table
    topProductsCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      ...theme.shadows.sm,
    },
    tableHeader: {
      flexDirection: "row",
      paddingBottom: theme.spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: colors.border,
    },
    tableHeaderText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textTertiary,
      textTransform: "uppercase",
    },
    tableRight: {
      flex: 1,
      textAlign: "right",
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tableCellText: {
      fontSize: 13,
      color: colors.textPrimary,
    },
    tableCellBold: {
      fontWeight: "700",
      color: colors.primaryDark,
    },
    // Actions
    actions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.lg,
    },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.xs,
    },
    printButton: {
      backgroundColor: colors.primary,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    shareButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    shareButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.primary,
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      <BackHeader title="Daily Report" onBack={onBack} />

      {/* Date picker row */}
      <View style={styles.datePicker}>
        <Pressable accessibilityRole="button" style={styles.dateArrow} onPress={handlePrevDay}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={colors.textPrimary}
          />
        </Pressable>
        <View style={styles.dateCenter}>
          <Text style={styles.dateText}>{formatDisplayDate(selectedDate)}</Text>
          {isToday && <Text style={styles.dateBadge}>Today</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
          onPress={handleNextDay}
          disabled={isToday}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={28}
            color={isToday ? colors.textTertiary : colors.textPrimary}
          />
        </Pressable>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading report...</Text>
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={colors.error}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => loadReport(selectedDate)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Report content */}
      {!loading && !error && report && (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Summary cards */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {formatMoney(report.totalSalesMinor)}
              </Text>
              <Text style={styles.summaryLabel}>Total Sales</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {formatMoney(report.totalRevenueMinor)}
              </Text>
              <Text style={styles.summaryLabel}>Revenue</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {report.transactionCount}
              </Text>
              <Text style={styles.summaryLabel}>Transactions</Text>
            </View>
          </View>

          {/* Payment split */}
          <Text style={styles.sectionTitle}>Payment Split</Text>
          <View style={styles.paymentSplitCard}>
            {report.paymentSplit.cashMinor > 0 && (
              <View style={styles.paymentRow}>
                <View style={styles.paymentLabelRow}>
                  <MaterialCommunityIcons
                    name="cash"
                    size={18}
                    color={colors.success}
                  />
                  <Text style={styles.paymentLabel}>Cash</Text>
                </View>
                <Text style={styles.paymentAmount}>
                  {formatMoney(report.paymentSplit.cashMinor)}
                </Text>
              </View>
            )}
            {report.paymentSplit.upiMinor > 0 && (
              <View style={styles.paymentRow}>
                <View style={styles.paymentLabelRow}>
                  <MaterialCommunityIcons
                    name="cellphone"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.paymentLabel}>UPI</Text>
                </View>
                <Text style={styles.paymentAmount}>
                  {formatMoney(report.paymentSplit.upiMinor)}
                </Text>
              </View>
            )}
            {report.paymentSplit.dueMinor > 0 && (
              <View style={styles.paymentRow}>
                <View style={styles.paymentLabelRow}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={18}
                    color={colors.warning}
                  />
                  <Text style={styles.paymentLabel}>Due</Text>
                </View>
                <Text style={styles.paymentAmount}>
                  {formatMoney(report.paymentSplit.dueMinor)}
                </Text>
              </View>
            )}
            {report.paymentSplit.cardMinor > 0 && (
              <View style={styles.paymentRow}>
                <View style={styles.paymentLabelRow}>
                  <MaterialCommunityIcons
                    name="credit-card-outline"
                    size={18}
                    color={colors.accent}
                  />
                  <Text style={styles.paymentLabel}>Card</Text>
                </View>
                <Text style={styles.paymentAmount}>
                  {formatMoney(report.paymentSplit.cardMinor)}
                </Text>
              </View>
            )}
          </View>

          {/* Top 5 products */}
          {report.topProducts.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Top 5 Products</Text>
              <View style={styles.topProductsCard}>
                {/* Table header */}
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2 }]}>
                    Product
                  </Text>
                  <Text style={[styles.tableHeaderText, styles.tableRight]}>
                    Qty
                  </Text>
                  <Text style={[styles.tableHeaderText, styles.tableRight]}>
                    Revenue
                  </Text>
                </View>
                {report.topProducts.slice(0, 5).map((product, idx) => (
                  <View key={idx} style={styles.tableRow}>
                    <Text
                      style={[styles.tableCellText, { flex: 2 }]}
                      numberOfLines={1}
                    >
                      {product.productName}
                    </Text>
                    <Text style={[styles.tableCellText, styles.tableRight]}>
                      {product.qtySold}
                    </Text>
                    <Text
                      style={[
                        styles.tableCellText,
                        styles.tableRight,
                        styles.tableCellBold,
                      ]}
                    >
                      {formatMoney(product.revenueMinor)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.actionButton, styles.printButton]}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator
                  size="small"
                  color={colors.textInverse}
                />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="printer-outline"
                    size={18}
                    color={colors.textInverse}
                  />
                  <Text style={styles.actionButtonText}>Print Report</Text>
                </>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.actionButton, styles.shareButton]}
              onPress={handleShare}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="share-variant"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.shareButtonText}>Share Report</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
