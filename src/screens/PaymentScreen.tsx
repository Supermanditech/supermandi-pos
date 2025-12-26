import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { theme } from '../theme';
import { useCartStore } from '../stores/cartStore';
import { eventLogger } from '../services/eventLogger';
import { hapticFeedback } from '../utils/haptics';

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: {
    paymentMode: 'UPI' | 'CASH' | 'DUE';
  };
};

type PaymentNavigationProp = StackNavigationProp<RootStackParamList, 'Payment'>;

type PaymentMode = 'UPI' | 'CASH' | 'DUE';

const PaymentScreen = () => {
  const navigation = useNavigation<PaymentNavigationProp>();
  const { subtotal, applyDiscount, discount, total } = useCartStore();
  
  const [selectedMode, setSelectedMode] = useState<PaymentMode>('UPI');
  const [discountInput, setDiscountInput] = useState('');
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    eventLogger.log('USER_ACTION', {
      action: 'PAYMENT_SCREEN_VIEWED',
      subtotal,
      total,
    });
  }, []);

  const handleApplyDiscount = () => {
    const discountValue = parseFloat(discountInput);
    
    if (isNaN(discountValue) || discountValue < 0) {
      hapticFeedback.error();
      return;
    }

    if (discountValue > subtotal) {
      hapticFeedback.error();
      return;
    }

    applyDiscount({
      type: 'fixed',
      value: discountValue,
      reason: 'Manual discount',
    });

    hapticFeedback.success();
    setShowDiscountInput(false);
    
    eventLogger.log('USER_ACTION', {
      action: 'DISCOUNT_APPLIED',
      discountAmount: discountValue,
      subtotal,
      newTotal: subtotal - discountValue,
    });
  };

  const handlePaymentModeSelect = (mode: PaymentMode) => {
    setSelectedMode(mode);
    hapticFeedback.light();
  };

  const handlePayment = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    hapticFeedback.medium();
    
    eventLogger.log('USER_ACTION', {
      action: 'PAYMENT_INITIATED',
      mode: selectedMode,
      amount: total,
    });

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    eventLogger.log('PAYMENT_SUCCESS', {
      mode: selectedMode,
      amount: total,
      timestamp: Date.now(),
    });

    hapticFeedback.success();
    setIsProcessing(false);
    
    navigation.navigate('SuccessPrint', { paymentMode: selectedMode });
  };

  const renderUPIFlow = () => (
    <View style={styles.paymentFlow}>
      <View style={styles.qrCodePlaceholder}>
        <Text style={styles.qrCodeText}>QR CODE</Text>
        <Text style={styles.qrCodeSubtext}>Scan to pay</Text>
      </View>
      
      <View style={styles.paymentDetails}>
        <Text style={styles.paymentDetailLabel}>Store: SuperMandi POS</Text>
        <Text style={styles.paymentDetailLabel}>Bill #: {Date.now().toString().slice(-6)}</Text>
        <Text style={styles.paymentDetailLabel}>Amount: ₹{total.toFixed(2)}</Text>
      </View>
      
      <Text style={styles.listeningText}>✓ Listening for payment confirmation...</Text>
      
      <TouchableOpacity
        style={[styles.confirmButton, isProcessing && styles.confirmButtonDisabled]}
        onPress={handlePayment}
        disabled={isProcessing}
      >
        <Text style={styles.confirmButtonText}>
          {isProcessing ? 'Processing...' : 'Complete Order →'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderCashFlow = () => (
    <View style={styles.paymentFlow}>
      <Text style={styles.cashFlowText}>Cash Payment</Text>
      <Text style={styles.cashFlowAmount}>₹{total.toFixed(2)}</Text>
      
      <TouchableOpacity
        style={[styles.confirmButton, isProcessing && styles.confirmButtonDisabled]}
        onPress={handlePayment}
        disabled={isProcessing}
      >
        <Text style={styles.confirmButtonText}>
          {isProcessing ? 'Processing...' : 'Complete Order →'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderDueFlow = () => (
    <View style={styles.paymentFlow}>
      <Text style={styles.dueFlowText}>Mark as Due</Text>
      <Text style={styles.dueFlowAmount}>₹{total.toFixed(2)}</Text>
      <Text style={styles.dueFlowSubtext}>Payment will be collected later</Text>
      
      <TouchableOpacity
        style={[styles.confirmButton, isProcessing && styles.confirmButtonDisabled]}
        onPress={handlePayment}
        disabled={isProcessing}
      >
        <Text style={styles.confirmButtonText}>
          {isProcessing ? 'Processing...' : 'Complete Order →'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Amount Section */}
        <View style={styles.amountSection}>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Subtotal</Text>
            <Text
              style={styles.amountValue}
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              ₹{subtotal.toFixed(2)}
            </Text>
          </View>
          
          <TouchableOpacity
            style={styles.discountRow}
            onPress={() => setShowDiscountInput(!showDiscountInput)}
          >
            <Text style={styles.discountLabel}>Discount</Text>
            <Text
              style={styles.discountValue}
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {discount ? `−₹${discount.value.toFixed(2)}` : '₹0.00'}
            </Text>
          </TouchableOpacity>
          
          {showDiscountInput && (
            <View style={styles.discountInputContainer}>
              <TextInput
                style={styles.discountInput}
                placeholder="Enter discount amount"
                placeholderTextColor={theme.colors.textTertiary}
                value={discountInput}
                onChangeText={setDiscountInput}
                keyboardType="decimal-pad"
                autoFocus
              />
              <TouchableOpacity
                style={styles.applyDiscountButton}
                onPress={handleApplyDiscount}
              >
                <Text style={styles.applyDiscountText}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>FINAL TOTAL</Text>
            <Text
              style={styles.totalValue}
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              ₹{total.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Payment Options */}
        <View style={styles.paymentOptions}>
          <Text style={styles.sectionTitle}>Select Payment Method</Text>
          
          <TouchableOpacity
            style={[
              styles.paymentOption,
              selectedMode === 'UPI' && styles.paymentOptionSelected,
            ]}
            onPress={() => handlePaymentModeSelect('UPI')}
          >
            <Text style={[
              styles.paymentOptionText,
              selectedMode === 'UPI' && styles.paymentOptionTextSelected,
            ]}>
              UPI
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.paymentOption,
              selectedMode === 'CASH' && styles.paymentOptionSelected,
            ]}
            onPress={() => handlePaymentModeSelect('CASH')}
          >
            <Text style={[
              styles.paymentOptionText,
              selectedMode === 'CASH' && styles.paymentOptionTextSelected,
            ]}>
              CASH
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.paymentOption,
              selectedMode === 'DUE' && styles.paymentOptionSelected,
            ]}
            onPress={() => handlePaymentModeSelect('DUE')}
          >
            <Text style={[
              styles.paymentOptionText,
              selectedMode === 'DUE' && styles.paymentOptionTextSelected,
            ]}>
              DUE
            </Text>
          </TouchableOpacity>
        </View>

        {/* Payment Flow */}
        {selectedMode === 'UPI' && renderUPIFlow()}
        {selectedMode === 'CASH' && renderCashFlow()}
        {selectedMode === 'DUE' && renderDueFlow()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  amountSection: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 8,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  amountLabel: {
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  amountValue: {
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.textPrimary,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginVertical: 14,
  },
  discountLabel: {
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  discountValue: {
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.error,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  discountInputContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  discountInput: {
    flex: 1,
    fontSize: 18,
    lineHeight: 22,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    color: theme.colors.textPrimary,
  },
  applyDiscountButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyDiscountText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textInverse,
  },
  totalRow: {
    alignItems: 'center',
    marginTop: 18,
  },
  totalLabel: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 2,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 64,
    lineHeight: 72,
    color: theme.colors.textPrimary,
    fontWeight: '900',
    marginTop: 8,
    width: '100%',
    textAlign: 'right',
  },
  paymentOptions: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    ...theme.typography.h4,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  paymentOption: {
    backgroundColor: theme.colors.backgroundSecondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.sm,
  },
  paymentOptionSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  paymentOptionText: {
    ...theme.typography.h4,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    fontWeight: '600',
  },
  paymentOptionTextSelected: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  paymentFlow: {
    backgroundColor: '#E9FBEF',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  qrCodePlaceholder: {
    width: 230,
    height: 230,
    backgroundColor: '#111827',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  qrCodeText: {
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.textInverse,
    marginBottom: 6,
    fontWeight: '800',
  },
  qrCodeSubtext: {
    fontSize: 14,
    lineHeight: 18,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  paymentDetails: {
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentDetailLabel: {
    fontSize: 18,
    lineHeight: 22,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '600',
  },
  listeningText: {
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.primary,
    fontWeight: '700',
    marginBottom: 18,
    textAlign: 'center',
  },
  cashFlowText: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  cashFlowAmount: {
    ...theme.typography.h1,
    color: theme.colors.primary,
    fontWeight: '700',
    marginBottom: theme.spacing.xl,
  },
  dueFlowText: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  dueFlowAmount: {
    ...theme.typography.h1,
    color: theme.colors.warning,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  dueFlowSubtext: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
    height: 64,
    borderRadius: 18,
    minWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  confirmButtonDisabled: {
    backgroundColor: theme.colors.borderDark,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    fontSize: 22,
    lineHeight: 26,
    color: theme.colors.textInverse,
    fontWeight: '900',
  },
});

export default PaymentScreen;
