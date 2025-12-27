# Quick Start: Barcode Testing Setup

## 🚀 Run This Now (Windows PowerShell)

```powershell
# Navigate to backend
cd backend

# Seed the database with test products
npm run seed

# Restart backend server (if running)
# Press Ctrl+C to stop, then:
npm run dev
```

## ✅ What This Does

Adds 3 test products to your database:

| Barcode | Product Name | Price |
|---------|--------------|-------|
| `0987654321` | Test Barcode Product | 15.00 AED |
| `QR_PRODUCT_C` | Test QR Product C | 25.00 AED |
| `BAR_PRODUCT_D` | Test Barcode Product D | 30.00 AED |

## 🧪 Test on Android Device

1. Open POS app on Redmi 13C
2. Click **"Test QR Code"** button → Should find product ✅
3. Click **"Test Barcode"** button → Should find product ✅
4. Scan barcode **0987654321** → Should find product ✅

## 📋 Verify It Worked

```powershell
# Test the API (backend must be running)
curl http://localhost:3001/api/products?barcode=0987654321
```

Should return JSON with the product details.

---

**For detailed instructions, see:** [`BARCODE_TESTING_SETUP.md`](BARCODE_TESTING_SETUP.md:1)
