#!/bin/bash
# MANUAL DEPLOYMENT SCRIPT FOR GOOGLE VM
# Run this script directly on the VM (SSH in first)

echo "=========================================="
echo "SUPERMANDI POS - BACKEND DEPLOYMENT"
echo "=========================================="
echo ""
echo "Commit: 3b632caf63f2f0cc2391690c4680d5af9ba4b030"
echo "Tag: pos-retailer-variants-fix-2026-01-11-0153IST"
echo "Date: 2026-01-11"
echo ""
echo "=========================================="
echo ""

# Navigate to backend directory
echo "📂 Navigating to backend directory..."
cd ~/supermandi-backend || {
  echo "❌ ERROR: Backend directory not found at ~/supermandi-backend"
  echo "Please check the path and try again."
  exit 1
}

echo "✅ Current directory: $(pwd)"
echo ""

# Show current branch and commit
echo "📊 Current Git Status:"
git branch --show-current
git log -1 --oneline
echo ""

# Fetch all tags and branches
echo "📥 Fetching latest changes from GitHub..."
git fetch --all --tags || {
  echo "❌ ERROR: Failed to fetch from GitHub"
  echo "Please check network connectivity and GitHub access."
  exit 1
}

echo "✅ Fetch complete"
echo ""

# Pull latest changes
echo "⬇️  Pulling latest changes from main branch..."
git pull origin main || {
  echo "❌ ERROR: Failed to pull changes"
  echo "You may have local changes. Run 'git status' to check."
  exit 1
}

echo "✅ Pull complete"
echo ""

# Verify the commit
echo "🔍 Verifying deployment commit..."
CURRENT_COMMIT=$(git rev-parse --short HEAD)
EXPECTED_COMMIT="3b632ca"

echo "Current commit: $CURRENT_COMMIT"
echo "Expected commit: $EXPECTED_COMMIT"

if [ "$CURRENT_COMMIT" != "$EXPECTED_COMMIT" ]; then
  echo "⚠️  WARNING: Commit mismatch!"
  echo "Expected: $EXPECTED_COMMIT"
  echo "Got: $CURRENT_COMMIT"
  echo ""
  echo "Latest commit message:"
  git log -1 --oneline
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
  fi
else
  echo "✅ Commit verified: $CURRENT_COMMIT"
fi

echo ""

# Show tag
TAG=$(git describe --tags 2>/dev/null || echo "No tag")
echo "Tag: $TAG"
echo ""

# Check for package.json changes
echo "📦 Checking for dependency changes..."
if git diff HEAD@{1} HEAD -- package.json package-lock.json | grep -q .; then
  echo "📦 package.json or package-lock.json changed"
  echo "Installing dependencies..."
  npm install || {
    echo "❌ ERROR: npm install failed"
    exit 1
  }
  echo "✅ Dependencies installed"
else
  echo "ℹ️  No dependency changes detected, skipping npm install"
fi

echo ""

# Restart backend services
echo "🔄 Restarting backend services with pm2..."
pm2 restart all || {
  echo "❌ ERROR: Failed to restart pm2 services"
  echo "Try running 'pm2 list' to check service status"
  exit 1
}

echo "✅ Services restarted"
echo ""

# Wait a moment for services to start
sleep 3

# Show PM2 status
echo "📊 PM2 Service Status:"
pm2 list
echo ""

# Show recent logs
echo "📜 Recent Backend Logs (last 20 lines):"
pm2 logs backend --nostream --lines 20
echo ""

# Monitor for AUTOFIXED messages
echo "🔍 Checking for AUTOFIXED messages..."
AUTOFIXED_COUNT=$(pm2 logs backend --nostream --lines 500 | grep -c "AUTOFIXED" || echo "0")

if [ "$AUTOFIXED_COUNT" -gt 0 ]; then
  echo "✅ Found $AUTOFIXED_COUNT AUTOFIXED messages:"
  pm2 logs backend --nostream --lines 500 | grep "AUTOFIXED"
else
  echo "ℹ️  No AUTOFIXED messages yet (this is normal if no missing links exist)"
fi

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "📋 What to do next:"
echo "1. Test on store-3: Verify item 1006 appears in sell screen"
echo "2. Monitor logs: pm2 logs backend | grep AUTOFIXED"
echo "3. Check for errors: pm2 logs backend --err"
echo ""
echo "📊 Key Fixes Deployed:"
echo "- ✅ Retailer variants auto-link fix (item 1006 issue)"
echo "- ✅ Two-phase payment flow (stock deduction fix)"
echo "- ✅ Cart and event system improvements"
echo ""
echo "🔍 To monitor in real-time:"
echo "   pm2 logs backend"
echo ""
echo "🎉 Deployment successful!"
