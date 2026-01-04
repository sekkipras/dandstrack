/**
 * D&S Expense Tracker - Frontend Application
 * Lightweight, mobile-first expense and document management
 */

// ========================================
// State Management
// ========================================
const state = {
    user: null,
    categories: [],
    transactions: [],
    documents: [],
    selectedCategory: null,
    currentView: 'home',
    categoryGroup: 'home',  // 'home' or 'office'
    docCategory: 'all',
    statsPeriod: 'month'
};

// ========================================
// Service Worker Update Handler
// ========================================
if ('serviceWorker' in navigator) {
    // Listen for SW update messages
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
            console.log('App updated to version:', event.data.version);
            showUpdateNotification();
        }
    });

    // Check for updates periodically (every 5 minutes)
    setInterval(() => {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) reg.update();
        });
    }, 5 * 60 * 1000);
}

function showUpdateNotification() {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    toast.className = 'toast show info';
    toastMessage.innerHTML = '🔄 New version available! <button onclick="location.reload()" style="margin-left:8px;padding:4px 8px;background:#6366f1;border:none;border-radius:4px;color:white;cursor:pointer;">Refresh</button>';

    // Don't auto-hide update notification
}

// ========================================
// API Helper
// ========================================
const api = {
    async request(endpoint, options = {}) {
        const response = await fetch(`/api${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Request failed');
        }

        return response.json();
    },

    get: (endpoint) => api.request(endpoint),
    post: (endpoint, data) => api.request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
    delete: (endpoint) => api.request(endpoint, { method: 'DELETE' }),

    async uploadFile(file, name, category) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        formData.append('category', category);

        const response = await fetch('/api/documents', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.error || 'Upload failed');
        }

        return response.json();
    }
};

// ========================================
// Utility Functions
// ========================================
const utils = {
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount);
    },

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        }

        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    },

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    getDateRange(period) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        switch (period) {
            case 'month':
                return {
                    startDate: new Date(year, month, 1).toISOString().split('T')[0],
                    endDate: now.toISOString().split('T')[0]
                };
            case 'year':
                return {
                    startDate: new Date(year, 0, 1).toISOString().split('T')[0],
                    endDate: now.toISOString().split('T')[0]
                };
            case 'all':
                return {
                    startDate: '2000-01-01',
                    endDate: now.toISOString().split('T')[0]
                };
            default:
                return {
                    startDate: new Date(year, month, 1).toISOString().split('T')[0],
                    endDate: now.toISOString().split('T')[0]
                };
        }
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// ========================================
// Toast Notifications
// ========================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    toast.className = 'toast show ' + type;
    toastMessage.textContent = message;

    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ========================================
// Screen Management
// ========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById(screenId).style.display = 'block';
}

function showLoading() {
    document.getElementById('loading-screen').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-screen').style.display = 'none';
}

// ========================================
// Authentication
// ========================================
async function checkAuth() {
    try {
        const user = await api.get('/auth/me');
        state.user = user;
        return true;
    } catch {
        return false;
    }
}

async function checkSetupStatus() {
    const status = await api.get('/auth/setup-status');
    return status;
}

async function login(username, password) {
    const result = await api.post('/auth/login', { username, password });
    if (result.success) {
        const user = await api.get('/auth/me');
        state.user = user;
        showToast('Welcome back, ' + user.displayName + '!', 'success');
        initApp();
    }
}

async function register(displayName, username, password) {
    const result = await api.post('/auth/register', { displayName, username, password });
    if (result.success) {
        const user = await api.get('/auth/me');
        state.user = user;
        showToast('Account created! Welcome, ' + displayName + '!', 'success');
        initApp();
    }
}

async function logout() {
    await api.post('/auth/logout');
    state.user = null;
    showScreen('auth-screen');
}

// ========================================
// Categories
// ========================================
async function loadCategories() {
    state.categories = await api.get(`/categories?group=${state.categoryGroup}`);
    renderCategories();
}

async function loadMerchantSuggestions(categoryId) {
    try {
        const merchants = await api.get(`/categories/${categoryId}/merchants`);
        return merchants;
    } catch {
        return [];
    }
}

function renderCategories() {
    const select = document.getElementById('category-select');

    // Keep the first "Select a category..." option and add categories
    select.innerHTML = `<option value="">Select a category...</option>` +
        state.categories.map(cat => `
            <option value="${cat.id}" ${state.selectedCategory === cat.id ? 'selected' : ''}>
                ${cat.icon} ${cat.name}
            </option>
        `).join('');

    // Add change handler
    select.onchange = async () => {
        const categoryId = parseInt(select.value);
        if (categoryId) {
            state.selectedCategory = categoryId;

            // Show merchant input and load suggestions
            const merchantSection = document.getElementById('merchant-section');
            merchantSection.style.display = 'block';

            // Load and display merchant suggestions
            const merchants = await loadMerchantSuggestions(categoryId);
            renderMerchantSuggestions(merchants);
        } else {
            state.selectedCategory = null;
            document.getElementById('merchant-section').style.display = 'none';
        }
    };
}

function renderMerchantSuggestions(merchants) {
    const suggestionsEl = document.getElementById('merchant-suggestions');
    const merchantInput = document.getElementById('transaction-merchant');

    if (merchants.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
    }

    suggestionsEl.innerHTML = merchants.map(m => `
        <button type="button" class="merchant-suggestion" data-merchant="${m.merchant}">
            <span class="name">${m.merchant}</span>
            <span class="count">${m.usage_count}x</span>
        </button>
    `).join('');

    // Show on focus
    merchantInput.addEventListener('focus', () => {
        if (merchants.length > 0) {
            suggestionsEl.style.display = 'block';
        }
    });

    // Hide on blur (with delay for click)
    merchantInput.addEventListener('blur', () => {
        setTimeout(() => {
            suggestionsEl.style.display = 'none';
        }, 200);
    });

    // Handle suggestion clicks
    suggestionsEl.querySelectorAll('.merchant-suggestion').forEach(btn => {
        btn.addEventListener('click', () => {
            merchantInput.value = btn.dataset.merchant;
            suggestionsEl.style.display = 'none';
        });
    });
}

// ========================================
// Transactions
// ========================================
async function loadTransactions(options = {}) {
    const params = new URLSearchParams();
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    if (options.type) params.append('type', options.type);
    if (options.limit) params.append('limit', options.limit);

    return api.get(`/transactions?${params.toString()}`);
}

async function loadSummary(options = {}) {
    const params = new URLSearchParams();
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);

    return api.get(`/transactions/summary?${params.toString()}`);
}

async function addTransaction(data) {
    return api.post('/transactions', data);
}

async function deleteTransaction(id) {
    return api.delete(`/transactions/${id}`);
}

function renderTransactionItem(tx) {
    // Payment mode icons
    const paymentIcons = {
        cash: '💵',
        upi: '📱',
        bank_transfer: '🏛️',
        credit_card: '💳',
        debit_card: '🏦'
    };
    const paymentIcon = paymentIcons[tx.payment_mode] || '💵';

    return `
    <div class="transaction-item" data-id="${tx.id}">
      <div class="transaction-icon" style="background: ${tx.category_color}20">
        ${tx.category_icon}
      </div>
      <div class="transaction-details">
        <div class="transaction-category">${tx.category_name}${tx.merchant ? ` • ${tx.merchant}` : ''}</div>
        <div class="transaction-meta">
          <span>${utils.formatDate(tx.date)}</span>
          <span>${paymentIcon}</span>
          ${tx.added_by ? `<span>• ${tx.added_by}</span>` : ''}
          ${tx.note ? `<span>• ${tx.note}</span>` : ''}
        </div>
      </div>
      <div class="transaction-amount ${tx.type}">
        ${tx.type === 'income' ? '+' : '-'}${utils.formatCurrency(tx.amount)}
      </div>
      <button class="transaction-delete" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"/>
          <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/>
        </svg>
      </button>
    </div>
  `;
}

function renderTransactions(transactions, containerId) {
    const container = document.getElementById(containerId);

    if (transactions.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📝</div>
        <p>No transactions yet</p>
      </div>
    `;
        return;
    }

    container.innerHTML = transactions.map(renderTransactionItem).join('');

    // Add delete handlers
    container.querySelectorAll('.transaction-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.transaction-item');
            const id = item.dataset.id;

            if (confirm('Delete this transaction?')) {
                try {
                    await deleteTransaction(id);
                    item.remove();
                    showToast('Transaction deleted', 'success');
                    refreshDashboard();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            }
        });
    });
}

// ========================================
// Dashboard
// ========================================
async function refreshDashboard() {
    const dateRange = utils.getDateRange('month');

    const [summary, transactions, monthlySummary] = await Promise.all([
        loadSummary(dateRange),
        loadTransactions({ ...dateRange, limit: 10 }),
        loadMonthlySummary()
    ]);

    // Update summary cards
    document.getElementById('total-expense').textContent = utils.formatCurrency(summary.expense);

    // Calculate home vs office totals from category breakdown
    const homeTotal = summary.categoryBreakdown
        .filter(c => c.category_group === 'home')
        .reduce((sum, c) => sum + c.total, 0);
    const officeTotal = summary.categoryBreakdown
        .filter(c => c.category_group === 'office')
        .reduce((sum, c) => sum + c.total, 0);

    document.getElementById('total-home').textContent = utils.formatCurrency(homeTotal);
    document.getElementById('total-office').textContent = utils.formatCurrency(officeTotal);

    // Render transactions
    renderTransactions(transactions, 'transactions-list');

    // Render monthly summary
    renderMonthlySummary(monthlySummary);
}

// Monthly summary functions
async function loadMonthlySummary(year = null, month = null) {
    const params = new URLSearchParams();
    if (year) params.append('year', year);
    if (month) params.append('month', month);
    return api.get(`/transactions/monthly-summary?${params.toString()}`);
}

function renderMonthlySummary(data) {
    // Update month selector
    const selector = document.getElementById('month-selector');
    if (data.availableMonths && data.availableMonths.length > 0) {
        selector.innerHTML = data.availableMonths.map(m => {
            const monthName = new Date(m.year, parseInt(m.month) - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
            const isSelected = parseInt(m.year) === data.year && parseInt(m.month) === data.month;
            return `<option value="${m.year}-${m.month}" ${isSelected ? 'selected' : ''}>${monthName}</option>`;
        }).join('');
    }

    // Render summary content
    const content = document.getElementById('monthly-summary-content');

    if (data.transactionCount === 0) {
        content.innerHTML = `
            <div class="empty-state" style="padding: 1rem;">
                <p>No expenses recorded for ${data.monthName}</p>
            </div>
        `;
        return;
    }

    // Group breakdown
    const homeTotal = data.groupBreakdown.find(g => g.group_name === 'home')?.total || 0;
    const officeTotal = data.groupBreakdown.find(g => g.group_name === 'office')?.total || 0;

    content.innerHTML = `
        <div class="monthly-stats">
            <div class="monthly-stat total">
                <span class="label">Total Spent</span>
                <span class="value">${utils.formatCurrency(data.totalExpense)}</span>
            </div>
            <div class="monthly-stat-row">
                <div class="monthly-stat home">
                    <span class="label">🏠 Home</span>
                    <span class="value">${utils.formatCurrency(homeTotal)}</span>
                </div>
                <div class="monthly-stat office">
                    <span class="label">💼 Office</span>
                    <span class="value">${utils.formatCurrency(officeTotal)}</span>
                </div>
            </div>
        </div>
        <div class="monthly-categories">
            ${data.categoryBreakdown.slice(0, 5).map(cat => `
                <div class="monthly-category-item">
                    <span class="icon">${cat.icon}</span>
                    <span class="name">${cat.name}</span>
                    <span class="amount">${utils.formatCurrency(cat.total)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// ========================================
// Documents
// ========================================
async function loadDocuments(category = null) {
    const params = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    state.documents = await api.get(`/documents${params}`);
    renderDocuments();
}

async function loadDocCategories() {
    const categories = await api.get('/documents/categories');
    renderDocCategories(categories);
}

function renderDocCategories(categories) {
    const container = document.getElementById('doc-categories');
    const allCount = categories.reduce((sum, c) => sum + c.count, 0);

    container.innerHTML = `
    <button class="doc-category-btn ${state.docCategory === 'all' ? 'active' : ''}" data-category="all">
      All (${allCount})
    </button>
    ${categories.map(cat => `
      <button class="doc-category-btn ${state.docCategory === cat.category ? 'active' : ''}" 
              data-category="${cat.category}">
        ${cat.category} (${cat.count})
      </button>
    `).join('')}
  `;

    container.querySelectorAll('.doc-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.docCategory = btn.dataset.category;
            container.querySelectorAll('.doc-category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadDocuments(state.docCategory === 'all' ? null : state.docCategory);
        });
    });
}

function renderDocuments() {
    const container = document.getElementById('documents-list');

    if (state.documents.length === 0) {
        container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="icon">📁</div>
        <p>No documents yet</p>
      </div>
    `;
        return;
    }

    container.innerHTML = state.documents.map(doc => {
        const isImage = doc.mime_type?.startsWith('image/');
        const icon = getDocIcon(doc.mime_type);

        return `
      <div class="document-card" data-id="${doc.id}">
        <div class="document-preview">
          ${isImage ? `<img src="/api/documents/${doc.id}/view" alt="${doc.name}" loading="lazy">` : icon}
        </div>
        <div class="document-info">
          <div class="document-name">${doc.name}</div>
          <div class="document-meta">${utils.formatFileSize(doc.file_size)}</div>
        </div>
        <button class="document-delete" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/>
          </svg>
        </button>
      </div>
    `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.document-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.document-delete')) return;
            const id = card.dataset.id;
            viewDocument(id);
        });

        card.querySelector('.document-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = card.dataset.id;

            if (confirm('Delete this document?')) {
                try {
                    await api.delete(`/documents/${id}`);
                    card.remove();
                    showToast('Document deleted', 'success');
                    loadDocCategories();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            }
        });
    });
}

function getDocIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word')) return '📘';
    if (mimeType.includes('image')) return '🖼️';
    return '📄';
}

function viewDocument(id) {
    const doc = state.documents.find(d => d.id == id);
    if (!doc) return;

    const modal = document.getElementById('doc-viewer-modal');
    const title = document.getElementById('doc-viewer-title');
    const body = document.getElementById('doc-viewer-body');
    const downloadBtn = document.getElementById('download-doc-btn');

    title.textContent = doc.name;
    downloadBtn.onclick = () => {
        window.open(`/api/documents/${id}/download`, '_blank');
    };

    if (doc.mime_type?.startsWith('image/')) {
        body.innerHTML = `<img src="/api/documents/${id}/view" alt="${doc.name}">`;
    } else if (doc.mime_type === 'application/pdf') {
        body.innerHTML = `<iframe src="/api/documents/${id}/view"></iframe>`;
    } else {
        body.innerHTML = `
      <div class="empty-state">
        <div class="icon">${getDocIcon(doc.mime_type)}</div>
        <p>Preview not available</p>
        <button class="btn btn-primary" onclick="window.open('/api/documents/${id}/download', '_blank')">
          Download File
        </button>
      </div>
    `;
    }

    modal.style.display = 'flex';
}

// ========================================
// Statistics
// ========================================
async function loadStats() {
    const dateRange = utils.getDateRange(state.statsPeriod);
    const summary = await loadSummary(dateRange);

    // Update total expense
    document.getElementById('stats-expense').textContent = utils.formatCurrency(summary.expense);

    // Calculate home vs office totals
    const homeTotal = summary.categoryBreakdown
        .filter(c => c.category_group === 'home')
        .reduce((sum, c) => sum + c.total, 0);
    const officeTotal = summary.categoryBreakdown
        .filter(c => c.category_group === 'office')
        .reduce((sum, c) => sum + c.total, 0);

    document.getElementById('stats-home').textContent = utils.formatCurrency(homeTotal);
    document.getElementById('stats-office').textContent = utils.formatCurrency(officeTotal);

    // Render breakdowns by group
    const homeCategories = summary.categoryBreakdown.filter(c => c.category_group === 'home');
    const officeCategories = summary.categoryBreakdown.filter(c => c.category_group === 'office');

    renderBreakdown(homeCategories, 'home-breakdown', homeTotal);
    renderBreakdown(officeCategories, 'office-breakdown', officeTotal);

    // Load payment summary
    await loadPaymentSummary();
}

async function loadPaymentSummary() {
    try {
        const summary = await api.get('/transactions/payment-summary');

        // Update cash on hand
        document.getElementById('cash-on-hand').textContent = utils.formatCurrency(summary.cashOnHand);

        // Update credit card due
        document.getElementById('credit-card-due').textContent = utils.formatCurrency(summary.creditCard.currentDue);

        // Format due date
        const dueDate = new Date(summary.creditCard.dueDate);
        const dueDateStr = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        document.getElementById('credit-due-date').textContent = `Due: ${dueDateStr}`;
    } catch (err) {
        console.error('Failed to load payment summary:', err);
    }
}

function renderBreakdown(items, containerId, total) {
    const container = document.getElementById(containerId);

    if (items.length === 0) {
        container.innerHTML = `
      <div class="empty-state" style="padding: 1rem;">
        <p>No data for this period</p>
      </div>
    `;
        return;
    }

    container.innerHTML = items.map(item => {
        const percentage = total > 0 ? (item.total / total) * 100 : 0;

        return `
      <div class="breakdown-item">
        <div class="breakdown-icon" style="background: ${item.color}20">
          ${item.icon}
        </div>
        <div class="breakdown-details">
          <div class="breakdown-name">${item.name}</div>
          <div class="breakdown-bar">
            <div class="breakdown-bar-fill" style="width: ${percentage}%; background: ${item.color}"></div>
          </div>
        </div>
        <div class="breakdown-amount">${utils.formatCurrency(item.total)}</div>
      </div>
    `;
    }).join('');
}

// ========================================
// Event Handlers Setup
// ========================================
function setupAuthHandlers() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            await login(username, password);
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const displayName = document.getElementById('register-name').value;
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;

        try {
            await register(displayName, username, password);
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Toggle between login and register
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    });
}

function setupMainHandlers() {
    // Logout
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Category group tabs (Home/Office)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            state.categoryGroup = btn.dataset.tab;  // 'home' or 'office'
            state.selectedCategory = null;
            document.getElementById('category-group').value = state.categoryGroup;

            loadCategories();
        });
    });

    // Month selector for monthly summary
    document.getElementById('month-selector').addEventListener('change', async (e) => {
        const [year, month] = e.target.value.split('-');
        const summary = await loadMonthlySummary(year, month);
        renderMonthlySummary(summary);
    });

    // Quick add form
    document.getElementById('quick-add-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const amount = parseFloat(document.getElementById('amount-input').value);
        const date = document.getElementById('transaction-date').value;
        const note = document.getElementById('transaction-note').value;
        const merchant = document.getElementById('transaction-merchant').value;
        const paymentMode = document.getElementById('payment-mode').value;

        if (!amount || amount <= 0) {
            showToast('Please enter an amount', 'error');
            return;
        }

        if (!state.selectedCategory) {
            showToast('Please select a category', 'error');
            return;
        }

        try {
            await addTransaction({
                type: 'expense',  // Always expense now
                amount,
                categoryId: state.selectedCategory,
                merchant: merchant || null,
                paymentMode,
                date,
                note
            });

            showToast('Expense added!', 'success');

            // Reset form
            document.getElementById('amount-input').value = '';
            document.getElementById('transaction-note').value = '';
            document.getElementById('transaction-merchant').value = '';
            document.getElementById('merchant-section').style.display = 'none';
            document.getElementById('category-select').value = '';
            document.getElementById('payment-mode').value = 'cash';
            state.selectedCategory = null;

            refreshDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // View all transactions
    document.getElementById('view-all-btn').addEventListener('click', () => {
        navigateToView('transactions');
    });

    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            navigateToView(view);
        });
    });
}

function setupTransactionsHandlers() {
    document.getElementById('back-from-transactions').addEventListener('click', () => {
        navigateToView('home');
    });

    const filterType = document.getElementById('filter-type');
    const filterMonth = document.getElementById('filter-month');

    // Set default month
    const now = new Date();
    filterMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const applyFilters = utils.debounce(async () => {
        const group = filterType.value;  // Now filters by category group (home/office)
        const month = filterMonth.value;

        let startDate, endDate;
        if (month) {
            const [year, m] = month.split('-');
            startDate = `${year}-${m}-01`;
            const lastDay = new Date(parseInt(year), parseInt(m), 0).getDate();
            endDate = `${year}-${m}-${lastDay}`;
        }

        // Load transactions with group filter
        let transactions = await loadTransactions({ startDate, endDate, type: 'expense', limit: 100 });

        // Filter by category group on client side (since we don't have group filter in API for transactions)
        if (group && ['home', 'office'].includes(group)) {
            const groupCategories = await api.get(`/categories?group=${group}`);
            const groupCategoryIds = new Set(groupCategories.map(c => c.id));
            transactions = transactions.filter(t => groupCategoryIds.has(t.category_id));
        }

        renderTransactions(transactions, 'all-transactions-list');
    }, 300);

    filterType.addEventListener('change', applyFilters);
    filterMonth.addEventListener('change', applyFilters);
}

function setupDocumentsHandlers() {
    document.getElementById('back-from-documents').addEventListener('click', () => {
        navigateToView('home');
    });

    // Upload button
    document.getElementById('upload-doc-btn').addEventListener('click', () => {
        document.getElementById('upload-modal').style.display = 'flex';
    });

    // Modal close
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        });
    });

    // File dropzone
    const dropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('file-input');
    const selectedFile = document.getElementById('selected-file');
    const selectedFileName = document.getElementById('selected-file-name');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent-primary)';
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--text-muted)';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--text-muted)';

        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            showSelectedFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            showSelectedFile(fileInput.files[0]);
        }
    });

    function showSelectedFile(file) {
        selectedFileName.textContent = file.name;
        selectedFile.style.display = 'flex';
        dropzone.style.display = 'none';

        // Pre-fill name
        const nameInput = document.getElementById('doc-name');
        if (!nameInput.value) {
            nameInput.value = file.name.replace(/\.[^/.]+$/, '');
        }
    }

    document.getElementById('clear-file').addEventListener('click', () => {
        fileInput.value = '';
        selectedFile.style.display = 'none';
        dropzone.style.display = 'flex';
    });

    // Upload form
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        if (!file) {
            showToast('Please select a file', 'error');
            return;
        }

        const name = document.getElementById('doc-name').value;
        const category = document.getElementById('doc-category').value;

        const submitBtn = document.getElementById('upload-submit-btn');
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Uploading...';

        try {
            await api.uploadFile(file, name, category);
            showToast('Document uploaded!', 'success');

            // Reset form
            fileInput.value = '';
            document.getElementById('doc-name').value = '';
            selectedFile.style.display = 'none';
            dropzone.style.display = 'flex';
            document.getElementById('upload-modal').style.display = 'none';

            // Reload documents
            loadDocCategories();
            loadDocuments(state.docCategory === 'all' ? null : state.docCategory);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'Upload';
        }
    });
}

function setupStatsHandlers() {
    document.getElementById('back-from-stats').addEventListener('click', () => {
        navigateToView('home');
    });

    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.statsPeriod = btn.dataset.period;
            loadStats();
        });
    });
}

// ========================================
// Navigation
// ========================================
async function navigateToView(view) {
    state.currentView = view;

    // Update bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });

    switch (view) {
        case 'home':
            showScreen('main-screen');
            break;

        case 'transactions':
            showScreen('transactions-view');
            const filterMonth = document.getElementById('filter-month');
            const now = new Date();
            filterMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            const transactions = await loadTransactions({ limit: 100 });
            renderTransactions(transactions, 'all-transactions-list');
            break;

        case 'documents':
            showScreen('documents-view');
            await loadDocCategories();
            await loadDocuments();
            break;

        case 'stats':
            showScreen('stats-view');
            await loadStats();
            break;
    }
}

// ========================================
// Initialize App
// ========================================
async function initApp() {
    document.getElementById('user-name').textContent = state.user.displayName;

    // Set today's date as default
    document.getElementById('transaction-date').value = new Date().toISOString().split('T')[0];

    // Load initial data
    await Promise.all([
        loadCategories(),
        refreshDashboard()
    ]);

    showScreen('main-screen');
}

// ========================================
// App Entry Point
// ========================================
async function main() {
    showLoading();

    // Setup all event handlers
    setupAuthHandlers();
    setupMainHandlers();
    setupTransactionsHandlers();
    setupDocumentsHandlers();
    setupStatsHandlers();

    try {
        // Check if user is authenticated
        const isAuth = await checkAuth();

        if (isAuth) {
            await initApp();
        } else {
            // Check setup status
            const status = await checkSetupStatus();

            if (status.needsSetup) {
                // Show register form for first user
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('register-form').style.display = 'block';
            }

            showScreen('auth-screen');
        }
    } catch (err) {
        console.error('Initialization error:', err);
        showScreen('auth-screen');
    }

    hideLoading();
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed, app still works
    });
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', main);
