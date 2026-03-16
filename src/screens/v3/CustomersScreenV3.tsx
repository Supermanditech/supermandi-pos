import React, { useMemo } from "react";
import { View, Pressable, TextInput, FlatList, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";

// STG-575: Customers v3 — list with WhatsApp contact, purchase history inline

type Customer = { name: string; initial: string; visits: number; total: number };
const DEMO: Customer[] = [
  { name: "Ramesh Kumar", initial: "R", visits: 32, total: 24500 },
  { name: "Suresh Patel", initial: "S", visits: 18, total: 12800 },
  { name: "Mohan Singh", initial: "M", visits: 45, total: 38000 },
  { name: "Priya Sharma", initial: "P", visits: 8, total: 4200 },
];

type Props = { onClose: () => void };

export default function CustomersScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Customers</Text><Pressable style={styles.addBtn}><Text style={styles.addBtnText}>+ Add</Text></Pressable></View>
      <View style={styles.searchBar}><TextInput style={styles.searchInput} placeholder="Search customer..." placeholderTextColor={colors.textTertiary} /></View>
      <FlatList data={DEMO} keyExtractor={(c) => c.name} contentContainerStyle={{ padding: 14 }} renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.avatar}><Text style={styles.initial}>{item.initial}</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{item.visits} visits · ₹{item.total.toLocaleString("en-IN")} total</Text></View>
          <Pressable style={styles.waBtn}><Svg width={10} height={10} viewBox="0 0 24 24" fill="#fff"><Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></Svg></Pressable>
          <Text style={styles.arrow}>›</Text>
        </View>
      )} />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    addBtn: { backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
    addBtnText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
    searchBar: { padding: 10, paddingHorizontal: 14, backgroundColor: colors.surface },
    searchInput: { padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, fontSize: 13, fontWeight: "500" },
    card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
    initial: { fontSize: 18, fontWeight: "800", color: colors.primary },
    name: { fontSize: 14, fontWeight: "700" },
    meta: { fontSize: 11, color: colors.textTertiary },
    waBtn: { backgroundColor: "#25D366", padding: 6, borderRadius: 6 },
    arrow: { fontSize: 14, color: colors.border, marginLeft: 4 },
  });
}
