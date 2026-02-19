// T-195: Thermal Printer Configuration Screen
// Paper width, auto-print, copies, test print

import React, { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme } from "../theme";
import { useSettingsStore } from "../stores/settingsStore";
import { printerService } from "../services/printerService";

interface PrinterSettingsScreenProps {
  onBack?: () => void;
}

export default function PrinterSettingsScreen({ onBack }: PrinterSettingsScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Settings store
  const printerPaperWidth = useSettingsStore((s) => s.printerPaperWidth);
  const printerAutoPrint = useSettingsStore((s) => s.printerAutoPrint);
  const printerCopies = useSettingsStore((s) => s.printerCopies);
  const setPrinterPaperWidth = useSettingsStore((s) => s.setPrinterPaperWidth);
  const setPrinterAutoPrint = useSettingsStore((s) => s.setPrinterAutoPrint);
  const setPrinterCopies = useSettingsStore((s) => s.setPrinterCopies);

  const [testPrinting, setTestPrinting] = useState(false);

  const handleTestPrint = useCallback(async () => {
    setTestPrinting(true);
    try {
      await printerService.testPrint();
      Alert.alert(
        t("printerSettings.testSuccess", "Test Print Sent"),
        t("printerSettings.testSuccessMsg", "A test receipt has been sent to the printer.")
      );
    } catch (err: any) {
      Alert.alert(
        t("printerSettings.testFailed", "Test Print Failed"),
        err.message || t("printerSettings.testFailedMsg", "Could not send test page. Check printer connection.")
      );
    } finally {
      setTestPrinting(false);
    }
  }, [t]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>
          {t("printerSettings.title", "Printer Settings")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Paper Width */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("printerSettings.paperWidth", "Paper Width")}
          </Text>
          <Text style={styles.sectionDescription}>
            {t("printerSettings.paperWidthDesc", "Select the width of your thermal printer paper roll.")}
          </Text>
          <View style={styles.radioGroup}>
            <Pressable
              style={[styles.radioOption, printerPaperWidth === 58 && styles.radioOptionSelected]}
              onPress={() => setPrinterPaperWidth(58)}
            >
              <View style={[styles.radioCircle, printerPaperWidth === 58 && styles.radioCircleSelected]}>
                {printerPaperWidth === 58 && <View style={styles.radioInner} />}
              </View>
              <View>
                <Text style={[styles.radioLabel, printerPaperWidth === 58 && styles.radioLabelSelected]}>
                  58mm
                </Text>
                <Text style={styles.radioHint}>
                  {t("printerSettings.small", "Small (most portable printers)")}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.radioOption, printerPaperWidth === 80 && styles.radioOptionSelected]}
              onPress={() => setPrinterPaperWidth(80)}
            >
              <View style={[styles.radioCircle, printerPaperWidth === 80 && styles.radioCircleSelected]}>
                {printerPaperWidth === 80 && <View style={styles.radioInner} />}
              </View>
              <View>
                <Text style={[styles.radioLabel, printerPaperWidth === 80 && styles.radioLabelSelected]}>
                  80mm
                </Text>
                <Text style={styles.radioHint}>
                  {t("printerSettings.large", "Large (countertop printers)")}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Auto Print */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>
                {t("printerSettings.autoPrint", "Auto-Print Receipts")}
              </Text>
              <Text style={styles.sectionDescription}>
                {t("printerSettings.autoPrintDesc", "Automatically print receipt after each sale is completed.")}
              </Text>
            </View>
            <Switch
              value={printerAutoPrint}
              onValueChange={setPrinterAutoPrint}
              trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }}
              thumbColor={printerAutoPrint ? theme.colors.primary : theme.colors.backgroundTertiary}
            />
          </View>
        </View>

        {/* Copies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("printerSettings.copies", "Number of Copies")}
          </Text>
          <Text style={styles.sectionDescription}>
            {t("printerSettings.copiesDesc", "How many copies to print per receipt (1 original + extra copies).")}
          </Text>
          <View style={styles.copiesRow}>
            <Pressable
              style={[styles.copyButton, printerCopies <= 1 && styles.copyButtonDisabled]}
              onPress={() => setPrinterCopies(printerCopies - 1)}
              disabled={printerCopies <= 1}
            >
              <MaterialCommunityIcons
                name="minus"
                size={20}
                color={printerCopies <= 1 ? theme.colors.textTertiary : theme.colors.primary}
              />
            </Pressable>
            <Text style={styles.copiesText}>{printerCopies}</Text>
            <Pressable
              style={[styles.copyButton, printerCopies >= 3 && styles.copyButtonDisabled]}
              onPress={() => setPrinterCopies(printerCopies + 1)}
              disabled={printerCopies >= 3}
            >
              <MaterialCommunityIcons
                name="plus"
                size={20}
                color={printerCopies >= 3 ? theme.colors.textTertiary : theme.colors.primary}
              />
            </Pressable>
          </View>
        </View>

        {/* Test Print Button */}
        <View style={styles.section}>
          <Pressable
            style={[styles.testButton, testPrinting && styles.testButtonDisabled]}
            onPress={handleTestPrint}
            disabled={testPrinting}
          >
            <MaterialCommunityIcons
              name="printer"
              size={20}
              color={theme.colors.textInverse}
            />
            <Text style={styles.testButtonText}>
              {testPrinting
                ? t("printerSettings.printing", "Printing...")
                : t("printerSettings.testPrint", "Test Print")}
            </Text>
          </Pressable>
          <Text style={styles.testHint}>
            {t("printerSettings.testHint", "Sends a test receipt to verify your printer is working correctly.")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  radioGroup: {
    gap: theme.spacing.sm,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  radioOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: theme.colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  radioLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  radioLabelSelected: {
    color: theme.colors.primary,
  },
  radioHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  copiesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.lg,
  },
  copyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  copyButtonDisabled: {
    borderColor: theme.colors.border,
  },
  copiesText: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    minWidth: 40,
    textAlign: "center",
  },
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  testHint: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginTop: theme.spacing.sm,
  },
});
