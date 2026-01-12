// DismissReasonModal - V3.0.9 compliant
// Modal for entering dismiss reason

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../theme";
import type { PendingReorder } from "../../services/api/reorderApi";

// =============================================================================
// TYPES
// =============================================================================

export interface DismissReasonModalProps {
  visible: boolean;
  item: PendingReorder | null;
  onDismiss: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}

// =============================================================================
// PREDEFINED REASONS
// =============================================================================

const PREDEFINED_REASONS = [
  "Not needed at this time",
  "Found alternative supplier",
  "Product discontinued",
  "Price too high",
  "Stock already received",
  "Seasonal item - out of season",
];

// =============================================================================
// COMPONENT
// =============================================================================

export function DismissReasonModal({
  visible,
  item,
  onDismiss,
  onClose,
}: DismissReasonModalProps) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setReason("");
      setCustomReason("");
      setError(null);
    }
  }, [visible]);

  // Get final reason
  const finalReason = reason === "other" ? customReason.trim() : reason;
  const isValid = finalReason.length > 0;

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!item || !isValid) return;

    setSubmitting(true);
    setError(null);

    try {
      await onDismiss(item.id, finalReason);
      onClose();
    } catch (err) {
      console.error("[DismissReasonModal] Failed to dismiss:", err);
      setError("Failed to dismiss. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [item, isValid, finalReason, onDismiss, onClose]);

  // Handle reason select
  const handleReasonSelect = useCallback((selectedReason: string) => {
    setReason(selectedReason);
    setError(null);
  }, []);

  if (!item) return null;

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
          <Text style={styles.headerTitle}>Dismiss Reorder</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Product Info */}
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{item.productName}</Text>
            <Text style={styles.productMeta}>
              Suggested: {item.suggestedQuantity} units
              {item.suggestedSupplierName && ` from ${item.suggestedSupplierName}`}
            </Text>
          </View>

          {/* Reason Selection */}
          <Text style={styles.sectionTitle}>Select a reason</Text>

          <View style={styles.reasonsContainer}>
            {PREDEFINED_REASONS.map((predefinedReason) => (
              <Pressable
                key={predefinedReason}
                style={[
                  styles.reasonChip,
                  reason === predefinedReason && styles.reasonChipSelected,
                ]}
                onPress={() => handleReasonSelect(predefinedReason)}
              >
                <Text
                  style={[
                    styles.reasonChipText,
                    reason === predefinedReason && styles.reasonChipTextSelected,
                  ]}
                >
                  {predefinedReason}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={[
                styles.reasonChip,
                reason === "other" && styles.reasonChipSelected,
              ]}
              onPress={() => handleReasonSelect("other")}
            >
              <Text
                style={[
                  styles.reasonChipText,
                  reason === "other" && styles.reasonChipTextSelected,
                ]}
              >
                Other reason...
              </Text>
            </Pressable>
          </View>

          {/* Custom Reason Input */}
          {reason === "other" && (
            <View style={styles.customReasonContainer}>
              <TextInput
                style={styles.customReasonInput}
                placeholder="Enter your reason..."
                placeholderTextColor={theme.colors.textTertiary}
                value={customReason}
                onChangeText={setCustomReason}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
              <Text style={styles.charCount}>
                {customReason.length}/200
              </Text>
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons
                name="alert-circle"
                size={16}
                color={theme.colors.error}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            disabled={submitting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[
              styles.dismissButton,
              (!isValid || submitting) && styles.dismissButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!isValid || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.colors.textInverse} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="close-circle"
                  size={18}
                  color={theme.colors.textInverse}
                />
                <Text style={styles.dismissButtonText}>Dismiss</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
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
    width: 40,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
  productInfo: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  reasonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  reasonChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  reasonChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  reasonChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  reasonChipTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: "500",
  },
  customReasonContainer: {
    marginTop: theme.spacing.md,
  },
  customReasonInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textPrimary,
    minHeight: 100,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: "right",
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cancelButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  dismissButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.error,
    gap: theme.spacing.xs,
  },
  dismissButtonDisabled: {
    opacity: 0.5,
  },
  dismissButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});

export default DismissReasonModal;
