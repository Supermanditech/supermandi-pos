#!/bin/bash
# SuperMandi VM Setup Script - V3.0.9
# Run this on the VM to set up the backend

set -e

echo "=========================================="
echo "SuperMandi Backend Setup - V3.0.9"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Variables
INSTALL_DIR="/var/supermandi"
REPO_URL="https://github.com/Supermanditech/supermandi-pos.git"
BRANCH="main"

# 1. Install Docker if not present
echo -e "${YELLOW}[1/7] Checking Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}Docker installed${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

# 2. Install Docker Compose plugin if not present
echo -e "${YELLOW}[2/7] Checking Docker Compose...${NC}"
if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose installed${NC}"
else
    echo -e "${GREEN}Docker Compose already installed${NC}"
fi

# 3. Create directory and clone repo
echo -e "${YELLOW}[3/7] Setting up directory...${NC}"
sudo mkdir -p $INSTALL_DIR
sudo mkdir -p $INSTALL_DIR/data
sudo chown -R $USER:$USER $INSTALL_DIR

if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Updating existing repo..."
    cd $INSTALL_DIR
    git fetch origin
    git reset --hard origin/$BRANCH
else
    echo "Cloning repo..."
    git clone $REPO_URL $INSTALL_DIR
    cd $INSTALL_DIR
    git checkout $BRANCH
fi
echo -e "${GREEN}Code ready at $INSTALL_DIR${NC}"

# 4. Create .env.prod if not exists
echo -e "${YELLOW}[4/7] Setting up environment...${NC}"
cd $INSTALL_DIR/backend

if [ ! -f ".env.prod" ]; then
    # Generate secure passwords
    POSTGRES_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    REDIS_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)

    cat > .env.prod << EOF
# Production Environment - Auto-generated
POSTGRES_USER=supermandi
POSTGRES_PASSWORD=${POSTGRES_PASS}
POSTGRES_DB=supermandi
POSTGRES_PORT=5432

REDIS_PASSWORD=${REDIS_PASS}
REDIS_PORT=6379

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=7d

API_GATEWAY_PORT=3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

DATA_DIR=/var/supermandi/data
LOG_LEVEL=info
NODE_ENV=production
EOF
    echo -e "${GREEN}.env.prod created with secure passwords${NC}"
else
    echo -e "${GREEN}.env.prod already exists${NC}"
fi

# 5. Start Docker services
echo -e "${YELLOW}[5/7] Starting Docker services...${NC}"
cd $INSTALL_DIR/backend
sudo docker compose -f docker-compose.prod.yml down 2>/dev/null || true
sudo docker compose -f docker-compose.prod.yml up -d --build

# 6. Wait for services
echo -e "${YELLOW}[6/7] Waiting for services to start...${NC}"
sleep 10

# 7. Health check
echo -e "${YELLOW}[7/7] Checking health...${NC}"
echo ""
echo "Container status:"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Test API health
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}API Gateway: HEALTHY${NC}"
else
    echo -e "${RED}API Gateway: NOT RESPONDING${NC}"
    echo "Checking logs..."
    sudo docker logs backend-api-gateway-1 --tail 20 2>/dev/null || true
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "API URL: http://$(curl -s ifconfig.me):3000"
echo "Health:  http://$(curl -s ifconfig.me):3000/health"
echo ""
echo "To check logs:"
echo "  sudo docker logs backend-api-gateway-1 -f"
echo ""
echo "To restart:"
echo "  cd $INSTALL_DIR/backend && sudo docker compose -f docker-compose.prod.yml restart"
echo ""
