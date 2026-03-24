#!/bin/bash
# GCP-STG-0707: Supplier portal pre-build gate
set -e
echo "=== SUPPLIER PRE-BUILD GATE ==="
cd supplier-portal

echo "[1/2] TypeScript..."
npx tsc --noEmit || { echo "❌ FAIL: TypeScript errors"; exit 1; }
echo "✅ TypeScript clean"

echo "[2/2] Next.js build..."
NEXT_PUBLIC_API_BASE_URL="" npm run build || { echo "❌ FAIL: Build failed"; exit 1; }
echo "✅ Build passed"

echo "=== SUPPLIER PRE-BUILD GATE: ✅ PASS ==="
