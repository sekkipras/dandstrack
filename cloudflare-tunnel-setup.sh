#!/bin/bash

#===============================================================================
# DandS Expense Tracker - Cloudflare Tunnel Setup Script
# Run this on your Raspberry Pi to expose the app via your custom domain
# Prerequisites:
#   - Domain added to Cloudflare (free plan works)
#   - Application already running (docker compose up -d)
# Usage: chmod +x cloudflare-tunnel-setup.sh && ./cloudflare-tunnel-setup.sh
#===============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       DandS Expense Tracker - Cloudflare Tunnel Setup         ║"
echo "║              Secure Access via Custom Domain                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Function to print status
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_warning "Running as root. Some commands will be adjusted."
        SUDO=""
    else
        SUDO="sudo"
        print_status "Running as user: $(whoami)"
    fi
}

# Check prerequisites
check_prerequisites() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                   CHECKING PREREQUISITES                      ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    # Check if app is running
    if docker ps -q -f name=dands-expense | grep -q .; then
        print_success "DandS Expense app is running"
    else
        print_error "DandS Expense app is not running!"
        echo "  Please run: docker compose up -d"
        echo "  Then re-run this script."
        exit 1
    fi

    # Check if curl is available
    if command -v curl &> /dev/null; then
        print_success "curl is available"
    else
        print_status "Installing curl..."
        $SUDO apt-get update -qq && $SUDO apt-get install -y -qq curl
        print_success "curl installed"
    fi
}

# Install cloudflared
install_cloudflared() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                  INSTALLING CLOUDFLARED                       ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    if command -v cloudflared &> /dev/null; then
        CLOUDFLARED_VERSION=$(cloudflared --version | head -1)
        print_success "cloudflared already installed: $CLOUDFLARED_VERSION"
    else
        print_status "Detecting system architecture..."
        ARCH=$(uname -m)

        case $ARCH in
            armv7l|armv6l)
                CLOUDFLARED_ARCH="arm"
                print_status "Architecture: ARM (32-bit)"
                ;;
            aarch64|arm64)
                CLOUDFLARED_ARCH="arm64"
                print_status "Architecture: ARM64"
                ;;
            x86_64)
                CLOUDFLARED_ARCH="amd64"
                print_status "Architecture: x86_64"
                ;;
            *)
                print_error "Unsupported architecture: $ARCH"
                exit 1
                ;;
        esac

        print_status "Downloading cloudflared..."
        DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUDFLARED_ARCH}.deb"

        curl -L --output /tmp/cloudflared.deb "$DOWNLOAD_URL"

        print_status "Installing cloudflared..."
        $SUDO dpkg -i /tmp/cloudflared.deb
        rm /tmp/cloudflared.deb

        print_success "cloudflared installed successfully"
    fi
}

# Authenticate with Cloudflare
authenticate_cloudflare() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                CLOUDFLARE AUTHENTICATION                      ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    # Check if already authenticated
    if [ -f ~/.cloudflared/cert.pem ]; then
        print_success "Already authenticated with Cloudflare"
        echo ""
        read -p "Do you want to re-authenticate? (y/N): " REAUTH
        if [[ ! $REAUTH =~ ^[Yy]$ ]]; then
            return
        fi
    fi

    echo ""
    print_status "Opening browser for Cloudflare authentication..."
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  A URL will appear below. If no browser opens automatically:  ${NC}"
    echo -e "${YELLOW}  1. Copy the URL                                              ${NC}"
    echo -e "${YELLOW}  2. Open it in a browser on any device                        ${NC}"
    echo -e "${YELLOW}  3. Log in to Cloudflare                                      ${NC}"
    echo -e "${YELLOW}  4. Select the domain you want to use                         ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    cloudflared tunnel login

    if [ -f ~/.cloudflared/cert.pem ]; then
        print_success "Authentication successful!"
    else
        print_error "Authentication failed. Please try again."
        exit 1
    fi
}

# Create tunnel
create_tunnel() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                    CREATING TUNNEL                            ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    TUNNEL_NAME="dands-expense"

    # Check if tunnel already exists
    if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
        print_success "Tunnel '$TUNNEL_NAME' already exists"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
        print_status "Tunnel ID: $TUNNEL_ID"
    else
        print_status "Creating tunnel '$TUNNEL_NAME'..."
        cloudflared tunnel create $TUNNEL_NAME
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
        print_success "Tunnel created with ID: $TUNNEL_ID"
    fi

    # Export for later use
    export TUNNEL_ID
    export TUNNEL_NAME
}

# Configure DNS
configure_dns() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                    DNS CONFIGURATION                          ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    echo ""
    echo "Enter the subdomain you want to use for the expense tracker."
    echo "Examples:"
    echo "  • expense.yourdomain.com"
    echo "  • money.yourdomain.com"
    echo "  • tracker.yourdomain.com"
    echo ""
    read -p "Enter full domain (e.g., expense.yourdomain.com): " DOMAIN

    if [ -z "$DOMAIN" ]; then
        print_error "Domain cannot be empty"
        exit 1
    fi

    print_status "Configuring DNS for $DOMAIN..."

    # Route DNS to tunnel
    cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN 2>/dev/null || {
        print_warning "DNS route may already exist or requires manual setup"
        echo "  If this is a new setup, the DNS record should be created automatically."
        echo "  If not, add a CNAME record in Cloudflare DNS:"
        echo "    Name: $(echo $DOMAIN | cut -d. -f1)"
        echo "    Target: ${TUNNEL_ID}.cfargotunnel.com"
    }

    print_success "DNS configured for: $DOMAIN"

    # Export for config file
    export DOMAIN
}

# Create config file
create_config() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                  CREATING CONFIG FILE                         ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    CONFIG_DIR="$HOME/.cloudflared"
    CONFIG_FILE="$CONFIG_DIR/config.yml"

    mkdir -p "$CONFIG_DIR"

    print_status "Creating tunnel config at $CONFIG_FILE..."

    cat > "$CONFIG_FILE" << EOF
# Cloudflare Tunnel Configuration for DandS Expense Tracker
# Generated on $(date)

tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/${TUNNEL_ID}.json

ingress:
  # Route traffic for your domain to the local app
  - hostname: $DOMAIN
    service: http://localhost:3000
  # Catch-all rule (required)
  - service: http_status:404
EOF

    print_success "Config file created: $CONFIG_FILE"
}

# Install as system service
install_service() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}               INSTALLING AS SYSTEM SERVICE                    ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    print_status "Installing cloudflared as a system service..."

    $SUDO cloudflared service install

    print_success "Service installed"

    print_status "Starting cloudflared service..."
    $SUDO systemctl start cloudflared
    $SUDO systemctl enable cloudflared

    # Check if service is running
    sleep 2
    if systemctl is-active --quiet cloudflared; then
        print_success "Cloudflared service is running"
    else
        print_warning "Service may not have started. Check with: sudo systemctl status cloudflared"
    fi
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                    SETUP COMPLETE!                            ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Your DandS Expense Tracker is now accessible at:"
    echo ""
    echo -e "  ${GREEN}https://$DOMAIN${NC}"
    echo ""
    echo "Benefits:"
    echo "  • Automatic HTTPS (SSL/TLS)"
    echo "  • No ports exposed on your Pi"
    echo "  • DDoS protection via Cloudflare"
    echo "  • Access from anywhere in the world"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  • Check tunnel status:   cloudflared tunnel list"
    echo "  • View service status:   sudo systemctl status cloudflared"
    echo "  • View service logs:     sudo journalctl -u cloudflared -f"
    echo "  • Restart tunnel:        sudo systemctl restart cloudflared"
    echo "  • Stop tunnel:           sudo systemctl stop cloudflared"
    echo ""
    echo -e "${YELLOW}Note:${NC} DNS propagation may take a few minutes."
    echo "      If the domain doesn't work immediately, wait 2-5 minutes."
    echo ""
}

# Uninstall function (for reference)
print_uninstall_info() {
    echo ""
    echo -e "${BLUE}To uninstall the tunnel later:${NC}"
    echo "  sudo cloudflared service uninstall"
    echo "  cloudflared tunnel delete dands-expense"
    echo ""
}

# Main execution
main() {
    check_root
    check_prerequisites
    install_cloudflared
    authenticate_cloudflare
    create_tunnel
    configure_dns
    create_config
    install_service
    print_summary
    print_uninstall_info
}

# Run main function
main
