const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dands-expense-secret-change-in-production';
const DATA_DIR = process.env.DATA_DIR || './data';
const DOCS_DIR = process.env.DOCS_DIR || './documents';

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

// Initialize SQLite database
const db = new Database(path.join(DATA_DIR, 'expense.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'both')),
    category_group TEXT DEFAULT 'home' CHECK(category_group IN ('home', 'office')),
    icon TEXT DEFAULT '💰',
    color TEXT DEFAULT '#6366f1',
    user_id INTEGER,
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
    amount REAL NOT NULL,
    category_id INTEGER NOT NULL,
    merchant TEXT,
    note TEXT,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
`);

// Migration: Add merchant column if it doesn't exist (for existing databases)
try {
  db.exec(`ALTER TABLE transactions ADD COLUMN merchant TEXT`);
  console.log('Migration: Added merchant column');
} catch (e) {
  // Column already exists, ignore
}

// Migration: Add payment_mode column if it doesn't exist
try {
  db.exec(`ALTER TABLE transactions ADD COLUMN payment_mode TEXT DEFAULT 'cash'`);
  console.log('Migration: Added payment_mode column');
} catch (e) {
  // Column already exists, ignore
}

// Create indexes after migrations
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_payment_mode ON transactions(payment_mode)`);
} catch (e) {
  // Indexes might already exist
}

// Migration: Add category_group column if it doesn't exist
try {
  db.exec(`ALTER TABLE categories ADD COLUMN category_group TEXT DEFAULT 'home' CHECK(category_group IN ('home', 'office'))`);
  console.log('Migration: Added category_group column');
} catch (e) {
  // Column already exists, ignore
}

// Migration: Update Office Expenses to have 'office' group
try {
  db.prepare("UPDATE categories SET category_group = 'office' WHERE name = 'Office Expenses'").run();
  console.log('Migration: Updated Office Expenses to office group');
} catch (e) {
  // Ignore errors
}

// Migration: Add new categories if they don't exist (for existing databases)
const newCategories = [
  { name: 'Vegetables & Fruits', type: 'expense', icon: '🥬', color: '#16a34a', group: 'home' },
  { name: 'Drinking Water', type: 'expense', icon: '💧', color: '#0ea5e9', group: 'home' },
  { name: 'Office Expenses', type: 'expense', icon: '💼', color: '#6366f1', group: 'office' },
  { name: 'Office Supplies', type: 'expense', icon: '📎', color: '#8b5cf6', group: 'office' },
  { name: 'Office Travel', type: 'expense', icon: '🚌', color: '#f59e0b', group: 'office' },
];

for (const cat of newCategories) {
  const exists = db.prepare('SELECT id FROM categories WHERE name = ? AND is_default = 1').get(cat.name);
  if (!exists) {
    db.prepare('INSERT INTO categories (name, type, icon, color, category_group, is_default) VALUES (?, ?, ?, ?, ?, 1)')
      .run(cat.name, cat.type, cat.icon, cat.color, cat.group);
    console.log(`Migration: Added ${cat.name} category`);
  }
}

// Insert default categories if none exist
const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories WHERE is_default = 1').get();
if (categoryCount.count === 0) {
  const defaultCategories = [
    // Home expense categories
    { name: 'Food & Dining', type: 'expense', icon: '🍔', color: '#ef4444', group: 'home' },
    { name: 'Groceries', type: 'expense', icon: '🛒', color: '#f97316', group: 'home' },
    { name: 'Vegetables & Fruits', type: 'expense', icon: '🥬', color: '#16a34a', group: 'home' },
    { name: 'Drinking Water', type: 'expense', icon: '💧', color: '#0ea5e9', group: 'home' },
    { name: 'Transport', type: 'expense', icon: '🚗', color: '#eab308', group: 'home' },
    { name: 'Utilities', type: 'expense', icon: '💡', color: '#22c55e', group: 'home' },
    { name: 'Entertainment', type: 'expense', icon: '🎬', color: '#3b82f6', group: 'home' },
    { name: 'Shopping', type: 'expense', icon: '🛍️', color: '#8b5cf6', group: 'home' },
    { name: 'Health', type: 'expense', icon: '🏥', color: '#ec4899', group: 'home' },
    { name: 'Education', type: 'expense', icon: '📚', color: '#14b8a6', group: 'home' },
    { name: 'Bills', type: 'expense', icon: '📄', color: '#64748b', group: 'home' },
    { name: 'Other Expense', type: 'expense', icon: '📦', color: '#78716c', group: 'home' },
    // Office expense categories
    { name: 'Office Expenses', type: 'expense', icon: '💼', color: '#6366f1', group: 'office' },
    { name: 'Office Supplies', type: 'expense', icon: '�', color: '#8b5cf6', group: 'office' },
    { name: 'Office Travel', type: 'expense', icon: '🚌', color: '#f59e0b', group: 'office' },
  ];

  const insertCategory = db.prepare(
    'INSERT INTO categories (name, type, icon, color, category_group, is_default) VALUES (?, ?, ?, ?, ?, 1)'
  );

  for (const cat of defaultCategories) {
    insertCategory.run(cat.name, cat.type, cat.icon, cat.color, cat.group);
  }
}

// Middleware - Minimal security for local network/Tailscale access
// Helmet disabled to prevent HTTPS upgrade issues on local network
// app.use(helmet({ ... }));  // Disabled for HTTP access
app.use(compression());
app.use(express.json({ limit: '1mb' })); // Limit request size
app.use(cookieParser());
app.use(express.static('public'));

// Input sanitization helper
const sanitize = (str, maxLength = 200) => {
  if (!str) return null;
  return String(str).trim().slice(0, maxLength).replace(/[<>]/g, '');
};

// Simple rate limiting for auth routes (in-memory, resets on restart)
const authAttempts = new Map();
const rateLimitAuth = (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const attempts = authAttempts.get(ip) || { count: 0, resetTime: now + 60000 };

  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + 60000;
  }

  if (attempts.count >= 10) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  }

  attempts.count++;
  authAttempts.set(ip, attempts);
  next();
};

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ========================
// AUTH ROUTES
// ========================

// Register user (rate limited)
app.post('/api/auth/register', rateLimitAuth, (req, res) => {
  const { username, password, displayName } = req.body;

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Check if any users exist (first user can register freely)
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count >= 2) {
    return res.status(403).json({ error: 'Maximum users reached. Contact admin.' });
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)'
    ).run(username.toLowerCase(), hashedPassword, displayName);

    const token = jwt.sign({ id: result.lastInsertRowid, username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, displayName });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login (rate limited)
app.post('/api/auth/login', rateLimitAuth, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

  res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, displayName: user.display_name });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Check auth status
app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ id: user.id, username: user.username, displayName: user.display_name });
});

// Check if setup needed
app.get('/api/auth/setup-status', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  res.json({ needsSetup: userCount.count === 0, userCount: userCount.count });
});

// ========================
// CATEGORY ROUTES
// ========================

app.get('/api/categories', authenticate, (req, res) => {
  const { type, group } = req.query;

  // Query categories with usage count from transactions (all household members)
  // Most frequently used categories appear first
  let query = `
    SELECT c.*, COALESCE(usage.count, 0) as usage_count
    FROM categories c
    LEFT JOIN (
      SELECT category_id, COUNT(*) as count
      FROM transactions
      GROUP BY category_id
    ) usage ON c.id = usage.category_id
    WHERE (c.is_default = 1 OR c.user_id = ?)
  `;
  const params = [req.user.id];

  // Only show expense categories (income removed)
  query += " AND c.type = 'expense'";

  // Filter by category group if specified
  if (group && ['home', 'office'].includes(group)) {
    query += " AND c.category_group = ?";
    params.push(group);
  }

  // Order by group (home first), then usage count, then alphabetically
  query += ' ORDER BY c.category_group ASC, usage_count DESC, c.name ASC';

  const categories = db.prepare(query).all(...params);
  res.json(categories);
});

app.post('/api/categories', authenticate, (req, res) => {
  const { name, type, icon, color } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }

  const result = db.prepare(
    'INSERT INTO categories (name, type, icon, color, user_id, is_default) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(name, type, icon || '💰', color || '#6366f1', req.user.id);

  res.json({ id: result.lastInsertRowid, name, type, icon, color });
});

// Get suggested merchants for a category (HOUSEHOLD - learns from all users)
app.get('/api/categories/:id/merchants', authenticate, (req, res) => {
  const categoryId = req.params.id;

  // Get most frequently used merchants for this category (all household members)
  const merchants = db.prepare(`
    SELECT merchant, COUNT(*) as usage_count, MAX(date) as last_used
    FROM transactions
    WHERE category_id = ? AND merchant IS NOT NULL AND merchant != ''
    GROUP BY merchant
    ORDER BY usage_count DESC, last_used DESC
    LIMIT 10
  `).all(categoryId);

  res.json(merchants);
});

// ========================
// TRANSACTION ROUTES
// ========================

// Add transaction
app.post('/api/transactions', authenticate, (req, res) => {
  const { type, amount, categoryId, merchant, paymentMode, note, date } = req.body;

  if (!type || !amount || !categoryId) {
    return res.status(400).json({ error: 'Type, amount, and category are required' });
  }

  // Validate amount
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  // Validate payment mode
  const validModes = ['cash', 'upi', 'bank_transfer', 'credit_card', 'debit_card'];
  const mode = validModes.includes(paymentMode) ? paymentMode : 'cash';

  // Sanitize text inputs
  const safeMerchant = sanitize(merchant, 100);
  const safeNote = sanitize(note, 300);

  const transactionDate = date || new Date().toISOString().split('T')[0];

  const result = db.prepare(
    'INSERT INTO transactions (user_id, type, amount, category_id, merchant, payment_mode, note, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, type, parsedAmount, categoryId, safeMerchant, mode, safeNote, transactionDate);

  res.json({ id: result.lastInsertRowid, success: true });
});

// Get transactions (HOUSEHOLD MODE - shows all users' transactions)
app.get('/api/transactions', authenticate, (req, res) => {
  const { startDate, endDate, type, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
           u.display_name as added_by
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    query += ' AND t.date >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND t.date <= ?';
    params.push(endDate);
  }

  if (type && ['expense', 'income'].includes(type)) {
    query += ' AND t.type = ?';
    params.push(type);
  }

  query += ' ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const transactions = db.prepare(query).all(...params);
  res.json(transactions);
});

// Get summary (HOUSEHOLD MODE - combines all users)
app.get('/api/transactions/summary', authenticate, (req, res) => {
  const { startDate, endDate } = req.query;

  // Default to current month
  const now = new Date();
  const defaultStart = startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultEnd = endDate || now.toISOString().split('T')[0];

  const summary = db.prepare(`
    SELECT 
      type,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions
    WHERE date >= ? AND date <= ?
    GROUP BY type
  `).all(defaultStart, defaultEnd);

  const categoryBreakdown = db.prepare(`
    SELECT 
      c.name,
      c.icon,
      c.color,
      c.category_group,
      t.type,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.date >= ? AND t.date <= ?
    GROUP BY c.id, t.type
    ORDER BY total DESC
  `).all(defaultStart, defaultEnd);

  const income = summary.find(s => s.type === 'income')?.total || 0;
  const expense = summary.find(s => s.type === 'expense')?.total || 0;

  res.json({
    expense,
    balance: income - expense,
    startDate: defaultStart,
    endDate: defaultEnd,
    categoryBreakdown
  });
});

// Get payment mode summary (cash on hand, credit card dues)
app.get('/api/transactions/payment-summary', authenticate, (req, res) => {
  // Get ATM Withdrawal category ID
  const atmCategory = db.prepare("SELECT id FROM categories WHERE name = 'ATM Withdrawal' AND is_default = 1").get();
  const atmCategoryId = atmCategory?.id;

  // Calculate Cash on Hand: ATM withdrawals (income) - Cash expenses
  let cashOnHand = 0;

  if (atmCategoryId) {
    // Total ATM withdrawals (adds to cash)
    const atmWithdrawals = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE category_id = ? AND type = 'income'
    `).get(atmCategoryId);
    cashOnHand += atmWithdrawals.total;
  }

  // Subtract cash expenses
  const cashExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE type = 'expense' AND payment_mode = 'cash'
  `).get();
  cashOnHand -= cashExpenses.total;

  // Calculate Credit Card dues (expenses since last billing cycle)
  // Billing cycle ends on 5th of each month
  const now = new Date();
  let billingStart, billingEnd;

  if (now.getDate() >= 5) {
    // Current billing cycle: 5th of this month to 4th of next month
    billingStart = new Date(now.getFullYear(), now.getMonth(), 5);
    billingEnd = new Date(now.getFullYear(), now.getMonth() + 1, 4);
  } else {
    // Previous billing cycle: 5th of last month to 4th of this month
    billingStart = new Date(now.getFullYear(), now.getMonth() - 1, 5);
    billingEnd = new Date(now.getFullYear(), now.getMonth(), 4);
  }

  const billingStartStr = billingStart.toISOString().split('T')[0];
  const billingEndStr = billingEnd.toISOString().split('T')[0];

  // Credit card expenses in current billing cycle
  const creditCardExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM transactions
    WHERE type = 'expense' AND payment_mode = 'credit_card'
    AND date >= ? AND date <= ?
  `).get(billingStartStr, billingEndStr);

  // Calculate next due date (5th of next month)
  let nextDueDate;
  if (now.getDate() >= 5) {
    nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  } else {
    nextDueDate = new Date(now.getFullYear(), now.getMonth(), 5);
  }

  // Payment mode breakdown
  const paymentBreakdown = db.prepare(`
    SELECT payment_mode, SUM(amount) as total, COUNT(*) as count
    FROM transactions
    WHERE type = 'expense'
    GROUP BY payment_mode
    ORDER BY total DESC
  `).all();

  res.json({
    cashOnHand: Math.max(0, cashOnHand),
    creditCard: {
      currentDue: creditCardExpenses.total,
      transactionCount: creditCardExpenses.count,
      billingStart: billingStartStr,
      billingEnd: billingEndStr,
      dueDate: nextDueDate.toISOString().split('T')[0]
    },
    paymentBreakdown
  });
});

// Delete transaction (any household member can delete)
app.delete('/api/transactions/:id', authenticate, (req, res) => {
  const result = db.prepare(
    'DELETE FROM transactions WHERE id = ?'
  ).run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  res.json({ success: true });
});

// ========================
// DOCUMENT ROUTES
// ========================

// Upload document
app.post('/api/documents', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { name, category } = req.body;

  const result = db.prepare(
    'INSERT INTO documents (user_id, name, original_name, category, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    req.user.id,
    name || req.file.originalname,
    req.file.originalname,
    category || 'General',
    req.file.filename,
    req.file.size,
    req.file.mimetype
  );

  res.json({ id: result.lastInsertRowid, success: true });
});

// Get documents
app.get('/api/documents', authenticate, (req, res) => {
  const { category } = req.query;

  let query = 'SELECT * FROM documents WHERE user_id = ?';
  const params = [req.user.id];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY uploaded_at DESC';

  const documents = db.prepare(query).all(...params);
  res.json(documents);
});

// Download document
app.get('/api/documents/:id/download', authenticate, (req, res) => {
  const doc = db.prepare(
    'SELECT * FROM documents WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const filePath = path.join(DOCS_DIR, doc.file_path);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.download(filePath, doc.original_name);
});

// View document (for images/PDFs)
app.get('/api/documents/:id/view', authenticate, (req, res) => {
  const doc = db.prepare(
    'SELECT * FROM documents WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const filePath = path.join(DOCS_DIR, doc.file_path);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.contentType(doc.mime_type);
  res.sendFile(path.resolve(filePath));
});

// Delete document
app.delete('/api/documents/:id', authenticate, (req, res) => {
  const doc = db.prepare(
    'SELECT * FROM documents WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Delete file from disk
  const filePath = path.join(DOCS_DIR, doc.file_path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete from database
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);

  res.json({ success: true });
});

// Get document categories
app.get('/api/documents/categories', authenticate, (req, res) => {
  const categories = db.prepare(`
    SELECT DISTINCT category, COUNT(*) as count
    FROM documents
    WHERE user_id = ?
    GROUP BY category
    ORDER BY category
  `).all(req.user.id);

  // Add default categories
  const defaults = ['ID Documents', 'Licenses', 'Insurance', 'Medical', 'Financial', 'General'];
  const existing = categories.map(c => c.category);

  for (const def of defaults) {
    if (!existing.includes(def)) {
      categories.push({ category: def, count: 0 });
    }
  }

  res.json(categories.sort((a, b) => a.category.localeCompare(b.category)));
});

// ========================
// START SERVER
// ========================

// Health check endpoint (for Uptime Kuma or other monitoring)
// Monthly summary endpoint - shows summary for a specific month
app.get('/api/transactions/monthly-summary', authenticate, (req, res) => {
  const { year, month } = req.query;

  // Default to previous month if not specified
  const now = new Date();
  const targetYear = year ? parseInt(year) : (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const targetMonth = month ? parseInt(month) : (now.getMonth() === 0 ? 12 : now.getMonth());

  // Calculate start and end dates for the month
  const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

  // Get total expenses for the month
  const totals = db.prepare(`
    SELECT 
      COALESCE(SUM(amount), 0) as total_expense,
      COUNT(*) as transaction_count
    FROM transactions
    WHERE type = 'expense' AND date >= ? AND date <= ?
  `).get(startDate, endDate);

  // Get breakdown by category
  const categoryBreakdown = db.prepare(`
    SELECT 
      c.name,
      c.icon,
      c.color,
      c.category_group,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
    GROUP BY c.id
    ORDER BY total DESC
  `).all(startDate, endDate);

  // Get breakdown by group (home vs office)
  const groupBreakdown = db.prepare(`
    SELECT 
      c.category_group as group_name,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
    GROUP BY c.category_group
    ORDER BY c.category_group ASC
  `).all(startDate, endDate);

  // Get daily spending pattern
  const dailySpending = db.prepare(`
    SELECT 
      date,
      SUM(amount) as total
    FROM transactions
    WHERE type = 'expense' AND date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(startDate, endDate);

  // Get available months (for dropdown)
  const availableMonths = db.prepare(`
    SELECT DISTINCT 
      strftime('%Y', date) as year,
      strftime('%m', date) as month
    FROM transactions
    WHERE type = 'expense'
    ORDER BY year DESC, month DESC
    LIMIT 12
  `).all();

  res.json({
    year: targetYear,
    month: targetMonth,
    monthName: new Date(targetYear, targetMonth - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    startDate,
    endDate,
    totalExpense: totals.total_expense,
    transactionCount: totals.transaction_count,
    categoryBreakdown,
    groupBreakdown,
    dailySpending,
    availableMonths
  });
});

app.get('/api/health', (req, res) => {
  try {
    // Quick DB check
    db.prepare('SELECT 1').get();
    res.json({
      status: 'healthy',
      version: '1.3.0',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         D&S Expense Tracker v1.3.0 - Server Started          ║
╚═══════════════════════════════════════════════════════════════╝

🚀 Server running on port ${PORT}
📁 Data directory: ${path.resolve(DATA_DIR)}
📄 Documents directory: ${path.resolve(DOCS_DIR)}

Access the app at:
  • http://localhost:${PORT}
  • http://<your-ip>:${PORT}
  `);
});
