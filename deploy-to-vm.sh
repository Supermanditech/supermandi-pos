#!/bin/bash
# Deployment script for Google VM
# Run this on the VM or use SSH

echo "=== Deploying Backend to Google VM ==="
echo "Commit: 3b632ca"
echo "Tag: pos-retailer-variants-fix-2026-01-11-0153IST"
echo ""

# Navigate to backend directory
cd ~/supermandi-backend || exit 1

# Pull latest changes
echo "Pulling latest changes..."
git fetch --all --tags
git pull origin main

# Verify we're on the right commit
CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo "Current commit: $CURRENT_COMMIT"

# Install dependencies if needed
if git diff HEAD@{1} HEAD -- package.json package-lock.json | grep -q .; then
  echo "package.json changed, running npm install..."
  npm install
fi

# Restart services
echo "Restarting backend services..."
pm2 restart all

# Show status
echo ""
echo "=== Deployment Status ==="
pm2 list

echo ""
echo "=== Monitoring for AUTOFIXED messages ==="
echo "Run: pm2 logs backend | grep AUTOFIXED"
echo ""
echo "Deployment complete!"
