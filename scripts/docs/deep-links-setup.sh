#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0652 — Deep Links Configuration Documentation
# ────────────────────────────────────────────────────────────────
# Documents universal links (iOS) and app links (Android)
# configuration for the SuperMandi POS app.
#
# Usage:  bash scripts/docs/deep-links-setup.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'DOCS'
================================================================
  DEEP LINKS SETUP — SuperMandi POS App
================================================================

1. ANDROID APP LINKS — Intent Filter
---------------------------------------

  File: android/app/src/main/AndroidManifest.xml

  Add inside the <activity> that has android.intent.action.MAIN:

  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
      android:scheme="https"
      android:host="pos.supermandi.tech"
      android:pathPrefix="/" />
  </intent-filter>

  <!-- Custom scheme for development/testing -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="supermandi" android:host="pos" />
  </intent-filter>

2. DIGITAL ASSET LINKS (Android Verification)
------------------------------------------------

  File to host: https://pos.supermandi.tech/.well-known/assetlinks.json

  Content:
  [
    {
      "relation": ["delegate_permission/common.handle_all_urls"],
      "target": {
        "namespace": "android_app",
        "package_name": "com.supermandi.pos",
        "sha256_cert_fingerprints": [
          "<SHA-256 fingerprint from your signing key>"
        ]
      }
    }
  ]

  To get the SHA-256 fingerprint:
    keytool -list -v -keystore android/app/release.keystore -alias supermandi

  Verification:
    # Test with adb
    adb shell am start -a android.intent.action.VIEW \
      -d "https://pos.supermandi.tech/order/12345" com.supermandi.pos

    # Check verification status
    adb shell pm get-app-links com.supermandi.pos

3. iOS UNIVERSAL LINKS (Future — When iOS Build Added)
--------------------------------------------------------

  File: apple-app-site-association (AASA)
  Host: https://pos.supermandi.tech/.well-known/apple-app-site-association

  Content (no .json extension, but JSON format):
  {
    "applinks": {
      "apps": [],
      "details": [
        {
          "appID": "<TEAM_ID>.com.supermandi.pos",
          "paths": [
            "/order/*",
            "/product/*",
            "/store/*",
            "/settings/*"
          ]
        }
      ]
    }
  }

  Xcode configuration:
    1. Capabilities > Associated Domains
    2. Add: applinks:pos.supermandi.tech

4. EXPO / REACT NAVIGATION DEEP LINK CONFIG
----------------------------------------------

  File: src/navigation/linking.ts (or App.tsx)

  const linking = {
    prefixes: [
      'https://pos.supermandi.tech',
      'supermandi://pos',
    ],
    config: {
      screens: {
        // ── Order Deep Links ──
        OrderDetail: {
          path: 'order/:orderId',
          parse: { orderId: String },
        },
        // ── Product Deep Links ──
        ProductDetail: {
          path: 'product/:productId',
          parse: { productId: String },
        },
        // ── Store Deep Links ──
        StoreSettings: {
          path: 'store/settings',
        },
        // ── Sale Deep Links ──
        SaleReceipt: {
          path: 'sale/:saleId/receipt',
          parse: { saleId: String },
        },
      },
    },
  };

  // In NavigationContainer:
  <NavigationContainer linking={linking} fallback={<LoadingScreen />}>

5. COMMON USE CASES
---------------------

  Use Case 1: Open Specific Order
    URL:    https://pos.supermandi.tech/order/ORD-2026-001
    Custom: supermandi://pos/order/ORD-2026-001
    Action: Navigate to OrderDetail screen with orderId param

  Use Case 2: Navigate to Product
    URL:    https://pos.supermandi.tech/product/SKU-12345
    Custom: supermandi://pos/product/SKU-12345
    Action: Navigate to ProductDetail screen with productId param

  Use Case 3: Open Sale Receipt
    URL:    https://pos.supermandi.tech/sale/SALE-001/receipt
    Custom: supermandi://pos/sale/SALE-001/receipt
    Action: Navigate to SaleReceipt screen, auto-print if configured

  Use Case 4: Open Store Settings
    URL:    https://pos.supermandi.tech/store/settings
    Custom: supermandi://pos/store/settings
    Action: Navigate to Settings screen

  Use Case 5: Notification Tap → Order
    Push notification payload includes:
    { "data": { "deepLink": "supermandi://pos/order/ORD-2026-001" } }
    App handles in notification handler → navigate to order

6. TESTING DEEP LINKS
------------------------

  Android (adb):
    adb shell am start -a android.intent.action.VIEW \
      -d "supermandi://pos/order/ORD-001" com.supermandi.pos

  Expo Go (development):
    npx uri-scheme open "supermandi://pos/order/ORD-001" --android

  React Navigation testing:
    # In __tests__:
    import { getStateFromPath } from '@react-navigation/native';
    const state = getStateFromPath('order/ORD-001', linking.config);
    expect(state.routes[0].name).toBe('OrderDetail');
    expect(state.routes[0].params.orderId).toBe('ORD-001');

7. GCP HOSTING — .well-known Files
-------------------------------------

  For Cloud Run, serve the .well-known files via the API gateway
  or a GCS bucket fronted by Cloud CDN:

  # Option A: API Gateway route
  app.get('/.well-known/assetlinks.json', (req, res) => {
    res.json([{ /* asset links content */ }]);
  });

  # Option B: GCS bucket
  gsutil cp assetlinks.json gs://supermandi-static/.well-known/
  # Configure Cloud CDN to serve from this bucket

  Important: .well-known files MUST be served with:
    Content-Type: application/json
    No redirects (must be direct 200 response)
    Valid HTTPS certificate

================================================================
  END OF DEEP LINKS DOCUMENTATION
================================================================
DOCS
