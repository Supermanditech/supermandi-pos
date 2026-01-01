import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  PixelRatio,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "../theme";

export type ScanSource = "CAMERA" | "HID";

export type HidConfig = {
  prefix?: string;
  suffix?: string;
  terminatorKeys?: string[];
  minLength?: number;
};

type ScanBarProps = {
  onScan: (value: string, source: ScanSource) => void;
  onOpenScanner?: () => void;
  disabled?: boolean;
  instruction?: string;
  hidConfig?: HidConfig;
  testID?: string;
};

const DEFAULT_INSTRUCTION = "Scan Product to Digitise Store/Sale Billing";

export default function ScanBar({
  onScan,
  onOpenScanner,
  disabled = false,
  instruction = DEFAULT_INSTRUCTION,
  hidConfig,
  testID,
}: ScanBarProps) {
  const inputRef = useRef<TextInput>(null);
  const bufferRef = useRef("");
  const lastCommitRef = useRef(0);
  const [inputValue, setInputValue] = useState("");
  const { height } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();

  const layout = useMemo(() => {
    const barHeight = Math.round(Math.max(56, Math.min(64, height * 0.08)));
    const radius = Math.round(barHeight / 2);
    const horizontalPadding = Math.round(barHeight * 0.22);
    const contentGap = Math.round(barHeight * 0.18);
    const iconButtonSize = Math.max(44, Math.round(barHeight * 0.75));
    const iconSize = Math.round(barHeight * 0.42);
    const barcodeSize = Math.round(barHeight * 0.36);
    const qrSize = Math.round(barHeight * 0.26);
    const textSize = Math.round(Math.max(14, Math.min(18, barHeight * 0.26 * fontScale)));
    const textLineHeight = Math.round(textSize * 1.2);

    return {
      barHeight,
      radius,
      horizontalPadding,
      contentGap,
      iconButtonSize,
      iconSize,
      barcodeSize,
      qrSize,
      textSize,
      textLineHeight,
    };
  }, [height, fontScale]);

  const focusInput = useCallback(() => {
    if (disabled) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [disabled]);

  useEffect(() => {
    if (disabled) {
      bufferRef.current = "";
      setInputValue("");
      return;
    }

    const timer = setTimeout(() => {
      focusInput();
    }, 80);

    return () => clearTimeout(timer);
  }, [disabled, focusInput]);

  const extractValue = useCallback(
    (raw: string, allowMissingSuffix: boolean) => {
      if (!raw) return null;
      let value = raw;

      if (hidConfig?.prefix) {
        const lastIndex = value.lastIndexOf(hidConfig.prefix);
        if (lastIndex === -1) {
          return null;
        }
        value = value.slice(lastIndex + hidConfig.prefix.length);
      }

      if (hidConfig?.suffix) {
        if (value.endsWith(hidConfig.suffix)) {
          value = value.slice(0, -hidConfig.suffix.length);
        } else if (!allowMissingSuffix) {
          return null;
        }
      }

      value = value.trim();
      if (!value) return null;
      if (hidConfig?.minLength && value.length < hidConfig.minLength) {
        return null;
      }

      return value;
    },
    [hidConfig]
  );

  const commitScan = useCallback(
    (raw: string, allowMissingSuffix: boolean) => {
      const now = Date.now();
      if (now - lastCommitRef.current < 60) return;
      lastCommitRef.current = now;

      const value = extractValue(raw, allowMissingSuffix);
      bufferRef.current = "";
      setInputValue("");

      if (value) {
        onScan(value, "HID");
      }
    },
    [extractValue, onScan]
  );

  const handleChangeText = (text: string) => {
    if (disabled) return;
    bufferRef.current = text;
    setInputValue(text);

    if (hidConfig?.suffix && text.endsWith(hidConfig.suffix)) {
      commitScan(text, false);
    }
  };

  const handleSubmitEditing = () => {
    if (disabled) return;
    commitScan(bufferRef.current, true);
  };

  const handleKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (disabled) return;
    const terminators = hidConfig?.terminatorKeys ?? ["Enter"];
    if (terminators.includes(event.nativeEvent.key)) {
      commitScan(bufferRef.current, true);
    }
  };

  const handlePress = () => {
    if (disabled) return;
    focusInput();
    onOpenScanner?.();
  };

  return (
    <View style={styles.wrapper} testID={testID}>
      <Pressable
        style={[
          styles.bar,
          {
            height: layout.barHeight,
            borderRadius: layout.radius,
            paddingHorizontal: layout.horizontalPadding,
            gap: layout.contentGap,
          },
          disabled && styles.barDisabled,
        ]}
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={instruction}
      >
        <Pressable
          onPress={handlePress}
          disabled={disabled}
          accessibilityRole="button"
          style={[
            styles.leftAction,
            {
              height: layout.iconButtonSize,
              width: layout.iconButtonSize,
              borderRadius: layout.iconButtonSize / 2,
            },
          ]}
        >
          <MaterialCommunityIcons name="camera-outline" size={layout.iconSize} color={theme.colors.textInverse} />
        </Pressable>

        <Text
          style={[
            styles.instruction,
            { fontSize: layout.textSize, lineHeight: layout.textLineHeight },
          ]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {instruction}
        </Text>

        <View
          style={[
            styles.rightIcons,
            {
              width: layout.iconButtonSize,
              height: layout.iconButtonSize,
              borderRadius: Math.round(layout.iconButtonSize * 0.3),
            },
          ]}
        >
          <MaterialCommunityIcons name="barcode-scan" size={layout.barcodeSize} color={theme.colors.primaryDark} />
          <View style={styles.qrBadge}>
            <MaterialCommunityIcons name="qrcode-scan" size={layout.qrSize} color={theme.colors.primary} />
          </View>
        </View>
      </Pressable>

      <TextInput
        ref={inputRef}
        value={inputValue}
        onChangeText={handleChangeText}
        onSubmitEditing={handleSubmitEditing}
        onKeyPress={handleKeyPress}
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        caretHidden
        contextMenuHidden
        editable={!disabled}
        inputMode="none"
        showSoftInputOnFocus={false}
        style={styles.hiddenInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  bar: {
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  barDisabled: {
    opacity: 0.55,
  },
  leftAction: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primaryDark,
  },
  instruction: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  rightIcons: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  qrBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
});
