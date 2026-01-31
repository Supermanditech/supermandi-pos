// SM-022: CreditScreen
// Screen showing credit offers, active loans, and repayment history

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import * as creditApi from "../services/api/creditApi";
import type {
  CreditOffer,
  CreditApplication,
  CreditScore,
  ScoringFactors,
} from "../services/api/creditApi";

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

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

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [offersRes, applicationsRes] = await Promise.all([
        creditApi.getCreditOffers(),
        creditApi.getCreditApplications(),
      ]);

      setOffers(offersRes.offers);
      setCreditScore(offersRes.creditScore);
      setEligibleAmount(offersRes.eligibleAmount);
      setScoringFactors(offersRes.scoringFactors);
      setActiveApplication(offersRes.activeApplication);
      setApplications(applicationsRes.applications);
    } catch (error) {
      console.error("[CreditScreen] Failed to load data:", error);
      Alert.alert(
        t("credit.errorTitle", "Error"),
        t("credit.loadError", "Failed to load credit information. Please try again.")
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
  useEffect(() => {
    // Only auto-refresh if there's an active application with pending status
    if (!activeApplication || activeApplication.status === "approved" || activeApplication.status === "rejected") {
      return;
    }

    // Poll every 30 seconds
    const pollInterval = setInterval(() => {
      console.log("[CreditScreen] GO-LIVE-238: Auto-refreshing for pending application");
      void loadData();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [activeApplication?.status, loadData]);

  // GO-LIVE-245: Calculate credit utilization warning
  // Note: currentUtilization would need to be added to the API response
  // For now, default to 0 (no warning) until backend provides this data
  const creditUtilization = 0; // TODO: Add utilization tracking to backend
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
          error: response.error || t("credit.applyError", "Failed to submit application"),
          loading: false,
        }));
      }
    } catch (error: any) {
      setApplyModal((prev) => ({
        ...prev,
        error: error.message || t("credit.applyError", "Failed to submit application"),
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

      if (response.success && response.applicationStatus === "approved") {
        setApplyModal((prev) => ({
          ...prev,
          step: "success",
          loading: false,
        }));
      } else {
        setApplyModal((prev) => ({
          ...prev,
          error: response.message || t("credit.kycError", "KYC verification failed"),
          loading: false,
        }));
      }
    } catch (error: any) {
      setApplyModal((prev) => ({
        ...prev,
        error: error.message || t("credit.kycError", "KYC verification failed"),
        loading: false,
      }));
    }
  }, [applyModal.applicationId, applyModal.panNumber, applyModal.aadhaarLast4, t]);

  // Close apply modal
  const handleCloseApplyModal = useCallback(() => {
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
    if (applyModal.step === "success") {
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
                color={isInterestFree ? theme.colors.success : theme.colors.primary}
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
                {creditApi.formatEmiAmount(offer.emiMinor)}/mo
              </Text>
            </View>
          </View>

          {offer.validUntil && (
            <Text style={styles.offerValidity}>
              {t("credit.validUntil", "Valid until")} {offer.validUntil}
            </Text>
          )}

          <Pressable
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
              color={theme.colors.textInverse}
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

      // Calculate next EMI date (simple: 1 month from disbursement or today)
      const disbursedDate = app.disbursedAt ? new Date(app.disbursedAt) : new Date();
      const nextEmiDate = new Date(disbursedDate);
      nextEmiDate.setMonth(nextEmiDate.getMonth() + 1);

      return (
        <View key={app.id} style={styles.loanCard}>
          <View style={styles.loanHeader}>
            <View style={styles.loanSource}>
              <MaterialCommunityIcons
                name="bank-outline"
                size={18}
                color={theme.colors.primary}
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
                {nextEmiDate.toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </View>
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>
                {t("credit.remaining", "Remaining")}
              </Text>
              <Text style={styles.loanDetailValue}>
                {app.tenureMonths} {t("credit.emis", "EMIs")}
              </Text>
            </View>
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>
                {t("credit.interestRate", "Rate")}
              </Text>
              <Text style={styles.loanDetailValue}>
                {app.interestRateAnnual}% p.a.
              </Text>
            </View>
          </View>

          <View style={styles.loanProgress}>
            <View style={styles.loanProgressBar}>
              <View style={[styles.loanProgressFill, { width: "10%" }]} />
            </View>
            <Text style={styles.loanProgressText}>
              1/{app.tenureMonths} {t("credit.emisPaid", "EMIs paid")}
            </Text>
          </View>
        </View>
      );
    },
    [t]
  );

  // Render application history item
  const renderHistoryItem = useCallback(
    (app: CreditApplication) => {
      const statusColor = creditApi.getApplicationStatusColor(app.status);
      const statusLabel = creditApi.getApplicationStatusLabel(app.status, app.kycStatus);

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
              {new Date(app.createdAt).toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>
      );
    },
    []
  );

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>
          {t("credit.loading", "Loading Credit Info...")}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{t("credit.title", "Credit")}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* GO-LIVE-245: Credit Utilization Warning */}
      {showCreditWarning && (
        <View style={styles.creditWarning}>
          <MaterialCommunityIcons name="alert" size={18} color={theme.colors.error} />
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
          style={[styles.tab, activeTab === "offers" && styles.tabActive]}
          onPress={() => setActiveTab("offers")}
        >
          <Text style={[styles.tabText, activeTab === "offers" && styles.tabTextActive]}>
            {t("credit.offers", "Offers")} ({offers.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "loans" && styles.tabActive]}
          onPress={() => setActiveTab("loans")}
        >
          <Text style={[styles.tabText, activeTab === "loans" && styles.tabTextActive]}>
            {t("credit.loans", "Active Loans")} ({activeLoans.length})
          </Text>
        </Pressable>
        <Pressable
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
                  color={theme.colors.textTertiary}
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
                  color={theme.colors.textTertiary}
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
                  color={theme.colors.textTertiary}
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
            <Pressable style={styles.closeButton} onPress={handleCloseApplyModal}>
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={theme.colors.textPrimary}
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
                  placeholderTextColor={theme.colors.textTertiary}
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
                  style={[styles.submitButton, applyModal.loading && styles.submitButtonDisabled]}
                  onPress={handleSubmitApplication}
                  disabled={applyModal.loading}
                >
                  {applyModal.loading ? (
                    <ActivityIndicator size="small" color={theme.colors.textInverse} />
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
                    color={theme.colors.primary}
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
                  placeholderTextColor={theme.colors.textTertiary}
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
                  placeholderTextColor={theme.colors.textTertiary}
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
                  style={[styles.submitButton, applyModal.loading && styles.submitButtonDisabled]}
                  onPress={handleSubmitKyc}
                  disabled={applyModal.loading}
                >
                  {applyModal.loading ? (
                    <ActivityIndicator size="small" color={theme.colors.textInverse} />
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
                  color={theme.colors.success}
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
                <Pressable style={styles.doneButton} onPress={handleCloseApplyModal}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  creditWarningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.error,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.textSecondary,
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
  backButton: {
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
  scoreCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textTertiary,
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
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  eligibleAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  factorsRow: {
    flexDirection: "row",
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  factorItem: {
    flex: 1,
    alignItems: "center",
  },
  factorValue: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  factorLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginTop: 2,
    textAlign: "center",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
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
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textSecondary,
  },
  interestFreeBadge: {
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  interestFreeText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.success,
  },
  offerAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.border,
  },
  offerDetailLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  offerDetailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  offerValidity: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  applyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  applyButtonDisabled: {
    backgroundColor: theme.colors.textTertiary,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  loanCard: {
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textPrimary,
  },
  loanStatusBadge: {
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  loanStatusText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.success,
  },
  loanAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  loanAmountLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  loanAmount: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  loanAmountRight: {
    alignItems: "flex-end",
  },
  loanEmi: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  loanDetails: {
    flexDirection: "row",
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  loanDetailItem: {
    flex: 1,
    alignItems: "center",
  },
  loanDetailLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  loanDetailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  loanProgress: {
    gap: theme.spacing.xs,
  },
  loanProgressBar: {
    height: 6,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 3,
    overflow: "hidden",
  },
  loanProgressFill: {
    height: "100%",
    backgroundColor: theme.colors.success,
    borderRadius: 3,
  },
  loanProgressText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: "center",
  },
  historyItem: {
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textPrimary,
  },
  historyStatusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  historyStatusText: {
    fontSize: 11,
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
    color: theme.colors.textPrimary,
  },
  historyDate: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: "center",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
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
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  modalContent: {
    padding: theme.spacing.md,
  },
  modalOfferCard: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    alignItems: "center",
  },
  modalOfferSource: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  modalOfferLimit: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.primary,
    marginTop: theme.spacing.xs,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  amountInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.textTertiary,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  kycHeader: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  kycTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
  },
  kycDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
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
    color: theme.colors.success,
    marginTop: theme.spacing.md,
  },
  successDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  doneButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl * 2,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xl,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});

export default CreditScreen;
