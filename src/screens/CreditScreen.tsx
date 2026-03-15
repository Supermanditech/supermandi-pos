// SM-022: CreditScreen
// Screen showing credit offers, active loans, and repayment history

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDate } from "../i18n/formatters";
import * as creditApi from "../services/api/creditApi";
import type {
  CreditOffer,
  CreditApplication,
  CreditScore,
  ScoringFactors,
} from "../services/api/creditApi";
import { asError } from "../utils/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

interface CreditScreenProps {
  onBack?: () => void;
}

type TabId = "offers" | "loans" | "history";

// =============================================================================
// COMPONENT
// =============================================================================

export function CreditScreen({ onBack }: CreditScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // UIUX-POS-004: Android hardware back button support
  useEffect(() => {
    if (Platform.OS !== "android" || !onBack) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("offers");

  // Data state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offers, setOffers] = useState<CreditOffer[]>([]);
  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [creditScore, setCreditScore] = useState<CreditScore | null>(null);
  const [eligibleAmount, setEligibleAmount] = useState(0);
  const [scoringFactors, setScoringFactors] = useState<ScoringFactors | null>(null);
  const [activeApplication, setActiveApplication] = useState<{
    id: string;
    status: string;
    kycStatus: string;
  } | null>(null);

  // STG-457: Consent state for DPDP compliance
  const [consentRequired, setConsentRequired] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);

  // STG-448: Feature gate from backend config (single source of truth)
  const [creditEnabled, setCreditEnabled] = useState(true);

  // Apply modal state
  const [applyModal, setApplyModal] = useState<{
    visible: boolean;
    offer: CreditOffer | null;
    step: "amount" | "kyc" | "success";
    requestedAmount: string;
    panNumber: string;
    aadhaarLast4: string;
    applicationId: string | null;
    loading: boolean;
    error: string | null;
  }>({
    visible: false,
    offer: null,
    step: "amount",
    requestedAmount: "",
    panNumber: "",
    aadhaarLast4: "",
    applicationId: null,
    loading: false,
    error: null,
  });

  // ISSUE-085: Clear PII (PAN/Aadhaar) on unmount
  useEffect(() => {
    return () => {
      setApplyModal((prev) => ({ ...prev, panNumber: "", aadhaarLast4: "" }));
    };
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      // STG-448: Check feature gate first (single source of truth)
      const configPromise = creditApi.getCreditFeatureConfig().catch(() => null);
      const [offersRes, applicationsRes, featureConfig] = await Promise.all([
        creditApi.getCreditOffers(),
        creditApi.getCreditApplications(),
        configPromise,
      ]);

      // STG-448: If backend says credit is disabled, show disabled state
      if (featureConfig && !featureConfig.creditEnabled) {
        setCreditEnabled(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setCreditEnabled(true);

      // STG-457: Check if consent is required before showing credit data
      if (offersRes.consentRequired) {
        setConsentRequired(true);
        setOffers([]);
        setCreditScore(null);
        setEligibleAmount(0);
        setScoringFactors(null);
        setActiveApplication(null);
        setApplications([]);
        return;
      }

      setConsentRequired(false);
      setOffers(offersRes.offers);
      setCreditScore(offersRes.creditScore);
      setEligibleAmount(offersRes.eligibleAmount);
      setScoringFactors(offersRes.scoringFactors);
      setActiveApplication(offersRes.activeApplication);
      setApplications(applicationsRes.applications);
    } catch (error) {
      if (__DEV__) console.error("[CreditScreen] Failed to load data:", error);
      Alert.alert(
        t("credit.errorTitle", "Connection Error"),
        t("credit.loadError", "Failed to load credit information. Check your connection and try again.")
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // GO-LIVE-238: Auto-refresh when there's a pending application
  // POS-030: Max 20 polls (10 minutes) to prevent battery drain
  useEffect(() => {
    // ISSUE-086: Also skip polling when disbursed — no further status transitions expected
    if (!activeApplication || activeApplication.status === "approved" || activeApplication.status === "rejected" || activeApplication.status === "disbursed") {
      return;
    }

    let pollCount = 0;
    const maxPolls = 20;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(pollInterval);
        return;
      }
      void loadData();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [activeApplication?.status, loadData]);

  // GO-LIVE-245: Credit utilization warning — derived from loaded data
  const usedCreditMinor = applications
    .filter(a => a.status === "disbursed" || a.status === "approved")
    .reduce((sum, a) => sum + (a.disbursedAmountMinor ?? a.requestedAmountMinor), 0);
  const creditUtilization = eligibleAmount > 0 ? (usedCreditMinor / eligibleAmount) * 100 : 0;
  const showCreditWarning = creditUtilization >= 90;

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  // Apply for offer
  const handleApplyOffer = useCallback((offer: CreditOffer) => {
    setApplyModal({
      visible: true,
      offer,
      step: "amount",
      requestedAmount: (offer.amountMinor / 100).toString(),
      panNumber: "",
      aadhaarLast4: "",
      applicationId: null,
      loading: false,
      error: null,
    });
  }, []);

  // Submit application
  const handleSubmitApplication = useCallback(async () => {
    if (!applyModal.offer) return;

    const amount = parseFloat(applyModal.requestedAmount) * 100;
    if (isNaN(amount) || amount <= 0 || amount > applyModal.offer.amountMinor) {
      setApplyModal((prev) => ({
        ...prev,
        error: t("credit.invalidAmount", "Please enter a valid amount"),
      }));
      return;
    }

    setApplyModal((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await creditApi.applyForCredit(applyModal.offer.id, amount);

      if (response.success && response.applicationId) {
        setApplyModal((prev) => ({
          ...prev,
          step: "kyc",
          applicationId: response.applicationId ?? null,
          loading: false,
        }));
      } else {
        setApplyModal((prev) => ({
          ...prev,
          error: response.error || t("credit.applyError", "Failed to submit application. Check your connection and try again."),
          loading: false,
        }));
      }
    } catch (_error: unknown) {
    const error = asError(_error);
      setApplyModal((prev) => ({
        ...prev,
        error: error.message || t("credit.applyError", "Failed to submit application. Check your connection and try again."),
        loading: false,
      }));
    }
  }, [applyModal.offer, applyModal.requestedAmount, t]);

  // Submit KYC
  const handleSubmitKyc = useCallback(async () => {
    if (!applyModal.applicationId) return;

    // Validate PAN
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(applyModal.panNumber.toUpperCase())) {
      setApplyModal((prev) => ({
        ...prev,
        error: t("credit.invalidPan", "Invalid PAN format (e.g., ABCDE1234F)"),
      }));
      return;
    }

    // Validate Aadhaar
    if (!/^[0-9]{4}$/.test(applyModal.aadhaarLast4)) {
      setApplyModal((prev) => ({
        ...prev,
        error: t("credit.invalidAadhaar", "Please enter last 4 digits of Aadhaar"),
      }));
      return;
    }

    setApplyModal((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await creditApi.submitCreditKyc(
        applyModal.applicationId,
        applyModal.panNumber.toUpperCase(),
        applyModal.aadhaarLast4
      );

      // STG-471: Handle "processing"/"pending" as valid intermediate states, not errors
      if (response.success && response.applicationStatus === "approved") {
        setApplyModal((prev) => ({
          ...prev,
          step: "success",
          loading: false,
        }));
      } else if (response.success && (response.applicationStatus === "processing" || response.applicationStatus === "pending")) {
        setApplyModal((prev) => ({
          ...prev,
          step: "success",
          loading: false,
          // Show processing message instead of error
          successMessage: t("credit.kycProcessing", "KYC verification is being processed. You will be notified once approved."),
        }));
      } else {
        setApplyModal((prev) => ({
          ...prev,
          error: response.message || t("credit.kycError", "KYC verification failed"),
          loading: false,
        }));
      }
    } catch (_error: unknown) {
    const error = asError(_error);
      setApplyModal((prev) => ({
        ...prev,
        error: error.message || t("credit.kycError", "KYC verification failed"),
        loading: false,
      }));
    }
  }, [applyModal.applicationId, applyModal.panNumber, applyModal.aadhaarLast4, t]);

  // Close apply modal
  // UIUX-POS-012: Capture step before reset to avoid reading stale/reset state
  const handleCloseApplyModal = useCallback(() => {
    const wasSuccess = applyModal.step === "success";
    setApplyModal({
      visible: false,
      offer: null,
      step: "amount",
      requestedAmount: "",
      panNumber: "",
      aadhaarLast4: "",
      applicationId: null,
      loading: false,
      error: null,
    });
    if (wasSuccess) {
      void loadData();
    }
  }, [applyModal.step, loadData]);

  // Get active loans (disbursed applications)
  const activeLoans = applications.filter((app) => app.status === "disbursed");

  // Get repayment history (approved/disbursed)
  const repaymentHistory = applications.filter(
    (app) => app.status === "approved" || app.status === "disbursed"
  );

  // Render offer card
  const renderOfferCard = useCallback(
    (offer: CreditOffer) => {
      const isInterestFree = offer.interestRateAnnual === 0;
      const sourceLabel = creditApi.getOfferSourceLabel(offer.source);

      return (
        <View key={offer.id} style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <View style={styles.offerSource}>
              <MaterialCommunityIcons
                name={isInterestFree ? "gift-outline" : "bank-outline"}
                size={18}
                color={isInterestFree ? colors.success : colors.primary}
              />
              <Text style={styles.offerSourceText}>{sourceLabel}</Text>
            </View>
            {isInterestFree && (
              <View style={styles.interestFreeBadge}>
                <Text style={styles.interestFreeText}>
                  {t("credit.interestFree", "0% Interest")}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.offerAmount}>
            {creditApi.formatCreditAmount(offer.amountMinor)}
          </Text>

          <View style={styles.offerDetails}>
            <View style={styles.offerDetailItem}>
              <Text style={styles.offerDetailLabel}>{t("credit.tenure", "Tenure")}</Text>
              <Text style={styles.offerDetailValue}>
                {creditApi.formatTenure(offer.tenureMonths)}
              </Text>
            </View>
            <View style={styles.offerDetailDivider} />
            <View style={styles.offerDetailItem}>
              <Text style={styles.offerDetailLabel}>{t("credit.interest", "Interest")}</Text>
              <Text style={styles.offerDetailValue}>
                {creditApi.formatInterestRate(offer.interestRateAnnual)}
              </Text>
            </View>
            <View style={styles.offerDetailDivider} />
            <View style={styles.offerDetailItem}>
              <Text style={styles.offerDetailLabel}>{t("credit.emi", "EMI")}</Text>
              <Text style={styles.offerDetailValue}>
                {creditApi.formatEmiAmount(offer.emiMinor)}{t("credit.perMonth", "/mo")}
              </Text>
            </View>
          </View>

          {offer.validUntil && (
            <Text style={styles.offerValidity}>
              {t("credit.validUntil", "Valid until")} {offer.validUntil}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            style={[
              styles.applyButton,
              activeApplication && styles.applyButtonDisabled,
            ]}
            onPress={() => handleApplyOffer(offer)}
            disabled={!!activeApplication}
          >
            <MaterialCommunityIcons
              name="send-outline"
              size={16}
              color={colors.textInverse}
            />
            <Text style={styles.applyButtonText}>
              {activeApplication
                ? t("credit.applicationPending", "Application Pending")
                : t("credit.apply", "Apply Now")}
            </Text>
          </Pressable>
        </View>
      );
    },
    [activeApplication, handleApplyOffer, t]
  );

  // Render loan card
  const renderLoanCard = useCallback(
    (app: CreditApplication) => {
      const emiAmount = creditApi.calculateEmi(
        app.disbursedAmountMinor || app.requestedAmountMinor,
        app.interestRateAnnual,
        app.tenureMonths
      );

      // STG-445: Compute elapsed months for accurate remaining/next EMI
      const disbursedDate = app.disbursedAt ? new Date(app.disbursedAt) : new Date();
      const monthsElapsed = app.disbursedAt
        ? Math.max(1, Math.ceil((Date.now() - disbursedDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)))
        : 0;
      const emisPaid = Math.min(monthsElapsed, app.tenureMonths);
      const emisRemaining = Math.max(0, app.tenureMonths - emisPaid);
      const nextEmiDate = new Date(disbursedDate);
      nextEmiDate.setMonth(nextEmiDate.getMonth() + emisPaid + 1);

      return (
        <View key={app.id} style={styles.loanCard}>
          <View style={styles.loanHeader}>
            <View style={styles.loanSource}>
              <MaterialCommunityIcons
                name="bank-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.loanSourceText}>
                {creditApi.getOfferSourceLabel(app.offerSource)}
              </Text>
            </View>
            <View style={styles.loanStatusBadge}>
              <Text style={styles.loanStatusText}>
                {t("credit.active", "Active")}
              </Text>
            </View>
          </View>

          <View style={styles.loanAmountRow}>
            <View>
              <Text style={styles.loanAmountLabel}>
                {t("credit.loanAmount", "Loan Amount")}
              </Text>
              <Text style={styles.loanAmount}>
                {formatMoney(app.disbursedAmountMinor || app.requestedAmountMinor)}
              </Text>
            </View>
            <View style={styles.loanAmountRight}>
              <Text style={styles.loanAmountLabel}>
                {t("credit.monthlyEmi", "Monthly EMI")}
              </Text>
              <Text style={styles.loanEmi}>{creditApi.formatEmiAmount(emiAmount)}</Text>
            </View>
          </View>

          <View style={styles.loanDetails}>
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>
                {t("credit.nextEmi", "Next EMI")}
              </Text>
              <Text style={styles.loanDetailValue}>
                {formatDate(nextEmiDate, "short")}
              </Text>
            </View>
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>
                {t("credit.remaining", "Remaining")}
              </Text>
              <Text style={styles.loanDetailValue}>
                {emisRemaining} {t("credit.emis", "EMIs")}
              </Text>
            </View>
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>
                {t("credit.interestRate", "Rate")}
              </Text>
              <Text style={styles.loanDetailValue}>
                {app.interestRateAnnual}{t("credit.perAnnum", "% p.a.")}
              </Text>
            </View>
          </View>

          {/* STG-445: Reuse hoisted emisPaid/emisRemaining */}
          {(() => {
            const pct = app.tenureMonths > 0 ? Math.round((emisPaid / app.tenureMonths) * 100) : 0;
            return (
              <View style={styles.loanProgress}>
                <View style={styles.loanProgressBar}>
                  <View style={[styles.loanProgressFill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.loanProgressText}>
                  {emisPaid}/{app.tenureMonths} {t("credit.emisPaid", "EMIs paid")}
                </Text>
              </View>
            );
          })()}
        </View>
      );
    },
    [t]
  );

  // STG-459: Application status timeline steps
  const getTimelineSteps = useCallback((app: CreditApplication) => {
    const steps = [
      { key: "submitted", label: t("credit.timelineSubmitted", "Submitted"), done: true },
      { key: "kyc", label: t("credit.timelineKyc", "KYC Verification"), done: app.kycStatus === "verified" || app.kycStatus === "submitted" },
      { key: "processing", label: t("credit.timelineProcessing", "Processing"), done: app.status === "processing" || app.status === "approved" || app.status === "disbursed" },
      { key: "approved", label: t("credit.timelineApproved", "Approved"), done: app.status === "approved" || app.status === "disbursed" },
      { key: "disbursed", label: t("credit.timelineDisbursed", "Disbursed"), done: app.status === "disbursed" },
    ];
    if (app.status === "rejected") {
      return [
        ...steps.slice(0, 2),
        { key: "rejected", label: t("credit.timelineRejected", "Rejected"), done: true, isError: true },
      ];
    }
    return steps;
  }, [t]);

  // Render application history item — STG-459: With status timeline
  const renderHistoryItem = useCallback(
    (app: CreditApplication) => {
      const statusColor = creditApi.getApplicationStatusColor(app.status);
      const statusLabel = creditApi.getApplicationStatusLabel(app.status, app.kycStatus);
      const timeline = getTimelineSteps(app);

      return (
        <View key={app.id} style={styles.historyItem}>
          <View style={styles.historyHeader}>
            <Text style={styles.historySource}>
              {creditApi.getOfferSourceLabel(app.offerSource)}
            </Text>
            <View style={[styles.historyStatusBadge, { backgroundColor: statusColor + "20" }]}>
              <Text style={[styles.historyStatusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
          <View style={styles.historyDetails}>
            <Text style={styles.historyAmount}>
              {formatMoney(app.requestedAmountMinor)}
            </Text>
            <Text style={styles.historyDate}>
              {formatDate(new Date(app.createdAt))}
            </Text>
          </View>
          {/* STG-459: Application status timeline */}
          <View style={styles.timeline}>
            {timeline.map((step, idx) => {
              const isLast = idx === timeline.length - 1;
              const stepColor = (step as { isError?: boolean }).isError
                ? colors.error
                : step.done
                  ? colors.success
                  : colors.textTertiary;
              return (
                <View key={step.key} style={styles.timelineStep}>
                  <View style={styles.timelineIndicator}>
                    <View style={[styles.timelineDot, { backgroundColor: stepColor }]} />
                    {!isLast && (
                      <View style={[styles.timelineLine, { backgroundColor: step.done ? colors.success : colors.border }]} />
                    )}
                  </View>
                  <Text style={[styles.timelineLabel, { color: stepColor }]}>{step.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      );
    },
    [getTimelineSteps, colors]
  );

  // STG-448: Show disabled state when credit feature is off
  if (!creditEnabled && !loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable accessibilityRole="button" style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{t("credit.title", "Credit")}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="credit-card-off-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.loadingText, { marginTop: 12 }]}>
            {t("credit.featureDisabled", "Credit feature is not available for your store at this time.")}
          </Text>
        </View>
      </View>
    );
  }

  // STG-530: Show consent request UI when DPDP consent is required
  if (consentRequired && !loading) {
    const handleConsentAccept = async () => {
      setConsentLoading(true);
      try {
        await creditApi.recordCreditConsent();
        setConsentRequired(false);
        loadData();
      } catch (err) {
        const error = asError(err);
        Alert.alert(t("common.error"), error.message);
      } finally {
        setConsentLoading(false);
      }
    };

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable accessibilityRole="button" style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{t("credit.title", "Credit")}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="shield-check-outline" size={48} color={colors.primary} />
          <Text style={[styles.loadingText, { marginTop: 16, fontWeight: "600", fontSize: 16 }]}>
            {t("credit.consentTitle", "Consent Required")}
          </Text>
          <Text style={[styles.loadingText, { marginTop: 8, paddingHorizontal: 24, textAlign: "center" }]}>
            {t("credit.consentMessage", "Credit scoring requires your consent to analyze your business data. Your data is processed securely per DPDP guidelines.")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("credit.acceptConsent", "Accept & Continue")}
            style={[styles.applyButton, { marginTop: 24, opacity: consentLoading ? 0.6 : 1 }]}
            onPress={handleConsentAccept}
            disabled={consentLoading}
          >
            {consentLoading ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Text style={styles.applyButtonText}>{t("credit.acceptConsent", "Accept & Continue")}</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("credit.declineConsent", "Decline")}
            style={{ marginTop: 12, padding: 8 }}
            onPress={onBack}
          >
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t("credit.declineConsent", "Decline")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // UIUX-POS-021: Show header with back button during loading (don't trap user)
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable accessibilityRole="button" style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{t("credit.title", "Credit")}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {t("credit.loading", "Loading Credit Info...")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable accessibilityRole="button" style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={colors.textPrimary}
            />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{t("credit.title", "Credit")}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* STG-284: Jargon help bar */}
      <Pressable
        style={styles.jargonHelpBar}
        onPress={() => Alert.alert(
          t("credit.jargonHelpTitle", "What do these terms mean?"),
          t("credit.jargonHelpBody", "KYC = Know Your Customer — identity verification required for loans.\n\nPAN = Permanent Account Number — your tax ID (e.g., ABCDE1234F).\n\nAadhaar = Government-issued 12-digit identity number.\n\nEMI = Equated Monthly Installment — fixed monthly payment for your loan.")
        )}
        accessibilityRole="button"
        accessibilityLabel={t("credit.jargonHelpAccessibility", "Tap to learn what KYC, PAN, Aadhaar, and EMI mean")}
      >
        <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
        <Text style={styles.jargonHelpText}>
          {t("credit.jargonHelpLabel", "What is KYC, PAN, EMI?")}
        </Text>
      </Pressable>

      {/* GO-LIVE-245: Credit Utilization Warning */}
      {showCreditWarning && (
        <View style={styles.creditWarning}>
          <MaterialCommunityIcons name="alert" size={18} color={colors.error} />
          <Text style={styles.creditWarningText}>
            {t("credit.utilizationWarning", "High credit utilization ({{percent}}%). Consider repaying to improve your score.", { percent: Math.round(creditUtilization) })}
          </Text>
        </View>
      )}

      {/* Credit Score Card */}
      {creditScore && (
        <View style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <View style={styles.scoreInfo}>
              <Text style={styles.scoreLabel}>
                {t("credit.creditScore", "Credit Score")}
              </Text>
              <View style={styles.scoreBadgeRow}>
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: creditApi.getCreditScoreColor(creditScore) + "20" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="star"
                    size={14}
                    color={creditApi.getCreditScoreColor(creditScore)}
                  />
                  <Text
                    style={[
                      styles.scoreText,
                      { color: creditApi.getCreditScoreColor(creditScore) },
                    ]}
                  >
                    {creditApi.getCreditScoreLabel(creditScore)}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.eligibleInfo}>
              <Text style={styles.eligibleLabel}>
                {t("credit.eligible", "Eligible Amount")}
              </Text>
              <Text style={styles.eligibleAmount}>
                {creditApi.formatCreditAmount(eligibleAmount)}
              </Text>
            </View>
          </View>
          {scoringFactors && (
            <View style={styles.factorsRow}>
              <View style={styles.factorItem}>
                <Text style={styles.factorValue}>
                  {formatMoney(scoringFactors.monthlyGmv)}
                </Text>
                <Text style={styles.factorLabel}>
                  {t("credit.monthlyGmv", "Monthly Sales")}
                </Text>
              </View>
              <View style={styles.factorItem}>
                <Text style={styles.factorValue}>{scoringFactors.transactionCount}</Text>
                <Text style={styles.factorLabel}>
                  {t("credit.transactions", "Transactions")}
                </Text>
              </View>
              <View style={styles.factorItem}>
                <Text style={styles.factorValue}>{scoringFactors.bnplRepaymentRate}%</Text>
                <Text style={styles.factorLabel}>
                  {t("credit.repaymentRate", "Repayment Rate")}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="button"
          style={[styles.tab, activeTab === "offers" && styles.tabActive]}
          onPress={() => setActiveTab("offers")}
        >
          <Text style={[styles.tabText, activeTab === "offers" && styles.tabTextActive]}>
            {t("credit.offers", "Offers")} ({offers.length})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.tab, activeTab === "loans" && styles.tabActive]}
          onPress={() => setActiveTab("loans")}
        >
          <Text style={[styles.tabText, activeTab === "loans" && styles.tabTextActive]}>
            {t("credit.loans", "Active Loans")} ({activeLoans.length})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.tab, activeTab === "history" && styles.tabActive]}
          onPress={() => setActiveTab("history")}
        >
          <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
            {t("credit.history", "History")}
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === "offers" && (
          <>
            {offers.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons
                  name="credit-card-off-outline"
                  size={48}
                  color={colors.textTertiary}
                />
                <Text style={styles.emptyTitle}>
                  {t("credit.noOffers", "No Offers Available")}
                </Text>
                <Text style={styles.emptyText}>
                  {t(
                    "credit.noOffersDescription",
                    "Keep transacting to unlock credit offers"
                  )}
                </Text>
              </View>
            ) : (
              offers.map(renderOfferCard)
            )}
          </>
        )}

        {activeTab === "loans" && (
          <>
            {activeLoans.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons
                  name="hand-coin-outline"
                  size={48}
                  color={colors.textTertiary}
                />
                <Text style={styles.emptyTitle}>
                  {t("credit.noLoans", "No Active Loans")}
                </Text>
                <Text style={styles.emptyText}>
                  {t("credit.noLoansDescription", "Apply for a credit offer to get started")}
                </Text>
              </View>
            ) : (
              activeLoans.map(renderLoanCard)
            )}
          </>
        )}

        {activeTab === "history" && (
          <>
            {applications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons
                  name="history"
                  size={48}
                  color={colors.textTertiary}
                />
                <Text style={styles.emptyTitle}>
                  {t("credit.noHistory", "No History")}
                </Text>
                <Text style={styles.emptyText}>
                  {t("credit.noHistoryDescription", "Your credit applications will appear here")}
                </Text>
              </View>
            ) : (
              applications.map(renderHistoryItem)
            )}
          </>
        )}
      </ScrollView>

      {/* Apply Modal */}
      <Modal
        visible={applyModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseApplyModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Pressable accessibilityRole="button" style={styles.closeButton} onPress={handleCloseApplyModal}>
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
            <Text style={styles.modalTitle}>
              {applyModal.step === "success"
                ? t("credit.approved", "Approved!")
                : t("credit.applyForCredit", "Apply for Credit")}
            </Text>
            <View style={styles.headerRight} />
          </View>

          <ScrollView style={styles.modalContent}>
            {applyModal.step === "amount" && applyModal.offer && (
              <>
                <View style={styles.modalOfferCard}>
                  <Text style={styles.modalOfferSource}>
                    {creditApi.getOfferSourceLabel(applyModal.offer.source)}
                  </Text>
                  <Text style={styles.modalOfferLimit}>
                    {t("credit.maxAmount", "Maximum")}: {creditApi.formatCreditAmount(applyModal.offer.amountMinor)}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>
                  {t("credit.enterAmount", "Enter Amount (in Rupees)")}
                </Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="50000"
                  placeholderTextColor={colors.textTertiary}
                  value={applyModal.requestedAmount}
                  onChangeText={(text) =>
                    setApplyModal((prev) => ({
                      ...prev,
                      requestedAmount: text.replace(/[^0-9]/g, ""),
                      error: null,
                    }))
                  }
                  keyboardType="number-pad"
                />

                {applyModal.error && (
                  <Text style={styles.errorText}>{applyModal.error}</Text>
                )}

                <Pressable
                  accessibilityRole="button"
                  style={[styles.submitButton, applyModal.loading && styles.submitButtonDisabled]}
                  onPress={handleSubmitApplication}
                  disabled={applyModal.loading}
                >
                  {applyModal.loading ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {t("credit.continue", "Continue")}
                    </Text>
                  )}
                </Pressable>
              </>
            )}

            {applyModal.step === "kyc" && (
              <>
                <View style={styles.kycHeader}>
                  <MaterialCommunityIcons
                    name="shield-check-outline"
                    size={40}
                    color={colors.primary}
                  />
                  <Text style={styles.kycTitle}>
                    {t("credit.kycVerification", "KYC Verification")}
                  </Text>
                  <Text style={styles.kycDescription}>
                    {t(
                      "credit.kycDescription",
                      "Please enter your KYC details to complete the application"
                    )}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>{t("credit.panNumber", "PAN Number")}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="ABCDE1234F"
                  placeholderTextColor={colors.textTertiary}
                  value={applyModal.panNumber}
                  onChangeText={(text) =>
                    setApplyModal((prev) => ({
                      ...prev,
                      panNumber: text.toUpperCase().slice(0, 10),
                      error: null,
                    }))
                  }
                  autoCapitalize="characters"
                  maxLength={10}
                />

                <Text style={styles.inputLabel}>
                  {t("credit.aadhaarLast4", "Aadhaar Last 4 Digits")}
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="1234"
                  placeholderTextColor={colors.textTertiary}
                  value={applyModal.aadhaarLast4}
                  onChangeText={(text) =>
                    setApplyModal((prev) => ({
                      ...prev,
                      aadhaarLast4: text.replace(/[^0-9]/g, "").slice(0, 4),
                      error: null,
                    }))
                  }
                  keyboardType="number-pad"
                  maxLength={4}
                />

                {applyModal.error && (
                  <Text style={styles.errorText}>{applyModal.error}</Text>
                )}

                <Pressable
                  accessibilityRole="button"
                  style={[styles.submitButton, applyModal.loading && styles.submitButtonDisabled]}
                  onPress={handleSubmitKyc}
                  disabled={applyModal.loading}
                >
                  {applyModal.loading ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {t("credit.verifyKyc", "Verify & Submit")}
                    </Text>
                  )}
                </Pressable>
              </>
            )}

            {applyModal.step === "success" && (
              <View style={styles.successContainer}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={80}
                  color={colors.success}
                />
                <Text style={styles.successTitle}>
                  {t("credit.applicationApproved", "Application Approved!")}
                </Text>
                <Text style={styles.successDescription}>
                  {t(
                    "credit.disbursementInfo",
                    "Your credit will be disbursed within 24 hours. You will receive a confirmation SMS."
                  )}
                </Text>
                <Pressable accessibilityRole="button" style={styles.doneButton} onPress={handleCloseApplyModal}>
                  <Text style={styles.doneButtonText}>{t("credit.done", "Done")}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  // GO-LIVE-245: Credit utilization warning styles
  creditWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: colors.errorSoft,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  creditWarningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: colors.error,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  headerRight: {
    width: 40,
  },
  // STG-284: Jargon help bar styles
  jargonHelpBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  jargonHelpText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },
  scoreCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  scoreInfo: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  scoreBadgeRow: {
    flexDirection: "row",
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    gap: 4,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: "600",
  },
  eligibleInfo: {
    alignItems: "flex-end",
  },
  eligibleLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  eligibleAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  factorsRow: {
    flexDirection: "row",
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  factorItem: {
    flex: 1,
    alignItems: "center",
  },
  factorValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  factorLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
    textAlign: "center",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  offerCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  offerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  offerSource: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  offerSourceText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  interestFreeBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  interestFreeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
  },
  offerAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  offerDetails: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  offerDetailItem: {
    flex: 1,
    alignItems: "center",
  },
  offerDetailDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
  },
  offerDetailLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  offerDetailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  offerValidity: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  applyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  applyButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textInverse,
  },
  loanCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  loanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  loanSource: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  loanSourceText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  loanStatusBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  loanStatusText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
  },
  loanAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  loanAmountLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  loanAmount: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  loanAmountRight: {
    alignItems: "flex-end",
  },
  loanEmi: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.primary,
  },
  loanDetails: {
    flexDirection: "row",
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: theme.spacing.md,
  },
  loanDetailItem: {
    flex: 1,
    alignItems: "center",
  },
  loanDetailLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  loanDetailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  loanProgress: {
    gap: theme.spacing.xs,
  },
  loanProgressBar: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 3,
    overflow: "hidden",
  },
  loanProgressFill: {
    height: "100%",
    backgroundColor: colors.success,
    borderRadius: 3,
  },
  loanProgressText: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: "center",
  },
  historyItem: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  historySource: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  historyStatusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  historyDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  historyDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  // STG-459: Application status timeline styles
  timeline: {
    flexDirection: "row",
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timelineStep: {
    flex: 1,
    alignItems: "center",
  },
  timelineIndicator: {
    alignItems: "center",
    marginBottom: 4,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineLine: {
    position: "absolute",
    top: 4,
    left: 10,
    right: -10,
    height: 2,
    width: 30,
  },
  timelineLabel: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: "center",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  modalContent: {
    padding: theme.spacing.md,
  },
  modalOfferCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    alignItems: "center",
  },
  modalOfferSource: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "500",
  },
  modalOfferLimit: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
    marginTop: theme.spacing.xs,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  amountInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 20,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    marginBottom: theme.spacing.md,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textInverse,
  },
  kycHeader: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  kycTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: theme.spacing.md,
  },
  kycDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.xs,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.success,
    marginTop: theme.spacing.md,
  },
  successDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  doneButton: {
    backgroundColor: colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl * 2,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xl,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textInverse,
  },
}); }

export default CreditScreen;
