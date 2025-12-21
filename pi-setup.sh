#!/bin/bash

#===============================================================================
# DandS Expense Tracker - Raspberry Pi Setup Script
# Run this script on your Raspberry Pi to prepare the environment
# Usage: chmod +x pi-setup.sh && ./pi-setup.sh
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
echo "║         DandS Expense Tracker - Pi Setup Script               ║"
echo "║                   Raspberry Pi 4 Setup                        ║"
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

# System information
check_system() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                     SYSTEM INFORMATION                        ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    # Check if this is a Raspberry Pi
    if [ -f /proc/device-tree/model ]; then
        PI_MODEL=$(cat /proc/device-tree/model)
        print_success "Device: $PI_MODEL"
    else
        print_warning "Could not detect Raspberry Pi model"
    fi
    
    # Check OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        print_success "OS: $PRETTY_NAME"
    fi
    
    # Check architecture
    ARCH=$(uname -m)
    print_success "Architecture: $ARCH"
    
    # Check RAM
    TOTAL_RAM=$(free -h | awk '/^Mem:/ {print $2}')
    AVAILABLE_RAM=$(free -h | awk '/^Mem:/ {print $7}')
    print_success "Total RAM: $TOTAL_RAM (Available: $AVAILABLE_RAM)"
    
    # Check storage
    DISK_TOTAL=$(df -h / | awk 'NR==2 {print $2}')
    DISK_AVAILABLE=$(df -h / | awk 'NR==2 {print $4}')
    DISK_USED_PERCENT=$(df -h / | awk 'NR==2 {print $5}')
    print_success "Storage: $DISK_TOTAL total, $DISK_AVAILABLE available ($DISK_USED_PERCENT used)"
    
    # Check if storage is sufficient (need at least 1GB free)
    DISK_AVAILABLE_KB=$(df / | awk 'NR==2 {print $4}')
    if [ "$DISK_AVAILABLE_KB" -lt 1048576 ]; then
        print_warning "Low disk space! At least 1GB recommended for the application."
    fi
}

# Check existing services
check_existing_services() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                   EXISTING SERVICES CHECK                     ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    # Check Pi-hole
    if command -v pihole &> /dev/null || [ -d "/etc/pihole" ]; then
        print_success "Pi-hole: Detected"
        if systemctl is-active --quiet pihole-FTL 2>/dev/null; then
            print_success "  └─ Pi-hole FTL: Running"
        fi
    else
        print_warning "Pi-hole: Not detected"
    fi
    
    # Check Unbound
    if command -v unbound &> /dev/null; then
        print_success "Unbound: Installed"
        if systemctl is-active --quiet unbound 2>/dev/null; then
            print_success "  └─ Unbound service: Running"
        fi
    else
        print_warning "Unbound: Not detected"
    fi
    
    # Check Tailscale
    if command -v tailscale &> /dev/null; then
        print_success "Tailscale: Installed"
        TAILSCALE_STATUS=$(tailscale status 2>/dev/null | head -1 || echo "Unknown")
        if tailscale status &> /dev/null; then
            TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "Not connected")
            print_success "  └─ Tailscale IP: $TAILSCALE_IP"
        fi
    else
        print_warning "Tailscale: Not detected"
    fi
}

# Update system
update_system() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                     UPDATING SYSTEM                           ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    print_status "Updating package lists..."
    $SUDO apt-get update -qq
    print_success "Package lists updated"
}

# Install Docker
install_docker() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                     DOCKER INSTALLATION                       ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
        print_success "Docker already installed: v$DOCKER_VERSION"
        
        # Check if Docker service is running
        if systemctl is-active --quiet docker; then
            print_success "Docker service: Running"
        else
            print_warning "Docker service not running. Starting..."
            $SUDO systemctl start docker
            $SUDO systemctl enable docker
            print_success "Docker service started and enabled"
        fi
    else
        print_status "Installing Docker..."
        
        # Install prerequisites
        $SUDO apt-get install -y -qq \
            apt-transport-https \
            ca-certificates \
            curl \
            gnupg \
            lsb-release
        
        # Add Docker's official GPG key
        print_status "Adding Docker GPG key..."
        curl -fsSL https://download.docker.com/linux/debian/gpg | $SUDO gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null || true
        
        # Set up repository
        print_status "Setting up Docker repository..."
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian \
            $(lsb_release -cs) stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Install Docker
        print_status "Installing Docker Engine..."
        $SUDO apt-get update -qq
        $SUDO apt-get install -y -qq docker-ce docker-ce-cli containerd.io
        
        # Start Docker
        $SUDO systemctl start docker
        $SUDO systemctl enable docker
        
        print_success "Docker installed successfully"
    fi
    
    # Add current user to docker group
    if [ "$SUDO" != "" ]; then
        if ! groups | grep -q docker; then
            print_status "Adding user to docker group..."
            $SUDO usermod -aG docker $USER
            print_warning "You may need to log out and back in for docker group to take effect"
        else
            print_success "User already in docker group"
        fi
    fi
}

# Install Docker Compose
install_docker_compose() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                  DOCKER COMPOSE INSTALLATION                  ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    # Check for docker compose (v2 - plugin)
    if docker compose version &> /dev/null; then
        COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || docker compose version | grep -oP 'v\d+\.\d+\.\d+')
        print_success "Docker Compose (plugin) already installed: $COMPOSE_VERSION"
        return
    fi
    
    # Check for docker-compose (v1 - standalone)
    if command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(docker-compose --version | cut -d' ' -f4 | tr -d ',')
        print_success "Docker Compose (standalone) already installed: $COMPOSE_VERSION"
        return
    fi
    
    print_status "Installing Docker Compose plugin..."
    $SUDO apt-get install -y -qq docker-compose-plugin
    
    if docker compose version &> /dev/null; then
        print_success "Docker Compose plugin installed successfully"
    else
        # Fallback: Install standalone docker-compose
        print_status "Installing standalone Docker Compose..."
        $SUDO curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        $SUDO chmod +x /usr/local/bin/docker-compose
        print_success "Docker Compose standalone installed"
    fi
}

# Create application directory
create_app_directory() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                 APPLICATION DIRECTORY SETUP                   ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    APP_DIR="$HOME/dands-expense"
    
    if [ -d "$APP_DIR" ]; then
        print_success "Application directory exists: $APP_DIR"
    else
        print_status "Creating application directory..."
        mkdir -p "$APP_DIR"
        mkdir -p "$APP_DIR/data"
        mkdir -p "$APP_DIR/documents"
        print_success "Created: $APP_DIR"
        print_success "Created: $APP_DIR/data (for database)"
        print_success "Created: $APP_DIR/documents (for uploaded files)"
    fi
    
    # Set permissions
    chmod 755 "$APP_DIR"
    chmod 755 "$APP_DIR/data" 2>/dev/null || true
    chmod 755 "$APP_DIR/documents" 2>/dev/null || true
}

# Check network and ports
check_network() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                     NETWORK CONFIGURATION                     ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    # Get local IP
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    print_success "Local IP: $LOCAL_IP"
    
    # Get Tailscale IP if available
    if command -v tailscale &> /dev/null; then
        TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "Not connected")
        if [ "$TAILSCALE_IP" != "Not connected" ]; then
            print_success "Tailscale IP: $TAILSCALE_IP"
            print_status "You can access the app via Tailscale from anywhere!"
        fi
    fi
    
    # Check if port 3000 is available
    if ! ss -tuln | grep -q ":3000 "; then
        print_success "Port 3000: Available"
    else
        print_warning "Port 3000: In use"
        print_status "The application will use port 3000. You may need to free it or use a different port."
    fi
    
    # Check if port 80 is available (optional, for reverse proxy)
    if ! ss -tuln | grep -q ":80 "; then
        print_success "Port 80: Available"
    else
        print_warning "Port 80: In use (likely by Pi-hole lighttpd)"
        print_status "This is normal if Pi-hole is running. App will use port 3000."
    fi
}

# Summary
print_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                        SETUP COMPLETE                         ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    print_success "Your Raspberry Pi is ready for the DandS Expense Tracker!"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "  1. Copy the application files to: $HOME/dands-expense"
    echo "  2. Run: cd $HOME/dands-expense && docker compose up -d"
    echo ""
    echo -e "${BLUE}Access URLs (after deployment):${NC}"
    echo "  • Local:     http://$LOCAL_IP:3000"
    if command -v tailscale &> /dev/null; then
        TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
        if [ -n "$TAILSCALE_IP" ]; then
            echo "  • Tailscale: http://$TAILSCALE_IP:3000"
        fi
    fi
    echo ""
    echo -e "${YELLOW}Note:${NC} If you just added yourself to the docker group,"
    echo "      log out and back in for it to take effect."
    echo ""
}

# Main execution
main() {
    check_root
    check_system
    check_existing_services
    update_system
    install_docker
    install_docker_compose
    create_app_directory
    check_network
    print_summary
}

# Run main function
main
