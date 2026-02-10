# D&S Expense Tracker - Deployment Guide

## 📤 Pushing Changes (Windows)

After making code changes on your Windows machine:

```powershell
cd "c:\Users\sekki\DandS Expense"
git add .
git commit -m "Description of your changes"
git push
```

## 📥 Deploying to Pi

SSH into your Pi and run:

```bash
cd ~/dands-expense
git pull
docker compose down && docker compose up -d --build
```

### Quick one-liner:
```bash
cd ~/dands-expense && git pull && docker compose down && docker compose up -d --build
```

## 🔍 Useful Commands

### Check if app is running:
```bash
docker ps
curl http://localhost:3000/api/health
```

### View app logs:
```bash
docker logs dands-expense -f --tail 50
```

### Restart without rebuilding:
```bash
cd ~/dands-expense
docker compose restart
```

### Full rebuild (after major changes):
```bash
cd ~/dands-expense
docker compose down
docker compose up -d --build
```

## 🌐 Access the App

- **Local**: http://192.168.0.202:3000
- **Tailscale**: http://pihole:3000 (from any Tailscale device)
- **Custom Domain**: https://yourdomain.com (via Cloudflare Tunnel)

## 🔒 Cloudflare Tunnel Setup (Custom Domain)

To access your app from anywhere using your own domain with automatic HTTPS:

### Prerequisites
1. A domain added to Cloudflare (free plan works)
2. The app running on your Pi (`docker compose up -d`)

### Setup
```bash
cd ~/dands-expense
chmod +x cloudflare-tunnel-setup.sh
./cloudflare-tunnel-setup.sh
```

The script will:
1. Install `cloudflared` on your Pi
2. Authenticate with your Cloudflare account (opens a browser link)
3. Create a tunnel named `dands-expense`
4. Configure DNS for your chosen subdomain
5. Install and start the tunnel as a system service

### Benefits
- Automatic HTTPS (SSL/TLS)
- No ports exposed on your router
- DDoS protection via Cloudflare
- Access from anywhere in the world

### Tunnel Commands
```bash
# Check tunnel status
cloudflared tunnel list

# View service status
sudo systemctl status cloudflared

# View tunnel logs
sudo journalctl -u cloudflared -f

# Restart tunnel
sudo systemctl restart cloudflared

# Stop tunnel
sudo systemctl stop cloudflared
```

### Uninstall Tunnel
```bash
sudo cloudflared service uninstall
cloudflared tunnel delete dands-expense
```

## 🔧 Troubleshooting

### Git pull says "no tracking information"
Fix the branch tracking:
```bash
cd ~/dands-expense
git fetch origin
git checkout -B main origin/main
```

Then future pulls will work normally:
```bash
git pull
```

### Permission denied errors
Use sudo for file operations:
```bash
sudo rm -rf <file>
```

### Container won't start
Check logs:
```bash
docker logs dands-expense
```

## �📊 Version

Current version: **v1.4.0**  
Last updated: **Feb 10, 2026**
