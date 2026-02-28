/**
 * HELP-001: Help & Support screen for POS App.
 * Accessible from MenuScreen (post-login) and EnrollDeviceScreen (pre-login link).
 * Works offline — all content is static, external links use native intents.
 * All URLs use GCP-correct paths per ROUTING_SPEC.json.
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, typography, spacing, theme } from "../theme";

interface HelpScreenProps {
  onBack: () => void;
}

const SUPPORT_EMAIL = "hello@supermandi.tech";
const WEBSITE_URL = "https://supermandi.tech";
const RETAILER_PORTAL_URL = "https://supermandi.tech/retailer/";
const POS_DOWNLOAD_URL = "https://supermandi.tech/pos";
const TERMS_URL = "https://supermandi.tech/terms";
const PRIVACY_URL = "https://supermandi.tech/privacy";
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE;

function openUrl(url: string, fallbackMsg: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert("Cannot Open Link", fallbackMsg);
  });
}

export default function HelpScreen({ onBack }: HelpScreenProps) {
  const handleEmailPress = () => {
    openUrl(
      `mailto:${SUPPORT_EMAIL}`,
      `Please send an email to ${SUPPORT_EMAIL} manually.`
    );
  };

  const handleWhatsApp = () => {
    if (!SUPPORT_PHONE) {
      Alert.alert("Support Unavailable", "WhatsApp support is not configured.");
      return;
    }
    const msg = encodeURIComponent("Hi, I need help with SuperMandi POS.");
    openUrl(
      `https://wa.me/${SUPPORT_PHONE}?text=${msg}`,
      "Please install WhatsApp to use this feature."
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Back Button */}
      <Pressable
        onPress={onBack}
        style={styles.backButton}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name={"arrow-left" as any}
          size={24}
          color={colors.textPrimary}
        />
      </Pressable>

      <Text style={styles.title} accessibilityRole="header">
        Help & Support
      </Text>
      <Text style={styles.subtitle}>Need help? We're here for you.</Text>

      {/* Contact Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons
            name={"email-outline" as any}
            size={20}
            color={colors.primary}
          />
          <Text style={styles.cardTitle}>Contact Us</Text>
        </View>
        <Pressable
          onPress={handleEmailPress}
          style={styles.actionRow}
          accessibilityRole="link"
          accessibilityLabel={`Send email to ${SUPPORT_EMAIL}`}
        >
          <Text style={styles.emailText}>{SUPPORT_EMAIL}</Text>
          <MaterialCommunityIcons
            name={"open-in-new" as any}
            size={16}
            color={colors.primary}
          />
        </Pressable>
        <Text style={styles.responseTime}>
          We typically respond within 24 hours.
        </Text>
      </View>

      {/* WhatsApp Card */}
      {SUPPORT_PHONE ? (
        <Pressable
          style={[styles.card, styles.whatsappCard]}
          onPress={handleWhatsApp}
          accessibilityRole="button"
          accessibilityLabel="Contact us on WhatsApp"
        >
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name={"whatsapp" as any}
              size={20}
              color={colors.whatsapp}
            />
            <Text style={styles.cardTitle}>WhatsApp Support</Text>
          </View>
          <Text style={styles.cardDescription}>
            Chat with our support team
          </Text>
        </Pressable>
      ) : null}

      {/* Quick Links Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons
            name={"link-variant" as any}
            size={20}
            color={colors.primary}
          />
          <Text style={styles.cardTitle}>Quick Links</Text>
        </View>

        <Pressable
          onPress={() => openUrl(RETAILER_PORTAL_URL, `Visit ${RETAILER_PORTAL_URL} in your browser.`)}
          style={styles.linkRow}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>Retailer Portal</Text>
          <MaterialCommunityIcons
            name={"chevron-right" as any}
            size={18}
            color={colors.textTertiary}
          />
        </Pressable>

        <Pressable
          onPress={() => openUrl(POS_DOWNLOAD_URL, `Visit ${POS_DOWNLOAD_URL} in your browser.`)}
          style={styles.linkRow}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>Download POS App</Text>
          <MaterialCommunityIcons
            name={"chevron-right" as any}
            size={18}
            color={colors.textTertiary}
          />
        </Pressable>

        <Pressable
          onPress={() => openUrl(WEBSITE_URL, `Visit ${WEBSITE_URL} in your browser.`)}
          style={styles.linkRow}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>SuperMandi Website</Text>
          <MaterialCommunityIcons
            name={"chevron-right" as any}
            size={18}
            color={colors.textTertiary}
          />
        </Pressable>
      </View>

      {/* Legal Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons
            name={"shield-check-outline" as any}
            size={20}
            color={colors.primary}
          />
          <Text style={styles.cardTitle}>Legal</Text>
        </View>

        <Pressable
          onPress={() => openUrl(TERMS_URL, `Visit ${TERMS_URL} in your browser.`)}
          style={styles.linkRow}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>Terms of Service</Text>
          <MaterialCommunityIcons
            name={"chevron-right" as any}
            size={18}
            color={colors.textTertiary}
          />
        </Pressable>

        <Pressable
          onPress={() => openUrl(PRIVACY_URL, `Visit ${PRIVACY_URL} in your browser.`)}
          style={styles.linkRow}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>Privacy Policy</Text>
          <MaterialCommunityIcons
            name={"chevron-right" as any}
            size={18}
            color={colors.textTertiary}
          />
        </Pressable>
      </View>

      {/* Company Info */}
      <View style={styles.companyInfo}>
        <Text style={styles.companyText}>SuperMandi Tech Pvt Ltd</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  backButton: {
    marginBottom: spacing.md,
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.bodySmall.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  whatsappCard: {
    borderColor: colors.whatsapp + "30",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.label.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  cardDescription: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  emailText: {
    fontSize: typography.bodySmall.fontSize,
    color: colors.primary,
    fontWeight: "600",
  },
  responseTime: {
    fontSize: typography.caption.fontSize,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  linkText: {
    fontSize: typography.bodySmall.fontSize,
    color: colors.primary,
    fontWeight: "500",
  },
  companyInfo: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  companyText: {
    fontSize: typography.caption.fontSize,
    color: colors.textTertiary,
  },
});
