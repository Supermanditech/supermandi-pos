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
- **Target Platform**: Android (Handheld POS devices)
