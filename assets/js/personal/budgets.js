/* ============================================
   BUDGETS — budgets.js
   Manage Monthly limits & Category Budgets
   ============================================ */

const BudgetsModule = (() => {

  let _user = null;
  let _profile = null;
  let _selectedMonth = '';
  let _currentBudgetDoc = null;

  /**
   * Module initialization hook
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    console.log('🎯 Initializing Personal Budgets Module...');
    
    // Default selected month to today's month
    _selectedMonth = Utils.getCurrentMonth();
    const monthSelect = document.getElementById('budgetMonthSelect');
    if (monthSelect) {
      monthSelect.value = _selectedMonth;
    }

    // Populate category list in form dropdown
    populateCategoryDropdown();

    // Fetch and render
    await fetchAndRenderBudgets();
  }

  function populateCategoryDropdown() {
    const select = document.getElementById('budgetCategory');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Choose a category</option>';
    Utils.expenseCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
  }

  /**
   * Handle Month Date selector change trigger
   */
  async function onMonthChange() {
    const monthSelect = document.getElementById('budgetMonthSelect');
    if (monthSelect) {
      _selectedMonth = monthSelect.value;
      await fetchAndRenderBudgets();
    }
  }

  /**
   * Core aggregation and rendering engine
   */
  async function fetchAndRenderBudgets() {
    try {
      UI.showLoading('#categoryBudgetsContainer');

      // Fetch expenses and budget document for the month
      const [expenses, budgets] = await Promise.all([
        FirestoreService.getUserDocuments('personalExpenses', _user.uid),
        FirestoreService.getDocuments('budgets', [
          ['userId', '==', _user.uid],
          ['month', '==', _selectedMonth]
        ])
      ]);

      UI.hideLoading('#categoryBudgetsContainer');

      _currentBudgetDoc = budgets.length > 0 ? budgets[0] : null;

      // Group actual spending of selected month by category
      const spendingMap = {};
      const monthlyExpenses = expenses.filter(exp => {
        const d = Utils.toDate(exp.date);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === _selectedMonth;
      });

      monthlyExpenses.forEach(exp => {
        spendingMap[exp.category] = (spendingMap[exp.category] || 0) + (parseFloat(exp.amount) || 0);
      });

      const totalSpent = monthlyExpenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

      // Render Metrics cards
      renderBudgetOverview(totalSpent);

      // Render Categories Allocation Progress
      renderCategoryBudgets(spendingMap);

    } catch (error) {
      console.error('Error fetching budgets:', error);
      UI.showToast('Error fetching monthly budgets.', 'error');
    }
  }

  /**
   * Animate counters on metrics
   */
  function renderBudgetOverview(totalSpent) {
    const totalLimit = _currentBudgetDoc ? (parseFloat(_currentBudgetDoc.totalBudget) || 0) : 0;
    const remaining = totalLimit > 0 ? Math.max(0, totalLimit - totalSpent) : 0;
    const percent = totalLimit > 0 ? Utils.calcPercentage(totalSpent, totalLimit) : 0;

    Animations.animateCounter('totalBudgetVal', totalLimit);
    Animations.animateCounter('totalSpentVal', totalSpent);
    Animations.animateCounter('remainingBudgetVal', remaining);
    
    const percentEl = document.getElementById('budgetPercentVal');
    if (percentEl) {
      percentEl.textContent = `${percent}%`;
    }
  }

  /**
   * Render Category-specific budgets lists
   */
  function renderCategoryBudgets(spendingMap) {
    const container = document.getElementById('categoryBudgetsContainer');
    if (!container) return;

    container.innerHTML = '';

    const categoryBudgets = _currentBudgetDoc ? (_currentBudgetDoc.categories || []) : [];

    // Map categories in standard format
    const list = Utils.expenseCategories.map(catName => {
      const budgetObj = categoryBudgets.find(b => b.name === catName);
      const limit = budgetObj ? (parseFloat(budgetObj.limit) || 0) : 0;
      const spent = spendingMap[catName] || 0;
      return { name: catName, limit, spent };
    });

    // Sort categories showing set limits first, then sorted by spent desc
    list.sort((a, b) => {
      if (a.limit > 0 && b.limit === 0) return -1;
      if (a.limit === 0 && b.limit > 0) return 1;
      return b.spent - a.spent;
    });

    list.forEach(item => {
      const percent = item.limit > 0 ? Utils.calcPercentage(item.spent, item.limit) : 0;
      const isExceeded = item.limit > 0 && item.spent > item.limit;
      const isClose = item.limit > 0 && item.spent >= item.limit * 0.85 && item.spent <= item.limit;

      let progressColor = 'var(--primary-gradient)';
      let borderGlow = '';
      if (isExceeded) {
        progressColor = 'var(--accent-red)';
        borderGlow = 'card--glow-red';
      } else if (isClose) {
        progressColor = 'var(--accent-orange)';
        borderGlow = 'card--glow-orange';
      }

      const card = document.createElement('div');
      card.className = `card ${borderGlow}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:24px;">${Utils.getCategoryIcon(item.name)}</span>
            <div>
              <h4 style="font-size: var(--fs-md); font-weight: 600; margin:0;">${item.name}</h4>
              <span style="font-size:var(--fs-xs); color:var(--text-muted);">
                Spent ${Utils.formatCurrency(item.spent)}
              </span>
            </div>
          </div>
          
          <div style="text-align:right;">
            <span style="font-weight: 700; font-size:var(--fs-sm);">
              ${item.limit > 0 ? Utils.formatCurrency(item.limit) : 'No Limit'}
            </span>
            <button class="btn btn-ghost btn-sm" style="display:block; padding:2px 4px; font-size:10px; margin-left:auto; margin-top:2px; color:var(--primary-cyan);" onclick="BudgetsModule.openSetCategoryLimitModal('${item.name}', ${item.limit})">
              Edit Limit
            </button>
          </div>
        </div>

        <div class="progress" style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden; margin-bottom:4px;">
          <div class="progress-bar" style="width: ${Math.min(100, percent)}%; height: 100%; border-radius:3px; background:${progressColor};"></div>
        </div>
        
        <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted);">
          <span>${percent}% consumed</span>
          <span>${item.limit > 0 ? `${Utils.formatCurrency(Math.max(0, item.limit - item.spent))} left` : '—'}</span>
        </div>
      `;

      container.appendChild(card);
    });

    // Re-initialize Lucide icons for category budgets
    if (typeof UI !== 'undefined' && UI.reinitIcons) {
      UI.reinitIcons();
    }
  }

  /**
   * Modal actions
   */
  function openSetBudgetModal() {
    const currentLimit = _currentBudgetDoc ? (parseFloat(_currentBudgetDoc.totalBudget) || 0) : '';
    document.getElementById('monthlyLimit').value = currentLimit;
    UI.openModal('monthlyBudgetModal');
  }

  function openSetCategoryLimitModal(catName = '', currentLimit = 0) {
    const catSelect = document.getElementById('budgetCategory');
    const limitInput = document.getElementById('categoryLimit');

    if (catName) {
      catSelect.value = catName;
      catSelect.disabled = true; // Disable select if modifying directly
      limitInput.value = currentLimit || '';
    } else {
      catSelect.value = '';
      catSelect.disabled = false;
      limitInput.value = '';
    }

    UI.openModal('categoryBudgetModal');
  }

  /**
   * Save general monthly limit
   */
  async function saveMonthlyBudget() {
    const limit = parseFloat(document.getElementById('monthlyLimit').value);
    if (isNaN(limit) || limit <= 0) {
      UI.showToast('Please enter a valid budget amount.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveMonthlyBudgetBtn');
    UI.showButtonSpinner(saveBtn, 'Saving...');

    const payload = {
      userId: _user.uid,
      month: _selectedMonth,
      totalBudget: limit,
      categories: _currentBudgetDoc ? (_currentBudgetDoc.categories || []) : []
    };

    let result;
    if (_currentBudgetDoc) {
      result = await FirestoreService.updateDocument('budgets', _currentBudgetDoc.id, { totalBudget: limit });
    } else {
      result = await FirestoreService.addDocument('budgets', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast('Monthly budget updated!', 'success');
      UI.closeModal('monthlyBudgetModal');
      await fetchAndRenderBudgets();
    } else {
      UI.showToast(`Error updating budget: ${result.error}`, 'error');
    }
  }

  /**
   * Save specific category limit
   */
  async function saveCategoryBudget() {
    const catName = document.getElementById('budgetCategory').value;
    const limit = parseFloat(document.getElementById('categoryLimit').value);

    if (!catName || isNaN(limit) || limit <= 0) {
      UI.showToast('Please enter category limits correctly.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveCategoryBudgetBtn');
    UI.showButtonSpinner(saveBtn, 'Saving...');

    let updatedCategories = _currentBudgetDoc ? [...(_currentBudgetDoc.categories || [])] : [];

    const existingIdx = updatedCategories.findIndex(b => b.name === catName);
    if (existingIdx !== -1) {
      updatedCategories[existingIdx].limit = limit;
    } else {
      updatedCategories.push({ name: catName, limit });
    }

    let result;
    if (_currentBudgetDoc) {
      result = await FirestoreService.updateDocument('budgets', _currentBudgetDoc.id, { categories: updatedCategories });
    } else {
      const payload = {
        userId: _user.uid,
        month: _selectedMonth,
        totalBudget: 0, // default placeholder
        categories: [{ name: catName, limit }]
      };
      result = await FirestoreService.addDocument('budgets', payload);
    }

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast('Category limit updated!', 'success');
      UI.closeModal('categoryBudgetModal');
      await fetchAndRenderBudgets();
    } else {
      UI.showToast(`Error updating limit: ${result.error}`, 'error');
    }
  }

  return {
    init,
    onMonthChange,
    openSetBudgetModal,
    openSetCategoryLimitModal,
    saveMonthlyBudget,
    saveCategoryBudget
  };
})();
