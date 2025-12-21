# D&S Expense Tracker

A lightweight, self-hosted expense and document tracking application designed for Raspberry Pi.

## Features

- 💰 **Expense & Income Tracking** - Quick entry with categories
- 📁 **Document Storage** - Store important documents (IDs, licenses, etc.)
- 📱 **Mobile-First PWA** - Install on iPhone home screen
- 🔐 **Multi-User** - Support for 2 users with separate logins
- 🔒 **Secure** - Passwords hashed, JWT authentication
- 🐳 **Docker Ready** - Easy deployment

## Quick Start

### Prerequisites
- Raspberry Pi 4 with Docker installed
- Run `pi-setup.sh` to prepare the environment

### Deployment

1. **Copy files to your Pi:**
   ```bash
   # From your Windows PC
   scp -r * pi@<your-pi-ip>:~/dands-expense/
   ```

2. **Build and start:**
   ```bash
   cd ~/dands-expense
   docker compose up -d --build
   ```

3. **Access the app:**
   - Local: `http://<pi-ip>:3000`
   - Via Tailscale: `http://<tailscale-ip>:3000`

### First Time Setup

1. Open the app in your browser
2. Create your account (first user gets to register)
3. Share the app URL with your partner to create their account
4. Start tracking expenses!

### Add to iPhone Home Screen

1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Name it "D&S Expense" and tap Add

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `JWT_SECRET` | Secret for auth tokens | (change in production!) |
| `DATA_DIR` | Database location | ./data |
| `DOCS_DIR` | Documents location | ./documents |

## Security Notes

- Change `JWT_SECRET` in `docker-compose.yml` for production
- Access is secured behind your Tailscale network
- Passwords are bcrypt hashed
- File uploads limited to 10MB

## Backup

Your data is stored in:
- `./data/expense.db` - SQLite database
- `./documents/` - Uploaded files

Backup these directories regularly!

## Updates

```bash
cd ~/dands-expense
git pull  # or copy new files
docker compose down
docker compose up -d --build
```

## Default Categories

**Expenses:**
🍔 Food & Dining, 🛒 Groceries, 🚗 Transport, 💡 Utilities, 🎬 Entertainment, 🛍️ Shopping, 🏥 Health, 📚 Education, 📄 Bills

**Income:**
💼 Salary, 💻 Freelance, 📈 Investment, 🎁 Gift

## License

MIT - Use freely for personal use.
