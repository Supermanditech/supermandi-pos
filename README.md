# SuperMandi POS - Android Handheld POS Application

Production-grade Android handheld POS app built with Expo (React Native) and TypeScript.

## Project Foundation

This project includes the following foundation components:

### ✅ Core Setup
- Expo React Native with TypeScript
- Configured for Android handheld POS devices (5-8 inch screens)
- Portrait-only orientation
- Camera access disabled

### ✅ Global Systems

#### Theme System
- **Primary Color**: POS Green (#10B981)
- **High Contrast Text**: Optimized for readability
- **Large Typography**: Designed for handheld devices
- **Spacing & Shadows**: Consistent design tokens

Location: [`src/theme/`](src/theme/index.ts)

#### Event Logger
- **Offline-first**: All events stored locally
- **Event Types**: App lifecycle, cart actions, checkout, payments, printing
- **Storage**: AsyncStorage with 1000 event limit
- **Export**: JSON export capability

Location: [`src/services/eventLogger.ts`](src/services/eventLogger.ts)

#### Cart Store
- **State Management**: Zustand
- **Features**: 
  - Add/remove items
  - Update quantities
  - Apply discounts (percentage or fixed)
  - Auto-calculated subtotal, discount, and total
- **Event Logging**: All cart actions logged

Location: [`src/stores/cartStore.ts`](src/stores/cartStore.ts)

#### Haptic Feedback
- **Utility Functions**: Light, medium, heavy impacts
- **Notifications**: Success, warning, error
- **Selection**: For picker/selector changes

Location: [`src/utils/haptics.ts`](src/utils/haptics.ts)

#### Printer Service (Stub)
- **Placeholder Implementation**: Ready for actual printer integration
- **Features**: Print receipts, reports, test prints
- **Status Tracking**: Connection and paper availability

Location: [`src/services/printerService.ts`](src/services/printerService.ts)

### ✅ Navigation
- React Navigation (Stack Navigator)
- Themed header with POS green
- Ready for screen implementation

## Installation

```bash
npm install
```

## Backend (Express + Prisma)

Backend lives in [`backend/`](backend/package.json) and provides:

- SQLite-backed persistence via Prisma
- JWT authentication
- REST APIs for products and transactions

### Backend setup

```bash
cd backend
npm install

# create local db + generate prisma client
# macOS/Linux
cp .env.example .env

# Windows (cmd.exe)
copy .env.example .env
npx prisma migrate dev

# run the api
npm run dev
```

### Backend environment variables

See [`backend/.env.example`](backend/.env.example):

- `PORT` (default `3001`)
- `DATABASE_URL` (default `file:./dev.db`)
- `JWT_SECRET` (required)

### Backend API routes

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (requires `Authorization: Bearer <token>`)
- `GET /api/users/me` (requires auth)
- `GET /api/products?barcode=...` / `GET /api/products?q=...` (requires auth)
- `POST /api/products` (requires auth)
- `PATCH /api/products/:id` (requires auth)
- `DELETE /api/products/:id` (soft delete, requires auth)
- `GET /api/transactions?take=50` (requires auth)
- `POST /api/transactions` (requires auth)

Transaction creation (`POST /api/transactions`) expects:

```json
{
  "paymentMethod": "CASH",
  "currency": "AED",
  "items": [{ "productId": "...", "quantity": 2 }]
}
```

## Frontend ↔ Backend integration

### API base URL

Frontend uses [`API_BASE_URL`](src/config/api.ts:1) for the backend base URL.

**No URLs are hardcoded in the app code**: you must set `EXPO_PUBLIC_API_URL` per environment.

Set this when running on a physical device:

```bash
# example (Windows cmd.exe)
set EXPO_PUBLIC_API_URL=http://192.168.1.10:3001
npm start
```

For this PC on Wi‑Fi, the LAN IPv4 is `192.168.31.66`, so use:

```bash
set EXPO_PUBLIC_API_URL=http://192.168.31.66:3001
npm start
```

You can also copy [`/.env.example`](.env.example:1) to `/.env` for local dev.

### Backend reachability from a real device (LAN)

1) Ensure backend listens on all interfaces (`0.0.0.0`). This is now explicit in [`backend/src/server.ts`](backend/src/server.ts:1).

2) Start backend:

```bash
cd backend
npm run dev
```

3) From the phone/POS device browser (same Wi‑Fi), open:

`http://192.168.31.66:3001/health`

If it doesn’t load, Windows Firewall is blocking inbound traffic on port 3001. You must allow it (Windows requires Administrator privileges to add a rule).

### Android dev/test HTTP networking (cleartext)

For dev/test APKs, HTTP is allowed by setting `usesCleartextTraffic: true` in [`app.json`](app.json:17).

Production builds should disable cleartext and use HTTPS.

### Offline-first behavior (current)

- Products: fetched from backend, cached in AsyncStorage, then loaded from cache if offline.
- Sales (transactions): on checkout, app tries to POST to backend; if it fails (offline/server down), it queues the sale locally and auto-syncs when connectivity returns.

Implementation:

- API client: [`src/services/api/apiClient.ts`](src/services/api/apiClient.ts)
- Product caching: [`src/stores/productsStore.ts`](src/stores/productsStore.ts)
- Offline transaction queue + auto-sync: [`src/services/syncService.ts`](src/services/syncService.ts)

## Running the App

```bash
# Start Expo development server
npm start

# Run on Android device/emulator
npm run android
```

## Project Structure

```
supermandi-pos/
├── src/
│   ├── theme/           # Global theme system
│   ├── services/        # Event logger, printer service
│   ├── stores/          # Zustand stores (cart)
│   └── utils/           # Haptic feedback utilities
├── App.tsx              # Main app entry with navigation
├── app.json             # Expo configuration
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript configuration
```

## Next Steps

The foundation is complete. Next phase will include:
- UI Screens (Home, Products, Cart, Checkout)
- Product management
- Payment processing
- Receipt generation
- Offline sync capabilities

## Technical Stack

- **Framework**: Expo SDK 52
- **Language**: TypeScript
- **Navigation**: React Navigation 6
- **State Management**: Zustand
- **Storage**: AsyncStorage
- **Haptics**: expo-haptics
- **Camera**: expo-camera (QR/Barcode scanning)
- **Target Platform**: Android (Handheld POS devices)

## Test QR Codes & Barcodes

Use these codes to test the scanning functionality:

### QR Code Test
**Code**: `QR_PRODUCT_C`
**Product**: QR Product C - ₹79.99

### Barcode Test
**Code**: `BAR_PRODUCT_D`
**Product**: Barcode Product D - ₹199.99

### How to Test
1. Generate QR codes/barcodes using online tools with the codes above
2. Use Redmi 13C camera to scan them
3. Or click the "Test QR Code" / "Test Barcode" buttons in the app
4. Each scan adds one product to the cart

## UPI Payment Configuration

### For Testing
- **UPI ID**: `sharmakirana@upi` (fake for testing)
- **Dynamic QR Codes**: Automatically generated on Payment screen
- **UPI String Format**: `upi://pay?pa={UPI_ID}&pn=Sharma%20Kirana%20Store&am={amount}&cu=INR&tn=Bill%20{billNumber}`

### For Production Deployment
1. Open `src/screens/PaymentScreen.tsx`
2. Change the `RETAILER_UPI_ID` constant to your actual UPI ID:
   ```typescript
   const RETAILER_UPI_ID = "youractualupi@bank"; // Replace with real UPI ID
   ```
3. QR codes will be automatically generated for all payments

### QR Code Features
- **Real-time Generation**: QR codes update automatically with cart total
- **UPI Compatible**: Works with all UPI apps (Google Pay, PhonePe, Paytm, etc.)
- **Professional Display**: Clean UI with amount and merchant details
- **Error Handling**: Fallback display if QR generation fails
