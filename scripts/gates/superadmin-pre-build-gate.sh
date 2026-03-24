#!/bin/bash
# GCP-STG-0710: SuperAdmin pre-build gate
set -e
echo "=== SUPERADMIN PRE-BUILD GATE ==="
cd supermandi-superadmin

echo "[1/3] TypeScript..."
npx tsc --noEmit || { echo "❌ FAIL: TypeScript errors"; exit 1; }
echo "✅ TypeScript clean"

echo "[2/3] Vite build..."
VITE_API_BASE_URL="" npx vite build || { echo "❌ FAIL: Build failed"; exit 1; }
echo "✅ Build passed"

echo "[3/3] Tests..."
npx vitest run || { echo "❌ FAIL: Tests failed"; exit 1; }
echo "✅ Tests passed"

echo "=== SUPERADMIN PRE-BUILD GATE: ✅ PASS ==="
