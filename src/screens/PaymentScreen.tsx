import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCartStore } from "../stores/cartStore";
import * as Clipboard from 'expo-clipboard';

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: {
    paymentMode: 'UPI' | 'CASH' | 'DUE';
  };
};

type PaymentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Payment'>;

// 🔧 PRODUCTION CONFIGURATION: Change this to your actual UPI ID when deploying
// Example: "merchant@paytm", "store@icici", "retailer@axis"
const RETAILER_UPI_ID = "sharmakirana@upi"; // Currently set for testing

type PaymentMode = 'UPI' | 'CASH' | 'DUE';

const PaymentScreen = () => {
  const navigation = useNavigation<PaymentScreenNavigationProp>();
  const { total } = useCartStore();
  const [selectedMode, setSelectedMode] = useState<PaymentMode>('UPI');
  const [upiString, setUpiString] = useState<string>('');

  // Generate UPI payment string
  const generateUPIString = (amount: number): string => {
    const billNumber = Date.now().toString().slice(-6);
    const upiString = `upi://pay?pa=${RETAILER_UPI_ID}&pn=Sharma%20Kirana%20Store&am=${amount.toFixed(2)}&cu=INR&tn=Bill%20${billNumber}`;
    return upiString;
  };

  useEffect(() => {
    console.log("PaymentScreen mounted successfully");
    // Generate UPI string when component mounts or total changes
    const upiStr = generateUPIString(total);
    setUpiString(upiStr);
    console.log("Generated UPI string:", upiStr);
    console.log("📱 UPI QR code generated for amount:", total.toFixed(2));
  }, [total]);

  const handlePaymentSelect = (mode: PaymentMode) => {
    setSelectedMode(mode);
  };

  const handleCopyUPI = async () => {
    if (upiString) {
      await Clipboard.setStringAsync(upiString);
      console.log('UPI string copied to clipboard:', upiString);
    }
  };

  const handleCompletePayment = () => {
    console.log(`Completing payment with mode: ${selectedMode}`);
    navigation.navigate('SuccessPrint', { paymentMode: selectedMode });
  };

  const renderPaymentOption = (mode: PaymentMode, title: string, icon: string) => (
    <TouchableOpacity
      style={[
        styles.paymentOption,
        selectedMode === mode && styles.paymentOptionSelected
      ]}
      onPress={() => handlePaymentSelect(mode)}
    >
      <MaterialCommunityIcons
        name={icon as any}
        size={24}
        color={selectedMode === mode ? "#10B981" : "#6B7280"}
      />
      <Text style={[
        styles.paymentOptionText,
        selectedMode === mode && styles.paymentOptionTextSelected
      ]}>
        {title}
      </Text>
      {selectedMode === mode && (
        <MaterialCommunityIcons
          name="check-circle"
          size={20}
          color="#10B981"
          style={styles.checkIcon}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Select Payment Method</Text>
      </View>

      {/* Amount Display */}
      <View style={styles.amountSection}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text
          style={styles.amountValue}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          numberOfLines={1}
        >
          ₹{total.toFixed(2)}
        </Text>
      </View>

      {/* Payment Options */}
      <ScrollView style={styles.paymentOptions} contentContainerStyle={styles.paymentOptionsContent}>
        <Text style={styles.sectionTitle}>Choose Payment Method</Text>

        {renderPaymentOption('UPI', 'UPI Payment', 'qrcode-scan')}
        {renderPaymentOption('CASH', 'Cash Payment', 'cash')}
        {renderPaymentOption('DUE', 'Mark as Due', 'calendar-clock')}

        {/* Payment Details based on selected mode */}
        {selectedMode === 'UPI' && (
          <View style={styles.paymentDetails}>
            <Text style={styles.detailsTitle}>UPI Payment</Text>
            <Text style={styles.detailsText}>Scan QR code to pay ₹{total.toFixed(2)}</Text>
            <View style={styles.upiDetails}>
              <MaterialCommunityIcons name="qrcode" size={60} color="#10B981" />
              <Text style={styles.upiTitle}>UPI Payment Ready</Text>
              <Text style={styles.upiIdDisplay}>{RETAILER_UPI_ID}</Text>
              <Text style={styles.upiAmount}>₹{total.toFixed(2)}</Text>

              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyUPI}
              >
                <MaterialCommunityIcons name="content-copy" size={16} color="#fff" />
                <Text style={styles.copyButtonText}>Copy UPI String</Text>
              </TouchableOpacity>

              <Text style={styles.upiInstructions}>
                Use any QR code generator with the copied UPI string to create a scannable QR code
              </Text>
            </View>
          </View>
        )}

        {selectedMode === 'CASH' && (
          <View style={styles.paymentDetails}>
            <Text style={styles.detailsTitle}>Cash Payment</Text>
            <Text
              style={styles.detailsText}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={2}
            >
              Collect ₹{total.toFixed(2)} from customer
            </Text>
          </View>
        )}

        {selectedMode === 'DUE' && (
          <View style={styles.paymentDetails}>
            <Text style={styles.detailsTitle}>Due Payment</Text>
            <Text style={styles.detailsText}>₹{total.toFixed(2)} will be collected later</Text>
          </View>
        )}
      </ScrollView>

      {/* Complete Payment Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.completeButton}
          onPress={handleCompletePayment}
        >
          <Text style={styles.completeButtonText}>Complete Payment</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PaymentScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB"
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center"
  },
  amountSection: {
    backgroundColor: "#fff",
    margin: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  amountLabel: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 8
  },
  amountValue: {
    fontSize: 32,
    fontWeight: "900",
    color: "#111827"
  },
  paymentOptions: {
    flex: 1
  },
  paymentOptionsContent: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  paymentOptionSelected: {
    borderColor: "#10B981",
    backgroundColor: "#F0FDF4"
  },
  paymentOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginLeft: 12,
    flex: 1
  },
  paymentOptionTextSelected: {
    color: "#10B981"
  },
  checkIcon: {
    marginLeft: 8
  },
  paymentDetails: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    marginTop: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8
  },
  detailsText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16
  },
  qrPlaceholder: {
    width: 140,
    height: 180,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    paddingVertical: 8
  },
  qrText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 8
  },
  upiIdText: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "center"
  },
  amountText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#10B981",
    marginTop: 6,
    textAlign: "center"
  },
  footer: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB"
  },
  completeButton: {
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4
  },
  completeButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 8
  },
  upiDetails: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  upiTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  upiIdDisplay: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
    textAlign: 'center',
  },
  upiAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 15,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  upiInstructions: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
});
