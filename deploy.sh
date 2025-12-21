#!/bin/bash

#===============================================================================
# D&S Expense Tracker - Deployment Script
# Run this on your Raspberry Pi after copying all files
# Usage: chmod +x deploy.sh && ./deploy.sh
#===============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         D&S Expense Tracker - Deployment Script               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: docker-compose.yml not found. Please run this script from the dands-expense directory."
    exit 1
fi

# Create data directories
print_status "Creating data directories..."
mkdir -p data documents
chmod 755 data documents
print_success "Data directories ready"

# Generate JWT secret if not set
if grep -q "please-change-this-secret-in-production" docker-compose.yml; then
    print_status "Generating secure JWT secret..."
    # Use hex encoding to avoid special characters that break sed
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s|please-change-this-secret-in-production|$JWT_SECRET|" docker-compose.yml
    print_success "JWT secret configured"
else
    print_success "JWT secret already configured"
fi

# Stop existing container if running
if docker ps -q -f name=dands-expense | grep -q .; then
    print_status "Stopping existing container..."
    docker compose down
    print_success "Existing container stopped"
fi

# Build and start
print_status "Building Docker image (this may take a few minutes on first run)..."
docker compose build

print_status "Starting the application..."
docker compose up -d

# Wait for container to be healthy
print_status "Waiting for application to start..."
sleep 5

# Check if running
if docker ps -q -f name=dands-expense | grep -q .; then
    print_success "Application is running!"
else
    echo "Error: Container failed to start. Check logs with: docker compose logs"
    exit 1
fi

# Get IPs
LOCAL_IP=$(hostname -I | awk '{print $1}')
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    DEPLOYMENT COMPLETE!                        ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Access your expense tracker at:"
echo ""
echo "  📍 Local Network:  http://$LOCAL_IP:3000"
if [ -n "$TAILSCALE_IP" ]; then
echo "  🌐 Via Tailscale:  http://$TAILSCALE_IP:3000"
fi
echo ""
echo "First time? Open the app and create your account!"
echo ""
echo "Useful commands:"
echo "  • View logs:    docker compose logs -f"
echo "  • Stop app:     docker compose down"
echo "  • Restart app:  docker compose restart"
echo ""
