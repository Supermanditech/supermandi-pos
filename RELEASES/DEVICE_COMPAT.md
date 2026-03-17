# SuperMandi POS — Device Compatibility

> PD-007 | 2026-03-17

## Supported Platforms

| Platform | Minimum | Recommended |
|----------|---------|-------------|
| Android | 6.0 (API 23) | 10.0+ (API 29+) |
| Expo SDK | 52 | 52 |
| React Native | 0.76 | 0.76 |
| Hermes | Enabled | Enabled |

## Screen Size Support

| Category | Size Range | Layout | Status |
|----------|-----------|--------|--------|
| Small phone | 4.5-5.5" (320-360dp) | 2-col product grid | SUPPORTED |
| Medium phone | 5.5-6.5" (360-411dp) | 3-col product grid | PRIMARY |
| Large phone | 6.5-7" (411-480dp) | 3-col product grid | SUPPORTED |
| Tablet | 7-10" (600-800dp) | 3-col (could be 4-col) | BASIC |

## Tested Devices

| Device | Screen | Resolution | Result |
|--------|--------|------------|--------|
| Xiaomi Redmi Note 13 Pro | 6.67" | 1080x2400 | PRIMARY TEST DEVICE |

## POS Device Compatibility (India Market)

| Device Type | Examples | Scanner | Status |
|-------------|---------|---------|--------|
| Android phone + HID scanner | Any Android + USB/BT scanner | HID keyboard mode | SUPPORTED |
| Android POS terminal | Sunmi V2, PAX A920 | Built-in laser | SUPPORTED (HID mode) |
| Tablet POS | Samsung Tab A, Lenovo Tab M10 | External scanner | SUPPORTED |
| Phone camera scan | Any Android with camera | expo-camera | SUPPORTED |

## UI Adaptations

| Feature | Small (<360dp) | Medium (360-411dp) | Large (>411dp) |
|---------|---------------|-------------------|----------------|
| Product grid | 2 columns | 3 columns | 3 columns |
| Cart strip | Full width | Full width | Full width |
| Bottom nav | 4 tabs (compact) | 4 tabs (standard) | 4 tabs (standard) |
| Search bar | Full width | Full width | Full width |
| Category chips | Horizontal scroll | Horizontal scroll | Horizontal scroll |

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| App launch to sell screen | <3s | ~2s (Redmi) |
| Product grid scroll (30 items) | 60fps | 60fps |
| Scan to cart add | <500ms | ~300ms |
| Cart open to payment | 2 taps | 2 taps |
| Full checkout flow | <10s | ~8s |

## Known Limitations

- No iOS support (Android only for v3 launch)
- Tablet layout uses same 3-col grid as phone (no tablet-optimized layout)
- HID scanner requires USB OTG or Bluetooth pairing
- Camera scan requires adequate lighting
