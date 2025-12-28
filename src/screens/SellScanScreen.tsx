import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Camera, CameraView, BarcodeScanningResult } from "expo-camera";

import PosStatusStrip from "../components/PosStatusStrip";
import { useCartStore } from "../stores/cartStore";
import { useProductsStore } from "../stores/productsStore";
import { formatMoney } from "../utils/money";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: undefined;
};

type SellScanScreenNavigationProp =
  NativeStackNavigationProp<RootStackParamList, "SellScan">;

export default function SellScanScreen() {
  const navigation = useNavigation<SellScanScreenNavigationProp>();

  const { items, addItem, updateQuantity, removeItem, subtotal } =
    useCartStore();
  const { getProductByBarcode, products } = useProductsStore();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState("");

  const totalItems = items.length;

  /* CAMERA PERMISSION */
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  /* HANDLE CAMERA SCAN */
  const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanned || lastScannedCode === data) return;

    setScanned(true);
    setLastScannedCode(data);

    handleScan(data);

    setTimeout(() => {
      setScanned(false);
      setLastScannedCode("");
    }, 2000);
  };

  const toggleScanning = () => {
    if (!hasPermission) {
      Alert.alert(
        "Camera Permission",
        "Camera access is required for scanning"
      );
      return;
    }
    setIsScanning((v) => !v);
    setScanned(false);
    setLastScannedCode("");
  };

  /* MAIN SCAN HANDLER */
  const handleScan = (barcode: string) => {
    (global as any).__POS_SCANNER_PING__?.(); // 🔑 scanner heartbeat

    if (!barcode.trim()) return;

    const product = getProductByBarcode(barcode);

    if (!product) {
      Alert.alert("Product Not Found", barcode);
      return;
    }

    addItem({
      id: product.id,
      name: product.name,
      priceMinor: product.priceMinor,
      currency: product.currency,
      barcode: product.barcode,
    });
  };

  const inc = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) updateQuantity(id, item.quantity + 1);
  };

  const dec = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (item.quantity > 1) updateQuantity(id, item.quantity - 1);
    else removeItem(id);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* POS STATUS STRIP */}
      <PosStatusStrip />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.store}>Sharma Kirana Store</Text>
      </View>

      {/* SCAN BAR */}
      <View style={styles.scanBar}>
        <MaterialCommunityIcons name="barcode-scan" size={26} />
        <Text style={styles.scanText}>Scan product barcode / QR</Text>
        <TouchableOpacity onPress={toggleScanning} style={styles.cameraButton}>
          <MaterialCommunityIcons
            name={isScanning ? "camera-off" : "camera"}
            size={24}
            color="#10B981"
          />
        </TouchableOpacity>
      </View>

      {/* CAMERA */}
      {isScanning && hasPermission && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
        </View>
      )}

      {/* TEST PRODUCTS */}
      {!isScanning && (
        <View style={styles.testProducts}>
          <TouchableOpacity
            style={styles.testBtn}
            onPress={() => handleScan(products[0]?.barcode || "8901030895326")}
          >
            <Text style={styles.testBtnText}>
              Test: {products[0]?.name || "Maggi Noodles"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.testBtn}
            onPress={() => handleScan(products[1]?.barcode || "8901030895333")}
          >
            <Text style={styles.testBtnText}>
              Test: {products[1]?.name || "Parle-G Biscuits"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CART LIST */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>

            <View style={styles.qtyBox}>
              <TouchableOpacity onPress={() => dec(item.id)}>
                <Text style={styles.btn}>-</Text>
              </TouchableOpacity>

              <Text style={styles.qty}>{item.quantity}</Text>

              <TouchableOpacity onPress={() => inc(item.id)}>
                <Text style={styles.btn}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.price}>
              {formatMoney(
                item.priceMinor * item.quantity,
                item.currency ?? "INR"
              ).replace("INR ", "₹")}
            </Text>
          </View>
        )}
      />

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text>{totalItems} Items</Text>
        <Text style={styles.totalAmount}>
          {formatMoney(subtotal, items[0]?.currency ?? "INR").replace(
            "INR ",
            "₹"
          )}
        </Text>

        <TouchableOpacity
          style={styles.payBtn}
          onPress={() => navigation.navigate("Payment")}
        >
          <Text style={styles.payText}>PAY</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* STYLES */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: {
    height: 56,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },

  store: { fontSize: 18, fontWeight: "700" },

  scanBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
  },

  scanText: { marginLeft: 12, flex: 1, fontSize: 14 },

  cameraButton: { padding: 8 },

  cameraContainer: {
    margin: 12,
    height: 280,
    borderRadius: 12,
    overflow: "hidden",
  },

  camera: { flex: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },

  name: { flex: 1 },

  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
  },

  btn: { fontSize: 20, paddingHorizontal: 8 },

  qty: { minWidth: 24, textAlign: "center" },

  price: { width: 70, textAlign: "right" },

  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderColor: "#eee",
  },

  totalAmount: { fontSize: 18, fontWeight: "700", marginVertical: 6 },

  payBtn: {
    backgroundColor: "#0a7",
    padding: 14,
    alignItems: "center",
    borderRadius: 6,
  },

  payText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  testProducts: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
  },

  testBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },

  testBtnText: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
  },
});
