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

## 📊 Version

Current version: **v1.2.0**  
Last updated: **Dec 22, 2024**
