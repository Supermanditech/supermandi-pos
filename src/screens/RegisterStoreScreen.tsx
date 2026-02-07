/**
 * RO-004: POS Registration Screen
 *
 * Allows new retailers to register their store directly from the POS app.
 * Flow: Phone → OTP → Business Details → Success → Navigate to Enrollment
 *
 * Calls POST /api/v1/retailer/register with source: 'POS_MOBILE'
 * Uses DRX-001 phoneOtp service for Firebase OTP verification.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import { theme } from "../theme";
import { API_BASE_URL } from "../config/api";
import {
  sendOtp,
  verifyOtp,
  isOtpReady,
  resetOtp,
} from "../services/phoneOtp";

type RootStackParamList = {
  RegisterStore: undefined;
  EnrollDevice: { enrollmentCode?: string } | undefined;  // DRX-003
};

type Nav = NativeStackNavigationProp<RootStackParamList, "RegisterStore">;

type Step = "phone" | "otp" | "details" | "success";

// GSTIN validation: 15 characters
const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

interface RegistrationResult {
  storeId: string;
  storeCode: string;
  ownerUserId: string;
  storeName: string;
  isExisting: boolean;
  enrollmentCode?: string;  // DRX-003: Auto-generated for POS
}

export default function RegisterStoreScreen() {
  const navigation = useNavigation<Nav>();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [idToken, setIdToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Business details
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [gstin, setGstin] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Success state
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(
        () => setResendCooldown(resendCooldown - 1),
        1000
      );
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Normalize phone to E.164
  const normalizePhone = useCallback((raw: string): string => {
    const cleaned = raw.replace(/[\s\-()]/g, "");
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("0")) return `+91${cleaned.substring(1)}`;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return cleaned;
  }, []);

  // Step 1: Send OTP
  const handleSendOtp = useCallback(async () => {
    setError("");
    const cleanedPhone = phone.replace(/[\s-]/g, "");
    if (
      !/^(\+91)?[6-9]\d{9}$/.test(cleanedPhone) &&
      !/^\+?[0-9]{10,13}$/.test(cleanedPhone)
    ) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setIsLoading(true);
    try {
      await sendOtp(phone);
      setStep("otp");
      setResendCooldown(60);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to send OTP. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [phone]);

  // Step 2: Verify OTP
  const handleVerifyOtp = useCallback(async () => {
    setError("");
    if (otp.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const token = await verifyOtp(otp);
      setIdToken(token);
      setStep("details");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Invalid OTP. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [otp]);

  // Step 3: Submit registration
  const handleRegister = useCallback(async () => {
    setError("");

    // Client validation
    const errors: Record<string, string> = {};
    if (!businessName.trim()) errors.businessName = "Business name is required";
    if (!ownerName.trim()) errors.ownerName = "Owner name is required";
    if (gstin.trim()) {
      const normalized = gstin.toUpperCase().replace(/\s/g, "");
      if (normalized.length !== 15 || !GSTIN_REGEX.test(normalized)) {
        errors.gstin = "Invalid GSTIN format";
      }
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Invalid email";
    }
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      errors.pincode = "Must be 6 digits";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);

    try {
      const normalizedPhone = normalizePhone(phone);
      const response = await fetch(
        `${API_BASE_URL}/api/v1/retailer/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: normalizedPhone,
            otpProof: idToken,
            businessName: businessName.trim(),
            ownerName: ownerName.trim(),
            gstin: gstin.trim()
              ? gstin.toUpperCase().replace(/\s/g, "")
              : undefined,
            email: email.trim() || undefined,
            address: address.trim() || undefined,
            pincode: pincode.trim() || undefined,
            source: "POS_MOBILE",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "PHONE_EXISTS") {
          setError(
            "This phone number is already registered. Go back and enroll your device instead."
          );
        } else if (data.error === "GSTIN_EXISTS") {
          setError("A store with this GSTIN already exists.");
        } else if (data.error === "VALIDATION_ERROR" && data.fields) {
          const errs: Record<string, string> = {};
          for (const [field, msg] of Object.entries(data.fields)) {
            errs[field] = msg as string;
          }
          setFieldErrors(errs);
        } else if (data.error === "RATE_LIMITED") {
          setError("Too many attempts. Wait a minute and try again.");
        } else {
          setError(data.message || "Registration failed. Try again.");
        }
        return;
      }

      setResult(data as RegistrationResult);
      setStep("success");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Registration failed. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    businessName,
    ownerName,
    gstin,
    email,
    address,
    pincode,
    phone,
    idToken,
    normalizePhone,
  ]);

  const handleResendOtp = useCallback(async () => {
    if (resendCooldown > 0) return;
    setError("");
    setIsLoading(true);
    try {
      resetOtp();
      await sendOtp(phone);
      setResendCooldown(60);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to resend OTP."
      );
    } finally {
      setIsLoading(false);
    }
  }, [phone, resendCooldown]);

  const handleChangePhone = useCallback(() => {
    setStep("phone");
    setOtp("");
    setIdToken("");
    setError("");
    resetOtp();
  }, []);

  const handleCopyStoreCode = useCallback(async () => {
    if (!result) return;
    await Clipboard.setStringAsync(result.storeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleGoToEnroll = useCallback(() => {
    // DRX-003: Pass enrollment code if auto-generated by backend
    navigation.replace("EnrollDevice", result?.enrollmentCode
      ? { enrollmentCode: result.enrollmentCode }
      : undefined);
  }, [navigation, result]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SuperMandi</Text>
          <Text style={styles.headerSubtitle}>POS Registration</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Step 1: Phone */}
          {step === "phone" && (
            <>
              <Text style={styles.title}>Register your store</Text>
              <Text style={styles.subtitle}>
                Enter your phone number to get started
              </Text>

              {!isOtpReady() && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    OTP service not configured. Dev bypass mode active.
                  </Text>
                </View>
              )}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 9876543210"
                placeholderTextColor={theme.colors.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!isLoading}
                autoFocus
              />

              <Pressable
                style={[
                  styles.btnPrimary,
                  isLoading && styles.btnDisabled,
                ]}
                onPress={handleSendOtp}
                disabled={isLoading}
              >
                <Text style={styles.btnPrimaryText}>
                  {isLoading ? "Sending OTP..." : "Send OTP"}
                </Text>
              </Pressable>

              <Pressable
                style={styles.linkBtn}
                onPress={() => navigation.replace("EnrollDevice")}
              >
                <Text style={styles.linkText}>
                  Already registered? Enroll your device
                </Text>
              </Pressable>
            </>
          )}

          {/* Step 2: OTP */}
          {step === "otp" && (
            <>
              <Text style={styles.title}>Verify your phone</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit code sent to {phone}
              </Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="------"
                placeholderTextColor={theme.colors.textTertiary}
                value={otp}
                onChangeText={(t) =>
                  setOtp(t.replace(/\D/g, "").slice(0, 6))
                }
                keyboardType="number-pad"
                maxLength={6}
                editable={!isLoading}
                autoFocus
              />

              <Pressable
                style={[
                  styles.btnPrimary,
                  (isLoading || otp.length !== 6) && styles.btnDisabled,
                ]}
                onPress={handleVerifyOtp}
                disabled={isLoading || otp.length !== 6}
              >
                <Text style={styles.btnPrimaryText}>
                  {isLoading ? "Verifying..." : "Verify"}
                </Text>
              </Pressable>

              <View style={styles.row}>
                <Pressable onPress={handleChangePhone} disabled={isLoading}>
                  <Text style={styles.linkText}>Change Phone</Text>
                </Pressable>
                <Pressable
                  onPress={handleResendOtp}
                  disabled={isLoading || resendCooldown > 0}
                >
                  <Text
                    style={[
                      styles.linkText,
                      resendCooldown > 0 && styles.linkDisabled,
                    ]}
                  >
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend OTP"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Step 3: Business Details */}
          {step === "details" && (
            <>
              <Text style={styles.title}>Store details</Text>
              <Text style={styles.subtitle}>
                Your store will be created immediately
              </Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Business Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sharma General Store"
                placeholderTextColor={theme.colors.textTertiary}
                value={businessName}
                onChangeText={setBusinessName}
                editable={!isLoading}
                autoFocus
              />
              {fieldErrors.businessName ? (
                <Text style={styles.fieldError}>
                  {fieldErrors.businessName}
                </Text>
              ) : null}

              <Text style={styles.label}>Owner Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Rajesh Sharma"
                placeholderTextColor={theme.colors.textTertiary}
                value={ownerName}
                onChangeText={setOwnerName}
                editable={!isLoading}
              />
              {fieldErrors.ownerName ? (
                <Text style={styles.fieldError}>{fieldErrors.ownerName}</Text>
              ) : null}

              <Text style={styles.label}>
                GSTIN{" "}
                <Text style={styles.optionalBadge}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="22AAAAA0000A1Z5"
                placeholderTextColor={theme.colors.textTertiary}
                value={gstin}
                onChangeText={(t) => setGstin(t.toUpperCase())}
                maxLength={15}
                autoCapitalize="characters"
                editable={!isLoading}
              />
              {fieldErrors.gstin ? (
                <Text style={styles.fieldError}>{fieldErrors.gstin}</Text>
              ) : null}

              <Text style={styles.label}>
                Email{" "}
                <Text style={styles.optionalBadge}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="store@example.com"
                placeholderTextColor={theme.colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isLoading}
              />
              {fieldErrors.email ? (
                <Text style={styles.fieldError}>{fieldErrors.email}</Text>
              ) : null}

              <Text style={styles.label}>
                Pincode{" "}
                <Text style={styles.optionalBadge}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="110001"
                placeholderTextColor={theme.colors.textTertiary}
                value={pincode}
                onChangeText={(t) =>
                  setPincode(t.replace(/\D/g, "").slice(0, 6))
                }
                keyboardType="number-pad"
                maxLength={6}
                editable={!isLoading}
              />
              {fieldErrors.pincode ? (
                <Text style={styles.fieldError}>{fieldErrors.pincode}</Text>
              ) : null}

              <Pressable
                style={[
                  styles.btnPrimary,
                  isLoading && styles.btnDisabled,
                  { marginTop: theme.spacing.md },
                ]}
                onPress={handleRegister}
                disabled={isLoading}
              >
                <Text style={styles.btnPrimaryText}>
                  {isLoading ? "Creating store..." : "Create Store"}
                </Text>
              </Pressable>
            </>
          )}

          {/* Step 4: Success */}
          {step === "success" && result && (
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Text style={styles.successIconText}>&#10003;</Text>
              </View>

              <Text style={[styles.title, { textAlign: "center" }]}>
                {result.isExisting
                  ? "Store already registered"
                  : "Store created!"}
              </Text>
              <Text style={[styles.subtitle, { textAlign: "center" }]}>
                {result.isExisting
                  ? `"${result.storeName}" was already registered.`
                  : `"${result.storeName}" is ready to go.`}
              </Text>

              {/* Store Code */}
              <View style={styles.storeCodeBox}>
                <Text style={styles.storeCodeLabel}>Your Store Code</Text>
                <Text style={styles.storeCodeValue}>
                  {result.storeCode}
                </Text>
                <Pressable onPress={handleCopyStoreCode}>
                  <Text style={styles.linkText}>
                    {copied ? "Copied!" : "Copy to clipboard"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.successInfoBox}>
                <Text style={styles.successInfoText}>
                  {result.enrollmentCode
                    ? `Enrollment code ready! Tap below to enroll this device now.`
                    : `Next: Enroll this device to start billing. You'll need an enrollment code from the Retailer Portal.`}
                </Text>
              </View>

              <Pressable
                style={styles.btnPrimary}
                onPress={handleGoToEnroll}
              >
                <Text style={styles.btnPrimaryText}>
                  Enroll This Device
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  headerTitle: {
    ...theme.typography.h3,
    color: theme.colors.primary,
  },
  headerSubtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.md,
  },
  title: {
    ...theme.typography.h4,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  optionalBadge: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    fontWeight: "400",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.xs,
  },
  otpInput: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  btnPrimary: {
    height: 52,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.md,
  },
  btnDisabled: {
    backgroundColor: theme.colors.primaryLight,
    opacity: 0.7,
  },
  btnPrimaryText: {
    ...theme.typography.button,
    color: theme.colors.textInverse,
  },
  linkBtn: {
    alignItems: "center",
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  linkText: {
    ...theme.typography.bodySmall,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  linkDisabled: {
    color: theme.colors.textTertiary,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.md,
  },
  errorBox: {
    backgroundColor: theme.colors.errorSoft,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.error,
  },
  warningBox: {
    backgroundColor: theme.colors.warningSoft,
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  warningText: {
    ...theme.typography.caption,
    color: "#92400e",
  },
  fieldError: {
    ...theme.typography.caption,
    color: theme.colors.error,
    marginBottom: theme.spacing.xs,
  },
  successContainer: {
    alignItems: "center",
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  successIconText: {
    fontSize: 28,
    color: theme.colors.success,
  },
  storeCodeBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: "center",
    width: "100%",
    marginBottom: theme.spacing.md,
  },
  storeCodeLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  storeCodeValue: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  successInfoBox: {
    backgroundColor: theme.colors.successSoft,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    width: "100%",
  },
  successInfoText: {
    ...theme.typography.caption,
    color: "#166534",
  },
});
