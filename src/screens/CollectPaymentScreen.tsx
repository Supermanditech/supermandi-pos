import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import {
  confirmCollectionUpiManual,
  initCollectionUpi,
  recordCollectionCash,
  recordCollectionDue
} from "../services/api/posApi";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { formatMoney } from "../utils/money";
import { ApiError } from "../services/api/apiClient";
import { subscribeNetworkStatus } from "../services/networkStatus";
import { clearDeviceSession } from "../services/deviceSession";
import { POS_MESSAGES } from "../utils/uiStatus";
import { buildUpiIntent } from "../utils/upiIntent";
import { theme } from "../theme";

type RootStackParamList = {
  SellScan: undefined;
  CollectPayment: undefined;
  EnrollDevice: undefined;
  DeviceBlocked: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "CollectPayment">;
type PaymentMode = "UPI" | "CASH" | "DUE";

export default function CollectPaymentScreen() {
  const navigation = useNavigation<Nav>();
  const [amountInput, setAmountInput] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [selectedMode, setSelectedMode] = useState<PaymentMode>("UPI");
  const [upiIntent, setUpiIntent] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [upiVpa, setUpiVpa] = useState<string | null>(null);
  const [upiStoreName, setUpiStoreName] = useState<string | null>(null);
  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [upiStatusLoading, setUpiStatusLoading] = useState(true);

  const amountMinor = useMemo(() => {
    const parsed = Number(amountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [amountInput]);

  const handleDeviceAuthError = useCallback(async (error: ApiError): Promise<boolean> => {
    if (error.message === "device_inactive") {
      navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
      return true;
    }
    if (error.message === "device_unauthorized") {
      await clearDeviceSession();
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    if (error.message === "device_not_enrolled") {
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    return false;
  }, [navigation]);

  const upiDisabled =
    !isOnline || upiStatusLoading || storeActive === false || !upiVpa;
  const upiBlocked = storeActive === false || (!upiVpa && !upiStatusLoading);

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((online) => {
      setIsOnline(online);
      if (!online && selectedMode === "UPI") {
        setSelectedMode("CASH");
        setUpiIntent(null);
        setCollectionId(null);
      }
    });
    return () => unsubscribe();
  }, [selectedMode]);

  useEffect(() => {
    let cancelled = false;
    if (!isOnline) {
      setUpiStatusLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setUpiStatusLoading(true);

    fetchUiStatus()
      .then((status) => {
        if (cancelled) return;
        setStoreActive(status.storeActive ?? null);
        setUpiVpa(status.upiVpa ?? null);
        setUpiStoreName(status.storeName ?? null);
        setUpiStatusLoading(false);
        if (status.storeActive === false || !status.upiVpa) {
          setSelectedMode("CASH");
          setUpiIntent(null);
          setCollectionId(null);
        }
      })
      .catch(async (error) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          if (await handleDeviceAuthError(error)) {
            return;
          }
          if (error.message === "store_inactive") {
            setStoreActive(false);
            setUpiStatusLoading(false);
            setSelectedMode("CASH");
            return;
          }
        }
        setUpiStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleDeviceAuthError, isOnline]);

  useEffect(() => {
    if (selectedMode !== "UPI") return;
    if (storeActive === false || !upiVpa) {
      setSelectedMode("CASH");
      setUpiIntent(null);
      setCollectionId(null);
    }
  }, [selectedMode, storeActive, upiVpa]);

  const handleGenerateUpi = async () => {
    if (!isOnline) {
      Alert.alert("UPI Offline", "UPI is unavailable while offline. Use Cash or Due.");
      return;
    }
    if (upiStatusLoading) {
      Alert.alert("UPI Loading", "Checking UPI details. Please wait.");
      return;
    }
    if (upiBlocked) {
      Alert.alert("UPI Unavailable", "UPI VPA is not set for this store.");
      return;
    }
    if (amountMinor <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid amount.");
      return;
    }

    setLoading(true);
    try {
      const nextTransactionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const res = await initCollectionUpi({
        amountMinor,
        reference: referenceInput.trim() || null,
        transactionId: nextTransactionId
      });
      const intent = buildUpiIntent({
        upiVpa: res.upiVpa ?? upiVpa,
        storeName: res.storeName ?? upiStoreName,
        amountMinor: res.amountMinor,
        transactionId: nextTransactionId,
        note: "Supermandi POS Sale"
      });
      if (!intent) {
        throw new ApiError(0, "upi_vpa_missing");
      }
      setUpiIntent(intent);
      setCollectionId(res.collectionId);
      setUpiVpa(res.upiVpa ?? null);
      setUpiStoreName(res.storeName ?? null);
    } catch (error) {
      if (error instanceof ApiError) {
        if (await handleDeviceAuthError(error)) {
          return;
        }
        if (error.message === "store_inactive") {
          Alert.alert("POS Inactive", POS_MESSAGES.storeInactive);
          setSelectedMode("CASH");
          setUpiIntent(null);
          setCollectionId(null);
          return;
        }
        if (error.message === "upi_vpa_missing") {
          Alert.alert("UPI Missing", "UPI VPA is not set for this store.");
          setSelectedMode("CASH");
          setUpiIntent(null);
          setCollectionId(null);
          return;
        }
        if (error.message === "upi_offline_blocked") {
          Alert.alert("UPI Offline", "UPI is unavailable while offline. Use Cash or Due.");
          return;
        }
      }
      Alert.alert("UPI Error", "Unable to generate UPI QR.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUpi = async () => {
    if (!collectionId) return;
    setLoading(true);
    try {
      await confirmCollectionUpiManual({ collectionId });
      Alert.alert("Payment Recorded", "Collection marked as paid.");
      navigation.navigate("SellScan");
    } catch (error) {
      if (error instanceof ApiError) {
        if (await handleDeviceAuthError(error)) {
          return;
        }
        if (error.message === "store_inactive") {
          Alert.alert("POS Inactive", POS_MESSAGES.storeInactive);
          return;
        }
      }
      Alert.alert("UPI Error", "Unable to confirm payment.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecordDirect = async (mode: PaymentMode) => {
    if (amountMinor <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid amount.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "CASH") {
        await recordCollectionCash({
          amountMinor,
          reference: referenceInput.trim() || null
        });
      } else if (mode === "DUE") {
        await recordCollectionDue({
          amountMinor,
          reference: referenceInput.trim() || null
        });
      }
      Alert.alert("Collection Recorded", "Payment saved.");
      navigation.navigate("SellScan");
    } catch (error) {
      if (error instanceof ApiError) {
        if (await handleDeviceAuthError(error)) {
          return;
        }
        if (error.message === "store_inactive") {
          Alert.alert("POS Inactive", POS_MESSAGES.storeInactive);
          return;
        }
      }
      Alert.alert("Payment Error", "Unable to record collection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Collect Payment</Text>

      <ScrollView contentContainerStyle={styles.content}>
        {!isOnline && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{POS_MESSAGES.offline}</Text>
          </View>
        )}

        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          placeholder="Amount"
          keyboardType="decimal-pad"
          value={amountInput}
          onChangeText={(value) => {
            setAmountInput(value);
            setUpiIntent(null);
            setCollectionId(null);
          }}
        />

        <Text style={styles.label}>Reference (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Bill reference or note"
          value={referenceInput}
          onChangeText={setReferenceInput}
        />

        <View style={styles.modeRow}>
          {(["UPI", "CASH", "DUE"] as PaymentMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.modeButton,
                selectedMode === mode && styles.modeButtonActive,
                mode === "UPI" && upiDisabled && styles.modeButtonDisabled
              ]}
              onPress={() => setSelectedMode(mode)}
              disabled={mode === "UPI" && upiDisabled}
            >
              <Text
                style={[
                  styles.modeText,
                  selectedMode === mode && styles.modeTextActive,
                  mode === "UPI" && upiDisabled && styles.modeTextDisabled
                ]}
              >
                {mode}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedMode === "UPI" && (
          <View style={styles.upiSection}>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerateUpi}
              disabled={loading}
            >
              <MaterialCommunityIcons name="qrcode" size={18} color={theme.colors.textInverse} />
              <Text style={styles.generateText}>Generate UPI QR</Text>
            </TouchableOpacity>

            {upiStoreName && (
              <Text style={styles.upiStoreName}>{upiStoreName}</Text>
            )}

            {upiIntent ? (
              <View style={styles.qrBox}>
                <QRCode value={upiIntent} size={180} />
                <Text style={styles.amountText}>{formatMoney(amountMinor, "INR")}</Text>
              </View>
            ) : upiStatusLoading ? (
              <Text style={styles.helperText}>Checking UPI details...</Text>
            ) : upiBlocked ? (
              <Text style={styles.helperText}>
                UPI is unavailable until the store is active and UPI VPA is set.
              </Text>
            ) : (
              <Text style={styles.helperText}>
                {isOnline ? "Generate QR to collect payment." : "Offline: UPI is disabled."}
              </Text>
            )}

            {collectionId && (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmUpi}
                disabled={loading}
              >
                <Text style={styles.confirmText}>Payment Received</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {selectedMode !== "UPI" && (
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={() => handleRecordDirect(selectedMode)}
            disabled={loading}
          >
            <Text style={styles.confirmText}>
              {selectedMode === "CASH" ? "Record Cash Payment" : "Mark as Due"}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginVertical: 8,
    color: theme.colors.textPrimary
  },
  content: {
    paddingBottom: 24
  },
  banner: {
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  bannerText: {
    color: theme.colors.warning,
    fontSize: 13,
    fontWeight: "700"
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 12,
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary
  },
  modeRow: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 12,
    gap: 10
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    backgroundColor: theme.colors.surface
  },
  modeButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary
  },
  modeButtonDisabled: {
    opacity: 0.5
  },
  modeText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary
  },
  modeTextActive: {
    color: theme.colors.textInverse
  },
  modeTextDisabled: {
    color: theme.colors.textTertiary
  },
  upiSection: {
    marginTop: 8,
    alignItems: "center"
  },
  upiStoreName: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12
  },
  generateText: {
    marginLeft: 8,
    color: theme.colors.textInverse,
    fontWeight: "700"
  },
  qrBox: {
    marginTop: 16,
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  amountText: {
    marginTop: 10,
    fontWeight: "700",
    color: theme.colors.success
  },
  helperText: {
    marginTop: 12,
    color: theme.colors.textSecondary
  },
  confirmButton: {
    marginTop: 16,
    backgroundColor: theme.colors.success,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center"
  },
  confirmText: {
    color: theme.colors.textInverse,
    fontWeight: "700"
  }
});
