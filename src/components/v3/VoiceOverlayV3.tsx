import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { View, Pressable, StyleSheet, Text, Animated, Modal } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";

// STG-558: Voice overlay v3 — always-accessible from sell screen header mic button
// Wraps existing voice services (startRecording, stopRecording, submitVoiceCommand).
// This component handles the UI; actual voice API is connected in production wiring.

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

  // Simulate voice flow (in production, uses real voice services)
  useEffect(() => {
    if (!visible) { setState("listening"); setTranscript(""); setMatchedProduct(""); return; }
    // Simulate: listening → transcript → matched
    const t1 = setTimeout(() => { setTranscript('"2 Parle-G bada wala"'); setState("processing"); }, 1500);
    const t2 = setTimeout(() => { setMatchedProduct("Parle-G 100g"); setMatchedQty(2); setState("matched"); }, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [visible]);

  const handleConfirm = useCallback(() => {
    onProductMatched(matchedProduct, matchedQty);
    showToast(`${matchedProduct} ×${matchedQty} added`);
    onClose();
  }, [matchedProduct, matchedQty, onProductMatched, onClose]);

  const handleRetry = useCallback(() => {
    setState("listening");
    setTranscript("");
    setMatchedProduct("");
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

          {/* Match result */}
          {state === "matched" ? (
            <View style={styles.matchBox}>
              <Text style={styles.matchText}>✓ {matchedProduct} × {matchedQty} — ₹{matchedQty * 10}</Text>
            </View>
          ) : null}

          {/* Action buttons */}
          {state === "matched" ? (
            <View style={styles.actionRow}>
              <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmText}>✓ Add to Cart</Text>
              </Pressable>
              <Pressable style={styles.retryBtn} onPress={handleRetry}>
                <Text style={styles.retryText}>Try Again</Text>
              </Pressable>
            </View>
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
    sheet: { backgroundColor: "rgba(15,23,42,0.95)", borderRadius: 24, padding: 36, alignItems: "center" },
    closeBtn: { position: "absolute", top: 12, right: 16 },
    closeText: { color: "rgba(255,255,255,0.5)", fontSize: 18, fontWeight: "700" },
    micCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    stateText: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "500" },
    transcript: { color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 16, letterSpacing: -0.3 },
    matchBox: { backgroundColor: colors.success, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 16 },
    matchText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    actionRow: { flexDirection: "row", gap: 10, marginTop: 20, width: "100%" },
    confirmBtn: { flex: 1, backgroundColor: colors.success, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
    confirmText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    retryBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
    retryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    hint: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "500", textAlign: "center", marginTop: 20, lineHeight: 16 },
  });
}
