// REG-AUTH-401: LIMITED MODE Banner for POS App
// Displays when store's application status is not ACTIVE
// Shows status-specific messages and blocked actions

import React, { useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../theme";

// Status configuration for display
const STATUS_CONFIG: Record<string, {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  label: string;
  message: string;
}> = {
  DRAFT: {
    color: "#92400E",
    bgColor: "#FEF3C7",
    borderColor: "#F59E0B",
    icon: "file-document-edit-outline",
    label: "Draft",
    message: "Complete your registration and upload documents to get approved.",
  },
  KYC_SUBMITTED: {
    color: "#1E40AF",
    bgColor: "#DBEAFE",
    borderColor: "#3B82F6",
    icon: "file-clock-outline",
    label: "Under Review",
    message: "Your documents are being reviewed. This usually takes 1-2 business days.",
  },
  PAYMENTS_SUBMITTED: {
    color: "#1E40AF",
    bgColor: "#DBEAFE",
    borderColor: "#3B82F6",
    icon: "clock-check-outline",
    label: "Final Review",
    message: "Your application is in final review stage.",
  },
  ENROLLED: {
    color: "#92400E",
    bgColor: "#FEF3C7",
    borderColor: "#F59E0B",
    icon: "account-clock-outline",
    label: "Enrolled",
    message: "Your store is enrolled but awaiting full approval.",
  },
  NEEDS_FIX: {
    color: "#991B1B",
    bgColor: "#FEE2E2",
    borderColor: "#EF4444",
    icon: "alert-circle-outline",
    label: "Action Required",
    message: "Please update your information and resubmit.",
  },
  // SA-P0-001: Store suspension display
  SUSPENDED: {
    color: "#991B1B",
    bgColor: "#FEE2E2",
    borderColor: "#EF4444",
    icon: "store-alert-outline",
    label: "Suspended",
    message: "This store has been temporarily suspended by the administrator. Contact support for details.",
  },
  REJECTED: {
    color: "#991B1B",
    bgColor: "#FEE2E2",
    borderColor: "#EF4444",
    icon: "close-circle-outline",
    label: "Rejected",
    message: "Your application was not approved. Please contact support.",
  },
  EXPIRED: {
    color: "#475569",
    bgColor: "#F1F5F9",
    borderColor: "#94A3B8",
    icon: "clock-alert-outline",
    label: "Expired",
    message: "Your application has expired. Please contact support.",
  },
  PENDING: {
    color: "#92400E",
    bgColor: "#FEF3C7",
    borderColor: "#F59E0B",
    icon: "clock-outline",
    label: "Pending",
    message: "Your account is pending admin approval.",
  },
};

// Default config for unknown statuses
const DEFAULT_CONFIG = {
  color: "#92400E",
  bgColor: "#FEF3C7",
  borderColor: "#F59E0B",
  icon: "information-outline",
  label: "Pending",
  message: "Your account is pending approval. Some features are restricted.",
};

// Actions blocked in LIMITED MODE
const BLOCKED_ACTIONS = [
  "Create Sales",
  "Process Payments",
  "Place Orders (BUY)",
  "Run Reorders",
];

// Actions allowed in LIMITED MODE
const ALLOWED_ACTIONS = [
  "View Menu",
  "View Products",
  "Sync Data",
];

interface LimitedModeBannerProps {
  status: string | null;
  storeName?: string | null;
  compact?: boolean;
}

export default function LimitedModeBanner({
  status,
  storeName,
  compact = false,
}: LimitedModeBannerProps) {
  const [expanded, setExpanded] = useState(false);

  // Don't show for ACTIVE status
  const normalizedStatus = status?.toUpperCase();
  if (!normalizedStatus || normalizedStatus === "ACTIVE") {
    return null;
  }

  const config = STATUS_CONFIG[normalizedStatus] || DEFAULT_CONFIG;

  // Compact mode - just a pill indicator
  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
        <MaterialCommunityIcons name={config.icon as any} size={14} color={config.color} />
        <Text style={[styles.compactText, { color: config.color }]}>
          LIMITED MODE
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name={config.icon as any} size={18} color={config.color} />
          <View style={styles.headerLabels}>
            <View style={[styles.badge, { backgroundColor: config.borderColor }]}>
              <Text style={styles.badgeText}>LIMITED MODE</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.statusText, { color: config.color }]}>
                Status: {config.label}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Message */}
      <Text style={[styles.message, { color: config.color }]}>
        {config.message}
      </Text>

      {/* Expandable restrictions */}
      <Pressable
        style={styles.expandButton}
        onPress={() => setExpanded(!expanded)}
        hitSlop={8}
      >
        <Text style={styles.expandText}>
          {expanded ? "Hide restrictions" : "View restrictions"}
        </Text>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.colors.textSecondary}
        />
      </Pressable>

      {expanded && (
        <View style={styles.restrictionsContainer}>
          <View style={styles.restrictionColumn}>
            <Text style={styles.restrictionHeader}>Blocked:</Text>
            {BLOCKED_ACTIONS.map((action) => (
              <View key={action} style={styles.restrictionRow}>
                <MaterialCommunityIcons name="close-circle" size={12} color={theme.colors.error} />
                <Text style={styles.restrictionText}>{action}</Text>
              </View>
            ))}
          </View>
          <View style={styles.restrictionColumn}>
            <Text style={[styles.restrictionHeader, { color: theme.colors.success }]}>Allowed:</Text>
            {ALLOWED_ACTIONS.map((action) => (
              <View key={action} style={styles.restrictionRow}>
                <MaterialCommunityIcons name="check-circle" size={12} color={theme.colors.success} />
                <Text style={styles.restrictionText}>{action}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// Compact pill indicator for status bar
export function LimitedModeIndicator({ status }: { status: string | null }) {
  const normalizedStatus = status?.toUpperCase();
  if (!normalizedStatus || normalizedStatus === "ACTIVE") {
    return null;
  }

  const config = STATUS_CONFIG[normalizedStatus] || DEFAULT_CONFIG;

  return (
    <View style={[styles.indicator, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
      <Text style={[styles.indicatorText, { color: config.color }]}>
        {config.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  headerLabels: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: theme.colors.textInverse,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  expandText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  restrictionsContainer: {
    flexDirection: "row",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  restrictionColumn: {
    flex: 1,
  },
  restrictionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.error,
    marginBottom: 4,
  },
  restrictionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  restrictionText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 999,
  },
  compactText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  indicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 4,
  },
  indicatorText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
