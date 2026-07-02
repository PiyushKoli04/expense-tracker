/* ============================================
   UTILS — utils.js
   Formatters, Helpers, Date Utilities
   ============================================ */

const Utils = (() => {

  /* ── Currency Formatting ── */
  let _currency = '₹';

  function setCurrency(symbol) {
    _currency = symbol;
  }

  function getCurrency() {
    return _currency;
  }

  function formatCurrency(amount, showSign = false) {
    const num = parseFloat(amount) || 0;
    const formatted = Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    if (showSign && num !== 0) {
      return `${num > 0 ? '+' : '-'}${_currency}${formatted}`;
    }
    return `${num < 0 ? '-' : ''}${_currency}${formatted}`;
  }

  function formatNumber(num) {
    return parseFloat(num || 0).toLocaleString('en-IN');
  }

  function formatCompact(num) {
    const n = parseFloat(num) || 0;
    if (Math.abs(n) >= 10000000) return `${_currency}${(n / 10000000).toFixed(1)}Cr`;
    if (Math.abs(n) >= 100000) return `${_currency}${(n / 100000).toFixed(1)}L`;
    if (Math.abs(n) >= 1000) return `${_currency}${(n / 1000).toFixed(1)}K`;
    return formatCurrency(n);
  }

  /* ── Date Formatting ── */
  function formatDate(date, format = 'short') {
    if (!date) return '—';
    const d = toDate(date);
    if (isNaN(d.getTime())) return '—';

    switch (format) {
      case 'short':
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      case 'long':
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      case 'full':
        return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      case 'relative':
        return getRelativeTime(d);
      case 'iso':
        return d.toISOString().split('T')[0];
      case 'month-year':
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      default:
        return d.toLocaleDateString('en-IN');
    }
  }

  function toDate(value) {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (value.toDate) return value.toDate(); // Firestore Timestamp
    if (value.seconds) return new Date(value.seconds * 1000);
    return new Date(value);
  }

  function getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(date, 'short');
  }

  function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function getMonthName(monthStr) {
    const [year, month] = monthStr.split('-');
    const d = new Date(year, parseInt(month) - 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function getMonthRange(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return { start, end };
  }

  function isCurrentMonth(date) {
    const d = toDate(date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  /* ── Percentage Calculation ── */
  function calcPercentage(part, total) {
    if (!total || total === 0) return 0;
    return Math.round((part / total) * 100);
  }

  function calcProfitLoss(invested, current) {
    const inv = parseFloat(invested) || 0;
    const cur = parseFloat(current) || 0;
    return cur - inv;
  }

  function calcProfitLossPercent(invested, current) {
    const inv = parseFloat(invested) || 0;
    if (inv === 0) return 0;
    const cur = parseFloat(current) || 0;
    return (((cur - inv) / inv) * 100).toFixed(2);
  }

  /* ── ID / Random ── */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  function getInitials(name) {
    if (!name) return '?';
    return name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function getAvatarColor(name) {
    const colors = ['cyan', 'purple', 'green', 'orange', 'pink', 'teal'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /* ── Category Icons ── */
  const categoryIcons = {
    'Food & Dining': 'utensils',
    'Transport': 'car',
    'Shopping': 'shopping-bag',
    'Bills & Utilities': 'file-text',
    'Entertainment': 'film',
    'Health': 'activity',
    'Education': 'book-open',
    'Travel': 'plane',
    'Groceries': 'shopping-cart',
    'Rent': 'home',
    'Insurance': 'shield',
    'Subscriptions': 'smartphone',
    'Personal Care': 'sparkles',
    'Gifts': 'gift',
    'Other': 'pin'
  };

  const investmentTypeIcons = {
    'Stocks': 'trending-up',
    'Mutual Funds': 'bar-chart-3',
    'SIP': 'refresh-cw',
    'Crypto': 'coins',
    'Gold': 'gem',
    'Real Estate': 'building',
    'Business': 'briefcase',
    'Fixed Deposits': 'landmark'
  };

  const groupTypeIcons = {
    'Trip': 'plane',
    'Hostel': 'building-2',
    'Family': 'users',
    'Event': 'party-popper',
    'Startup': 'rocket',
    'Shared Subscription': 'smartphone'
  };

  function getCategoryIcon(category) {
    const iconName = categoryIcons[category] || 'pin';
    return `<i data-lucide="${iconName}" class="icon-inline"></i>`;
  }

  function getInvestmentIcon(type) {
    const iconName = investmentTypeIcons[type] || 'dollar-sign';
    return `<i data-lucide="${iconName}" class="icon-inline"></i>`;
  }

  function getGroupTypeIcon(type) {
    const iconName = groupTypeIcons[type] || 'users';
    return `<i data-lucide="${iconName}" class="icon-inline"></i>`;
  }

  /* ── Expense Categories ── */
  const expenseCategories = [
    'Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities',
    'Entertainment', 'Health', 'Education', 'Travel', 'Groceries',
    'Rent', 'Insurance', 'Subscriptions', 'Personal Care', 'Gifts', 'Other'
  ];

  const paymentMethods = [
    'Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Wallet', 'Other'
  ];

  const investmentTypes = [
    'Stocks', 'Mutual Funds', 'SIP', 'Crypto', 'Gold', 'Real Estate', 'Business', 'Fixed Deposits'
  ];

  const groupTypes = [
    'Trip', 'Hostel', 'Family', 'Event', 'Startup', 'Shared Subscription'
  ];

  /* ── Debounce ── */
  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /* ── Deep Clone ── */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ── Truncate ── */
  function truncate(str, len = 30) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  return {
    setCurrency, getCurrency, formatCurrency, formatNumber, formatCompact,
    formatDate, toDate, getCurrentMonth, getMonthName, getMonthRange, isCurrentMonth,
    calcPercentage, calcProfitLoss, calcProfitLossPercent,
    generateId, getInitials, getAvatarColor,
    getCategoryIcon, getInvestmentIcon, getGroupTypeIcon,
    expenseCategories, paymentMethods, investmentTypes, groupTypes,
    categoryIcons, investmentTypeIcons, groupTypeIcons,
    debounce, deepClone, truncate
  };
})();
