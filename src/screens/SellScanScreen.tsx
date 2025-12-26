import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type Item = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

const TEST_PRODUCTS: Item[] = [
  { id: "1", name: "Maggie 2 Min Noodles", price: 12, qty: 2 },
  { id: "2", name: "Amul Taaza Milk", price: 27, qty: 1 },
  { id: "3", name: "Tata Salt 1kg", price: 28, qty: 1 },
  { id: "4", name: "Britannia Good Day", price: 10, qty: 5 }
];

export default function SellScanScreen() {
  const [items, setItems] = useState<Item[]>(TEST_PRODUCTS);

  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  const grandTotal = items.reduce((s, i) => s + i.qty * i.price, 0);

  const inc = (id: string) =>
    setItems(p =>
      p.map(i => (i.id === id ? { ...i, qty: i.qty + 1 } : i))
    );

  const dec = (id: string) =>
    setItems(p =>
      p.map(i =>
        i.id === id && i.qty > 1 ? { ...i, qty: i.qty - 1 } : i
      )
    );

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

              <Text style={styles.qty}>{item.qty}</Text>

              <TouchableOpacity onPress={() => inc(item.id)}>
                <Text style={styles.btn}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.price}>
              {item.price * item.qty}
            </Text>
          </View>
        )}
      />

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.totalItems}>
          {totalItems} Items
        </Text>
        <Text style={styles.totalAmount}>
          Rs. {grandTotal.toFixed(2)}
        </Text>

        <TouchableOpacity style={styles.payBtn}>
          <Text style={styles.payText}>PAY</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  },  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },
  store: {
    fontSize: 18,
    fontWeight: "700"
  },
  status: {
    flexDirection: "row",
    gap: 12
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
    color: "#555"
  },  container: { flex: 1, backgroundColor: "#fff" },

  header: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },
  store: {
    fontSize: 18,
    fontWeight: "700"
  },
  status: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6
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
  payText: { color: "#fff", fontSize: 16, fontWeight: "700" }
});




