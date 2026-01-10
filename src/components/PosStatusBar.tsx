import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Animated,
  Modal,
  PanResponder,
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
  printerOk?: boolean | null;
  scannerOk?: boolean | null;
  cameraAvailable?: boolean | null;
};

type StatusPopover = {
  type: "network" | "printer" | "scanner";
  anchor: { x: number; y: number; width: number; height: number };
};

const POPOVER_DEFAULT_WIDTH = 120;
const POPOVER_DEFAULT_HEIGHT = 44;
const POPOVER_OFFSET = 6;
const POPOVER_MARGIN = 8;
const POPOVER_ARROW_SIZE = 10;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function PosStatusBar({
  storeActive,
  deviceActive,
  pendingOutboxCount,
  mode,
  storeName,
  storeId,
  printerOk,
  scannerOk,
  cameraAvailable
}: PosStatusBarProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [popover, setPopover] = useState<StatusPopover | null>(null);
  const [popoverSize, setPopoverSize] = useState<{ width: number; height: number } | null>(null);
  const [networkState, setNetworkState] = useState<{
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }>({ isConnected: true, isInternetReachable: true });
  const networkRef = useRef<View>(null);
  const printerRef = useRef<View>(null);
  const scannerRef = useRef<View>(null);
  const popoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkState({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null
      });
    });

    return () => {
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
  const storeIdLabel = storeId ?? "--";

  const iconActiveColor = theme.colors.textSecondary;
  const iconInactiveColor = theme.colors.textTertiary;
  const iconSize = 12;

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

  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
    sheetTranslateY.setValue(0);
  }, [sheetTranslateY]);

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
        type === "network" ? networkRef : type === "printer" ? printerRef : scannerRef;
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

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy > 0) {
          sheetTranslateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 80 || gesture.vy > 1) {
          closeDetails();
          return;
        }
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    });
  }, [closeDetails, sheetTranslateY]);

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
    ];
  }, [networkConnected, networkIcon, printerReady, printerIcon, scannerDetected, scannerIcon]);

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
      <Pressable
        style={styles.container}
        focusable={false}
        onPress={() => {
          closePopover();
          setDetailsOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="System status details"
      >
        <View style={styles.iconRow} pointerEvents="box-none">
          <Pressable
            ref={networkRef}
            collapsable={false}
            focusable={false}
            accessible
            accessibilityLabel={networkLabel}
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              openPopover("network");
            }}
            hitSlop={8}
            style={styles.iconSlot}
          >
            <MaterialCommunityIcons
              name={networkIcon}
              size={iconSize}
              color={networkConnected ? iconActiveColor : iconInactiveColor}
            />
          </Pressable>

          <Pressable
            ref={printerRef}
            collapsable={false}
            focusable={false}
            accessible
            accessibilityLabel={printerLabel}
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              openPopover("printer");
            }}
            hitSlop={8}
            style={styles.iconSlot}
          >
            <MaterialCommunityIcons
              name={printerIcon}
              size={iconSize}
              color={printerReady ? iconActiveColor : iconInactiveColor}
            />
          </Pressable>

          <Pressable
            ref={scannerRef}
            collapsable={false}
            focusable={false}
            accessible
            accessibilityLabel={scannerLabel}
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              openPopover("scanner");
            }}
            hitSlop={8}
            style={styles.iconSlot}
          >
            <MaterialCommunityIcons
              name={scannerIcon}
              size={iconSize}
              color={scannerDetected ? iconActiveColor : iconInactiveColor}
            />
          </Pressable>
        </View>

        <View style={styles.storeInfo} pointerEvents="none">
          <Text
            style={styles.storeName}
            numberOfLines={2}
            ellipsizeMode="clip"
          >
            {storeLabel}
          </Text>
          <Text
            style={styles.storeMeta}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            ID {storeIdLabel}
            {" | "}
            <Text style={[styles.statusMessage, { color: statusTone.text }]}>{statusMessage}</Text>
          </Text>
        </View>
      </Pressable>

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

      <Modal
        visible={detailsOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDetails}
      >
        <View style={styles.detailsOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDetails} />
          <Animated.View
            style={[
              styles.detailsSheet,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.detailsHandle} />
            <Text style={styles.detailsTitle}>System status</Text>
            {statusItems.map((item) => (
              <View key={item.id} style={styles.detailsRow}>
                <MaterialCommunityIcons
                  name={item.icon}
                  size={18}
                  color={item.ok ? theme.colors.textPrimary : theme.colors.textSecondary}
                />
                <View style={styles.detailsRowText}>
                  <Text style={styles.detailsLabel}>{item.label}</Text>
                  <Text style={[styles.detailsValue, { color: item.tone }]}>
                    {item.ok ? item.okLabel : item.badLabel}
                  </Text>
                </View>
                <View style={[styles.detailsDot, { backgroundColor: item.tone }]} />
              </View>
            ))}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 32,
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    overflow: "visible",
  },
  iconSlot: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  storeInfo: {
    alignSelf: "stretch",
    marginTop: 4,
  },
  storeName: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  storeMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textTertiary,
  },
  statusMessage: {
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
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  popoverValue: {
    fontSize: 11,
    fontWeight: "700",
  },
  detailsOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 15, 20, 0.45)",
  },
  detailsSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 12,
  },
  detailsHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 6,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailsRowText: {
    flex: 1,
  },
  detailsLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  detailsValue: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
  },
  detailsDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});
