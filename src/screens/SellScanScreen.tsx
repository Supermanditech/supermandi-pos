import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Dimensions
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Camera, CameraView, BarcodeScanningResult } from "expo-camera";
import { useCartStore } from "../stores/cartStore";
import { useProductsStore } from "../stores/productsStore";
import { formatMoney } from "../utils/money";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: undefined;
};

type SellScanScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SellScan'>;


export default function SellScanScreen() {
  const navigation = useNavigation<SellScanScreenNavigationProp>();
  const { items, addItem, updateQuantity, removeItem, subtotal } = useCartStore();
  const { getProductByBarcode, products } = useProductsStore();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');

  const totalItems = items.length;

  // Test QR codes and barcodes - use first two products from store
  const testCodes = {
    qr: products[2]?.barcode || 'QR_PRODUCT_C',
    barcode: products[3]?.barcode || 'BAR_PRODUCT_D'
  };

  // Request camera permissions
  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    getCameraPermissions();
  }, []);

  // Handle barcode scanning
  const handleBarCodeScanned = ({ type, data }: BarcodeScanningResult) => {
    if (scanned || lastScannedCode === data) return;

    setScanned(true);
    setLastScannedCode(data);

    console.log(`Scanned ${type}: ${data}`);

    // Process the scanned code
    handleScan(data);

    // Reset after 2 seconds to allow scanning again
    setTimeout(() => {
      setScanned(false);
      setLastScannedCode('');
    }, 2000);
  };

  // Toggle scanning mode
  const toggleScanning = () => {
    if (hasPermission === null) {
      Alert.alert('Camera permission required', 'Please grant camera permission to scan codes.');
      return;
    }
    if (hasPermission === false) {
      Alert.alert('No camera permission', 'Camera permission is required to scan codes.');
      return;
    }
    setIsScanning(!isScanning);
    setScanned(false);
    setLastScannedCode('');
  };

  const handleScan = (barcode: string) => {
    if (!barcode.trim()) return;

    const product = getProductByBarcode(barcode);

    if (product) {
      addItem({
        id: product.id,
        name: product.name,
        priceMinor: product.priceMinor,
        currency: product.currency,
        barcode: product.barcode,
      });
    } else {
      Alert.alert(
        'Product Not Found',
        `No product found with barcode: ${barcode}`,
        [{ text: 'OK' }]
      );
    }
  };

  const inc = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      updateQuantity(id, item.quantity + 1);
    }
  };

  const dec = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      if (item.quantity > 1) {
        updateQuantity(id, item.quantity - 1);
      } else {
        removeItem(id);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
                  {/* HEADER */}
      <View style={styles.header}>

        {/* STATUS ICONS (TOP RIGHT) */}
        <View style={styles.statusBar}>
          <MaterialCommunityIcons name="wifi" size={18} />
          <MaterialCommunityIcons name="bluetooth" size={18} />
          <MaterialCommunityIcons name="barcode-scan" size={18} />
        </View>

        {/* STORE NAME */}
        <Text style={styles.store}>
          Sharma Kirana Store
        </Text>

      </View>

      {/* SCAN BAR */}
      <View style={styles.scanBar}>
        <MaterialCommunityIcons name="barcode-scan" size={26} />
        <Text style={styles.scanText}>
          Scan product barcode / QR
        </Text>
        <TouchableOpacity
          onPress={toggleScanning}
          style={styles.cameraButton}
        >
          <MaterialCommunityIcons
            name={isScanning ? "camera-off" : "camera"}
            size={24}
            color="#10B981"
          />
        </TouchableOpacity>
      </View>

      {/* CAMERA VIEW */}
      {isScanning && hasPermission && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8", "upc_a", "upc_e"],
            }}
          />
          <View style={styles.cameraOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanInstruction}>
              {scanned ? `Scanned: ${lastScannedCode}` : 'Position QR code or barcode within the frame'}
            </Text>
            <TouchableOpacity
              style={styles.closeCameraButton}
              onPress={() => setIsScanning(false)}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* TEST SCAN BUTTONS */}
      <View style={styles.testScanButtons}>
        <TouchableOpacity
          style={styles.testScanButton}
          onPress={() => handleScan(testCodes.qr)}
        >
          <MaterialCommunityIcons name="qrcode" size={20} color="#fff" />
          <View>
            <Text style={styles.testScanButtonText}>Test QR Code</Text>
            <Text style={styles.testCodeText}>QR_PRODUCT_C</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.testScanButton}
          onPress={() => handleScan(testCodes.barcode)}
        >
          <MaterialCommunityIcons name="barcode" size={20} color="#fff" />
          <View>
            <Text style={styles.testScanButtonText}>Test Barcode</Text>
            <Text style={styles.testCodeText}>BAR_PRODUCT_D</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* TEST CODES INFO */}
      <View style={styles.testInfo}>
        <Text style={styles.testInfoTitle}>📱 Test Codes</Text>
        <Text style={styles.testInfoText}>
          QR: QR_PRODUCT_C | Barcode: BAR_PRODUCT_D
        </Text>
        <Text style={styles.testInfoSubtext}>
          Generate real QR/barcodes with these codes to test camera scanning
        </Text>
      </View>

      {/* LIST */}
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>

            <View style={styles.qtyBox}>
              <TouchableOpacity onPress={() => dec(item.id)}>
                <Text style={styles.btn}>-</Text>
              </TouchableOpacity>

              <Text
                style={styles.qty}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                numberOfLines={1}
              >
                {item.quantity}
              </Text>

              <TouchableOpacity onPress={() => inc(item.id)}>
                <Text style={styles.btn}>+</Text>
              </TouchableOpacity>
            </View>

            <Text
              style={styles.price}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
            >
              {formatMoney(item.priceMinor * item.quantity, item.currency ?? "INR").replace("INR ", "₹")}
            </Text>
          </View>
        )}
      />

      {/* Test Add Item Buttons */}
      <View style={styles.testButtons}>
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => handleScan(products[0]?.barcode || '1234567890')}
        >
          <Text style={styles.testButtonText}>+ {products[0]?.name || 'Test Item A'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => handleScan(products[1]?.barcode || '0987654321')}
        >
          <Text style={styles.testButtonText}>+ {products[1]?.name || 'Test Item B'}</Text>
        </TouchableOpacity>
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.totalItems}>
          {totalItems} Items
        </Text>
        <Text
          style={styles.totalAmount}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
        >
          {formatMoney(subtotal, items[0]?.currency ?? "INR").replace("INR ", "₹")}
        </Text>

        <TouchableOpacity
          style={styles.payBtn}
          onPress={() => {
            console.log("PAY button pressed, navigating to Payment");
            navigation.navigate("Payment");
          }}
        >
          <Text style={styles.payText}>PAY</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: {
    height: 64,
    paddingHorizontal: 12,
    paddingTop: 14,
    justifyContent: "flex-end",
    borderBottomWidth: 1,
    borderColor: "#e6e6e6",
    backgroundColor: "#fff"
  },

  statusBar: {
    position: "absolute",
    top: 8,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },

  store: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111"
  },

  scanBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    backgroundColor: "#fafafa"
  },

  scanText: {
    marginLeft: 12,
    fontSize: 14,
    color: "#555",
    flex: 1
  },

  cameraButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },

  cameraContainer: {
    margin: 12,
    borderRadius: 12,
    overflow: "hidden",
    height: 300
  },

  camera: {
    flex: 1
  },

  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)"
  },

  scanFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "#10B981",
    borderRadius: 12,
    backgroundColor: "transparent"
  },

  scanInstruction: {
    marginTop: 16,
    fontSize: 14,
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 20
  },

  closeCameraButton: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 8
  },

  testScanButtons: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8
  },

  testScanButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    padding: 12,
    borderRadius: 8,
    gap: 8
  },

  testScanButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },

  name: { flex: 1, fontSize: 14 },

  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8
  },

  btn: { fontSize: 20, paddingHorizontal: 8 },

  qty: { fontSize: 16, minWidth: 20, textAlign: "center" },

  price: { width: 60, textAlign: "right" },

  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderColor: "#eee"
  },

  totalItems: { fontSize: 14 },

  totalAmount: { fontSize: 18, fontWeight: "700", marginVertical: 6 },

  payBtn: {
    backgroundColor: "#0a7",
    padding: 14,
    alignItems: "center",
    borderRadius: 6
  },

  payText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  testButtons: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8
  },

  testButton: {
    flex: 1,
    backgroundColor: "#10B981",
    padding: 12,
    borderRadius: 6,
    alignItems: "center"
  },

  testButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  },

  testCodeText: {
    color: "#fff",
    fontSize: 10,
    opacity: 0.8,
    marginTop: 2
  },

  testInfo: {
    margin: 12,
    padding: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },

  testInfoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6
  },

  testInfoText: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4
  },

  testInfoSubtext: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic"
  }
});










