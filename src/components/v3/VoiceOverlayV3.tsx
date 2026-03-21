import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { View, Pressable, StyleSheet, Text, Animated, Modal } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import {
  startRecording, stopRecording, cancelRecording,
  submitVoiceCommand, type VoiceCommandResult,
  VoiceRateLimitError, VoiceTimeoutError,
} from "../../services/voice";
import { useProductsStore } from "../../stores/productsStore";
import { useCartStore } from "../../stores/cartStore";
import { buildCartItemFromVoice, buildCartItem } from "../../services/cartPayload";
import { logger } from "../../services/logger";

// V3-003: Voice overlay wired to real voice services
// V3-FIX-120: Voice confirm now adds to cart through canonical builder

type VoiceOverlayV3Props = {
  visible: boolean;
  onClose: () => void;
  onProductMatched: (productName: string, quantity: number) => void;
};

type VoiceState = "idle" | "listening" | "processing" | "matched" | "error";

export default function VoiceOverlayV3({ visible, onClose, onProductMatched }: VoiceOverlayV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [state, setState] = useState<VoiceState>("listening");
  const [transcript, setTranscript] = useState("");
  const [matchedProduct, setMatchedProduct] = useState("");
  const [matchedQty, setMatchedQty] = useState(1);
  // GCP-STG-0027: Track matched product price for display
  const [matchedPrice, setMatchedPrice] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for mic icon
  useEffect(() => {
    if (state !== "listening") { pulseAnim.setValue(1); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [state, pulseAnim]);

  // V3-003: Real voice flow — startRecording on visible, submit on stop
  useEffect(() => {
    if (!visible) { setState("idle"); setTranscript(""); setMatchedProduct(""); return; }
    let cancelled = false;

    const runVoice = async () => {
      try {
        setState("listening");
        await startRecording();
        // Wait for user to tap confirm or auto-stop triggers
      } catch (err) {
        if (!cancelled) {
          if (err instanceof VoiceRateLimitError) {
            showToast("Voice rate limited — try again in a moment");
          } else {
            logger.debug("VoiceV3", `start_failed:${String(err)}`);
          }
          setState("error");
        }
      }
    };
    void runVoice();

    return () => { cancelled = true; void cancelRecording().catch(() => {}); };
  }, [visible]);

  // Submit recording and get result
  const handleStopAndSubmit = useCallback(async () => {
    setState("processing");
    try {
      // submitVoiceCommand needs storeId — get from device session
      const { getDeviceStoreId } = require("../../services/deviceSession");
      const storeId = await getDeviceStoreId();
      // PD-027: Pass current app language locale for Hindi/English voice recognition
      const i18nLang = require("../../i18n").default?.language ?? "en";
      const voiceLocale = i18nLang.startsWith("hi") ? "HI" : "EN";
      const result: VoiceCommandResult = await submitVoiceCommand(storeId ?? "", voiceLocale);
      const intent = result.intent;
      const productName = intent?.productName ?? intent?.slots?.query ?? "";
      const qty = intent?.quantity ?? intent?.slots?.quantity ?? 1;
      if (result.success && productName) {
        setTranscript(result.transcript ?? "");
        setMatchedProduct(productName);
        setMatchedQty(qty);
        // GCP-STG-0027: Look up price for display
        const products = useProductsStore.getState().products;
        const priceMatch = products.find((p) => p.name.toLowerCase() === productName.toLowerCase())
          ?? products.find((p) => p.name.toLowerCase().includes(productName.toLowerCase()));
        setMatchedPrice(priceMatch?.priceMinor ?? 0);
        setState("matched");
        logger.debug("VoiceV3", `matched:${productName},qty:${qty}`);
      } else {
        setTranscript(result.transcript ?? result.message ?? "");
        setState("error");
        showToast(result.message || "Could not match product — try again");
      }
    } catch (err) {
      if (err instanceof VoiceTimeoutError) {
        showToast("Voice timed out");
      }
      setState("error");
      logger.debug("VoiceV3", `submit_failed:${String(err)}`);
    }
  }, []);

  // V3-FIX-120: Voice confirm adds to cart through canonical builder
  const handleConfirm = useCallback(() => {
    // Look up product by name in products store for full metadata
    const products = useProductsStore.getState().products;
    const match = products.find(
      (p) => p.name.toLowerCase() === matchedProduct.toLowerCase()
    ) ?? products.find(
      (p) => p.name.toLowerCase().includes(matchedProduct.toLowerCase())
    );

    if (match) {
      // Full product found — use canonical builder with all metadata
      const addItem = useCartStore.getState().addItem;
      const existing = useCartStore.getState().items.find(
        (i) => i.id === (match.barcode ?? match.id) || i.barcode === match.barcode
      );
      if (existing) {
        useCartStore.getState().updateQuantity(existing.id, existing.quantity + matchedQty);
      } else {
        addItem(buildCartItemFromVoice(match, matchedQty));
      }
      onProductMatched(matchedProduct, matchedQty);
      showToast(`${matchedProduct} ×${matchedQty} added`);
      onClose();
    } else {
      // V3-FIX-120: No product match — do NOT create synthetic zero-price cart line.
      // Show error state and let retailer retry or search manually.
      showToast(`"${matchedProduct}" not found in store — try search instead`);
      setState("error");
    }
  }, [matchedProduct, matchedQty, onProductMatched, onClose]);

  const handleRetry = useCallback(() => {
    setState("listening");
    setTranscript("");
    setMatchedProduct("");
    setMatchedPrice(0);
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close voice input">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>

          {/* Mic icon with pulse */}
          <Animated.View style={[styles.micCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
              <Rect x={9} y={2} width={6} height={12} rx={3} />
              <Path d="M5 10a7 7 0 0014 0" />
              <Path d="M12 18v4M9 22h6" />
            </Svg>
          </Animated.View>

          {/* State display */}
          {state === "listening" ? (
            <Text style={styles.stateText}>Listening...</Text>
          ) : state === "processing" ? (
            <Text style={styles.stateText}>Processing...</Text>
          ) : null}

          {/* Transcript */}
          {transcript ? (
            <Text style={styles.transcript}>{transcript}</Text>
          ) : null}

          {/* GCP-STG-0027: Match result — product name × qty + estimated price */}
          {state === "matched" ? (
            <View style={styles.matchBox}>
              <Text style={styles.matchText}>✓ {matchedProduct} × {matchedQty}</Text>
              {matchedPrice > 0 ? <Text style={styles.matchPrice}>₹{Math.round(matchedPrice * matchedQty / 100).toLocaleString("en-IN")}</Text> : null}
            </View>
          ) : null}

          {/* Action buttons */}
          {/* V3-FIX-068: Action buttons matching prototype — Add, Retry */}
          {state === "listening" ? (
            <Pressable style={styles.confirmBtn} onPress={handleStopAndSubmit}>
              <Text style={styles.confirmText}>Done</Text>
            </Pressable>
          ) : null}
          {state === "matched" ? (
            <View style={styles.actionRow}>
              <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmText}>✓ Add</Text>
              </Pressable>
              <Pressable style={styles.retryBtn} onPress={handleRetry}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {state === "error" ? (
            <Pressable style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}

          {/* Language hint */}
          <Text style={styles.hint}>Hindi + English supported{"\n"}"Maggi teen" · "2 doodh packet" · "bill karo"</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.85)", justifyContent: "center", padding: 20 },
    sheet: { backgroundColor: "rgba(15,23,42,0.95)", borderRadius: 24, padding: getScreenPadding() * 2, alignItems: "center" },
    closeBtn: { position: "absolute", top: 12, right: 16 },
    closeText: { color: "rgba(255,255,255,0.5)", fontSize: 18, fontWeight: "700" },
    micCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    stateText: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "500" },
    transcript: { color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 16, letterSpacing: -0.3 },
    matchBox: { backgroundColor: colors.success, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 16 },
    matchText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    matchPrice: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600", marginTop: 2 },
    actionRow: { flexDirection: "row", gap: 10, marginTop: 20, width: "100%" },
    confirmBtn: { flex: 1, backgroundColor: colors.success, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
    confirmText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    retryBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
    retryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    hint: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "500", textAlign: "center", marginTop: 20, lineHeight: 16 },
  });
}
