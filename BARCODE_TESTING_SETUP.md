# Barcode Testing Setup Guide

## Overview
This guide provides step-by-step instructions to populate the backend database with test products that match the frontend barcode/QR test actions.

## Problem
The POS app barcode scanning works correctly, but returns "Product Not Found" because the Product table is empty or missing matching barcodes.

## Solution
Seed the database with test products using exact barcodes that match the frontend test buttons.

---

## Prerequisites
- Backend server dependencies installed (`npm install` in `backend/` directory)
- Database file exists at `backend/prisma/dev.db`
- PowerShell or Command Prompt access

---

## Step-by-Step Instructions

### Option 1: Using npm seed script (Recommended)

1. **Open PowerShell or Command Prompt**

2. **Navigate to the backend directory:**
   ```powershell
   cd backend
   ```

3. **Run the seed script:**
   ```powershell
   npm run seed
   ```

4. **Expected output:**
   ```
   🌱 Starting database seed...
   ✅ Cleared X existing products
   ✅ Created product: Test Barcode Product (barcode: 0987654321)
   ✅ Created product: Test QR Product C (barcode: QR_PRODUCT_C)
   ✅ Created product: Test Barcode Product D (barcode: BAR_PRODUCT_D)

   🎉 Database seeding completed successfully!

   Test products available:
     1. Barcode: 0987654321 → Test Barcode Product (15.00 AED)
     2. Barcode: QR_PRODUCT_C → Test QR Product C (25.00 AED)
     3. Barcode: BAR_PRODUCT_D → Test Barcode Product D (30.00 AED)
   ```

5. **Restart the backend server** (if running):
   - Stop the server (Ctrl+C)
   - Start it again: `npm run dev`

---

### Option 2: Using Prisma Studio (Visual Interface)

1. **Open PowerShell in the backend directory:**
   ```powershell
   cd backend
   ```

2. **Launch Prisma Studio:**
   ```powershell
   npx prisma studio
   ```

3. **Browser will open at http://localhost:5555**

4. **Click on "Product" model in the left sidebar**

5. **Delete existing products** (if any):
   - Select all rows
   - Click "Delete X records"

6. **Add new products manually:**
   - Click "Add record" button
   - Fill in the following for each product:

   **Product 1:**
   - name: `Test Barcode Product`
   - barcode: `0987654321`
   - price: `1500`
   - currency: `AED`
   - stock: `100`
   - isActive: `true`

   **Product 2:**
   - name: `Test QR Product C`
   - barcode: `QR_PRODUCT_C`
   - price: `2500`
   - currency: `AED`
   - stock: `50`
   - isActive: `true`

   **Product 3:**
   - name: `Test Barcode Product D`
   - barcode: `BAR_PRODUCT_D`
   - price: `3000`
   - currency: `AED`
   - stock: `75`
   - isActive: `true`

7. **Click "Save X changes"** after adding all products

8. **Close Prisma Studio** and restart backend server

---

## Verification

### 1. Check via API endpoint

**Open PowerShell and test the API:**

```powershell
# Test barcode 0987654321
curl http://localhost:3001/api/products?barcode=0987654321

# Test barcode QR_PRODUCT_C
curl http://localhost:3001/api/products?barcode=QR_PRODUCT_C

# Test barcode BAR_PRODUCT_D
curl http://localhost:3001/api/products?barcode=BAR_PRODUCT_D
```

**Expected response format:**
```json
{
  "products": [
    {
      "id": "...",
      "name": "Test Barcode Product",
      "barcode": "0987654321",
      "price": 1500,
      "currency": "AED",
      "stock": 100,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### 2. Test on Android device

1. **Ensure backend is running** (`npm run dev` in backend directory)
2. **Open POS app on Redmi 13C**
3. **Navigate to the scan screen**
4. **Click "Test Barcode" button** → Should find "Test Barcode Product"
5. **Click "Test QR Code" button** → Should find "Test QR Product C"
6. **Scan physical barcode 0987654321** → Should find "Test Barcode Product"

---

## Test Product Details

| Barcode | Product Name | Price (AED) | Stock |
|---------|--------------|-------------|-------|
| `0987654321` | Test Barcode Product | 15.00 | 100 |
| `QR_PRODUCT_C` | Test QR Product C | 25.00 | 50 |
| `BAR_PRODUCT_D` | Test Barcode Product D | 30.00 | 75 |

**Note:** Prices are stored in fils (minor units). 1500 fils = 15.00 AED.

---

## Troubleshooting

### "Product Not Found" still appears

1. **Verify backend is running:**
   ```powershell
   curl http://localhost:3001/health
   ```
   Should return: `{"status":"OK","service":"SuperMandi Backend",...}`

2. **Check database was seeded:**
   ```powershell
   cd backend
   npx prisma studio
   ```
   Open Product table and verify 3 records exist

3. **Verify frontend API configuration:**
   - Check `src/config/api.ts` has correct backend URL
   - Ensure Android device can reach backend IP address

### Seed script fails

1. **Ensure dependencies are installed:**
   ```powershell
   cd backend
   npm install
   ```

2. **Regenerate Prisma Client:**
   ```powershell
   npm run prisma:generate
   ```

3. **Check database file exists:**
   ```powershell
   dir prisma\dev.db
   ```

### Database is locked

- Stop the backend server (`Ctrl+C`)
- Close Prisma Studio if open
- Run seed script again

---

## Files Modified

- **Created:** [`backend/src/seed.ts`](backend/src/seed.ts:1) - Database seeding script
- **Modified:** [`backend/package.json`](backend/package.json:12) - Added `seed` script command

---

## Technical Details

### Product Model Schema
```prisma
model Product {
  id          String   @id @default(cuid())
  name        String
  barcode     String?  @unique
  sku         String?  @unique
  price       Int      // stored in minor units (fils)
  currency    String   @default("AED")
  stock       Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Barcode Lookup Logic
The backend [`/api/products`](backend/src/routes/products.ts:11) endpoint accepts a `barcode` query parameter:
```typescript
GET /api/products?barcode=0987654321
```

This performs an exact match lookup on the `barcode` field where `isActive=true`.

---

## Next Steps

After seeding:
1. ✅ Backend database contains test products
2. ✅ API returns products for test barcodes
3. ✅ POS app can find products when scanning
4. ✅ No frontend changes required

The barcode scanning flow is now fully functional for testing on the Redmi 13C device.
