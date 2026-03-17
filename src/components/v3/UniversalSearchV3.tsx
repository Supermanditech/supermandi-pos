import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { View, FlatList, TextInput, Pressable, StyleSheet, Text } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";

// STG-560: Context-aware universal search — one component, different data source per tab
// SELL tab → store inventory (offline-first, uses productsStore/sellSearchApi)
// BUY tab → supplier catalogue (API, uses catalogApi)
// Both use the same UI — context determines placeholder, results, and action

export type SearchContext = "sell" | "buy";

export interface SearchResult {
  id: string;
  name: string;
  barcode?: string;
  brand?: string;
  priceMinor: number;
  stock?: number;
  supplier?: string;
  margin?: number;
  caseSize?: number;
}

type UniversalSearchV3Props = {
  context: SearchContext;
  visible: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  // Inject results from parent (parent fetches via correct API based on context)
  results?: SearchResult[];
  loading?: boolean;
  onQueryChange?: (query: string) => void;
};

const RECENT_KEY = "@supermandi.recent_searches";
const RECENT_MAX = 8;
const DEFAULT_RECENT = ["Tata Tea", "Maggi", "Amul", "Surf"];
const DEFAULT_RECENT_BUY = ["Parle", "Nestle", "HUL", "ITC"];

// Demo results for prototype
const DEMO_SELL: SearchResult[] = [
  { id: "1", name: "Parle-G Gold 100g", barcode: "8901234567890", brand: "Parle", priceMinor: 1000, stock: 47 },
  { id: "2", name: "Parle Monaco 200g", barcode: "8901234567891", brand: "Parle", priceMinor: 3500, stock: 12 },
  { id: "3", name: "Parle Hide & Seek 120g", barcode: "8901234567892", brand: "Parle", priceMinor: 3000, stock: 8 },
];
const DEMO_BUY: SearchResult[] = [
  { id: "1", name: "Parle-G Gold 100g", brand: "Parle", priceMinor: 850, supplier: "ABC Dist.", margin: 15, caseSize: 48 },
  { id: "2", name: "Parle Monaco 200g", brand: "Parle", priceMinor: 2800, supplier: "ABC Dist.", margin: 20, caseSize: 24 },
  { id: "3", name: "Parle Krackjack 200g", brand: "Parle", priceMinor: 2500, supplier: "XYZ Trading", margin: 18, caseSize: 24 },
];

export default function UniversalSearchV3({ context, visible, onClose, onSelect, results, loading, onQueryChange }: UniversalSearchV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(DEFAULT_RECENT);
  const inputRef = useRef<TextInput>(null);

  const isSell = context === "sell";
  const placeholder = isSell ? "Search your products..." : "Search supplier catalogue...";
  const displayResults = results ?? (query.length > 0 ? (isSell ? DEMO_SELL : DEMO_BUY) : []);

  // V3-064: Load persisted recent searches on mount
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then((raw) => {
      if (raw) { try { setRecentSearches(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
  }, []);

  // V3-064: Save search term to recent list
  const saveRecentSearch = useCallback((term: string) => {
    setRecentSearches((prev) => {
      const updated = [term, ...prev.filter((t) => t !== term)].slice(0, RECENT_MAX);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  useEffect(() => {
    if (visible) { setTimeout(() => inputRef.current?.focus(), 100); }
    else { setQuery(""); }
  }, [visible]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    onQueryChange?.(text);
  }, [onQueryChange]);

  const handleChipTap = useCallback((term: string) => {
    setQuery(term);
    onQueryChange?.(term);
  }, [onQueryChange]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <View style={[styles.inputBox, query.length > 0 && styles.inputBoxFocused]}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={query.length > 0 ? colors.primary : colors.textTertiary} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={8} />
            <Path d="M21 21l-4.35-4.35" />
          </Svg>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={handleQueryChange}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => { setQuery(""); onQueryChange?.(""); }} accessibilityLabel="Clear search">
              <Text style={styles.clearBtn}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close search">
          <Text style={styles.closeBtnText}>Cancel</Text>
        </Pressable>
      </View>

      {/* Recent searches — shown when query empty */}
      {query.length === 0 ? (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>RECENT SEARCHES</Text>
          <View style={styles.chipRow}>
            {recentSearches.map((term) => (
              <Pressable key={term} style={styles.chip} onPress={() => handleChipTap(term)}>
                <Text style={styles.chipText}>{term}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Results */}
      {query.length > 0 ? (
        <View style={styles.resultsSection}>
          <Text style={styles.sectionTitle}>
            {isSell ? "STORE PRODUCTS" : "SUPPLIER CATALOGUE"}
          </Text>
          <FlatList
            data={displayResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => { saveRecentSearch(query); onSelect(item); showToast(`${item.name} ${isSell ? "added" : "selected"}`); }} accessibilityRole="button">
                <View style={styles.resultImg}><Text style={{ fontSize: 18 }}>🍪</Text></View>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.resultDetail}>
                    ₹{(item.priceMinor / 100).toFixed(0)}
                    {item.stock != null ? ` · Stock: ${item.stock}` : ""}
                    {item.supplier ? ` · ${item.supplier}` : ""}
                    {item.margin ? ` · ${item.margin}% margin` : ""}
                  </Text>
                </View>
                <Text style={styles.resultAction}>{isSell ? "+ Add" : "Select"}</Text>
              </Pressable>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { position: "absolute", inset: 0, backgroundColor: colors.surface, zIndex: 20 },
    searchBar: { flexDirection: "row", gap: 8, padding: 10, paddingHorizontal: 14, backgroundColor: colors.surface },
    inputBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.background, borderRadius: 14, borderWidth: 2, borderColor: colors.border },
    inputBoxFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
    input: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.textPrimary },
    clearBtn: { fontSize: 14, fontWeight: "700", color: colors.textTertiary, padding: 4 },
    closeBtn: { justifyContent: "center", paddingHorizontal: 8 },
    closeBtnText: { fontSize: 14, fontWeight: "600", color: colors.primary },
    recentSection: { paddingHorizontal: 16, paddingTop: 8 },
    sectionTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, marginBottom: 8 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, backgroundColor: colors.backgroundSecondary, borderWidth: 1.5, borderColor: colors.border },
    chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
    resultsSection: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary },
    resultImg: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    resultInfo: { flex: 1, minWidth: 0 },
    resultName: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.2 },
    resultDetail: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    resultAction: { fontSize: 13, fontWeight: "800", color: colors.primary },
  });
}
