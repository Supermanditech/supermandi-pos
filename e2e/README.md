# SuperMandi POS E2E Tests

End-to-end tests using Maestro for the SuperMandi POS application.

## Prerequisites

1. Install Maestro CLI:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. Start the app on a device or emulator:
   ```bash
   npx expo start --android
   # or
   npx expo run:android
   ```

## Running Tests

Run all flows:
```bash
maestro test e2e/
```

Run specific flow:
```bash
maestro test e2e/sellFlow.yaml
maestro test e2e/buyFlow.yaml
maestro test e2e/reorderFlow.yaml
maestro test e2e/grnFlow.yaml
```

Run with verbose output:
```bash
maestro test --debug-output e2e/sellFlow.yaml
```

## Test Flows

| Flow | Description |
|------|-------------|
| `sellFlow.yaml` | Complete SELL cycle: scan/search product, add to cart, apply discount, checkout |
| `buyFlow.yaml` | Complete BUY cycle: browse catalog, add to cart, create purchase order |
| `reorderFlow.yaml` | REORDER cycle: view pending reorders, select items, approve to cart |
| `grnFlow.yaml` | GRN cycle: select order, enter received quantities, submit GRN |

## Environment Variables

Tests can be configured via environment variables:

```bash
export TEST_PHONE="+919999900001"
export TEST_PIN="1234"
maestro test e2e/
```

## Test Data Requirements

Tests assume the following test data exists in the backend:
- Test staff user with phone `+919999900001` and PIN `1234`
- Products with barcodes starting with `890123456789`
- At least one supplier with products
- At least one pending reorder (for reorder flow)
- At least one confirmed order (for GRN flow)

## CI/CD Integration

For headless CI/CD runs:
```bash
maestro test --format junit --output results.xml e2e/
```

## Troubleshooting

1. **App not found**: Ensure app is running on device/emulator
2. **Element not found**: Check if testID matches or use `launchApp` command
3. **Timeout**: Increase wait times with `extendedWaitUntil`
