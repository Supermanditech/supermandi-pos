import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { composePosMessage, getPrimaryTone, type UiStatus } from "../utils/uiStatus";
import { formatStoreName } from "../utils/storeName";
import { theme } from "../theme";

type PosStatusBarProps = {
  storeActive?: boolean | null;
  deviceActive?: boolean | null;
  pendingOutboxCount?: number | null;
  mode?: "SELL" | "DIGITISE";
  storeName?: string | null;
  storeId?: string | null;
  storeCode?: string | null; // GO-LIVE: Human-readable store code (e.g., "MUM-ANH-001")
  printerOk?: boolean | null;
  scannerOk?: boolean | null;
  cameraAvailable?: boolean | null;
  // STG-017: Staff name/role display
  staffName?: string | null;
  staffRole?: string | null;
};

type StatusPopover = {
  type: "network" | "printer" | "scanner" | "camera";
  anchor: { x: number; y: number; width: number; height: number };
};

const POPOVER_DEFAULT_WIDTH = 120;
const POPOVER_DEFAULT_HEIGHT = 44;
const POPOVER_OFFSET = 6;
const POPOVER_MARGIN = 8;
const POPOVER_ARROW_SIZE = 10;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// STG-036: Format current time as HH:MM
function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default function PosStatusBar({
  storeActive,
  deviceActive,
  pendingOutboxCount,
  mode,
  storeName,
  storeId,
  storeCode,
  printerOk,
  scannerOk,
  cameraAvailable,
  staffName,
  staffRole,
}: PosStatusBarProps) {
  const [popover, setPopover] = useState<StatusPopover | null>(null);
  const [popoverSize, setPopoverSize] = useState<{ width: number; height: number } | null>(null);
  const [networkState, setNetworkState] = useState<{
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }>({ isConnected: true, isInternetReachable: true });
  const networkRef = useRef<View>(null);
  const printerRef = useRef<View>(null);
  const scannerRef = useRef<View>(null);
  const cameraRef = useRef<View>(null);
  const popoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // STG-036: Live clock display
  const [currentTime, setCurrentTime] = useState(() => formatTime(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(formatTime(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);

  // FIX-032: Mounted ref prevents setState after unmount if callback fires during cleanup
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!mountedRef.current) return;
      setNetworkState({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null
      });
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const tones = {
    success: {
      bg: theme.colors.successSoft,
      border: theme.colors.success,
      text: theme.colors.success
    },
    error: {
      bg: theme.colors.errorSoft,
      border: theme.colors.error,
      text: theme.colors.error
    },
    warning: {
      bg: theme.colors.warningSoft,
      border: theme.colors.warning,
      text: theme.colors.warning
    },
    neutral: {
      bg: theme.colors.surfaceAlt,
      border: theme.colors.border,
      text: theme.colors.textSecondary
    }
  } as const;

  const pendingCount =
    typeof pendingOutboxCount === "number" && Number.isFinite(pendingOutboxCount)
      ? pendingOutboxCount
      : 0;
  const networkOnline =
    networkState.isConnected !== false && networkState.isInternetReachable !== false;
  const status: UiStatus = {
    storeActive: storeActive ?? null,
    deviceActive: deviceActive ?? null,
    pendingOutboxCount: pendingCount,
    networkOnline,
    printerOk: printerOk ?? null,
    scannerOk: scannerOk ?? null,
    cameraAvailable: cameraAvailable ?? null,
    mode
  };
  const statusMessage = composePosMessage(status);
  const statusTone = tones[getPrimaryTone(status)];
  const storeLabel = formatStoreName(storeName) ?? "Store";
  // GO-LIVE: Show storeCode (human-readable) if available, otherwise truncated UUID
  const storeIdLabel = storeCode || (storeId ? storeId.slice(-8) : "--");

  const iconActiveColor = theme.colors.textSecondary;
  const iconInactiveColor = theme.colors.textTertiary;
  // STG-005: Larger icons for readability
  const iconSize = 14;

  const networkConnected =
    networkState.isConnected !== false && networkState.isInternetReachable !== false;
  const networkIcon = networkConnected ? "wifi" : "wifi-off";
  const networkLabel = networkConnected ? "Network connected" : "Network disconnected";

  const printerReady = printerOk === true;
  const printerIcon = printerReady ? "printer" : "printer-off";
  const printerLabel = printerReady ? "Printer connected" : "Printer disconnected";

  const scannerDetected = scannerOk === true;
  const scannerIcon = scannerDetected ? "barcode-scan" : "barcode-off";
  const scannerLabel = scannerDetected ? "HID scanner connected" : "HID scanner not detected";

  // DEV-059: Camera status split from scanner
  const cameraReady = cameraAvailable === true;
  const cameraIcon: React.ComponentProps<typeof MaterialCommunityIcons>["name"] = cameraReady ? "camera" : "camera-off";
  const cameraLabel = cameraReady ? "Camera available" : "Camera not available";

  const closePopover = useCallback(() => {
    setPopover(null);
  }, []);

  const openPopover = useCallback(
    (type: StatusPopover["type"]) => {
      if (popover?.type === type) {
        setPopover(null);
        return;
      }
      setPopoverSize(null);
      const ref =
        type === "network" ? networkRef : type === "printer" ? printerRef : type === "scanner" ? scannerRef : cameraRef;
      if (!ref.current) {
        setPopover({ type, anchor: { x: POPOVER_MARGIN, y: 0, width: 16, height: 16 } });
        return;
      }
      ref.current.measureInWindow((x, y, width, height) => {
        setPopover({ type, anchor: { x, y, width, height } });
      });
    },
    [popover],
  );

  useEffect(() => {
    if (!popover) {
      if (popoverTimerRef.current) {
        clearTimeout(popoverTimerRef.current);
        popoverTimerRef.current = null;
      }
      return;
    }
    if (popoverTimerRef.current) {
      clearTimeout(popoverTimerRef.current);
    }
    popoverTimerRef.current = setTimeout(() => {
      setPopover(null);
      popoverTimerRef.current = null;
    }, 2000);
    return () => {
      if (popoverTimerRef.current) {
        clearTimeout(popoverTimerRef.current);
        popoverTimerRef.current = null;
      }
    };
  }, [popover]);

  const handlePopoverLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout;
    setPopoverSize((prev) => {
      if (prev && prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  const statusItems = useMemo(() => {
    return [
      {
        id: "network",
        label: "Network",
        ok: networkConnected,
        okLabel: "Online",
        badLabel: "Offline",
        icon: networkIcon,
        tone: networkConnected ? theme.colors.success : theme.colors.error,
      },
      {
        id: "printer",
        label: "Printer",
        ok: printerReady,
        okLabel: "Connected",
        badLabel: "Not connected",
        icon: printerIcon,
        tone: printerReady ? theme.colors.success : theme.colors.warning,
      },
      {
        id: "scanner",
        label: "HID Scanner",
        ok: scannerDetected,
        okLabel: "Connected",
        badLabel: "Not detected",
        icon: scannerIcon,
        tone: scannerDetected ? theme.colors.success : theme.colors.warning,
      },
      {
        id: "camera",
        label: "Camera",
        ok: cameraReady,
        okLabel: "Available",
        badLabel: "Not available",
        icon: cameraIcon,
        tone: cameraReady ? theme.colors.success : theme.colors.warning,
      },
    ];
  }, [networkConnected, networkIcon, printerReady, printerIcon, scannerDetected, scannerIcon, cameraReady, cameraIcon]);

  const popoverItem = useMemo(() => {
    if (!popover) return null;
    return statusItems.find((item) => item.id === popover.type) ?? null;
  }, [popover, statusItems]);

  const popoverLayout = useMemo(() => {
    if (!popover) return null;
    const popoverWidth = popoverSize?.width ?? POPOVER_DEFAULT_WIDTH;
    const popoverHeight = popoverSize?.height ?? POPOVER_DEFAULT_HEIGHT;
    const { x, y, width, height } = popover.anchor;
    const anchorCenter = x + width / 2;
    let left = anchorCenter - popoverWidth / 2;
    left = clamp(left, POPOVER_MARGIN, windowWidth - popoverWidth - POPOVER_MARGIN);
    let top = y + height + POPOVER_OFFSET;
    if (top + popoverHeight > windowHeight - POPOVER_MARGIN) {
      top = Math.max(POPOVER_MARGIN, y - POPOVER_OFFSET - popoverHeight);
    }
    const arrowLeft = clamp(
      anchorCenter - left - POPOVER_ARROW_SIZE / 2,
      POPOVER_ARROW_SIZE,
      popoverWidth - POPOVER_ARROW_SIZE * 2,
    );
    return { left, top, arrowLeft };
  }, [popover, popoverSize, windowHeight, windowWidth]);

  return (
    <>
      <View
        style={styles.container}
      >
        {/* STG-052: Store name row with truncation handling */}
        <View style={styles.storeRow} pointerEvents="none">
          <Text
            style={styles.storeName}
            numberOfLines={1}
            ellipsizeMode="tail"
            testID="status-bar-store-name"
          >
            {storeLabel}
          </Text>
          {/* STG-036: Date/time display */}
          <Text style={styles.timeText} testID="status-bar-time">{currentTime}</Text>
        </View>

        {/* STG-017: Staff name/role + store code */}
        <View style={styles.metaRow} pointerEvents="none">
          {staffName ? (
            <Text style={styles.staffText} numberOfLines={1} testID="status-bar-staff">
              {staffName}{staffRole ? ` · ${staffRole}` : ""}
            </Text>
          ) : null}
          <Text style={styles.storeCodeText} numberOfLines={1}>
            {storeIdLabel}
          </Text>
        </View>

        {/* STG-005: Decluttered icon row with labels (STG-067) */}
        <View style={styles.iconRow} pointerEvents="box-none">
          <Pressable
            ref={networkRef}
            collapsable={false}
            focusable={false}
            accessible
            accessibilityLabel={networkLabel}
            accessibilityRole="button"
            onPress={(e) => { e.stopPropagation(); openPopover("network"); }}
            hitSlop={8}
            style={styles.iconWithLabel}
          >
            <MaterialCommunityIcons name={networkIcon} size={iconSize} color={networkConnected ? iconActiveColor : iconInactiveColor} />
            <Text style={[styles.iconLabel, { color: networkConnected ? iconActiveColor : iconInactiveColor }]}>Net</Text>
          </Pressable>

          <Pressable
            ref={printerRef}
            collapsable={false}
            focusable={false}
            accessible
            accessibilityLabel={printerLabel}
            accessibilityRole="button"
            onPress={(e) => { e.stopPropagation(); openPopover("printer"); }}
            hitSlop={8}
            style={styles.iconWithLabel}
          >
            <MaterialCommunityIcons name={printerIcon} size={iconSize} color={printerReady ? iconActiveColor : iconInactiveColor} />
            <Text style={[styles.iconLabel, { color: printerReady ? iconActiveColor : iconInactiveColor }]}>Print</Text>
          </Pressable>

          <Pressable
            ref={scannerRef}
            collapsable={false}
            focusable={false}
            accessible
            accessibilityLabel={scannerLabel}
            accessibilityRole="button"
            onPress={(e) => { e.stopPropagation(); openPopover("scanner"); }}
            hitSlop={8}
            style={styles.iconWithLabel}
          >
            <MaterialCommunityIcons name={scannerIcon} size={iconSize} color={scannerDetected ? iconActiveColor : iconInactiveColor} />
            <Text style={[styles.iconLabel, { color: scannerDetected ? iconActiveColor : iconInactiveColor }]}>Scan</Text>
          </Pressable>

          {/* STG-049: Camera icon with label */}
          <Pressable
            ref={cameraRef}
            collapsable={false}
            focusable={false}
            accessible
            accessibilityLabel={cameraLabel}
            accessibilityRole="button"
            onPress={(e) => { e.stopPropagation(); openPopover("camera"); }}
            hitSlop={8}
            style={styles.iconWithLabel}
          >
            <MaterialCommunityIcons name={cameraIcon} size={iconSize} color={cameraReady ? iconActiveColor : iconInactiveColor} />
            <Text style={[styles.iconLabel, { color: cameraReady ? iconActiveColor : iconInactiveColor }]}>Cam</Text>
          </Pressable>

          {/* STG-045: Larger status message */}
          <View style={[styles.statusPill, { backgroundColor: statusTone.bg, borderColor: statusTone.border }]}>
            <Text style={[styles.statusMessage, { color: statusTone.text }]} numberOfLines={1} testID="status-bar-message">
              {statusMessage}
            </Text>
          </View>
        </View>
      </View>

      {popover && popoverItem && popoverLayout ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={closePopover}
        >
          <Pressable style={styles.popoverOverlay} onPress={closePopover}>
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Pressable
                style={[
                  styles.popoverCard,
                  { left: popoverLayout.left, top: popoverLayout.top },
                ]}
                onPress={() => {}}
                onLayout={handlePopoverLayout}
              >
                <View style={[styles.popoverArrow, { left: popoverLayout.arrowLeft }]} />
                <Text style={styles.popoverLabel}>{popoverItem.label}</Text>
                <Text style={[styles.popoverValue, { color: popoverItem.tone }]}>
                  {popoverItem.ok ? popoverItem.okLabel : popoverItem.badLabel}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 2,
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  storeName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textTertiary,
    marginLeft: 8,
    fontVariant: ["tabular-nums"],
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  staffText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.primary,
    flex: 1,
  },
  storeCodeText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textTertiary,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "stretch",
    overflow: "visible",
  },
  iconWithLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    overflow: "visible",
  },
  iconLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusPill: {
    marginLeft: "auto",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusMessage: {
    fontSize: 11,
    fontWeight: "700",
  },
  popoverOverlay: {
    flex: 1,
  },
  popoverCard: {
    position: "absolute",
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
    ...theme.shadows.sm,
  },
  popoverArrow: {
    position: "absolute",
    top: -POPOVER_ARROW_SIZE / 2,
    width: POPOVER_ARROW_SIZE,
    height: POPOVER_ARROW_SIZE,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ rotate: "45deg" }],
  },
  popoverLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  popoverValue: {
    fontSize: 11,
    fontWeight: "700",
  },
});
