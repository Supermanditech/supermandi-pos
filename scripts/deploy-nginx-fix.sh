#!/bin/bash
# GO-LIVE-URL-AUDIT-001: Deploy nginx fix and verify configuration
# Run this script on the VM as root or with sudo

set -e

echo "=========================================="
echo "GO-LIVE-URL-AUDIT-001: Nginx Fix Deployment"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Backup current config
echo -e "\n${YELLOW}Step 1: Backing up current nginx config${NC}"
BACKUP_FILE="/etc/nginx/sites-available/supermandi.conf.backup.$(date +%Y%m%d_%H%M%S)"
if [ -f /etc/nginx/sites-available/supermandi.conf ]; then
    sudo cp /etc/nginx/sites-available/supermandi.conf "$BACKUP_FILE"
    echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
else
    echo -e "${YELLOW}No existing config found, skipping backup${NC}"
fi

# Step 2: Copy new config
echo -e "\n${YELLOW}Step 2: Copying new nginx config${NC}"
# Assuming the new config is at ~/supermandi-pos/nginx.prod.conf
if [ -f ~/supermandi-pos/nginx.prod.conf ]; then
    sudo cp ~/supermandi-pos/nginx.prod.conf /etc/nginx/sites-available/supermandi.conf
    echo -e "${GREEN}Config copied successfully${NC}"
elif [ -f /home/supermanditech/supermandi-pos/nginx.prod.conf ]; then
    sudo cp /home/supermanditech/supermandi-pos/nginx.prod.conf /etc/nginx/sites-available/supermandi.conf
    echo -e "${GREEN}Config copied successfully${NC}"
else
    echo -e "${RED}ERROR: nginx.prod.conf not found!${NC}"
    echo "Please copy nginx.prod.conf to the VM first"
    exit 1
fi

# Step 3: Test nginx configuration
echo -e "\n${YELLOW}Step 3: Testing nginx configuration${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}Nginx config test PASSED${NC}"
else
    echo -e "${RED}Nginx config test FAILED!${NC}"
    echo "Rolling back to previous config..."
    if [ -f "$BACKUP_FILE" ]; then
        sudo cp "$BACKUP_FILE" /etc/nginx/sites-available/supermandi.conf
    fi
    exit 1
fi

# Step 4: Reload nginx
echo -e "\n${YELLOW}Step 4: Reloading nginx${NC}"
sudo nginx -s reload
echo -e "${GREEN}Nginx reloaded successfully${NC}"

# Step 5: Verify sites-enabled
echo -e "\n${YELLOW}Step 5: Listing sites-enabled${NC}"
ls -la /etc/nginx/sites-enabled/

# Step 6: Check for server_name duplicates
echo -e "\n${YELLOW}Step 6: Checking for server_name duplicates${NC}"
grep -r "server_name" /etc/nginx/sites-enabled/ | sort

# Step 7: Verify endpoints
echo -e "\n${YELLOW}Step 7: Verifying endpoints${NC}"

echo -e "\n--- Root Landing Page ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ]; then
    echo -e "${GREEN}Root /: HTTP $HTTP_CODE${NC}"
else
    echo -e "${RED}Root /: HTTP $HTTP_CODE (expected 200 or 301)${NC}"
fi

echo -e "\n--- Supplier Routes (without trailing slash) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L https://supermandi.tech/supplier/login)
echo "supplier/login: HTTP $HTTP_CODE"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L https://supermandi.tech/supplier/register)
echo "supplier/register: HTTP $HTTP_CODE"

echo -e "\n--- Cache Headers ---"
echo -e "\nRetailer asset:"
curl -s -I "https://supermandi.tech/retailer/assets/index-D5lSCCGP.js" 2>/dev/null | grep -i cache-control

echo -e "\nAdmin asset:"
curl -s -I "https://supermandi.tech/admin/assets/index-bKfCJR2K.js" 2>/dev/null | grep -i cache-control

echo -e "\nSupplier Next.js asset:"
curl -s -I "https://supermandi.tech/supplier/_next/static/chunks/main-app-ef1b14ff06b3e3ae.js" 2>/dev/null | grep -i cache-control

echo -e "\n--- HTML no-store verification ---"
echo -e "\nRoot landing:"
curl -s -I "https://supermandi.tech/" 2>/dev/null | grep -i cache-control

echo -e "\nRetailer HTML:"
curl -s -I "https://supermandi.tech/retailer/" 2>/dev/null | grep -i cache-control

echo -e "\nAdmin HTML:"
curl -s -I "https://supermandi.tech/admin/" 2>/dev/null | grep -i cache-control

echo -e "\n${GREEN}=========================================="
echo "Deployment complete!"
echo "==========================================${NC}"
