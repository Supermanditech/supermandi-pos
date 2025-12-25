import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { theme } from '../theme';
import { useCartStore, CartItem } from '../stores/cartStore';
import { eventLogger } from '../services/eventLogger';
import { hapticFeedback } from '../utils/haptics';
import { STORE_NAME } from '../constants/store';

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
};

type SellScanNavigationProp = StackNavigationProp<RootStackParamList, 'SellScan'>;

// Mock product database (replace with actual database later)
const mockProducts: Record<string, { name: string; price: number }> = {
  '1234567890': { name: 'Sample Product A', price: 99.99 },
  '0987654321': { name: 'Sample Product B', price: 149.50 },
};

export const SellScanScreen = () => {
  const navigation = useNavigation<SellScanNavigationProp>();
  const scanInputRef = useRef<TextInput>(null);
  
  const { items, addItem, updateQuantity, removeItem, subtotal } = useCartStore();
  
  const [scanValue, setScanValue] = useState('');
  const [showProductNotFound, setShowProductNotFound] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('1');

  // Auto-focus scan input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      scanInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleScan = (barcode: string) => {
    if (!barcode.trim()) return;

    eventLogger.log('USER_ACTION', {
      action: 'SCAN_DETECTED',
      barcode,
    });

    // Check if product exists
    const product = mockProducts[barcode];
    
    if (product) {
      // Add to cart
      addItem({
        id: barcode,
        name: product.name,
        price: product.price,
        barcode,
      });
      
      hapticFeedback.success();
      
      eventLogger.log('CART_ADD_ITEM', {
        barcode,
        productName: product.name,
        price: product.price,
      });
    } else {
      // Product not found - show bottom sheet
      hapticFeedback.warning();
      setShowProductNotFound(true);
      
      eventLogger.log('USER_ACTION', {
        action: 'PRODUCT_NOT_FOUND',
        barcode,
      });
    }

    // Clear and refocus
    setScanValue('');
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 100);
  };

  const handleSaveNewProduct = () => {
    if (!newProductName.trim() || !newProductPrice.trim()) {
      hapticFeedback.error();
      return;
    }

    const price = parseFloat(newProductPrice);
    if (isNaN(price) || price <= 0) {
      hapticFeedback.error();
      return;
    }

    const barcode = scanValue;
    
    // Add to mock database (in real app, save to actual database)
    mockProducts[barcode] = {
      name: newProductName.trim(),
      price,
    };

    // Add to cart
    addItem({
      id: barcode,
      name: newProductName.trim(),
      price,
      barcode,
    });

    hapticFeedback.success();
    
    eventLogger.log('USER_ACTION', {
      action: 'PRODUCT_CREATED',
      barcode,
      productName: newProductName.trim(),
      price,
    });

    // Reset and close
    setNewProductName('');
    setNewProductPrice('');
    setNewProductStock('1');
    setShowProductNotFound(false);
    
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 100);
  };

  const handleCancelNewProduct = () => {
    setNewProductName('');
    setNewProductPrice('');
    setNewProductStock('1');
    setShowProductNotFound(false);
    
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 100);
  };

  const handleIncreaseQuantity = (item: CartItem) => {
    updateQuantity(item.id, item.quantity + 1);
    hapticFeedback.light();
    
    eventLogger.log('CART_UPDATE_QUANTITY', {
      itemId: item.id,
      newQuantity: item.quantity + 1,
    });
  };

  const handleDecreaseQuantity = (item: CartItem) => {
    if (item.quantity > 1) {
      updateQuantity(item.id, item.quantity - 1);
      hapticFeedback.light();
      
      eventLogger.log('CART_UPDATE_QUANTITY', {
        itemId: item.id,
        newQuantity: item.quantity - 1,
      });
    } else {
      removeItem(item.id);
      hapticFeedback.medium();
      
      eventLogger.log('CART_REMOVE_ITEM', {
        itemId: item.id,
      });
    }
  };

  const handleLongPressItem = (item: CartItem) => {
    hapticFeedback.heavy();
    removeItem(item.id);
    
    eventLogger.log('CART_REMOVE_ITEM', {
      itemId: item.id,
      method: 'long_press',
    });
  };

  const handlePayPress = () => {
    if (items.length === 0) return;
    
    hapticFeedback.medium();
    navigation.navigate('Payment');
  };

  const renderCartItem = ({ item }: { item: CartItem }) => {
    const lineTotal = item.price * item.quantity;
    
    return (
      <TouchableOpacity
        style={styles.cartItem}
        onLongPress={() => handleLongPressItem(item)}
        delayLongPress={500}
      >
        <View style={styles.cartItemLeft}>
          <Text style={styles.productName} numberOfLines={1} ellipsizeMode="tail">
            {item.name}
          </Text>
          <Text style={styles.productDetails}>
            ₹{item.price.toFixed(2)} × {item.quantity} = ₹{lineTotal.toFixed(2)}
          </Text>
        </View>
        
        <View style={styles.cartItemRight}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleDecreaseQuantity(item)}
          >
            <Text style={styles.quantityButtonText}>−</Text>
          </TouchableOpacity>
          
          <Text style={styles.quantityText}>{item.quantity}</Text>
          
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleIncreaseQuantity(item)}
          >
            <Text style={styles.quantityButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.storeName}>{STORE_NAME}</Text>
        <View style={styles.statusIcons}>
          <Text style={styles.statusIcon}>📶</Text>
          <Text style={styles.statusIcon}>🔵</Text>
        </View>
      </View>

      {/* Visible Scan Input */}
      <View style={styles.scanInputContainer}>
        <Text style={styles.scanIcon}>📷</Text>
        <TextInput
          ref={scanInputRef}
          style={styles.scanInput}
          value={scanValue}
          onChangeText={setScanValue}
          onSubmitEditing={() => handleScan(scanValue)}
          placeholder="Scan product barcode / QR"
          placeholderTextColor={theme.colors.textTertiary}
          returnKeyType="done"
          blurOnSubmit={false}
        />
        <Text style={styles.keyboardIcon}>⌨️</Text>
      </View>

      {/* Test Add Item Button (for testing without scanner) */}
      <View style={styles.testButtonContainer}>
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => handleScan('1234567890')}
        >
          <Text style={styles.testButtonText}>+ Add Test Item A</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => handleScan('0987654321')}
        >
          <Text style={styles.testButtonText}>+ Add Test Item B</Text>
        </TouchableOpacity>
      </View>

      {/* Cart List */}
      <FlatList
        data={items}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.id}
        style={styles.cartList}
        contentContainerStyle={styles.cartListContent}
        ListEmptyComponent={
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartText}>Scan items to add to cart</Text>
          </View>
        }
      />

      {/* Total Bar (Sticky Footer) */}
      <View style={styles.totalBar}>
        <Text style={styles.itemCountInline}>{items.length} Items</Text>

        <View style={styles.amountWrap}>
          <Text
            style={styles.subtotal}
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            ₹{subtotal.toFixed(2)}
          </Text>
        </View>
        
        <TouchableOpacity
          style={[styles.payButton, items.length === 0 && styles.payButtonDisabled]}
          onPress={handlePayPress}
          disabled={items.length === 0}
        >
          <Text style={styles.payButtonText}>PAY</Text>
        </TouchableOpacity>
      </View>

      {/* Product Not Found Bottom Sheet */}
      <Modal
        visible={showProductNotFound}
        transparent
        animationType="slide"
        onRequestClose={handleCancelNewProduct}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCancelNewProduct}
        >
          <TouchableOpacity
            style={styles.bottomSheet}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={styles.bottomSheetTitle}>Product Not Found</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Product Name"
              placeholderTextColor={theme.colors.textTertiary}
              value={newProductName}
              onChangeText={setNewProductName}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Selling Price (₹)"
              placeholderTextColor={theme.colors.textTertiary}
              value={newProductPrice}
              onChangeText={setNewProductPrice}
              keyboardType="decimal-pad"
              autoFocus
            />
            
            <TextInput
              style={styles.input}
              placeholder="Stock Quantity"
              placeholderTextColor={theme.colors.textTertiary}
              value={newProductStock}
              onChangeText={setNewProductStock}
              keyboardType="number-pad"
            />
            
            <View style={styles.bottomSheetButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelNewProduct}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveNewProduct}
              >
                <Text style={styles.saveButtonText}>Save & Add</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  storeName: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  statusIcons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 18,
    color: theme.colors.primary,
  },
  scanInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 56,
  },
  scanIcon: {
    fontSize: 20,
    marginRight: 10,
    color: theme.colors.textTertiary,
  },
  scanInput: {
    flex: 1,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '500',
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  keyboardIcon: {
    fontSize: 20,
    marginLeft: 10,
    color: theme.colors.textTertiary,
  },
  testButtonContainer: {
    display: 'none',
  },
  testButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  testButtonText: {
    ...theme.typography.button,
    color: theme.colors.textInverse,
    fontSize: 14,
  },
  cartList: {
    flex: 1,
  },
  cartListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  emptyCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xxxl,
  },
  emptyCartText: {
    ...theme.typography.body,
    color: theme.colors.textTertiary,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 14,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 6,
  },
  cartItemLeft: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  productName: {
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.textPrimary,
    fontWeight: '800',
    marginBottom: 6,
  },
  productDetails: {
    fontSize: 16,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundTertiary,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 46,
  },
  quantityButton: {
    width: 40,
    height: 40,
    backgroundColor: 'transparent',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 26,
    lineHeight: 26,
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  quantityText: {
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.textPrimary,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  totalBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 104,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 18,
  },
  itemCountInline: {
    width: 92,
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  amountWrap: {
    flex: 1,
    paddingRight: 14,
  },
  subtotal: {
    fontSize: 44,
    lineHeight: 48,
    color: theme.colors.textPrimary,
    fontWeight: '900',
    flex: 1,
    textAlign: 'right',
  },
  payButton: {
    backgroundColor: theme.colors.primary,
    height: 64,
    minWidth: 190,
    borderRadius: 32,
    paddingHorizontal: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  payButtonDisabled: {
    backgroundColor: theme.colors.borderDark,
    shadowOpacity: 0,
    elevation: 0,
  },
  payButtonText: {
    fontSize: 24,
    lineHeight: 28,
    color: theme.colors.textInverse,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  bottomSheetTitle: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },
  input: {
    ...theme.typography.body,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    color: theme.colors.textPrimary,
  },
  bottomSheetButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: theme.colors.backgroundTertiary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...theme.typography.button,
    color: theme.colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  saveButtonText: {
    ...theme.typography.button,
    color: theme.colors.textInverse,
  },
});
