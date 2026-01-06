import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { theme } from "../theme";
import type { ScanNotice } from "../services/scan/handleScan";

type ScanNoticeBannerProps = {
  notice: ScanNotice | null;
};

export default function ScanNoticeBanner({ notice }: ScanNoticeBannerProps) {
  if (!notice) return null;

  const toneStyle =
    notice.tone === "warning"
      ? styles.noticeWarning
      : notice.tone === "error"
        ? styles.noticeError
        : styles.noticeInfo;

  return (
    <View style={[styles.notice, toneStyle]}>
      <Text style={styles.noticeText}>{notice.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  noticeWarning: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
  },
  noticeError: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.errorSoft,
  },
  noticeInfo: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.accentSoft,
  },
  noticeText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
});
