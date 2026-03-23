import React, { useRef, useEffect } from 'react';
import { TextInput, Platform, StyleSheet } from 'react-native';
import { feedHidText, isHidScanInProgress } from '../services/hidScannerService';

/**
 * GCP-STG-0519: Hidden TextInput that captures HID keyboard-emulation scanner input.
 *
 * On Android, HID barcode scanners appear as external keyboards. They send characters
 * rapidly followed by Enter. This component captures that input via a permanently-focused
 * hidden TextInput and feeds it into the HID scanner service buffer.
 *
 * Mount this at the app root level (App.tsx) so it captures input on ALL screens.
 */
export function HidKeyboardCapture() {
  if (Platform.OS !== 'android') return null;

  const inputRef = useRef<TextInput>(null);
  const valueRef = useRef('');

  // Re-focus periodically to ensure we capture HID input even after modals/navigation
  useEffect(() => {
    const interval = setInterval(() => {
      if (inputRef.current && !isHidScanInProgress()) {
        inputRef.current.focus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <TextInput
      ref={inputRef}
      style={styles.hidden}
      autoFocus
      blurOnSubmit={false}
      showSoftInputOnFocus={false}
      onChangeText={(text) => {
        valueRef.current = text;
        feedHidText(text);
      }}
      onSubmitEditing={() => {
        // Enter key pressed — HID scanner sends Enter after barcode
        // feedHidText already handles Enter via HID_TERMINATORS
        // Reset the input for next scan
        valueRef.current = '';
        // Clear with small delay to avoid race
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.clear();
          }
        }, 50);
      }}
      value=""
      testID="hid-keyboard-capture"
    />
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    // Move off-screen to prevent cursor blinking
    left: -1000,
    top: -1000,
  },
});
