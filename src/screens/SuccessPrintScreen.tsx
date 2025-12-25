import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { theme } from '../theme';
import { useCartStore } from '../stores/cartStore';
import { eventLogger } from '../services/eventLogger';
import { printerService } from '../services/printerService';
import { hapticFeedback } from '../utils/haptics';

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: {
    paymentMode: 'UPI' | 'CASH' | 'DUE';
  };
};

type SuccessPrintNavigationProp = StackNavigationProp<RootStackParamList, 'SuccessPrint'>;
type SuccessPrintRouteProp = RouteProp<RootStackParamList, 'SuccessPrint'>;

export const SuccessPrintScreen = () => {
  const navigation = useNavigation<SuccessPrintNavigationProp>();
  const route = useRoute<SuccessPrintRouteProp>();
  
  const paymentMode = route.params?.paymentMode || 'CASH';
  
  const { items, total, clearCart } = useCartStore();
  const [printStatus, setPrintStatus] = useState<'printing' | 'success' | 'failed'>('printing');
  const [showUndo, setShowUndo] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(2);
  const [billNumber] = useState(Date.now().toString().slice(-6));
  
  // Store cart snapshot for undo
  const cartSnapshot = useRef(JSON.parse(JSON.stringify(items)));
  
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const initializeSuccess = async () => {
      // Emit SALE_COMPLETED
      await eventLogger.log('USER_ACTION', {
        action: 'SALE_COMPLETED',
        paymentMode,
        billNumber,
        total,
        itemCount: items.length,
      });

      // Attempt auto-print
      try {
        const receiptContent = generateReceiptContent();
        await printerService.printReceipt(receiptContent);
        
        setPrintStatus('success');
        
        await eventLogger.log('PRINT_RECEIPT', {
          billNumber,
          success: true,
        });
      } catch (error) {
        setPrintStatus('failed');
        
        await eventLogger.log('PRINT_FAILED', {
          billNumber,
          error: String(error),
        });
      }

      // Show undo toast after 1 second
      setTimeout(() => {
        setShowUndo(true);
        
        // Animate toast in
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 1000);
    };

    initializeSuccess();
  }, []);

  useEffect(() => {
    if (!showUndo) return;

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setUndoCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          handleAutoReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [showUndo]);

  const generateReceiptContent = (): string => {
    const lines = [
      '=================================',
      '       SUPERMANDI POS',
      '=================================',
      `Bill #: ${billNumber}`,
      `Date: ${new Date().toLocaleString()}`,
      `Payment: ${paymentMode}`,
      '=================================',
      '',
      'ITEMS:',
      ...items.map(item => 
        `${item.name}\n  ${item.quantity} x ₹${item.price.toFixed(2)} = ₹${(item.quantity * item.price).toFixed(2)}`
      ),
      '',
      '=================================',
      `TOTAL: ₹${total.toFixed(2)}`,
      '=================================',
      '',
      'Thank you for your business!',
      '=================================',
    ];
    
    return lines.join('\n');
  };

  const handleReprint = async () => {
    hapticFeedback.light();
    setPrintStatus('printing');
    
    try {
      const receiptContent = generateReceiptContent();
      await printerService.printReceipt(receiptContent);
      
      setPrintStatus('success');
      hapticFeedback.success();
      
      await eventLogger.log('PRINT_RECEIPT', {
        billNumber,
        success: true,
        reprint: true,
      });
    } catch (error) {
      setPrintStatus('failed');
      hapticFeedback.error();
      
      await eventLogger.log('PRINT_FAILED', {
        billNumber,
        error: String(error),
        reprint: true,
      });
    }
  };

  const handleUndo = async () => {
    hapticFeedback.heavy();
    
    // Animate toast out
    Animated.timing(toastOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    await eventLogger.log('USER_ACTION', {
      action: 'SALE_UNDONE',
      billNumber,
    });

    // Restore cart from snapshot
    // Note: In real implementation, you'd restore the cart state properly
    // For now, we'll just navigate back
    
    setTimeout(() => {
      navigation.navigate('SellScan');
    }, 300);
  };

  const handleAutoReset = async () => {
    // Animate toast out
    Animated.timing(toastOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    await eventLogger.log('CART_CLEAR', {
      reason: 'auto_reset_after_sale',
      billNumber,
    });

    // Clear cart
    clearCart();

    setTimeout(() => {
      navigation.navigate('SellScan');
    }, 300);
  };

  const getSuccessMessage = () => {
    if (paymentMode === 'DUE') {
      return 'Sale Recorded (Due)';
    }
    return 'Payment Successful';
  };

  return (
    <View style={styles.container}>
      {/* Success Icon */}
      <View style={styles.successIcon}>
        <Text style={styles.checkmark}>✓</Text>
      </View>

      {/* Success Message */}
      <Text style={styles.successMessage}>{getSuccessMessage()}</Text>
      
      {/* Bill Number */}
      <Text style={styles.billNumber}>Bill #{billNumber}</Text>

      {/* Print Status */}
      <View style={styles.printStatusContainer}>
        {printStatus === 'printing' && (
          <Text style={styles.printingText}>●  PRINTING RECEIPT...</Text>
        )}
        {printStatus === 'success' && (
          <Text style={styles.printSuccessText}>Receipt Printed</Text>
        )}
        {printStatus === 'failed' && (
          <Text style={styles.printFailedText}>Print Failed</Text>
        )}
      </View>

      {/* Reprint Button */}
      <TouchableOpacity
        style={styles.reprintButton}
        onPress={handleReprint}
      >
        <Text style={styles.reprintButtonText}>🖨  Reprint Receipt</Text>
      </TouchableOpacity>

      {/* Undo Toast */}
      {showUndo && (
        <Animated.View
          style={[
            styles.undoToast,
            { opacity: toastOpacity },
          ]}
        >
          <Text style={styles.undoToastText}>✓  Sale completed</Text>
          <TouchableOpacity
            style={styles.undoButton}
            onPress={handleUndo}
          >
            <Text style={styles.undoButtonText}>UNDO?</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successIcon: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    shadowColor: theme.colors.success,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  checkmark: {
    fontSize: 92,
    color: theme.colors.textInverse,
    fontWeight: '900',
  },
  successMessage: {
    fontSize: 52,
    lineHeight: 58,
    color: theme.colors.textPrimary,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  billNumber: {
    fontSize: 24,
    lineHeight: 30,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginBottom: 28,
  },
  printStatusContainer: {
    marginBottom: 22,
  },
  printingText: {
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.primary,
    fontWeight: '800',
    letterSpacing: 1,
  },
  printSuccessText: {
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.success,
    fontWeight: '800',
  },
  printFailedText: {
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.error,
    fontWeight: '800',
  },
  reprintButton: {
    width: '100%',
    height: 64,
    backgroundColor: theme.colors.background,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 8,
  },
  reprintButtonText: {
    fontSize: 22,
    lineHeight: 26,
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  undoToast: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#0B1220',
    borderRadius: 32,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 18,
  },
  undoToastText: {
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.textInverse,
    fontWeight: '700',
    flex: 1,
  },
  undoButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  undoButtonText: {
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.primaryLight,
    fontWeight: '900',
  },
});
