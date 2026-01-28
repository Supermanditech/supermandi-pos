#!/bin/bash
# Supermandi Backend Deployment Script
# Run this script on the VM: bash vm-deploy-script.sh

# GL-CRIT-0080: Added set -u for unset variable protection
set -eu  # Exit on any error or unset variable
set -o pipefail  # Fail on pipe errors

echo "=========================================="
echo "SUPERMANDI BACKEND DEPLOYMENT"
echo "=========================================="
echo ""
echo "Target Commit: 3b632caf63f2f0cc2391690c4680d5af9ba4b030"
echo "Tag: pos-retailer-variants-fix-2026-01-11-0153IST"
echo ""

# GL-CRIT-0082: Validate directory exists before operations
BACKEND_DIR="${HOME}/supermandi-backend"

# Step 1: Validate and navigate to backend directory
echo "📂 Step 1: Validating backend directory..."
if [[ ! -d "$BACKEND_DIR" ]]; then
    echo "❌ ERROR: Directory $BACKEND_DIR not found"
    echo "Please ensure the repository is cloned to ~/supermandi-backend"
    exit 1
fi

if [[ ! -f "$BACKEND_DIR/package.json" ]]; then
    echo "❌ ERROR: $BACKEND_DIR/package.json not found"
    echo "Directory exists but doesn't appear to be a valid Node.js project"
    exit 1
fi

cd "$BACKEND_DIR" || {
    echo "❌ ERROR: Failed to navigate to $BACKEND_DIR"
    exit 1
}
echo "✅ Current directory: $(pwd)"
echo ""

# Step 2: Show current status
echo "📊 Step 2: Current Git Status..."
echo "Branch: $(git branch --show-current)"
echo "Current commit: $(git log -1 --oneline)"
echo ""

# Step 3: Fetch latest changes
echo "📥 Step 3: Fetching latest changes from GitHub..."
git fetch --all --tags || {
    echo "❌ ERROR: Failed to fetch from GitHub"
    exit 1
}
echo "✅ Fetch complete"
echo ""

# Step 4: Pull latest changes
echo "⬇️  Step 4: Pulling latest changes from main..."
git pull origin main || {
    echo "❌ ERROR: Failed to pull changes"
    echo "You may have local modifications. Run 'git status' to check."
    exit 1
}
echo "✅ Pull complete"
echo ""

# Step 5: Verify commit
echo "🔍 Step 5: Verifying deployment..."
CURRENT_COMMIT=$(git rev-parse --short HEAD)
EXPECTED_COMMIT="3b632ca"

echo "Current commit: $CURRENT_COMMIT"
echo "Expected commit: $EXPECTED_COMMIT"

if [ "$CURRENT_COMMIT" = "$EXPECTED_COMMIT" ]; then
    echo "✅ Commit verified!"
else
    echo "⚠️  WARNING: Commit mismatch!"
    echo "Current: $CURRENT_COMMIT"
    echo "Expected: $EXPECTED_COMMIT"
fi

TAG=$(git describe --tags 2>/dev/null || echo "No tag")
echo "Tag: $TAG"
echo ""

# Step 6: Install dependencies
echo "📦 Step 6: Installing dependencies..."
npm install || {
    echo "❌ ERROR: npm install failed"
    exit 1
}
echo "✅ Dependencies installed"
echo ""

# Step 7: Restart PM2 services
echo "🔄 Step 7: Restarting PM2 services..."
pm2 restart all || {
    echo "❌ ERROR: Failed to restart PM2"
    exit 1
}
echo "✅ Services restarted"
echo ""

# Wait for services to start
sleep 3

# Step 8: Show PM2 status
echo "📊 Step 8: PM2 Service Status..."
pm2 list
echo ""

# Step 9: Check for AUTOFIXED messages
echo "🔍 Step 9: Checking for AUTOFIXED messages..."
AUTOFIXED_COUNT=$(pm2 logs backend --nostream --lines 500 2>/dev/null | grep -c "AUTOFIXED" || echo "0")

if [ "$AUTOFIXED_COUNT" -gt 0 ]; then
    echo "✅ Found $AUTOFIXED_COUNT AUTOFIXED messages:"
    pm2 logs backend --nostream --lines 500 | grep "AUTOFIXED" | tail -20
else
    echo "ℹ️  No AUTOFIXED messages yet (normal if no missing links)"
fi
echo ""

# Step 10: Show recent logs
echo "📜 Step 10: Recent Backend Logs..."
pm2 logs backend --nostream --lines 30
echo ""

# Final summary
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  Current commit: $CURRENT_COMMIT"
echo "  Tag: $TAG"
echo "  PM2 status: $(pm2 list | grep -c 'online' || echo '0') services online"
echo ""
echo "Next steps:"
echo "  1. Test on store-3: Verify item 1006 appears in sell screen"
echo "  2. Monitor logs: pm2 logs backend"
echo "  3. Check for errors: pm2 logs backend --err"
echo ""
echo "🎉 Backend deployed successfully!"
